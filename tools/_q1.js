(function () {
  const A = window.__narutoAuto;
  if (!A) return JSON.stringify({ hasApp: false });
  const out = { hasApp: true };
  out.topKeys = Object.keys(A);
  if (A.app) {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(A.app));
    out.appMethods = proto.filter(n => /watch|bg|Background|init/i.test(n));
    out.hasWatchBackground = typeof A.app._watchBackground === 'function';
    out.hasWatchdogTimer = !!A.app._bgWatchdog;
  }
  if (A.config && A.config.get) {
    out.bgWatch = A.config.get('vision.backgroundWatch');
  }
  out.panelTitle = (function () {
    const p = document.querySelector('#na-panel');
    return p ? (p.innerText || '').trim().split('\n')[0] : null;
  })();
  return JSON.stringify(out, null, 1);
})()
