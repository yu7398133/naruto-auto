// 自愈加载器：篡改猴脚本管理器的问题不影响本脚本
// 思路：把「后台保活」做成页面级持久脚本，由用户浏览器主页注入，
// 或作为独立 userscript 安装。这里生成一个自包含的独立脚本文件。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'naruto-auto.user.js');

const src = fs.readFileSync(SRC, 'utf8');

// 提取看门狗实现，生成独立小脚本（不被主脚本的安装状态影响）
const standalone = `// ==UserScript==
// @name         火影后台保活看门狗
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      1.0.0
// @description  独立看门狗：窗口最小化时自动唤醒被冻结的云游戏 video，保证视觉链路持续可用。可单独安装，不依赖主脚本版本。
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

  const WATCH_MS = 3000;
  const TAG = '[bgwatchdog]';

  const state = { ticks: 0, revives: 0, fails: 0, hidden: null, sameFrame: 0, lastCt: null, lastHash: null };
  window.__na_bg_watchdog_state__ = state;

  const say = (m) => console.log(TAG, m);

  function findVideo() {
    // 优先用主脚本绑定的元素，回退到直接查 DOM
    const A = window.__narutoAuto;
    if (A && A.vision && A.vision.video) return A.vision.video;
    return document.querySelector('video');
  }

  function hashFrame(v) {
    try {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d');
      cx.drawImage(v, 0, 0, 32, 32);
      const d = cx.getImageData(0, 0, 32, 32).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 8) h = (h * 31 + d[i]) >>> 0;
      return h;
    } catch (e) { return null; }
  }

  if (window.__na_bg_watchdog__) clearInterval(window.__na_bg_watchdog__);

  window.__na_bg_watchdog__ = setInterval(() => {
    state.ticks++;
    const v = findVideo();
    if (!v || v.tagName !== 'VIDEO') return;

    const hidden = !!document.hidden;
    if (hidden !== state.hidden) {
      state.hidden = hidden;
      say(hidden ? '页面进入后台，看门狗启动' : '页面回到前台');
    }

    if (hidden) {
      if (v.readyState === 0) return;          // 重置中，等它自己恢复
      if (v.paused) {
        const p = v.play();
        if (p && p.then) {
          p.then(() => { state.revives++; say('后台唤醒成功 #' + state.revives); })
           .catch(e => { state.fails++; say('后台唤醒失败: ' + ((e && e.name) || e)); });
        }
        return;
      }
    }

    // 陈帧检测
    if (v.readyState >= 2 && v.videoWidth > 0) {
      const t = +(v.currentTime || 0);
      const h = hashFrame(v);
      if (state.lastCt !== null && Math.abs(t - state.lastCt) < 0.001 && h !== null && h === state.lastHash) {
        if (++state.sameFrame === 4) say('警告：画面连续 4 次未变化，视觉可能已失效 (ct=' + t + ')');
      } else state.sameFrame = 0;
      state.lastCt = t; state.lastHash = h;
    }
  }, WATCH_MS);

  say('看门狗已启动 (' + WATCH_MS + 'ms)');
})();
`;

const outPath = path.join(ROOT, 'naruto-bg-watchdog.user.js');
fs.writeFileSync(outPath, standalone, 'utf8');

console.log('已生成独立脚本:', outPath);
console.log('大小:', standalone.length, '字节');
console.log('主脚本:', src.length, '字节 (含 _watchBackground:', src.includes('_watchBackground'), ')');
