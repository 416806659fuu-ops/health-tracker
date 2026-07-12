// ---- 设置页 ----
function initSettings() {
  document.getElementById('setting-base').addEventListener('input', (e) => {
    state.settings.baseMetabolism = Number(e.target.value) || 0;
    markDirty();
    updateSettingsSum();
    renderRecordSafely();
  });
  document.getElementById('setting-extra').addEventListener('input', (e) => {
    state.settings.extraBase = Number(e.target.value) || 0;
    markDirty();
    updateSettingsSum();
    renderRecordSafely();
  });

  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-input').addEventListener('change', importData);
  document.getElementById('clear-btn').addEventListener('click', clearData);
  document.getElementById('reset-api-btn').addEventListener('click', () => {
    localStorage.removeItem('api_url');
    localStorage.removeItem('api_token');
    location.reload();
  });
}

function renderRecordSafely() {
  if (window.renderRecord) window.renderRecord();
}

// 整份 state 被换掉之后（导入/清空），把每个页面都重画一遍
function renderAllViews() {
  renderSettings();
  renderRecordSafely();
  if (window.renderStrength) window.renderStrength();
}

function updateSettingsSum() {
  const sum = (state.settings.baseMetabolism || 0) + (state.settings.extraBase || 0);
  document.getElementById('setting-sum').textContent = `合计（每日消耗基准）：${sum} kcal`;
}

function renderSettings() {
  document.getElementById('setting-base').value = state.settings.baseMetabolism;
  document.getElementById('setting-extra').value = state.settings.extraBase;
  updateSettingsSum();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `健康记录备份-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出备份文件');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.intake || !parsed.settings) throw new Error('格式不对');
      if (!confirm('导入将覆盖服务器上当前所有数据，确定继续吗？')) return;
      // 老备份里没有 strength 字段，补齐后再用，否则重训页会拿到 undefined
      state = mergeIntoDefaults(parsed);
      renderAllViews();
      await syncToServer();
      showToast('导入成功，已保存到服务器');
    } catch (err) {
      alert('文件格式不正确，导入失败');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

async function clearData() {
  if (!confirm('将清空服务器上保存的所有摄入记录、重训记录和动作库，且无法恢复，确定吗？')) return;
  state = defaultState();
  renderAllViews();
  await syncToServer();
  showToast('已清空全部数据');
}

window.initSettings = initSettings;
window.renderSettings = renderSettings;
