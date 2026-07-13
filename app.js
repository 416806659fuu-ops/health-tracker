// ---- 核心：与后端同步的状态 / 保存条 / 通用工具 ----
const CACHE_KEY = 'health-tracker-cache-v3';
// 旧版本的缓存键，按从新到旧排列。加了重训模块之后缓存结构变了，但旧设备上
// 可能还躺着没来得及保存的摄入记录，所以新版读不到 v3 时会回头去读 v2，
// 缺的字段用默认值补齐。第一次 cacheLocally() 之后就自动写成 v3 了。
const LEGACY_CACHE_KEYS = ['health-tracker-cache-v2'];

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

// 组间休息时长（秒）：热身组之后 30s，正式组之间 60s，一个动作全部练完 180s
const DEFAULT_REST = { afterWarmup: 30, betweenSets: 60, betweenExercises: 180 };

function defaultState() {
  return {
    settings: { baseMetabolism: 1300, extraBase: 300, rest: { ...DEFAULT_REST } },
    intake: { days: {} },
    strength: { catalog: [], days: {} },
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
  for (const key of [CACHE_KEY, ...LEGACY_CACHE_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      return mergeIntoDefaults(JSON.parse(raw));
    } catch (e) {
      /* 这一份坏了就试下一份 */
    }
  }
  return null;
}

// 把任意一份（可能是旧版、可能缺字段的）数据补齐成完整结构。
// 服务器返回的数据也走这里，因为 GAS 那边如果还没部署重训表，也不会有 strength。
function mergeIntoDefaults(parsed) {
  const d = defaultState();
  const settings = Object.assign(d.settings, parsed.settings);
  // rest 是嵌套对象，上面那行会整个替换掉它，所以单独再补一次缺失的键
  settings.rest = Object.assign({ ...DEFAULT_REST }, (parsed.settings || {}).rest);
  return Object.assign(d, parsed, {
    settings,
    intake: Object.assign(d.intake, parsed.intake),
    strength: Object.assign(d.strength, parsed.strength),
  });
}

// 「没配置后端」和「配置了但连不上」是两回事，提示语不能混为一谈：
// 前者要引导你去填地址，后者才是真的离线。
let notConfigured = false;

async function bootState() {
  try {
    const { url, token } = getApiConfig();
    if (!url || !token) {
      notConfigured = true;
      throw new Error('not configured');
    }
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state = mergeIntoDefaults(data);
    offline = false;
    notConfigured = false;
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
  const status = document.getElementById('save-status');
  const hasCache = !!loadLocalCache();

  if (notConfigured) {
    status.textContent = '还没连后端，点这里设置';
    status.style.cursor = 'pointer';
    status.onclick = () => {
      localStorage.removeItem('api_url');
      localStorage.removeItem('api_token');
      location.reload();
    };
  } else if (hasCache) {
    status.textContent = '离线：无法连接服务器，正在用本机缓存';
  } else {
    status.textContent = '无法连接服务器，且本机没有缓存';
  }
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
const VIEW_TITLES = { record: '摄入记录', history: '历史趋势', strength: '重训记录', settings: '设置' };

function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  document.querySelectorAll('.tab-bar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('page-title').textContent = VIEW_TITLES[name] || '';
  if (name === 'history' && window.renderHistory) window.renderHistory();
  if (name === 'settings' && window.renderSettings) window.renderSettings();
  if (name === 'record' && window.renderRecord) window.renderRecord();
  if (name === 'strength' && window.renderStrength) window.renderStrength();
  requestAnimationFrame(fitFlatViewHeight);
}

// 记录页/历史页要求整页不滑动、内容收在屏幕里——跟重训页同样的思路
// （见 session.js 的 fitSessionHeight）：算死的 calc() 遇到离线提示条换行、
// 各手机安全区高度不同就会不准，所以改成实测剩余高度再写死。
// 设置/重训页不需要这个限制，保持原来能滑动的样子。
function fitFlatViewHeight() {
  const active = document.querySelector('.view.active');
  if (!active) return;
  if (active.dataset.view !== 'record' && active.dataset.view !== 'history') {
    active.style.height = '';
    return;
  }
  const frame = document.getElementById('phone-screen'); // 预览壳里量壳内高度，真机上量视口
  const viewportH = frame ? frame.clientHeight : window.innerHeight;
  const stickyTop = document.querySelector('.sticky-top');
  const mainEl = document.getElementById('app-root');
  const topH = stickyTop ? stickyTop.offsetHeight : 0;
  const mainStyle = mainEl ? getComputedStyle(mainEl) : null;
  const mainPad = mainStyle ? parseFloat(mainStyle.paddingTop) + parseFloat(mainStyle.paddingBottom) : 0;
  // 底部导航栏是 position:fixed，真正给它让位的是 body 自己的 padding-bottom
  // （见 style.css）。这里不能再单独量一次 tab-bar 高度去减——
  // 两处各量一次很容易对不上，多出的差值就是那一点点还能滑动的缝。
  // 统一只认 body 这一份 padding，才不会有两边不一致的问题。
  const bodyPadBottom = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  active.style.height = `${Math.max(200, viewportH - topH - mainPad - bodyPadBottom)}px`;
}

window.addEventListener('resize', () => requestAnimationFrame(fitFlatViewHeight));
window.addEventListener('orientationchange', () => setTimeout(() => requestAnimationFrame(fitFlatViewHeight), 120));

async function boot() {
  await bootState();

  document.querySelectorAll('.tab-bar button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchView(btn.dataset.tab);
    });
  });

  document.getElementById('save-btn').addEventListener('click', syncToServer);

  // 每个模块独立初始化：某一个出错时，其他页面照常能用，
  // 而不是整个 app 卡在「加载中…」——摄入记录是每天都要用的，不能被重训拖垮。
  [
    ['记录', window.initRecord],
    ['历史', window.initHistory],
    ['重训', window.initStrength],
    ['设置', window.initSettings],
  ].forEach(([label, init]) => {
    if (!init) return;
    try {
      init();
    } catch (e) {
      console.error(`[${label}] 初始化失败`, e);
    }
  });

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
