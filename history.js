// ---- 历史趋势页 ----
let historyRange = 30; // 7 | 30 | 90 | 'all'
let showTable = false;

function initHistory() {
  document.querySelectorAll('.range-row button[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyRange = btn.dataset.range === 'all' ? 'all' : Number(btn.dataset.range);
      renderHistory();
    });
  });
  document.getElementById('toggle-table-btn').addEventListener('click', () => {
    showTable = !showTable;
    renderHistory();
  });

  const card = document.getElementById('chart-card');
  const tooltip = document.getElementById('chart-tooltip');
  card.addEventListener('pointermove', (e) => {
    const hit = e.target.closest('[data-tip]');
    if (!hit) {
      tooltip.style.opacity = 0;
      return;
    }
    const rect = card.getBoundingClientRect();
    tooltip.innerHTML = hit.dataset.tip;
    tooltip.style.left = `${e.clientX - rect.left}px`;
    tooltip.style.top = `${hit.getBoundingClientRect().top - rect.top}px`;
    tooltip.style.opacity = 1;
  });
  card.addEventListener('pointerleave', () => {
    tooltip.style.opacity = 0;
  });
}

function collectDays() {
  const dates = Object.keys(state.intake.days).sort();
  if (historyRange === 'all') return dates;
  const today = todayKey();
  const cutoff = addDays(today, -(historyRange - 1));
  return dates.filter((d) => d >= cutoff && d <= today);
}

function renderHistory() {
  document.querySelectorAll('.range-row button[data-range]').forEach((btn) => {
    const val = btn.dataset.range === 'all' ? 'all' : Number(btn.dataset.range);
    btn.classList.toggle('active', val === historyRange);
  });

  const dates = collectDays();
  const rows = dates.map((d) => {
    const day = getDay(d);
    return { date: d, intake: totalIntake(day), burn: Number(day.burn) || 0, deficit: dayDeficit(day) };
  });

  renderKpis(rows);
  renderChart(rows);

  document.getElementById('toggle-table-btn').textContent = showTable ? '隐藏数据表 ▲' : '查看数据表 ▼';
  document.getElementById('history-table-wrap').style.display = showTable ? 'block' : 'none';
  if (showTable) renderTable(rows);
}

function renderKpis(rows) {
  const withData = rows.filter((r) => r.intake > 0 || r.burn > 0);
  const avg = withData.length ? withData.reduce((s, r) => s + r.deficit, 0) / withData.length : 0;
  const good = withData.filter((r) => r.deficit >= 0).length;
  const bad = withData.length - good;

  const el = document.getElementById('kpi-row');
  el.innerHTML = `
    <div class="kpi-tile">
      <div class="kpi-label">平均每日赤字</div>
      <div class="kpi-value ${avg >= 0 ? 'good' : 'critical'}">${Math.round(avg)}</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">达成赤字天数</div>
      <div class="kpi-value good">${good}</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">超支天数</div>
      <div class="kpi-value critical">${bad}</div>
    </div>`;
}

function renderChart(rows) {
  const svgWrap = document.getElementById('chart-svg-wrap');
  if (!rows.length) {
    svgWrap.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:24px 0;">这段时间还没有记录</p>';
    return;
  }

  const barSlot = rows.length > 45 ? 10 : rows.length > 20 ? 16 : 28;
  const barWidth = Math.max(4, Math.min(24, barSlot - 3));
  const height = 220;
  const midY = height / 2;
  const plotHalf = 92;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.deficit)));
  const scale = plotHalf / maxAbs;
  const width = rows.length * barSlot + 16;

  let bars = '';
  rows.forEach((r, i) => {
    const x = 8 + i * barSlot + (barSlot - barWidth) / 2;
    const isGood = r.deficit >= 0;
    const barH = Math.abs(r.deficit) * scale;
    const y = isGood ? midY - barH : midY;
    const color = isGood ? 'var(--series-blue)' : 'var(--series-red)';
    const rTop = isGood ? 4 : 0;
    const rBot = isGood ? 0 : 4;
    const label = `${r.date}<br><span class="tt-value">${Math.round(r.deficit)} kcal</span>`;
    const safeLabel = label.replace(/"/g, '&quot;');
    bars += `
      <rect data-tip="${safeLabel}" x="${x}" y="${y}"
        width="${barWidth}" height="${Math.max(barH, 1)}" rx="${isGood ? rTop : rBot}"
        fill="${color}"></rect>
      <rect data-tip="${safeLabel}" x="${x - 3}" y="8" width="${barWidth + 6}" height="${height - 16}" fill="transparent"></rect>`;
  });

  // 稀疏 x 轴标签：首、尾，以及居中一个
  const tickIdx = rows.length > 2 ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1] : rows.map((_, i) => i);
  let ticks = '';
  tickIdx.forEach((i) => {
    const x = 8 + i * barSlot + barSlot / 2;
    const short = rows[i].date.slice(5);
    ticks += `<text x="${x}" y="${height - 4}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${short}</text>`;
  });

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block;min-width:100%">
      <line x1="8" y1="${midY}" x2="${width - 8}" y2="${midY}" stroke="var(--baseline)" stroke-width="1"></line>
      ${bars}
      ${ticks}
    </svg>`;

  svgWrap.innerHTML = svg;
  // textContent 写入日期，避免潜在注入（数据均为本地生成，双重保险）
}

function fmt2(n) {
  return Math.round(n * 10) / 10;
}

function renderTable(rows) {
  const wrap = document.getElementById('history-table-wrap');
  const rev = [...rows].reverse();
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>日期</th><th>总摄入</th><th>消耗</th><th>赤字</th></tr></thead>
      <tbody>
        ${rev
          .map(
            (r) => `<tr>
              <td>${r.date}</td>
              <td>${fmt2(r.intake)}</td>
              <td>${fmt2(r.burn)}</td>
              <td class="${r.deficit >= 0 ? 'good' : 'critical'}">${fmt2(r.deficit)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

window.initHistory = initHistory;
window.renderHistory = renderHistory;
