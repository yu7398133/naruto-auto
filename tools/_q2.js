(function () {
  const A = window.__narutoAuto;
  const v = A && A.vision ? A.vision.video : null;
  const st = window.__na_bg_watchdog_state__ || null;
  const out = {
    hasWatchdog: !!window.__na_bg_watchdog__,
    hidden: document.hidden,
    visibility: document.visibilityState,
  };
  if (v && v.tagName === 'VIDEO') {
    out.paused = v.paused;
    out.readyState = v.readyState;
    out.ct = +(v.currentTime || 0).toFixed(2);
    out.vw = v.videoWidth;
    // 帧指纹
    try {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d');
      cx.drawImage(v, 0, 0, 32, 32);
      const d = cx.getImageData(0, 0, 32, 32).data;
      let h = 0, sum = 0;
      for (let i = 0; i < d.length; i += 8) { h = (h * 31 + d[i]) >>> 0; }
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      out.hash = h;
      out.avg = +(sum / (d.length / 4)).toFixed(1);
    } catch (e) { out.hashErr = String(e); }
  }
  if (st) {
    out.ticks = st.ticks;
    out.revives = st.revives;
    out.reviveFails = st.reviveFails;
    out.sameFrameStreak = st.sameFrameStreak;
    out.lastCt = st.lastCt;
    out.recentLog = st.log.slice(-8);
  }
  try {
    out.scene = A.probe ? A.probe().scene : null;
  } catch (e) { out.scene = 'err:' + e; }
  return JSON.stringify(out, null, 1);
})()
