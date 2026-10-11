// 抓真实画面：改为在页面内把 PNG 分块传回（避免 CDP 返回值体积限制）
const http = require('http'); const fs = require('fs');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (m, p) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const r0 = await send('Runtime.evaluate', { expression: `(() => {
    const v = document.querySelector('video');
    if (!v || !v.videoWidth) return 'NO_VIDEO';
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    window.__shot = c;
    const d = c.toDataURL('image/png');
    window.__shotData = d;
    return 'OK len=' + d.length;
  })()`, returnByValue: true });
  console.log('shot: ' + r0.result.result.value);
  if (String(r0.result.result.value).startsWith('NO_')) { sock.close(); return; }

  // 分块取回
  const total = (await send('Runtime.evaluate', { expression: 'window.__shotData.length', returnByValue: true })).result.result.value;
  const CH = 200000; let out = '';
  for (let off = 0; off < total; off += CH) {
    const part = (await send('Runtime.evaluate', { expression: `window.__shotData.slice(${off}, ${off + CH})`, returnByValue: true })).result.result.value;
    out += part;
  }
  const buf = Buffer.from(out.split(',')[1], 'base64');
  fs.writeFileSync(__dirname + '/live-frame.png', buf);
  console.log('saved live-frame.png ' + buf.length + ' bytes');

  // 左侧菜单区（原分辨率 0..300 x 0..900）另存
  const r2 = await send('Runtime.evaluate', { expression: `(() => {
    const c = window.__shot; const cc = document.createElement('canvas');
    cc.width = 300; cc.height = 900;
    cc.getContext('2d').drawImage(c, 0, 0, 300, 900, 0, 0, 300, 900);
    window.__shotData = cc.toDataURL('image/png'); return window.__shotData.length;
  })()`, returnByValue: true });
  const t2 = r2.result.result.value; let o2 = '';
  for (let off = 0; off < t2; off += CH) {
    o2 += (await send('Runtime.evaluate', { expression: `window.__shotData.slice(${off}, ${off + CH})`, returnByValue: true })).result.result.value;
  }
  fs.writeFileSync(__dirname + '/live-left.png', Buffer.from(o2.split(',')[1], 'base64'));
  console.log('saved live-left.png');
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
