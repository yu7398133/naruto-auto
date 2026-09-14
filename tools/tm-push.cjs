// ============================================================
//  tools/tm-push.cjs —— 把 naruto-auto.user.js 推到 Tampermonkey（带安装结果校验）
//  用法： node tools/tm-push.cjs [目标版本，默认读脚本头部 @version]
//  依赖： 自本机 CentBrowser 的 CDP 端口 9222（--remote-debugging-port=9222）
//         NODE_PATH 指向带 playwright 的 node_modules
//  例：
//    export NODE_PATH="C:/Users/chenyu/.workbuddy/binaries/node/workspace/node_modules"
//    "C:/Users/chenyu/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" tools/tm-push.cjs 0.5.56
//
//  2026-09-13 踩坑记录（为什么不能简写）：
//   ① 确认页按钮是 <input type="button" value="更新">，**不要**用 Playwright 的 `text=更新` 定位 ——
//      text 引擎对未加引号的字符串做**子串匹配**，页面表格里的「更新用户脚本」标签会先被匹配到，
//      点它等于没点，而脚本仍报"已点"，于是静默失败（版本号压根没变）。
//      正确做法：`input[type=button][value="更新"]`（精确 value 匹配）。
//   ② 点完「更新」后，TM 可能再弹一层「即将重新安装用户脚本 / 即将重置所有脚本的设置！」，按钮是
//      `input[type=button][value="重新安装"]` —— 这层也要点，否则不算装完。见 ROUNDS 循环。
//   ③ 校验别只看一眼：TM「已安装」列表是懒渲染的，要滚动 + 重试若干次才读得到火影那行；
//      太快读会得到"没找到"，误判成失败。
// ============================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'naruto-auto.user.js');
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const EXT_UTILS = `chrome-extension://${TM_ID}/options.html#nav=utils`;
const EXT_INSTALLED = `chrome-extension://${TM_ID}/options.html#nav=installed`;
const SCRIPT_NAME = /火影忍者云游戏自动化|naruto-auto/i;

const WANT = process.argv[2] ||
  (fs.readFileSync(SRC, 'utf8').match(/\/\/\s*@version\s+([\d.]+)/) || [])[1] || '';
const ROUNDS = 5;   // 确认页可能要连点几层

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = async p => { try { return await p; } catch (e) { return '__ERR__' + ((e && e.message) || e); } };
const wt = (p, ms) => Promise.race([ok(p), sleep(ms).then(() => '__TIMEOUT__')]);

/** 只读：TM 已安装列表里 naruto-auto 的版本行（懒渲染，需滚动 + 重试） */
async function readInstalled(ctx) {
  const d = await ctx.newPage();
  try {
    await wt(d.goto(EXT_INSTALLED, { waitUntil: 'domcontentloaded', timeout: 20000 }), 22000);
    await sleep(4000);
    for (let i = 0; i < 15; i++) {
      const t = await ok(d.evaluate(`(document.body.innerText||'')`));
      if (typeof t === 'string') {
        const line = t.split('\n').map(s => s.trim()).find(s => SCRIPT_NAME.test(s) && /\d+\.\d+\.\d+/.test(s));
        if (line) { const m = line.match(/(\d+\.\d+\.\d+)/); return { line, ver: m ? m[1] : null }; }
      }
      await d.evaluate(`window.scrollBy(0,500)`).catch(() => {});
      await sleep(700);
    }
    return { line: '(未找到 naruto-auto 行)', ver: null };
  } finally { await ok(d.close()); }
}

(async () => {
  if (!WANT) { log('✗ 读不到目标版本号'); process.exit(1); }
  log('目标版本:', WANT, '| 源:', SRC);

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const pages = () => { try { return ctx.pages(); } catch (e) { return []; } };

  const before = await readInstalled(ctx);
  log('安装前 TM:', before.line);
  if (before.ver === WANT) {
    log(`✅ 已是 ${WANT}，无需推送`);
    await ok(browser.close());
    process.exit(0);
  }

  // 1) 上传
  const utils = await ctx.newPage();
  log('goto utils:', await wt(utils.goto(EXT_UTILS, { waitUntil: 'domcontentloaded', timeout: 20000 }), 22000));
  await sleep(2500);
  log('upload:', await wt(utils.locator('input[type=file]').first().setInputFiles(SRC), 20000).then(r => r === undefined ? 'OK' : r));
  await sleep(1500);
  await ok(utils.close());

  // 2) 确认页：可能要连点「更新」→「重新安装」等多层
  let clickedAny = false;
  for (let round = 1; round <= ROUNDS; round++) {
    let ask = null;
    for (let i = 0; i < 25 && !ask; i++) {
      await sleep(700);
      ask = pages().find(p => /ask\.html/.test(p.url()));
    }
    if (!ask) { log(`第${round}轮：无 ask.html`); break; }
    await wt(ask.bringToFront(), 5000);
    await sleep(1500);

    const head = await ok(ask.evaluate(`(document.body.innerText||'').slice(0,200).replace(/\\n+/g,' | ')`));
    log(`第${round}轮确认页:`, head);

    // 精确点按钮：更新 / 安装 / 重新安装（按 value 精确匹配；再兜底常见 id 与精确文本）
    let hit = null;
    for (const sel of [`input[type=button][value="更新"]`, `input[type=button][value="安装"]`,
                       `input[type=button][value="重新安装"]`,
                       `#input_9LBfdW5kZWZpbmVk_bu`, `#input_zbCJxV91bmRlZmluZWQ_bu`,
                       `button:text-is("更新")`, `button:text-is("安装")`]) {
      const el = ask.locator(sel).first();
      if ((await ok(el.count())) > 0 && (await ok(el.isVisible()))) {
        const r = await wt(el.click({ timeout: 5000 }), 7000);
        log(`  点击 ${sel} →`, r === undefined ? 'OK' : r);
        hit = sel; clickedAny = true; break;
      }
    }
    if (!hit) { log('  没找到可点按钮（可能已装完）'); break; }
    await sleep(3000);

    // 装完 TM 会把 ask 页关掉；关掉或读不到按钮就说明这一轮结束
    if (ask.isClosed()) { log('  ask 页已关闭 → 安装完成'); break; }
  }

  // 3) 校验（慢读）
  await sleep(2000);
  const after = await readInstalled(ctx);
  log('安装后 TM:', after.line);
  const okAll = after.ver === WANT;
  log(okAll ? `✅ 校验通过：TM 已安装 ${WANT}` : `❌ 校验失败：TM 为 ${after.ver || '未知'}，期望 ${WANT}`);

  await ok(browser.close());
  process.exit(okAll ? 0 : 2);
})().catch(e => { log('FATAL', e.message); process.exit(1); });
