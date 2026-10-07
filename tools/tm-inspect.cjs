// 直接读 TM 里存的实际脚本源码，判断版本与关键标记。
const { chromium } = require('playwright');

const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`chrome-extension://${TM_ID}/options.html#nav=installed`);
  await sleep(3000);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1000); await sleep(350); }

  // 直接问 TM 的后台存储：chrome.storage.local 里 scripts 的键
  const info = await page.evaluate(async () => {
    const out = {};
    // TM 用 chrome.storage.local，键名形如 'script:<id>' 或 db
    try {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all);
      out.storageKeys = keys.length;
      const hits = [];
      for (const k of keys) {
        const v = all[k];
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        if (/火影|naruto-auto/i.test(s)) {
          hits.push({ key: k, size: s.length, ver: (s.match(/@version\s+([\d.]+)/) || [])[1] || '?' });
        }
      }
      out.hits = hits;
    } catch (e) { out.err = e.message; }
    return out;
  });
  log('storage 概况:', JSON.stringify(info, null, 1).slice(0, 1500));

  await page.close();
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1); });
