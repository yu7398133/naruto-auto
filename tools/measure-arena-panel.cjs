// 量「忍术奖励面板」截图的：变暗遮罩 vs 中央亮面板。
// 无 sharp/pngjs → 用 Chrome CDP 解码。若无 CDP，则退化为打印尺寸提示。
// 用法：node tools/measure-arena-panel.cjs <png>
const fs = require('fs');
const path = require('path');
const http = require('http');

const file = process.argv[2];
if (!file) { console.error('用法: node tools/measure-arena-panel.cjs <png>'); process.exit(1); }
const abs = path.resolve(file);

function cdpJson(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

(async () => {
  let targets;
  try { targets = await cdpJson('http://127.0.0.1:9222/json/list'); }
  catch (e) { console.log('CDP 9222 不可用，无法解码 PNG：', e.message); process.exit(2); }

  const page = targets.find(t => t.type === 'page');
  if (!page) { console.log('没有可用 page target'); process.exit(2); }

  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let id = 0; const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  });
  await new Promise(r => ws.on('open', r));

  const b64 = fs.readFileSync(abs).toString('base64');
  const expr = `(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${b64}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = img.width, H = img.height;
    const data = g.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i+1], data[i+2]]; };
    const luma = ([r,gg,b]) => Math.round((r*77 + gg*151 + b*28) >> 8);
    // 网格亮度图（16x9），看哪里暗
    const GX = 16, GY = 9, grid = [];
    for (let gy = 0; gy < GY; gy++) {
      const row = [];
      for (let gx = 0; gx < GX; gx++) {
        const x0 = Math.floor(gx*W/GX), x1 = Math.floor((gx+1)*W/GX);
        const y0 = Math.floor(gy*H/GY), y1 = Math.floor((gy+1)*H/GY);
        let s = 0, n = 0;
        for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { s += luma(px(x,y)); n++; }
        row.push(Math.round(s/n));
      }
      grid.push(row);
    }
    // 四角与边缘采样
    const corners = {
      tl: px(Math.round(W*0.02), Math.round(H*0.05)),
      tr: px(Math.round(W*0.98), Math.round(H*0.05)),
      bl: px(Math.round(W*0.02), Math.round(H*0.95)),
      br: px(Math.round(W*0.98), Math.round(H*0.95)),
    };
    return JSON.stringify({ W, H, grid, cornerLuma: Object.fromEntries(Object.entries(corners).map(([k,v])=>[k,{rgb:v,luma:luma(v)}])) });
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const out = JSON.parse(r.result.value);
  console.log('尺寸:', out.W + 'x' + out.H);
  console.log('\n=== 亮度网格 (16x9, 每格均值) ===');
  console.log('     ' + Array.from({length:16},(_,i)=>String(i).padStart(5)).join(''));
  out.grid.forEach((row, i) => console.log(String(i).padStart(3) + '  ' + row.map(v=>String(v).padStart(5)).join('')));
  console.log('\n=== 四角 ===');
  for (const [k,v] of Object.entries(out.cornerLuma)) console.log(`  ${k}: rgb(${v.rgb.join(',')}) luma=${v.luma}`);
  ws.close();
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
