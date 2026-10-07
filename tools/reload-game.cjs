// 刷新游戏页，让更新后的 Tampermonkey 脚本重新注入，并校验注入版本。
const { chromium } = require('playwright');

const GAME_RE = /start\.qq\.com\/game|arm-game/;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (p) => { try { return await p; } catch (e) { return '__ERR__' + e.message; } };

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const games = ctx.pages().filter(p => GAME_RE.test(p.url()));
  log(`找到 ${games.length} 个游戏页`);
  if (!games.length) { log('✗ 没有游戏页'); await ok(browser.close()); return; }

  for (const g of games) {
    log('刷新:', g.url().slice(0, 70));
    await ok(g.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }));
    await sleep(9000);   // 等脚本注入 + SDK 探测
    const info = await ok(g.evaluate(() => {
      const a = window.__narutoAuto;
      return {
        has: !!a,
        ver: a && a.VERSION ? a.VERSION : (a && a.config ? 'runtime' : null),
        hasPanel: !!document.getElementById('na-panel'),
        title: (document.querySelector('#na-panel .hd h3') || {}).textContent || null,
        logBtns: ['na-log-dl','na-log-cp','na-log-clr'].filter(id => !!document.getElementById(id)),
        mtBtn: (document.getElementById('na-multitouch') || {}).textContent || null,
      };
    }));
    log('  注入结果:', JSON.stringify(info));
  }
  await ok(browser.close());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
