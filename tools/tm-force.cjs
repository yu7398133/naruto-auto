// 强制推送：绕过 tm-push.cjs 的「版本号相同就跳过」，直接用 CodeMirror API 替换编辑器内容。
// 思路：打开 TM 编辑页 → 等 CodeMirror 就绪 → 设值 → 点「保存」。
// 用法：node tools/tm-force.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'naruto-auto.user.js');
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const SCRIPT_NAME = /火影忍者云游戏自动化|naruto-auto/i;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const code = fs.readFileSync(SRC, 'utf8');
  const want = (code.match(/\/\/\s*@version\s+([\d.]+)/) || [])[1];
  log('目标版本', want, '源大小', code.length, 'B');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // 1. 找已安装脚本的编辑链接
  log('打开已安装列表…');
  await page.goto(`chrome-extension://${TM_ID}/options.html#nav=installed`);
  await sleep(3000);

  // 滚动加载
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 1200);
    await sleep(400);
  }

  // 读所有行，找火影
  const rows = await page.$$eval('tr, .script, li', (els) =>
    els.map((e) => ({ t: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120), href: e.querySelector('a') ? e.querySelector('a').href : '' }))
      .filter((x) => /火影|naruto|0\.5\.9/.test(x.t))
  );
  log('相关行数', rows.length);
  rows.slice(0, 12).forEach((r, i) => log(`  [${i}]`, r.t, r.href ? '| ' + r.href.slice(0, 80) : ''));

  if (!rows.length) { log('✗ 列表里找不到火影脚本'); await page.close(); return; }

  // 2. 直接跳到编辑页：TM 编辑 URL 形如 options.html#nav=editor&url=<scriptId>
  //    更稳的方式：点该行的「编辑」链接
  const editLink = await page.$('a[href*="nav=editor"]');
  if (!editLink) { log('✗ 找不到编辑链接'); await page.close(); return; }
  const href = await editLink.getAttribute('href');
  log('编辑页', href);
  await page.goto(`chrome-extension://${TM_ID}/options.html#${(href.split('#')[1] || 'nav=editor')}`);
  await sleep(4000);

  // 3. 等 CodeMirror
  await page.waitForSelector('.CodeMirror', { timeout: 20000 });
  log('CodeMirror 已就绪');

  // 4. 设值
  const res = await page.evaluate((newCode) => {
    const cmEl = document.querySelector('.CodeMirror');
    if (!cmEl || !cmEl.CodeMirror) return { ok: false, why: 'no CodeMirror instance' };
    const cm = cmEl.CodeMirror;
    const oldLen = cm.getValue().length;
    cm.setValue(newCode);
    cm.refresh();
    return { ok: true, oldLen, newLen: cm.getValue().length };
  }, code);
  log('setValue:', JSON.stringify(res));
  await sleep(1500);

  // 5. 保存
  const saved = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('input[type=button], button, a')];
    const b = btns.find((x) => /^\s*保存\s*$/.test((x.value || x.textContent || '').trim()));
    if (b) { b.click(); return (b.value || b.textContent).trim(); }
    return '';
  });
  log('点击保存:', saved || '(没找到保存按钮)');
  await sleep(3000);

  // 6. 校验
  const after = await page.evaluate(() => {
    const el = document.querySelector('tr');
    return document.body.innerText.slice(0, 300).replace(/\s+/g, ' ');
  });
  log('保存后页面前 300 字:', after);

  await page.close();
  log('完成');
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1); });
