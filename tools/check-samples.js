// 查当前页面场景 + samples 目录里 .raw 的字节数是否自洽。
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'samples');

(async () => {
  console.log('=== samples/*.raw 字节数自洽检查（应为 1280*720*3 = 2764800）===');
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.raw'))) {
    const n = fs.statSync(path.join(DIR, f)).size;
    console.log(`  ${f.padEnd(30)} ${n}  ${n === 2764800 ? 'OK' : '❌ 异常'}`);
  }
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    console.log(`  ${f}: ${fs.readFileSync(path.join(DIR, f), 'utf8')}`);
  }

  console.log('\n=== 当前页面场景 ===');
  const r = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const p = r.filter(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'))
    .find(x => /start\.qq\.com/.test(x.url));
  if (!p) { console.log('  无 start.qq.com 页面'); return; }
  try { await fetch('http://127.0.0.1:9222/json/activate/' + p.id); } catch (e) {}
  await new Promise(z => setTimeout(z, 600));

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return 'no-script';
    const d = A.scenes.detect(false);
    const v = document.querySelector('video');
    return JSON.stringify({ scene: d.scene, brightness: Math.round(d.brightness), video: v ? v.videoWidth + 'x' + v.videoHeight : null });
  })()`;

  const val = await new Promise((res, rej) => {
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) { ws.close(); res(m.result.result.value); } };
    ws.onerror = () => rej(new Error('ws'));
    setTimeout(() => rej(new Error('timeout')), 15000);
  });
  console.log('  ' + val);
})();
