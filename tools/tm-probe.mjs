import { listPages, connect, evaluate } from './cdp.mjs';
import fs from 'node:fs';

const TM = 'gcalenpjmijncebpfijmoaglllgpjagf';

// ① 新建 tab 打开油猴管理页
const r = await fetch('http://127.0.0.1:9222/json/new?chrome-extension://' + TM + '/options.html', { method: 'PUT' });
const tab = await r.json();
console.log('已打开油猴管理页:', tab.id);

await new Promise(s => setTimeout(s, 3000));

// ② 连上去
const pages = await listPages();
const tgt = pages.find(p => p.id === tab.id) || pages.find(p => p.url.includes(TM));
if (!tgt) { console.log('找不到页面'); process.exit(1); }
console.log('连接:', tgt.url.slice(0, 100));

const conn = await connect(tgt.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// ③ 先看这个页面里有什么
const probe = await evaluate(conn, `(() => ({
  title: document.title,
  href: location.href,
  bodyLen: document.body ? document.body.innerHTML.length : -1,
  hasTM: typeof TM !== 'undefined',
  iframeCount: document.querySelectorAll('iframe').length,
  iframeSrcs: [...document.querySelectorAll('iframe')].map(f => f.src),
  keys: Object.keys(window).filter(k => /tamper|TM|monkey/i.test(k)).slice(0, 20),
}))()`);
console.log(JSON.stringify(probe, null, 2));

conn.close();
