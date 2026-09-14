// ==UserScript==
// @name         NarutoAuto 诊断器 (Diag)
// @namespace    naruto-auto-diag
// @version      0.1.0
// @description  一次性诊断：SDK 对象 / 画面元素 / canvas 取像素 / 点击是否生效。跑完点「复制报告」贴给开发者。
// @author       naruto-auto
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.__naDiagLoaded) return;
  window.__naDiagLoaded = true;

  const BASE_W = 1280, BASE_H = 720;

  const CANDIDATES = [
    'TCGSDK', 'tcgSdk', 'TCG_SDK', 'tcg',
    'GMSDK', 'gmSdk', '__GMSDK__', 'gamematrix', 'GM_SDK',
    'sdk', 'SDK', 'cloudGame', 'CloudGame', 'cloudSdk',
    'tcgInstance', 'gameSdk', 'GameSDK', 'liveSdk', 'player',
  ];

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback === undefined ? ('ERR:' + (e && e.message)) : fallback; }
  }

  function allWindows() {
    const list = [{ tag: 'top', w: window }];
    try { if (window.parent && window.parent !== window) list.push({ tag: 'parent', w: window.parent }); } catch (e) {}
    document.querySelectorAll('iframe').forEach((f, i) => {
      let cw = null;
      try { cw = f.contentWindow; } catch (e) {}
      if (cw) list.push({ tag: 'iframe#' + i, w: cw });
      else {
        let src = '';
        try { src = f.src; } catch (e) {}
        list.push({ tag: 'iframe#' + i + '(cross)', w: null, src });
      }
    });
    return list;
  }

  function collectSdk() {
    const found = [];
    const wins = allWindows();
    for (const { tag, w, src } of wins) {
      if (!w) { found.push({ where: tag, src, crossOrigin: true }); continue; }
      for (const name of CANDIDATES) {
        const obj = safe(() => w[name], null);
        if (!obj || typeof obj !== 'object') continue;
        const methods = [];
        safe(() => {
          let cur = obj, seen = new Set();
          while (cur && cur !== Object.prototype && !seen.has(cur)) {
            seen.add(cur);
            Object.getOwnPropertyNames(cur).forEach(k => {
              try { if (typeof cur[k] === 'function' && !methods.includes(k)) methods.push(k); } catch (e) {}
            });
            cur = Object.getPrototypeOf(cur);
          }
        });
        if (!methods.length) continue;
        found.push({
          where: tag,
          name,
          methods,
          inputMethods: methods.filter(m => /mouse|touch|key|input|click|tap|event|send/i.test(m)),
          src: Object.fromEntries(
            methods.filter(m => /mouse|touch|key|click|tap|input|send/i.test(m)).slice(0, 8)
              .map(m => [m, safe(() => String(obj[m]).replace(/\s+/g, ' ').slice(0, 240), '?')])
          ),
        });
      }
    }
    return found;
  }

  function collectMedia() {
    const out = [];
    const wins = allWindows();
    for (const { tag, w } of wins) {
      if (!w || !w.document) continue;
      safe(() => {
        w.document.querySelectorAll('video,canvas').forEach(el => {
          const r = el.getBoundingClientRect();
          out.push({
            where: tag,
            tagName: el.tagName,
            id: el.id || '',
            cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80),
            videoW: el.videoWidth || el.width || 0,
            videoH: el.videoHeight || el.height || 0,
            cssW: Math.round(r.width), cssH: Math.round(r.height),
            left: Math.round(r.left), top: Math.round(r.top),
            srcType: el.currentSrc ? el.currentSrc.split(':')[0] : (el.src ? el.src.split(':')[0] : ''),
            readyState: el.readyState,
            paused: el.paused,
          });
        });
      });
    }
    return out;
  }

  function pickBest(media) {
    const vids = media.filter(m => m.tagName === 'VIDEO' && m.videoW > 0);
    if (vids.length) return vids.sort((a, b) => b.videoW * b.videoH - a.videoW * a.videoH)[0];
    const cvs = media.filter(m => m.tagName === 'CANVAS' && m.videoW > 0);
    if (cvs.length) return cvs.sort((a, b) => b.videoW * b.videoH - a.videoW * a.videoH)[0];
    return null;
  }

  function findEl(media, best) {
    if (!best) return null;
    const wins = allWindows();
    for (const { w } of wins) {
      if (!w || !w.document) continue;
      const els = w.document.querySelectorAll('video,canvas');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (el.tagName === best.tagName &&
            Math.round(r.width) === best.cssW && Math.round(r.height) === best.cssH &&
            (el.videoWidth || el.width || 0) === best.videoW) return el;
      }
    }
    return null;
  }

  // ---- 帧捕获 ----
  const cv = document.createElement('canvas');
  cv.width = BASE_W; cv.height = BASE_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let target = null;

  function grab() {
    if (!target) return null;
    ctx.drawImage(target, 0, 0, BASE_W, BASE_H);
    return ctx.getImageData(0, 0, BASE_W, BASE_H);
  }

  function signature() {
    const img = grab();
    if (!img) return null;
    const d = img.data, out = new Uint8Array(64 * 36);
    for (let y = 0; y < 36; y++) {
      for (let x = 0; x < 64; x++) {
        const sx = Math.floor(x * BASE_W / 64), sy = Math.floor(y * BASE_H / 36);
        const i = (sy * BASE_W + sx) * 4;
        out[y * 64 + x] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      }
    }
    return out;
  }

  function diff(a, b) {
    if (!a || !b) return -1;
    let n = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 12) n++;
    return n * 100 / a.length;
  }

  function brightness() {
    const img = grab();
    if (!img) return -1;
    const d = img.data; let s = 0;
    for (let i = 0; i < d.length; i += 16) s += (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return s / (d.length / 16);
  }

  // ---- 点击 ----
  const INPUT_METHODS = ['sendMouseEvent', 'sendRawEvent', 'sendTouchEvent', 'sendInputEvent', 'sendClick', 'click'];
  let sdkObj = null, sdkName = null, activeMethod = 'sendMouseEvent';

  function pickSdk() {
    const wins = allWindows();
    for (const { w } of wins) {
      if (!w) continue;
      for (const name of CANDIDATES) {
        const obj = safe(() => w[name], null);
        if (obj && typeof obj === 'object' && INPUT_METHODS.some(m => typeof obj[m] === 'function')) {
          sdkObj = obj; sdkName = name;
          activeMethod = INPUT_METHODS.find(m => typeof obj[m] === 'function');
          return true;
        }
      }
    }
    return false;
  }

  function rawSend(type, x, y) {
    if (!sdkObj) throw new Error('SDK 未找到');
    const t = activeMethod === 'sendTouchEvent'
      ? (type === 'mousedown' ? 'touchstart' : type === 'mouseup' ? 'touchend' : 'touchmove')
      : type;
    const payloads = [
      { type: t, x, y, button: 0 },
      { type, x, y, button: 0 },
      { type: t, x, y },
      { x, y, type: t },
    ];
    let lastErr = null;
    for (const p of payloads) {
      try { const r = sdkObj[activeMethod](p); return { payload: p, ret: r === undefined ? null : String(r).slice(0, 80) }; }
      catch (e) { lastErr = e && e.message; }
    }
    throw new Error('所有载荷格式都失败: ' + lastErr);
  }

  let mode = 'stream';
  function mapCoord(x, y) {
    if (mode === 'raw') return { x: Math.round(x), y: Math.round(y) };
    if (mode === 'dom' && target) {
      const r = target.getBoundingClientRect();
      return { x: Math.round(r.left + x * r.width / BASE_W), y: Math.round(r.top + y * r.height / BASE_H) };
    }
    const s = { w: target && target.videoWidth || BASE_W, h: target && target.videoHeight || BASE_H };
    return { x: Math.round(x * s.w / BASE_W), y: Math.round(y * s.h / BASE_H) };
  }

  const logLines = [];
  function log(s) { logLines.push(s); console.log('[Diag]', s); }

  // ---- UI ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;top:12px;width:330px;z-index:2147483647;' +
    'background:#fff;color:#222;border:1px solid #bbb;border-radius:10px;padding:10px;' +
    'font:12px/1.5 "Microsoft YaHei",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);max-height:92vh;overflow:auto';
  panel.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:6px">🍥 NarutoAuto 诊断器</div>
    <div id="dg-status" style="background:#f5f5f5;padding:6px;border-radius:6px;margin-bottom:8px;white-space:pre-wrap">扫描中…</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      <button id="dg-scan" style="${btn}">🔄 重新扫描</button>
      <button id="dg-copy" style="${btn}">📋 复制报告</button>
      <button id="dg-shot" style="${btn}">📷 存截图</button>
    </div>
    <div style="border-top:1px solid #eee;padding-top:8px">
      <div style="font-weight:600;margin-bottom:4px">点击测试（验证点不点得动）</div>
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
        <span>X</span><input id="dg-x" value="66" style="${inp}">
        <span>Y</span><input id="dg-y" value="677" style="${inp}">
      </div>
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">
        <span>模式</span>
        <select id="dg-mode" style="${inp}">
          <option value="stream">stream(按串流分辨率)</option>
          <option value="dom">dom(按元素CSS尺寸)</option>
          <option value="raw">raw(原样1280x720)</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="dg-test" style="${btn}">👆 点一下(前後對比)</button>
        <button id="dg-esc" style="${btn}">ESC</button>
      </div>
      <div id="dg-testout" style="background:#f5f5f5;padding:6px;border-radius:6px;margin-top:6px;white-space:pre-wrap;min-height:34px"></div>
    </div>
    <div style="border-top:1px solid #eee;padding-top:8px;margin-top:8px">
      <div style="font-weight:600;margin-bottom:4px">取色（点画面读颜色）</div>
      <canvas id="dg-cv" width="320" height="180" style="width:100%;border:1px solid #ddd;background:#000;cursor:crosshair"></canvas>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button id="dg-grab" style="${btn}">🖼 抓帧</button>
        <span id="dg-color" style="align-self:center;color:#666"></span>
      </div>
    </div>
  `.replace(/\$\{btn\}|\$\{inp\}/g, m => m === '${btn}'
    ? 'padding:4px 8px;border:1px solid #ccc;border-radius:5px;background:#fafafa;cursor:pointer;font-size:12px'
    : 'width:52px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;font-size:12px');
  document.documentElement.appendChild(panel);

  const $ = id => panel.querySelector('#' + id);

  function refresh() {
    const media = collectMedia();
    const best = pickBest(media);
    const el = findEl(media, best);
    if (el) target = el;
    const hasSdk = !!sdkObj || pickSdk();

    let visionOk = false, visionErr = '';
    try { const s = signature(); visionOk = !!s; } catch (e) { visionErr = e && e.message || String(e); }

    $('dg-status').textContent =
      `SDK: ${hasSdk ? sdkName + ' / ' + activeMethod : '❌ 未找到'}\n` +
      `画面: ${best ? best.tagName + ' ' + best.videoW + 'x' + best.videoH + ' (css ' + best.cssW + 'x' + best.cssH + ')' : '❌ 未找到'}\n` +
      `取像素: ${visionOk ? '✅ 正常' : '❌ ' + (visionErr || '失败')}\n` +
      `亮度: ${visionOk ? brightness().toFixed(1) : '-'}`;
    log(`SDK=${hasSdk ? sdkName : 'NONE'} media=${best ? best.tagName + best.videoW + 'x' + best.videoH : 'NONE'} vision=${visionOk ? 'OK' : 'FAIL ' + visionErr}`);
    return { hasSdk, visionOk, visionErr };
  }

  $('dg-scan').onclick = () => { logLines.length = 0; sdkObj = null; target = null; refresh(); };

  $('dg-copy').onclick = async () => {
    const rep = buildReport();
    const text = JSON.stringify(rep, null, 2);
    try { await navigator.clipboard.writeText(text); $('dg-status').textContent = '✅ 报告已复制到剪贴板，粘贴给开发者'; }
    catch (e) { console.log(text); $('dg-status').textContent = '复制失败，已打印到控制台'; }
  };

  $('dg-shot').onclick = () => {
    if (!target) return;
    const c = document.createElement('canvas');
    c.width = target.videoWidth || 1280; c.height = target.videoHeight || 720;
    try { c.getContext('2d').drawImage(target, 0, 0); } catch (e) { alert('截图失败: ' + e.message); return; }
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'naruto-frame-' + Date.now() + '.png';
    a.click();
  };

  $('dg-mode').onchange = e => { mode = e.target.value; log('坐标模式=' + mode); };

  $('dg-test').onclick = async () => {
    const out = $('dg-testout');
    const x = parseInt($('dg-x').value, 10), y = parseInt($('dg-y').value, 10);
    if (!sdkObj) { out.textContent = '❌ SDK 未找到，无法点击'; return; }
    const before = signature();
    const p = mapCoord(x, y);
    let sent = null, err = null;
    try {
      sent = rawSend('mousedown', p.x, p.y);
      await new Promise(r => setTimeout(r, 60));
      rawSend('mouseup', p.x, p.y);
    } catch (e) { err = e && e.message || String(e); }
    await new Promise(r => setTimeout(r, 900));
    const after = signature();
    const d = diff(before, after);
    out.textContent =
      `逻辑(${x},${y}) → 发送(${p.x},${p.y}) 模式=${mode}\n` +
      `方法=${activeMethod} ${sent ? '载荷=' + JSON.stringify(sent.payload) + ' 返回=' + sent.ret : ''}\n` +
      (err ? `❌ 发送失败: ${err}\n` : '') +
      `画面变化=${d < 0 ? '?' : d.toFixed(1) + '%'} ${d > 3 ? '(有反应 ✅)' : '(几乎没变 ⚠ 可能没点中)'}\n` +
      `请看画面是否真的有变化——这比数字更准。`;
    log(`CLICK(${x},${y})->(${p.x},${p.y}) mode=${mode} method=${activeMethod} err=${err || 'none'} delta=${d.toFixed(1)}%`);
  };

  $('dg-esc').onclick = async () => {
    if (!sdkObj) return;
    try { sdkObj.sendKeyboardEvent({ type: 'keydown', key: 'Escape' }); } catch (e) {
      try { sdkObj.sendKeyboardEvent({ type: 'keydown', keyCode: 27 }); } catch (e2) { log('ESC 失败'); }
    }
    setTimeout(() => { try { sdkObj.sendKeyboardEvent({ type: 'keyup', key: 'Escape' }); } catch (e) {} }, 80);
    log('发送 ESC');
  };

  $('dg-grab').onclick = () => {
    const c = $('dg-cv'), g = c.getContext('2d');
    try {
      g.drawImage(target, 0, 0, c.width, c.height);
      $('dg-color').textContent = '已抓帧，点图取色';
    } catch (e) { $('dg-color').textContent = '失败: ' + e.message; }
  };

  $('dg-cv').onclick = e => {
    const c = $('dg-cv'), g = c.getContext('2d');
    const r = c.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) * c.width / r.width);
    const py = Math.floor((e.clientY - r.top) * c.height / r.height);
    let d;
    try { d = g.getImageData(px, py, 1, 1).data; }
    catch (err) { $('dg-color').textContent = '取色失败(跨域): ' + err.message; return; }
    const gx = Math.round(px * BASE_W / c.width), gy = Math.round(py * BASE_H / c.height);
    $('dg-color').innerHTML = `RGB(${d[0]},${d[1]},${d[2]}) @逻辑(${gx},${gy})`;
    log(`取色 RGB(${d[0]},${d[1]},${d[2]}) @(${gx},${gy})`);
  };

  function buildReport() {
    const media = collectMedia();
    const best = pickBest(media);
    let visionOk = false, visionErr = '', bright = -1;
    try { const s = signature(); visionOk = !!s; if (visionOk) bright = brightness(); }
    catch (e) { visionErr = e && e.message || String(e); }
    return {
      ts: new Date().toISOString(),
      url: location.href,
      ua: navigator.userAgent.slice(0, 160),
      screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio },
      sdkCandidates: collectSdk(),
      chosen: { name: sdkName, method: activeMethod },
      frames: allWindows().map(f => ({ tag: f.tag, crossOrigin: !!f.src, src: (f.src || '').slice(0, 120) })),
      media,
      bestMedia: best,
      vision: { canGrab: visionOk, error: visionErr, brightness: bright },
      clickMode: mode,
      coordExample: (function () {
        const out = {};
        for (const m of ['stream', 'dom', 'raw']) {
          mode = m; out[m] = mapCoord(66, 677); mode = 'stream';
        }
        return out;
      })(),
      log: logLines.slice(-60),
    };
  }

  window.__naDiag = { report: buildReport, refresh, log: logLines };
  console.log('%c[NarutoAuto 诊断器] 已加载。执行 __naDiag.report() 可拿完整报告，或点右上角面板「复制报告」。', 'color:#e67e22;font-weight:bold');

  setTimeout(() => { try { refresh(); } catch (e) { console.error(e); } }, 1200);
  setTimeout(() => { try { refresh(); } catch (e) { console.error(e); } }, 5000);
})();
