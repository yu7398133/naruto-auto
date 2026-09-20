// ==UserScript==
// @name         云游戏后台保活自检
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      1.0.0
// @description  验证云游戏页在「最小化 / 被其他窗口遮挡 / 切到其他虚拟桌面 / 锁屏」时，画面是否仍在渲染、视频是否仍在解码、JS 定时器是否被节流。配合 Chrome 策略 WindowOcclusionEnabled=0 使用。不点击、不操作，纯观测。
// @author       naruto-auto
// @match        https://start.qq.com/*
// @match        https://*.start.qq.com/*
// @match        https://gamer.qq.com/*
// @match        https://*.gamer.qq.com/*
// @match        https://cloudgame.qq.com/*
// @match        https://*.cloudgame.qq.com/*
// @match        https://cg.qq.com/*
// @match        https://*.cg.qq.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  //  云游戏后台保活自检 1.0.0
  //
  //  用途：回答一个问题 —— "把窗口藏起来之后，云游戏还在跑吗？"
  //  三个独立指标（任一掉下去都说明脚本会失效）：
  //    ① rAF 帧数  —— 页面渲染是否还在推进（被节流时会掉到 1/s 甚至 0）
  //    ② 定时器次数 —— setInterval(250) 的实际触发次数（正常 4/s，节流会掉到 1/s）
  //    ③ 视频 time —— video.currentTime 是否还在涨（MSE 后台优化会停用视频轨道）
  //  另有 visibilityState 变化史 —— 直接看出浏览器到底有没有把页面标成 hidden。
  //
  //  用法：装好后把窗口按要测的方式藏起来，等 30s+，切回来看那条时间带。
  //        绿 = 正常，黄 = 被节流，红 = 已冻结。
  //        「复制报告」会把统计结果拷到剪贴板，可直接粘给我定位。
  //
  //  ⚠ 本脚本**不做任何点击/按键**，不会干扰 naruto-auto 主脚本（面板在左下角，
  //    主脚本悬浮球在右下角，不重叠）。测完可以禁用。
  // ============================================================

  const STEP = 1000;   // 每秒聚合一次
  const KEEP = 600;    // 保留最近 600 秒原始数据
  const SHOW = 180;    // 面板时间带展示最近 180 秒
  const TIMER_HZ = 4;  // setInterval(250) 期望每秒触发次数

  const buckets = [];  // 每秒一格：{ t, vis, raf, timer, vd, frozen, noVideo }
  const visLog = [];   // visibilityState 变化史
  let cur = null;
  let lastCT = -1;
  let videoSeen = false;

  const mkBucket = () => ({
    t: Date.now(), vis: document.visibilityState,
    raf: 0, timer: 0, vd: 0, frozen: false, noVideo: false
  });
  cur = mkBucket();
  buckets.push(cur);

  // ── 指标 ① rAF ────────────────────────────────────────────
  (function rafLoop() { cur.raf++; requestAnimationFrame(rafLoop); })();

  // ── 指标 ② 定时器 ─────────────────────────────────────────
  setInterval(() => { cur.timer++; }, 250);

  // ── 指标 ④ 可见性变化 ─────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    visLog.push({ t: Date.now(), s: document.visibilityState });
    if (visLog.length > 200) visLog.shift();
    render();
  });

  // ── 指标 ③ 视频解码 ───────────────────────────────────────
  function pickVideo() {
    let best = null, bestA = 0;
    try {
      const dig = (doc) => {
        let list = [];
        try { list = doc.querySelectorAll('video'); } catch (e) { return; }
        for (const v of list) {
          const a = (v.videoWidth || 0) * (v.videoHeight || 0);
          if (a > bestA) { bestA = a; best = v; }
        }
      };
      dig(document);
      // 同源 iframe 也翻一遍（云游戏把 video 塞 iframe 的情况）
      try {
        for (const f of document.querySelectorAll('iframe')) {
          if (f.contentDocument) dig(f.contentDocument);
        }
      } catch (e) { /* 跨域，跳过 */ }
    } catch (e) { /* ignore */ }
    return best;
  }

  // ── 面板 ──────────────────────────────────────────────────
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;'
    + 'background:rgba(18,20,24,.93);color:#e8e8e8;'
    + 'font:12px/1.55 ui-monospace,Consolas,"Courier New",monospace;'
    + 'border:1px solid #3a3f47;border-radius:8px;padding:8px 10px;width:344px;'
    + 'user-select:text;pointer-events:auto';
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
    + '<b style="flex:1;font-size:12px">云游戏后台保活自检</b>'
    + '<span data-min style="cursor:pointer;padding:0 6px;border:1px solid #3a3f47;border-radius:4px">—</span>'
    + '</div><div data-body></div>';
  const mount = () => (document.body || document.documentElement).appendChild(box);
  mount();
  const bodyEl = box.querySelector('[data-body]');
  box.querySelector('[data-min]').onclick = () => {
    const hidden = bodyEl.style.display === 'none';
    bodyEl.style.display = hidden ? '' : 'none';
    box.querySelector('[data-min]').textContent = hidden ? '—' : '+';
  };

  const pad = (n) => ('0' + n).slice(-2);
  const hhmmss = (ms) => {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

  /** 单格状态：2=正常 1=被节流 0=冻结 */
  function grade(b, base) {
    const rafOk = base > 0 ? b.raf >= base * 0.5 : b.raf > 0;
    const tmrOk = b.timer >= TIMER_HZ - 1;
    if (!rafOk && !tmrOk) return 0;
    if (rafOk && tmrOk) return 2;
    return 1;
  }

  const C = { 0: '#e24b4a', 1: '#ef9f27', 2: '#639922' };

  function render() {
    try {
      const base = buckets.reduce((m, b) => Math.max(m, b.raf), 1);
      const recent = buckets.slice(-SHOW);
      const r60 = buckets.slice(-60);

      const avgRaf = avg(r60.map((b) => b.raf));
      const avgTmr = avg(r60.map((b) => b.timer));
      const frozen = r60.filter((b) => b.frozen).length;
      const bad = r60.filter((b) => grade(b, base) === 0).length;
      const warn = r60.filter((b) => grade(b, base) === 1).length;

      let verdict, vColor;
      if (!r60.length) { verdict = '采集中…'; vColor = '#888780'; }
      else if (bad / r60.length > 0.3) { verdict = '已冻结 / 严重节流 —— 藏起来会失效'; vColor = C[0]; }
      else if ((warn + bad) / r60.length > 0.2) { verdict = '被部分节流 —— 有风险'; vColor = C[1]; }
      else { verdict = '正常 —— 藏起来仍可运行'; vColor = C[2]; }

      const band = recent.map((b) => {
        const g = grade(b, base);
        const vis = b.vis === 'hidden' ? ' border-top:2px solid #85b7eb' : '';
        return '<span style="flex:1;height:16px;background:' + C[g] + vis + '"></span>';
      }).join('');

      const curVis = document.visibilityState;
      const vTxt = !videoSeen ? '<span style="color:#888780">未找到 video</span>'
        : (cur.frozen ? '<span style="color:' + C[0] + '">已冻结</span>'
          : '<span style="color:' + C[2] + '">解码中 ' + cur.vd.toFixed(2) + 's/s</span>');

      const vl = visLog.slice(-5).reverse().map((x) =>
        '<div style="color:#b4b2a9">' + hhmmss(x.t) + ' → ' + x.s + '</div>').join('') || '<div style="color:#888780">（无变化）</div>';

      bodyEl.innerHTML =
        '<div style="margin-bottom:5px;color:' + vColor + '">' + verdict + '</div>'
        + '<div>可见性 <b>' + curVis + '</b> ｜ 样本 ' + buckets.length + 's</div>'
        + '<div>rAF <b>' + avgRaf.toFixed(1) + '</b>/s（峰值 ' + base + '）'
        + ' ｜ 定时器 <b>' + avgTmr.toFixed(1) + '</b>/' + TIMER_HZ + '/s</div>'
        + '<div>视频 ' + vTxt + (frozen ? ' ｜ 冻结 ' + frozen + 's' : '') + '</div>'
        + '<div style="display:flex;gap:1px;margin:6px 0 3px">' + band + '</div>'
        + '<div style="color:#888780;font-size:11px">← 近 ' + Math.min(SHOW, recent.length)
        + 's；顶边蓝线 = hidden</div>'
        + '<div style="margin-top:6px;border-top:1px solid #3a3f47;padding-top:5px">'
        + '<div style="color:#888780">可见性变化：</div>' + vl + '</div>'
        + '<div style="display:flex;gap:6px;margin-top:7px">'
        + '<span data-copy style="cursor:pointer;padding:2px 8px;border:1px solid #3a3f47;border-radius:4px">复制报告</span>'
        + '<span data-reset style="cursor:pointer;padding:2px 8px;border:1px solid #3a3f47;border-radius:4px">清零</span>'
        + '</div>';

      bodyEl.querySelector('[data-copy]').onclick = () => {
        const lines = [];
        lines.push('# 云游戏后台保活自检报告  ' + new Date().toLocaleString());
        lines.push('页面: ' + location.href.split('?')[0]);
        lines.push('当前 visibilityState=' + document.visibilityState
          + ' | UA=' + (navigator.userAgent.match(/Chrome\/[\d.]+/) || [''])[0]);
        lines.push('样本 ' + buckets.length + 's | rAF 峰值 ' + base + ' | 判读: ' + verdict);
        lines.push('');
        lines.push('## 每秒明细（t / vis / raf / timer / vd / 状态）');
        const t0 = buckets[0] ? buckets[0].t : Date.now();
        for (const b of buckets.slice(-300)) {
          const g = ['冻结', '节流', '正常'][grade(b, base)];
          lines.push([('+' + ((b.t - t0) / 1000).toFixed(0) + 's').padStart(7), b.vis.padEnd(7),
            ('raf=' + b.raf).padEnd(8), ('tmr=' + b.timer).padEnd(7),
            ('vd=' + b.vd.toFixed(2)).padEnd(9), g].join(' '));
        }
        lines.push('');
        lines.push('## visibilityState 变化史');
        for (const x of visLog) lines.push(hhmmss(x.t) + '  ' + x.s);
        const txt = lines.join('\n');
        try {
          navigator.clipboard.writeText(txt).then(
            () => { toast('报告已复制'); },
            () => { toast('复制失败，请手动选中面板内容'); });
        } catch (e) { toast('复制失败'); }
        window.__nhcReport = txt;   // 控制台可用 copy(__nhcReport) 取
      };

      bodyEl.querySelector('[data-reset]').onclick = () => {
        buckets.length = 0; visLog.length = 0;
        cur = mkBucket(); buckets.push(cur);
        lastCT = -1;
        render();
      };
    } catch (e) { /* 渲染失败不影响采集 */ }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);z-index:2147483647;'
      + 'background:rgba(0,0,0,.85);color:#fff;font:12px/1.5 sans-serif;padding:6px 14px;border-radius:6px';
    (document.body || document.documentElement).appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ── 每秒聚合 + 落桶 ───────────────────────────────────────
  setInterval(() => {
    const v = pickVideo();
    if (v) {
      videoSeen = true;
      const ct = v.currentTime;
      cur.vd = lastCT >= 0 ? ct - lastCT : 0;
      cur.frozen = lastCT >= 0 && cur.vd <= 0.001;
      lastCT = ct;
    } else {
      cur.noVideo = true;
    }
    const nb = mkBucket();
    buckets.push(nb);
    cur = nb;
    while (buckets.length > KEEP) buckets.shift();
    render();
  }, STEP);

  render();
  console.log('[hidecheck] 云游戏后台保活自检已启动 v1.0.0 —— 面板在左下角');
})();
