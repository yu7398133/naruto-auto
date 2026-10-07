(() => {
  const out = {};
  out.title = document.title;
  out.url = location.href;
  out.hasLog = typeof window.logger !== 'undefined';
  // TM 自身的日志
  if (window.logger && window.logger.getAllLogs) {
    try {
      const logs = window.logger.getAllLogs();
      out.tmLogs = logs.slice(-40).map(l => {
        try { return JSON.stringify(l).slice(0, 400); } catch (e) { return String(l).slice(0, 200); }
      });
    } catch (e) { out.logErr = String(e); }
  }
  // 页面里显示的日志区
  const logEls = document.querySelectorAll('#log, .log, [id*="log"]');
  out.logAreaText = Array.from(logEls).map(e => (e.innerText || '').slice(0, 1500)).join('\n---\n').slice(0, 2500);
  return JSON.stringify(out, null, 1);
})()
