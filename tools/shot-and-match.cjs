// 通过 CDP 截取当前标签页（游戏画面），并直接做模板匹配诊断。
// 用法：node tools/shot-and-match.cjs [输出png名]
// 输出：截图 + 在左侧菜单区跑模板匹配的分数分布（找最优位置）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outName = process.argv[2] || 'live-shot.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  console.log('页面:');
  for (const p of pages) console.log('  -', p.url().slice(0, 100));

  // 选游戏页（含 video 的）
  let target = null;
  for (const p of pages) {
    const has = await p.evaluate(`!!document.querySelector('video')`).catch(() => false);
    if (has) { target = p; break; }
  }
  if (!target) target = pages.find(p => !/^(chrome|devtools):/.test(p.url())) || pages[0];
  console.log('截图目标:', target.url().slice(0, 100));

  await target.bringToFront();
  await sleep(600);
  const out = path.join(__dirname, outName);
  await target.screenshot({ path: out });
  const st = fs.statSync(out);
  console.log(`已保存: ${out} (${st.size} 字节)`);

  // 取 video 原始分辨率
  const vs = await target.evaluate(`(() => {
    const v = document.querySelector('video');
    return v ? { w: v.videoWidth, h: v.videoHeight, cw: v.clientWidth, ch: v.clientHeight } : null;
  })()`).catch(() => null);
  console.log('video:', JSON.stringify(vs));
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
