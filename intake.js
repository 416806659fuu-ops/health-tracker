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
  { key: 'fiber', label: '膳食纤维', color: 'var(--series-green)' },
];

function categoryInfo(key) {
  return CATEGORIES.find((c) => c.key === key) || { key: null, label: '历史', color: 'var(--text-muted)' };
}

const pendingCategory = { breakfast: 'protein', lunch: 'protein', dinner: 'protein', snack: 'protein' };

// 记录页只做"现在进行时"，不再支持翻看以往日期——以往的记录去历史页看。
// 所以这里不需要一个可变的 currentDate，每次都直接用当下的 todayKey()。

// 整页不滑动：只有"现在是哪一餐"那一个完整展开、可以直接加/删/改，
// 其余三餐收成底下一条小横条，点了弹出详情层（跟当前这餐功能完全一样，
// 只是放在覆盖层里，不占记录页本身的空间）。
function currentMealKey() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11.5 && h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack'; // 11:00-11:30、15:00-17:00、21:00-次日5:00 都算加餐
}

function emptyDay() {
  return {
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    burn: null,
  };
}

function getDay(dateKey) {
  const raw = state.intake.days[dateKey];
  if (!raw) return emptyDay();
  // 有些老记录可能是在加餐时段/字段存在之前写入的，meals 里缺某个键；
  // 跟 mergeIntoDefaults() 补全顶层结构一样的思路，这里也补全成4餐都在。
  return { meals: Object.assign(emptyDay().meals, raw.meals), burn: raw.burn ?? null };
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

function mealProteinTotal(day, mealKey) {
  return day.meals[mealKey].reduce((sum, item) => sum + (Number(item.protein) || 0), 0);
}

function totalIntake(day) {
  return MEALS.reduce((sum, m) => sum + mealTotal(day, m.key), 0);
}

function dayProteinTotal(day) {
  return MEALS.reduce((sum, m) => sum + mealProteinTotal(day, m.key), 0);
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
  if (!btn) return;
  const info = categoryInfo(pendingCategory[mealKey]);
  btn.style.setProperty('--cat-color', info.color);
  btn.textContent = `● ${info.label}`;
}

// 完整的一餐录入卡片：现在这一餐直接内嵌在记录页里，
// 其他三餐点开的时候塞进 #meal-detail-body，用的是同一份模板。
function mealCardHTML(mealKey) {
  const m = MEALS.find((x) => x.key === mealKey);
  return `
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
    </div>`;
}

function initRecord() {
  // 用 body 代理，因为完整录入卡片可能出现在记录页里（当前这餐），
  // 也可能出现在 meal-detail 覆盖层里（点其他时段点开的），两处共用同一套逻辑。
  document.body.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.food-del');
    if (delBtn) {
      const mealKey = delBtn.dataset.meal;
      const id = delBtn.dataset.id;
      const day = ensureDay(todayKey());
      day.meals[mealKey] = day.meals[mealKey].filter((it) => it.id !== id);
      markDirty();
      renderMealCard(mealKey);
      renderHero();
      renderOtherMealsStrip();
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
      return;
    }
    const otherRow = e.target.closest('.other-meal-row');
    if (otherRow) {
      openMealDetail(otherRow.dataset.meal);
      return;
    }
    if (e.target.closest('#meal-detail-back')) {
      closeMealDetail();
    }
  });
  document.body.addEventListener('input', (e) => {
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
  document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.classList.contains('cal-input') || e.target.classList.contains('protein-input'))) {
      e.preventDefault();
      addFoodItem(e.target.closest('.meal-card').dataset.meal);
    }
  });

  document.getElementById('field-burn').addEventListener('input', (e) => {
    const day = ensureDay(todayKey());
    const v = e.target.value;
    day.burn = v === '' ? null : Number(v);
    markDirty();
    renderHero();
  });
}

function openMealDetail(mealKey) {
  const m = MEALS.find((x) => x.key === mealKey);
  document.getElementById('meal-detail-title').textContent = m.label;
  document.getElementById('meal-detail-body').innerHTML = mealCardHTML(mealKey);
  updateCatToggleButton(mealKey);
  renderMealCard(mealKey);
  document.getElementById('meal-detail').style.display = 'block';
}

function closeMealDetail() {
  document.getElementById('meal-detail').style.display = 'none';
  document.getElementById('meal-detail-body').innerHTML = '';
  renderOtherMealsStrip();
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
  const day = ensureDay(todayKey());
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
  renderOtherMealsStrip();
  calInput.focus();
}

function renderHero() {
  const day = getDay(todayKey());
  const deficit = dayDeficit(day);
  const heroValue = document.getElementById('hero-value');
  heroValue.innerHTML = `${fmt(deficit)}<span class="unit">kcal</span>`;
  heroValue.className = 'hero-value ' + (deficit >= 0 ? 'good' : 'critical');
  document.getElementById('hero-protein-value').innerHTML = `${fmt(dayProteinTotal(day))}<span class="unit">g</span>`;

  document.getElementById('field-burn').value = day.burn ?? '';
}

function renderMealCard(mealKey) {
  const day = getDay(todayKey());
  const card = document.querySelector(`.meal-card[data-meal="${mealKey}"]`);
  if (!card) return;
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

  const total = mealTotal(day, mealKey);
  card.querySelector('.meal-total').textContent = `${fmt(total)} kcal`;
}

function renderOtherMealsStrip() {
  const day = getDay(todayKey());
  const cur = currentMealKey();
  const strip = document.getElementById('other-meals-strip');
  strip.innerHTML = MEALS.filter((m) => m.key !== cur)
    .map((m) => {
      const total = mealTotal(day, m.key);
      const protein = mealProteinTotal(day, m.key);
      return `
      <button class="other-meal-row" data-meal="${m.key}">
        <span class="other-meal-name">${m.label}</span>
        <span class="other-meal-val">${fmt(total)} kcal · ${fmt(protein)}g蛋白</span>
        <span class="other-meal-arrow">›</span>
      </button>`;
    })
    .join('');
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function renderRecord() {
  const now = new Date();
  document.getElementById('today-label').textContent =
    `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${WEEKDAY_LABELS[now.getDay()]}`;

  const cur = currentMealKey();
  const slot = document.getElementById('current-meal-slot');
  if (slot.dataset.meal !== cur) {
    slot.innerHTML = mealCardHTML(cur);
    slot.dataset.meal = cur;
    updateCatToggleButton(cur);
  }
  renderMealCard(cur);
  renderOtherMealsStrip();
  renderHero();
}

window.initRecord = initRecord;
window.renderRecord = renderRecord;
