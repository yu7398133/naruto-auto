// 抓当前真实画面（走脚本自己的 vision 通路）并对模板做全区间扫描，
// 输出 score 分布图，用来判断「是阈值太紧」还是「模板/画面不匹配」
const http = require('http');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (m, p) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  // 1) 把整个视频帧导出为 PNG（走脚本 vision 用的同一条 drawImage(video) 通路）
  const r1 = await send('Runtime.evaluate', { expression: `(() => {
    const v = document.querySelector('video');
    if (!v || !v.videoWidth) return 'NO_VIDEO';
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    window.__shot = c;
    return c.toDataURL('image/png');
  })()`, returnByValue: true });
  const durl = r1.result.result.value;
  if (!durl || durl === 'NO_VIDEO') { console.log(durl); sock.close(); return; }
  const fs = require('fs');
  const data = Buffer.from(durl.split(',')[1], 'base64');
  fs.writeFileSync(__dirname + '/live-frame.png', data);
  console.log('saved live-frame.png ' + data.length + ' bytes');

  // 2) 屏上当前画面是不是商城？把左菜单区域单独存出来看
  const r2 = await send('Runtime.evaluate', { expression: `(() => {
    const c = window.__shot; if (!c) return 'NO_SHOT';
    const cc = document.createElement('canvas'); cc.width = 300; cc.height = 900;
    cc.getContext('2d').drawImage(c, 0, 0, 300, 900, 0, 0, 300, 900);
    return cc.toDataURL('image/png');
  })()`, returnByValue: true });
  const d2 = r2.result.result.value;
  if (d2 && d2.startsWith('data:')) { fs.writeFileSync(__dirname + '/live-left.png', Buffer.from(d2.split(',')[1], 'base64')); console.log('saved live-left.png'); }
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
