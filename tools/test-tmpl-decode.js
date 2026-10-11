// 把三张模板 base64 送进页面，验证 decode 成功 + 尺寸正确
const fs = require('fs'); const path = require('path'); const http = require('http');
const CROP = path.resolve(__dirname, 'crop');
const b64 = {};
for (const [f, k] of [['F_shop.png', 'SHOP'], ['segB.png', 'PRIV'], ['T2_jifen.png', 'JIFEN']])
  b64[k] = fs.readFileSync(path.join(CROP, f)).toString('base64');

function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }

(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const expr = `(async () => {
    const srcs = ${JSON.stringify(b64)};
    const out = {};
    for (const k of Object.keys(srcs)) {
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode fail')); img.src = 'data:image/png;base64,' + srcs[k]; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        out[k] = { ok: true, w: img.width, h: img.height };
      } catch (e) { out[k] = { ok: false, err: e.message }; }
    }
    return JSON.stringify(out);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) console.log('EXC: ' + JSON.stringify(r.result.exceptionDetails.text));
  console.log(r.result.result.value);
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
