// 直接读 TM 里存的用户脚本源码，检查关键功能是否在（判断是否真的装上了）。
// 用法：node tools/tm-verify-content.cjs
const { chromium } = require('playwright');

const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  await page.goto(`chrome-extension://${TM_ID}/options.html#nav=installed`);
  await sleep(3500);

  const info = await page.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const out = [];
    for (const k of Object.keys(all)) {
      const v = all[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.includes('naruto-auto') || s.includes('火影忍者云游戏自动化')) {
        out.push({ key: k, size: s.length });
      }
    }
    // 找最大的那个 = 脚本源码
    let best = null;
    for (const k of Object.keys(all)) {
      const v = all[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.length > 100000 && (s.includes('@version') || s.includes('naruto'))) {
        if (!best || s.length > best.length) best = { key: k, content: s };
      }
    }
    if (!best) return { keys: out, content: null };
    const c = best.content;
    return {
      keys: out,
      key: best.key,
      size: c.length,
      version: (c.match(/\/\/\s*@version\s+([\d.]+)/) || [])[1] || '?',
      checks: {
        roundBadge: /roundBadge:\s*true/.test(c),
        sawBattleRound: c.includes('async sawBattleRound('),
        diTmpl: c.includes('ARENA_ROUND_DI_TMPL'),
        rewardPanel: c.includes('async sawArenaRewardPanel('),
        claimRewards: c.includes('claimArenaRewards'),
        uiWait: c.includes('UI_WAIT_MS'),
        menuUpDrag: c.includes('MENU_UP_DRAG'),
        stepOne: /step:\s*1/.test(c),
      },
    };
  });

  if (!info.content) {
    log('未找到脚本源码。keys:', JSON.stringify(info.keys, null, 1));
  } else {
    log(`TM 存的脚本 key: ${info.key}`);
    log(`大小: ${info.size} 字节`);
    log(`版本: ${info.version}`);
    log('\n关键功能检查:');
    for (const [k, v] of Object.entries(info.checks)) log(`  ${v ? '✅' : '❌'} ${k}`);
  }
  await page.close();
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
