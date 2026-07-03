// ---- 核心：与后端同步的状态 / 保存条 / 通用工具 ----
const CACHE_KEY = 'health-tracker-cache-v2';

// 后端是 Google Apps Script + Google Sheet。地址和密码不写死在代码里
// （这份代码要发布到公开的 GitHub Pages，写死的话谁都能看到源码里的密码），
// 而是第一次打开时问一次，存在这台设备的浏览器本地，以后就不用再问了。
function getApiConfig() {
  let url = localStorage.getItem('api_url');
  let token = localStorage.getItem('api_token');
  if (!url || !token) {
    url = (prompt('请输入后端地址（Apps Script 部署网址）：', url || '') || '').trim();
    token = (prompt('请输入密码（token）：', token || '') || '').trim();
    if (url) localStorage.setItem('api_url', url);
    if (token) localStorage.setItem('api_token', token);
  }
  return { url, token };
}

function defaultState() {
  return {
    settings: { baseMetabolism: 1300, extraBase: 300 },
    intake: { days: {} },
  };
}

let state = defaultState();
let dirty = false;
let offline = false;

function cacheLocally() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch (e) {
    /* 存储满了也不影响主流程 */
  }
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed, {
      settings: Object.assign(defaultState().settings, parsed.settings),
      intake: Object.assign(defaultState().intake, parsed.intake),
    });
  } catch (e) {
    return null;
  }
}

async function bootState() {
  try {
    const { url, token } = getApiConfig();
    if (!url || !token) throw new Error('not configured');
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state = data;
    offline = false;
    cacheLocally();
  } catch (e) {
    offline = true;
    const cached = loadLocalCache();
    if (cached) state = cached;
    showOfflineBanner();
  }
}

function showOfflineBanner() {
  const bar = document.getElementById('save-bar');
  bar.dataset.offline = '1';
  document.getElementById('save-status').textContent = '离线：无法连接服务器，正在用本机缓存';
}

// ---- 未保存修改的标记 + 保存条 ----
function markDirty() {
  dirty = true;
  cacheLocally();
  updateSaveBar('dirty');
}

function updateSaveBar(mode, extra) {
  const bar = document.getElementById('save-bar');
  const status = document.getElementById('save-status');
  bar.dataset.mode = mode;
  if (mode === 'dirty') status.textContent = '有未保存的修改';
  else if (mode === 'saving') status.textContent = '保存中…';
  else if (mode === 'saved') {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    status.textContent = `已保存 · ${hh}:${mm}`;
  } else if (mode === 'error') status.textContent = extra || '保存失败，请检查服务器，点击重试';
  else status.textContent = '';
}

async function syncToServer() {
  updateSaveBar('saving');
  try {
    const { url, token } = getApiConfig();
    if (!url || !token) throw new Error('not configured');
    // 不显式设置 Content-Type，让浏览器默认用 text/plain，
    // 避免触发 CORS 预检请求（Apps Script Web App 不支持 OPTIONS 预检）。
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ token, state }),
    });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    offline = false;
    document.getElementById('save-bar').dataset.offline = '';
    dirty = false;
    updateSaveBar('saved');
  } catch (e) {
    offline = true;
    updateSaveBar('error');
  }
}

window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateKey, delta) {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function baselineTotal() {
  return (state.settings.baseMetabolism || 0) + (state.settings.extraBase || 0);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 1600);
}

// ---- 安全的算式求值（卡路里输入框用），不用 eval/Function ----
function evalCalExpr(raw) {
  if (raw == null) return null;
  const str = String(raw).trim().replace(/[xX×]/g, '*').replace(/[÷]/g, '/');
  if (str === '') return null;
  if (!/^[0-9+\-*/(). ]+$/.test(str)) return null;

  let i = 0;
  function skipSpace() {
    while (str[i] === ' ') i++;
  }
  function parseNumber() {
    skipSpace();
    const start = i;
    if (str[i] === '+' || str[i] === '-') i++;
    let sawDigit = false;
    while (i < str.length && /[0-9]/.test(str[i])) {
      i++;
      sawDigit = true;
    }
    if (str[i] === '.') {
      i++;
      while (i < str.length && /[0-9]/.test(str[i])) {
        i++;
        sawDigit = true;
      }
    }
    if (!sawDigit) throw new Error('bad number');
    return Number(str.slice(start, i));
  }
  function parseFactor() {
    skipSpace();
    if (str[i] === '(') {
      i++;
      const v = parseExpr();
      skipSpace();
      if (str[i] !== ')') throw new Error('missing )');
      i++;
      return v;
    }
    if (str[i] === '-') {
      i++;
      return -parseFactor();
    }
    if (str[i] === '+') {
      i++;
      return parseFactor();
    }
    return parseNumber();
  }
  function parseTerm() {
    let v = parseFactor();
    skipSpace();
    while (str[i] === '*' || str[i] === '/') {
      const op = str[i];
      i++;
      const rhs = parseFactor();
      v = op === '*' ? v * rhs : v / rhs;
      skipSpace();
    }
    return v;
  }
  function parseExpr() {
    let v = parseTerm();
    skipSpace();
    while (str[i] === '+' || str[i] === '-') {
      const op = str[i];
      i++;
      const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
      skipSpace();
    }
    return v;
  }

  try {
    const result = parseExpr();
    skipSpace();
    if (i !== str.length) return null;
    if (!Number.isFinite(result)) return null;
    return result;
  } catch (e) {
    return null;
  }
}

// ---- 导航 ----
const VIEW_TITLES = { record: '摄入记录', history: '历史趋势', settings: '设置' };

function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  document.querySelectorAll('.tab-bar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('page-title').textContent = VIEW_TITLES[name] || '';
  if (name === 'history' && window.renderHistory) window.renderHistory();
  if (name === 'settings' && window.renderSettings) window.renderSettings();
  if (name === 'record' && window.renderRecord) window.renderRecord();
}

async function boot() {
  await bootState();

  document.querySelectorAll('.tab-bar button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchView(btn.dataset.tab);
    });
  });

  document.getElementById('save-btn').addEventListener('click', syncToServer);

  if (window.initRecord) window.initRecord();
  if (window.initHistory) window.initHistory();
  if (window.initSettings) window.initSettings();

  switchView('record');
  updateSaveBar(offline ? 'error' : 'saved');
  if (offline) showOfflineBanner();

  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('app-root').style.display = '';

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', boot);
