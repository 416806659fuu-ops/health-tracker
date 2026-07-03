// ---- 摄入记录页 ----
const MEALS = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

const CATEGORIES = [
  { key: 'protein', label: '蛋白质', color: 'var(--series-blue)' },
  { key: 'carb', label: '碳水', color: 'var(--series-aqua)' },
  { key: 'fat', label: '脂肪', color: 'var(--series-yellow)' },
];

function categoryInfo(key) {
  return CATEGORIES.find((c) => c.key === key) || { key: null, label: '历史', color: 'var(--text-muted)' };
}

const pendingCategory = { breakfast: 'protein', lunch: 'protein', dinner: 'protein', snack: 'protein' };

let currentDate = todayKey();

function emptyDay() {
  return {
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    burn: null,
  };
}

function getDay(dateKey) {
  return state.intake.days[dateKey] || emptyDay();
}

function ensureDay(dateKey) {
  if (!state.intake.days[dateKey]) {
    state.intake.days[dateKey] = emptyDay();
  }
  return state.intake.days[dateKey];
}

function mealTotal(day, mealKey) {
  return day.meals[mealKey].reduce((sum, item) => sum + (Number(item.cal) || 0), 0);
}

function totalIntake(day) {
  return MEALS.reduce((sum, m) => sum + mealTotal(day, m.key), 0);
}

function dayProteinTotal(day) {
  return MEALS.reduce(
    (sum, m) => sum + day.meals[m.key].reduce((s, item) => s + (Number(item.protein) || 0), 0),
    0
  );
}

function dayDeficit(day) {
  return baselineTotal() + (Number(day.burn) || 0) - totalIntake(day);
}

function fmt(n) {
  return Math.round(n * 10) / 10;
}

function cycleCategory(mealKey) {
  const idx = CATEGORIES.findIndex((c) => c.key === pendingCategory[mealKey]);
  const next = CATEGORIES[(idx + 1) % CATEGORIES.length];
  pendingCategory[mealKey] = next.key;
  updateCatToggleButton(mealKey);
}

function updateCatToggleButton(mealKey) {
  const btn = document.querySelector(`.cat-toggle[data-meal="${mealKey}"]`);
  const info = categoryInfo(pendingCategory[mealKey]);
  btn.style.setProperty('--cat-color', info.color);
  btn.textContent = `● ${info.label}`;
}

function initRecord() {
  document.getElementById('date-prev').addEventListener('click', () => {
    currentDate = addDays(currentDate, -1);
    renderRecord();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    currentDate = addDays(currentDate, 1);
    renderRecord();
  });
  document.getElementById('date-today-btn').addEventListener('click', () => {
    currentDate = todayKey();
    renderRecord();
  });
  document.getElementById('date-picker').addEventListener('change', (e) => {
    if (e.target.value) {
      currentDate = e.target.value;
      renderRecord();
    }
  });

  const container = document.getElementById('meal-cards');
  container.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.food-del');
    if (delBtn) {
      const mealKey = delBtn.dataset.meal;
      const id = delBtn.dataset.id;
      const day = ensureDay(currentDate);
      day.meals[mealKey] = day.meals[mealKey].filter((it) => it.id !== id);
      markDirty();
      renderMealCard(mealKey);
      renderHero();
      return;
    }
    const catBtn = e.target.closest('.cat-toggle');
    if (catBtn) {
      cycleCategory(catBtn.dataset.meal);
      return;
    }
    const addBtn = e.target.closest('.add-btn');
    if (addBtn) {
      addFoodItem(addBtn.dataset.meal);
    }
  });
  container.addEventListener('input', (e) => {
    if (e.target.classList.contains('cal-input')) {
      const mealKey = e.target.closest('.meal-card').dataset.meal;
      const preview = document.getElementById(`cal-preview-${mealKey}`);
      const val = evalCalExpr(e.target.value);
      preview.textContent = val === null ? '' : `= ${fmt(val)} kcal`;
    }
    if (e.target.classList.contains('protein-input')) {
      const mealKey = e.target.closest('.meal-card').dataset.meal;
      const preview = document.getElementById(`protein-preview-${mealKey}`);
      const val = evalCalExpr(e.target.value);
      preview.textContent = val === null ? '' : `= ${fmt(val)}g`;
    }
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.classList.contains('cal-input') || e.target.classList.contains('protein-input'))) {
      e.preventDefault();
      addFoodItem(e.target.closest('.meal-card').dataset.meal);
    }
  });

  document.getElementById('field-burn').addEventListener('input', (e) => {
    const day = ensureDay(currentDate);
    const v = e.target.value;
    day.burn = v === '' ? null : Number(v);
    markDirty();
    renderHero();
  });
}

