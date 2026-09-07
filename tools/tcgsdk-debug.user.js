// ==UserScript==
// @name         TCGSDK 调试助手
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      1.0
// @description  检测 TCGSDK 可用性，测试操控接口
// @match        https://start.qq.com/*
// @match        https://gamer.qq.com/*
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  const log = (msg, type = 'info') => {
    const styles = {
      info: 'color:#3498db',
      ok: 'color:#2ecc71',
      warn: 'color:#f39c12',
      error: 'color:#e74c3c',
    };
    console.log(`%c[TCGSDK-Debug] ${msg}`, styles[type] || '');
  };

  // 检测 TCGSDK
  log('开始检测 TCGSDK...');

  const checkSDK = () => {
    const sources = [
      { name: 'window.TCGSDK', val: window.TCGSDK },
      { name: 'window.top.TCGSDK', val: (() => { try { return window.top.TCGSDK; } catch(e) { return undefined; } })() },
    ];

    // 检查 iframe
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe, i) => {
      try {
        sources.push({ name: `iframe[${i}].TCGSDK`, val: iframe.contentWindow?.TCGSDK });
      } catch(e) { /* cross-origin */ }
    });

    let found = false;
    for (const src of sources) {
      if (src.val && typeof src.val.sendMouseEvent === 'function') {
        log(`✓ 找到 TCGSDK: ${src.name}`, 'ok');
        log(`  - sendMouseEvent: ${typeof src.val.sendMouseEvent}`, 'ok');
        log(`  - sendKeyboardEvent: ${typeof src.val.sendKeyboardEvent}`, 'ok');
        log(`  - sendRawEvent: ${typeof src.val.sendRawEvent}`, 'ok');
        log(`  - sendSeqRawEvents: ${typeof src.val.sendSeqRawEvents}`, 'ok');
        found = true;

        // 挂载到全局
        window.__tcgSDK = src.val;
        log('已挂载到 window.__tcgSDK', 'ok');

        // 测试点击
        log('测试点击 (500, 360)...');
        try {
          src.val.sendMouseEvent({ type: 'mousedown', x: 500, y: 360, button: 0 });
          setTimeout(() => {
            src.val.sendMouseEvent({ type: 'mouseup', x: 500, y: 360, button: 0 });
            log('✓ 点击测试完成', 'ok');
          }, 50);
        } catch(e) {
          log(`✗ 点击测试失败: ${e.message}`, 'error');
        }
        break;
      }
    }

    if (!found) {
      log('✗ 未找到 TCGSDK', 'error');
      log('可能原因:', 'warn');
      log('  1. 未进入云游戏页面（需要看到游戏画面）', 'warn');
      log('  2. TCGSDK 尚未加载完成（等待几秒后重试）', 'warn');
      log('  3. 页面结构已变化', 'warn');

      // 列出所有全局变量中包含 SDK/game/tcg 的
      const keys = Object.keys(window).filter(k =>
        /sdk|tcg|game|stream/i.test(k)
      );
      if (keys.length) {
        log(`可能相关的全局变量: ${keys.join(', ')}`, 'info');
      }
    }

    // 检查 canvas
    const canvases = document.querySelectorAll('canvas');
    log(`页面 Canvas 数量: ${canvases.length}`);
    canvases.forEach((c, i) => {
      log(`  canvas[${i}]: ${c.width}x${c.height}`, 'info');
    });
  };

  // 延迟检查（等待 SDK 加载）
  setTimeout(checkSDK, 3000);

  // 添加快捷键 Ctrl+Shift+D 重新检测
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      log('手动重新检测...');
      checkSDK();
    }
  });

  log('按 Ctrl+Shift+D 可重新检测');
})();
