(function () {
  const A = window.__narutoAuto;
  const out = {};
  if (A && A.config && A.config.get) {
    // 导出关键配置段，作为重装前的保险备份
    const sections = ['nav', 'vision', 'battle', 'input', 'runtime', 'ui'];
    out.config = {};
    for (const s of sections) {
      try { out.config[s] = A.config.get(s); } catch (e) { out.config[s] = 'err:' + e; }
    }
  }
  // localStorage 里的持久化配置
  try {
    out.lsKeys = Object.keys(localStorage).filter(k => /naruto|na_/i.test(k));
    out.lsData = {};
    for (const k of out.lsKeys) out.lsData[k] = String(localStorage.getItem(k)).slice(0, 3000);
  } catch (e) { out.lsErr = String(e); }
  window.__na_config_backup__ = JSON.stringify(out);
  return JSON.stringify({
    captured: true,
    keys: out.lsKeys,
    navBlindBack: out.config && out.config.nav ? out.config.nav.blindBack : null,
    size: (window.__na_config_backup__ || '').length
  }, null, 1);
})()
