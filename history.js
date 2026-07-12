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
    cells += `<div class="${cls}"><span class="cal-day-num">${r.day}</span><span class="cal-day-val">${deficitText}</span></div>`;
  });

  grid.innerHTML = cells;
}

window.initHistory = initHistory;
window.renderHistory = renderHistory;
