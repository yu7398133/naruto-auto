// 诊断：连上 CDP，打开 TM 的更新确认页，打印页面里所有可点元素的细节。
// 用来搞清「没找到可点按钮」到底是 DOM 结构变了还是别的原因。
// 用法：node tools/tm-ask-dump.cjs
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];

  // 触发更新：让 TM 去 8899 拉新版本
  const anyPage = ctx.pages()[0];
  console.log('页面数:', ctx.pages().length);
  for (const p of ctx.pages()) console.log('  -', p.url().slice(0, 110));

  let ask = ctx.pages().find(p => /ask\.html/.test(p.url()));
  if (!ask) {
    console.log('\n当前没有 ask.html 页面。');
    console.log('（tm-push 已经跑过一轮，ask 页可能已被 TM 关掉）');
  }

  if (ask) {
    await ask.bringToFront();
    await sleep(800);
    const dump = await ask.evaluate(`(() => {
      const els = Array.from(document.querySelectorAll('input,button,a,[role=button]'));
      return {
        title: document.title,
        url: location.href,
        bodyText: (document.body.innerText || '').slice(0, 400).replace(/\\n+/g, ' | '),
        els: els.map(e => ({
          tag: e.tagName, type: e.getAttribute('type') || '',
          id: e.id || '', cls: (e.className || '').toString().slice(0, 60),
          value: e.getAttribute('value') || '', text: (e.innerText || '').trim().slice(0, 30),
          vis: !!(e.offsetWidth || e.offsetHeight),
          rect: (() => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
        })),
      };
    })()`);
    console.log('\n=== ask 页 ===');
    console.log('title:', dump.title);
    console.log('url  :', dump.url);
    console.log('text :', dump.bodyText);
    console.log('\n可点元素:');
    for (const e of dump.els) {
      console.log(`  <${e.tag}${e.type ? ' type=' + e.type : ''}>` +
        ` id="${e.id}" value="${e.value}" text="${e.text}" vis=${e.vis} rect=[${e.rect}]`);
    }
  }
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
