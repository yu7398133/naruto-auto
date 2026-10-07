// 通过 @updateURL 让 Tampermonkey 更新：直接导航到脚本 URL，
// TM 会拦截并弹出「更新/安装」确认页（ask.html），逐个点掉。
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8899/naruto-auto.user.js';
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const EXT_INSTALLED = `chrome-extension://${TM_ID}/options.html#nav=installed`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (p) => { try { return await p; } catch (e) { return '__ERR__' + e.message; } };

async function readInstalled(ctx) {
  const p = await ctx.newPage();
  try {
    await ok(p.goto(EXT_INSTALLED, { waitUntil: 'domcontentloaded', timeout: 20000 }));
    await sleep(2500);
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 1000); await sleep(300); }
    const rows = await ok(p.evaluate(() => {
      return [...document.querySelectorAll('tr,li,.script')]
        .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(t => /火影|naruto/i.test(t));
    }));
    if (typeof rows === 'string') return { line: rows.slice(0, 80), ver: null };
    const line = rows[0] || '(未找到)';
    return { line, ver: (line.match(/0\.5\.\d+/) || [])[0] || null };
  } finally { await ok(p.close()); }
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const pages = () => { try { return ctx.pages(); } catch (e) { return []; } };

  const before = await readInstalled(ctx);
  log('更新前 TM:', before.line.slice(0, 90));

  // 打开脚本 URL → TM 拦截
  const p = await ctx.newPage();
  log('导航到 @updateURL …');
  await ok(p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 }));
  await sleep(3000);

  // TM 可能：(a) 弹 ask.html 确认页  (b) 直接在页面里渲染安装确认
  for (let round = 1; round <= 6; round++) {
    // 找 ask.html
    let ask = pages().find(x => /ask\.html/.test(x.url()));
    let target = ask;
    if (!target) {
      // 也可能就是刚打开的那个页面
      const txt = await ok(p.evaluate(() => (document.body.innerText || '').slice(0, 300)));
      if (typeof txt === 'string' && /安装|更新|重新安装/.test(txt)) {
        log(`第${round}轮：脚本页本身是确认页 → ${txt.replace(/\n+/g, ' | ').slice(0, 140)}`);
        target = p;
      } else {
        log(`第${round}轮：无确认页（当前页文本: ${(txt || '').slice(0, 80).replace(/\n+/g, ' ')}）`);
        break;
      }
    } else {
      log(`第${round}轮：ask.html`);
      await ok(ask.bringToFront());
    }
    await sleep(1200);

    // 点确认按钮
    let hit = null;
    for (const sel of ['input[type=button][value="更新"]', 'input[type=button][value="安装"]',
                       'input[type=button][value="重新安装"]', 'input[type=button][value="是"]',
                       'button:text-is("更新")', 'button:text-is("安装")', 'button:text-is("重新安装")']) {
      const el = target.locator(sel).first();
      const n = await ok(el.count());
      if (typeof n === 'number' && n > 0) {
        const vis = await ok(el.isVisible());
        if (vis === true) { await ok(el.click({ timeout: 5000 })); log(`  点击 ${sel}`); hit = sel; break; }
      }
    }
    if (!hit) { log('  没找到按钮，尝试列出所有 button/input'); 
      const b = await ok(target.evaluate(() => [...document.querySelectorAll('input[type=button],button')].map(x => (x.value||x.textContent||'').trim()).slice(0,12)));
      log('  可用按钮:', JSON.stringify(b));
      break;
    }
    await sleep(3000);
    if (target !== p && target.isClosed()) { log('  确认页已关闭 → 完成'); break; }
  }

  await sleep(2500);
  const after = await readInstalled(ctx);
  log('更新后 TM:', after.line.slice(0, 90));
  log(after.ver === '0.5.93' ? '✅ 已更新到 0.5.93' : `⚠ TM 当前 ${after.ver}`);

  await ok(p.close());
  await ok(browser.close());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
