(function () {
  // ============================================================
  //  后台保活看门狗（独立注入层）
  //
  //  背景：窗口最小化时 Chromium 冻结标签页并把 <video> 置为 paused，
  //  画面冻在最后一帧。脚本基于 drawImage(video) 的场景判定会永远返回
  //  同一个结果，于是在错误前提下疯狂点坐标。
  //
  //  实测：主动 play() 可在最小化状态下恢复画面（currentTime 持续推进、
  //  每帧 hash 不同、场景识别正常）。
  //
  //  本层挂到 __narutoAuto.vision 上，不依赖脚本源码能否重新安装。
  // ============================================================
  const A = window.__narutoAuto;
  if (!A || !A.vision) return JSON.stringify({ ok: false, err: 'no __narutoAuto.vision' });

  if (window.__na_bg_watchdog__) {
    clearInterval(window.__na_bg_watchdog__);
  }

  const WATCH_MS = 3000;
  const vision = A.vision;
  const log = (lv, msg) => {
    try {
      if (A.runtime && A.runtime.Utils && A.runtime.Utils.log) A.runtime.Utils.log(lv, msg);
      else console.log('[bgwatchdog]', lv, msg);
    } catch (e) { console.log('[bgwatchdog]', msg); }
  };

  const state = {
    installedAt: Date.now(),
    ticks: 0,
    hidden: null,
    revives: 0,
    reviveFails: 0,
    lastRs: null,
    lastCt: null,
    frozenStreak: 0,
    lastCtAt: null,
    lastHash: null,
    sameFrameStreak: 0,
    log: [],
  };
  window.__na_bg_watchdog_state__ = state;

  const pushLog = (s) => {
    state.log.push(`${new Date().toTimeString().slice(0, 8)} ${s}`);
    if (state.log.length > 60) state.log.shift();
    log('info', s);
  };

  const hashFrame = (v) => {
    try {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d');
      cx.drawImage(v, 0, 0, 32, 32);
      const d = cx.getImageData(0, 0, 32, 32).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 8) { h = (h * 31 + d[i]) >>> 0; }
      return h;
    } catch (e) { return null; }
  };

  window.__na_bg_watchdog__ = setInterval(() => {
    state.ticks++;
    const v = vision.video;
    if (!v || v.tagName !== 'VIDEO') return;

    // 可见性变化记一笔
    const hidden = !!document.hidden;
    if (hidden !== state.hidden) {
      state.hidden = hidden;
      pushLog(hidden ? '👁 进入后台，看门狗启动' : '👁 回到前台');
    }

    const rs = v.readyState;
    state.lastRs = rs;

    if (hidden) {
      // 重置中：不插手，等播放器自己恢复
      if (rs === 0) return;

      if (v.paused) {
        const p = v.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            state.revives++;
            pushLog(`✓ 后台唤醒 play() 成功（累计 ${state.revives} 次）`);
          }).catch(e => {
            state.reviveFails++;
            pushLog(`⚠ 后台唤醒失败：${(e && e.name) || e}（累计 ${state.reviveFails} 次）`);
          });
        }
        return;
      }
    }

    // 陈帧检测：即使没 paused，画面也可能不再更新（更隐蔽的失效）
    if (rs >= 2 && v.videoWidth > 0) {
      const t = +(v.currentTime || 0);
      const h = hashFrame(v);
      if (state.lastCt !== null && Math.abs(t - state.lastCt) < 0.001 && h !== null && h === state.lastHash) {
        if (++state.sameFrameStreak === 4) {
          pushLog(`⚠ 画面连续 ${state.sameFrameStreak} 次未变化（ct=${t}，paused=${v.paused}）——可能已失效`);
        }
      } else {
        state.sameFrameStreak = 0;
      }
      state.lastCt = t;
      state.lastHash = h;
    }
  }, WATCH_MS);

  return JSON.stringify({
    ok: true,
    installed: true,
    intervalMs: WATCH_MS,
    videoReady: !!(vision.video && vision.video.tagName === 'VIDEO'),
    hidden: !!document.hidden,
  }, null, 1);
})()