function addFoodItem(mealKey) {
  const card = document.querySelector(`.meal-card[data-meal="${mealKey}"]`);
  const calInput = card.querySelector('.cal-input');
  const proteinInput = card.querySelector('.protein-input');
  const cal = evalCalExpr(calInput.value);
  if (cal === null) {
    calInput.focus();
    return;
  }
  const protein = proteinInput.value === '' ? 0 : evalCalExpr(proteinInput.value) ?? 0;
  const day = ensureDay(currentDate);
  day.meals[mealKey].push({ id: uid(), category: pendingCategory[mealKey], cal, protein });
  markDirty();

  calInput.value = '';
  proteinInput.value = '';
  document.getElementById(`cal-preview-${mealKey}`).textContent = '';
  document.getElementById(`protein-preview-${mealKey}`).textContent = '';
  pendingCategory[mealKey] = 'protein';
  updateCatToggleButton(mealKey);

  renderMealCard(mealKey);
  renderHero();
  calInput.focus();
}

function renderHero() {
  const day = getDay(currentDate);
  const intake = totalIntake(day);
  const burn = Number(day.burn) || 0;
  const deficit = dayDeficit(day);
  const heroValue = document.getElementById('hero-value');
  heroValue.innerHTML = `${fmt(deficit)}<span class="unit">kcal</span>`;
  heroValue.className = 'hero-value ' + (deficit >= 0 ? 'good' : 'critical');
  document.getElementById('hero-intake').textContent = fmt(intake);
  document.getElementById('hero-burn').textContent = fmt(burn);
  document.getElementById('hero-budget').textContent = fmt(baselineTotal());
  document.getElementById('hero-protein').textContent = fmt(dayProteinTotal(day));

  document.getElementById('field-burn').value = day.burn ?? '';
}

function renderMealCard(mealKey) {
  const day = getDay(currentDate);
  const card = document.querySelector(`.meal-card[data-meal="${mealKey}"]`);
  const listEl = card.querySelector('.food-list');
  const items = day.meals[mealKey];
  listEl.innerHTML = items
    .map((it) => {
      const info = categoryInfo(it.category);
      return `
      <div class="food-item">
        <span class="cat-dot" style="background:${info.color}"></span>
        <span class="cat-label"></span>
        <span class="food-cal">${fmt(it.cal)} kcal</span>
        <span class="food-protein">${fmt(Number(it.protein) || 0)}g蛋白</span>
        <button class="food-del" data-meal="${mealKey}" data-id="${it.id}" aria-label="删除">&times;</button>
      </div>`;
    })
    .join('');
  listEl.querySelectorAll('.food-item').forEach((row, i) => {
    row.querySelector('.cat-label').textContent = categoryInfo(items[i].category).label;
  });
  card.querySelector('.meal-total').textContent = `${fmt(mealTotal(day, mealKey))} kcal`;
}

function renderRecord() {
  document.getElementById('date-picker').value = currentDate;
  document.getElementById('date-today-btn').style.display = currentDate === todayKey() ? 'none' : 'block';

  const container = document.getElementById('meal-cards');
  if (!container.dataset.built) {
    container.innerHTML = MEALS.map(
      (m) => `
      <div class="meal-card" data-meal="${m.key}">
        <div class="meal-card-head">
          <span class="meal-name">${m.label}</span>
          <span class="meal-total">0 kcal</span>
        </div>
        <div class="food-list"></div>
        <div class="add-row">
          <button class="cat-toggle" data-meal="${m.key}">● 蛋白质</button>
          <input class="cal-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="卡路里，如 45*2.3">
          <input class="protein-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="蛋白质g，如 20+5">
          <button class="add-btn" data-meal="${m.key}">+</button>
        </div>
        <div class="preview-row">
          <span class="cal-preview" id="cal-preview-${m.key}"></span>
          <span class="protein-preview" id="protein-preview-${m.key}"></span>
        </div>
      </div>`
    ).join('');
    container.dataset.built = '1';
    MEALS.forEach((m) => updateCatToggleButton(m.key));
  }

  MEALS.forEach((m) => renderMealCard(m.key));
  renderHero();
}

window.initRecord = initRecord;
window.renderRecord = renderRecord;
