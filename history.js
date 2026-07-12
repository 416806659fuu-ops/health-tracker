// ---- 历史趋势页（按月查看） ----
let historyMonth = todayKey().slice(0, 7); // 'YYYY-MM'

function initHistory() {
  document.getElementById('month-prev').addEventListener('click', () => {
    historyMonth = shiftMonth(historyMonth, -1);
    renderHistory();
  });
  document.getElementById('month-next').addEventListener('click', () => {
    historyMonth = shiftMonth(historyMonth, 1);
    renderHistory();
  });
  document.getElementById('calendar-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.date) return;
    openDayDetail(cell.dataset.date);
  });
  document.getElementById('day-detail-back').addEventListener('click', () => {
    document.getElementById('day-detail').style.display = 'none';
  });
}

// 点日历里的某一天，只读地看那天吃了什么——跟记录页同一套 meal-card 外观，
// 但没有加/删/改的控件，纯展示。
function openDayDetail(dateKey) {
  document.getElementById('day-detail-title').textContent = dateKey;
  const day = getDay(dateKey);
  const deficit = dayDeficit(day);
  const protein = dayProteinTotal(day);

  let html = `
    <div class="hero-card">
      <div class="hero-duo">
        <div class="hero-item">
          <div class="hero-value ${deficit >= 0 ? 'good' : 'critical'}">${fmt(deficit)}<span class="unit">kcal</span></div>
          <div class="hero-label">热量赤字</div>
        </div>
        <div class="hero-item">
          <div class="hero-value">${fmt(protein)}<span class="unit">g</span></div>
          <div class="hero-label">蛋白质摄入</div>
        </div>
      </div>
    </div>`;

  MEALS.forEach((m) => {
    const items = day.meals[m.key];
    const total = mealTotal(day, m.key);
    const rows = items
      .map((it) => {
        const info = categoryInfo(it.category);
        return `
        <div class="food-item readonly">
          <span class="cat-dot" style="background:${info.color}"></span>
          <span class="cat-label">${info.label}</span>
          <span class="food-cal">${fmt(it.cal)} kcal</span>
          <span class="food-protein">${fmt(Number(it.protein) || 0)}g蛋白</span>
        </div>`;
      })
      .join('') || `<p class="empty-note">没有记录</p>`;
    html += `
      <div class="meal-card readonly">
        <div class="meal-card-head">
          <span class="meal-name">${m.label}</span>
          <span class="meal-total">${fmt(total)} kcal</span>
        </div>
        <div class="food-list">${rows}</div>
      </div>`;
  });

  document.getElementById('day-detail-body').innerHTML = html;
  document.getElementById('day-detail').style.display = 'block';
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function renderHistory() {
  const [y, m] = historyMonth.split('-').map(Number);
  document.getElementById('month-label').textContent = `${y}年${m}月`;
  document.getElementById('month-next').disabled = historyMonth >= todayKey().slice(0, 7);

  const total = daysInMonth(historyMonth);
  const today = todayKey();
  const rows = [];
  for (let d = 1; d <= total; d++) {
    const dateKey = `${historyMonth}-${String(d).padStart(2, '0')}`;
    if (dateKey > today) {
      rows.push({ date: dateKey, day: d, hasData: false, future: true, deficit: null });
      continue;
    }
    const day = getDay(dateKey);
    const hasData = totalIntake(day) > 0 || Number(day.burn) > 0;
    rows.push({ date: dateKey, day: d, hasData, future: false, deficit: hasData ? dayDeficit(day) : null });
  }

  renderKpis(rows);
  renderCalendar(rows, y, m);
}

function renderKpis(rows) {
  const withData = rows.filter((r) => r.hasData);
  const good = withData.filter((r) => r.deficit >= 0).length;
  const totalDeficit = withData.reduce((s, r) => s + r.deficit, 0);

  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-tile">
      <div class="kpi-label">达成赤字天数</div>
      <div class="kpi-value good">${good}<span class="kpi-value-sub"> / ${withData.length}</span></div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">本月赤字合计</div>
      <div class="kpi-value ${totalDeficit >= 0 ? 'good' : 'critical'}">${Math.round(totalDeficit)}</div>
    </div>`;
}

function renderCalendar(rows, y, m) {
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=周日
  const leadBlanks = (firstDow + 6) % 7; // 转成周一开头
  const grid = document.getElementById('calendar-grid');
  const today = todayKey();

  let cells = '';
  for (let i = 0; i < leadBlanks; i++) cells += `<div class="cal-day empty"></div>`;
  rows.forEach((r) => {
    let cls = 'cal-day';
    if (r.date === today) cls += ' today';
    if (r.future) {
      cls += ' future';
    } else if (r.hasData) {
      cls += r.deficit >= 0 ? ' good' : ' critical';
    } else {
      cls += ' nodata';
    }
    const deficitText = r.hasData ? Math.round(r.deficit) : '';
    cells += `<div class="${cls}" data-date="${r.date}"><span class="cal-day-num">${r.day}</span><span class="cal-day-val">${deficitText}</span></div>`;
  });

  grid.innerHTML = cells;
  // 一个月可能占4~6周，行数不固定；按实际周数把可用高度均分，
  // 页面本身才能永远不用滑动，不会因为某些月份行数多就溢出。
  const weeks = Math.ceil((leadBlanks + rows.length) / 7);
  grid.style.gridTemplateRows = `repeat(${weeks}, 1fr)`;
}

window.initHistory = initHistory;
window.renderHistory = renderHistory;
