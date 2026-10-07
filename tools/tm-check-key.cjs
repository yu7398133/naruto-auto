// 精确检查 TM 里存的用户脚本源码是否含新功能（按 key 直读，不做全量扫描）。
// 用法：node tools/tm-check-key.cjs
const { chromium } = require('playwright');

const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const KEY = '!extdb.@source#7a26925e-9e7c-44fd-84cb-9009cb063ec9';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`chrome-extension://${TM_ID}/options.html#nav=installed`);
  await sleep(3000);

  const r = await page.evaluate(async (key) => {
    const all = await chrome.storage.local.get(key);
    const v = all[key];
    const s = typeof v === 'string' ? v : JSON.stringify(v || '');
    return {
      size: s.length,
      version: (s.match(/\/\/\s*@version\s+([\d.]+)/) || [])[1] || '?',
      roundBadge: s.includes('roundBadge: true'),
      sawBattleRound: s.includes('async sawBattleRound('),
      diTmpl: s.includes('ARENA_ROUND_DI_TMPL'),
      rewardPanel: s.includes('async sawArenaRewardPanel('),
      uiWait: s.includes('UI_WAIT_MS'),
      menuUpDrag: s.includes('MENU_UP_DRAG'),
      stepOne: /step:\s*1/.test(s),
    };
  }, KEY);

  console.log(`TM source: ${r.size} 字节   版本 ${r.version}`);
  console.log('功能检查:');
  for (const k of ['roundBadge', 'sawBattleRound', 'diTmpl', 'rewardPanel', 'uiWait', 'menuUpDrag', 'stepOne']) {
    console.log(`  ${r[k] ? '✅' : '❌'} ${k}`);
  }
  await page.close();
  process.exit(0);
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
