// 把浏览器**当前帧**导出为裸 RGB（.raw）+ 元数据，供离线正负样本对照使用。
//
// 为什么不用 JPEG/PNG：项目里没有 pngjs/jimp，也没有 jpeg 解码器。
//   canvas 已经解好码了，直接把 ImageData 存成裸字节最省事，零依赖。
//
// 用法：
//   战斗画面时  node tools\dump-frame-raw.js battle-ult-fireball
//   主界面时    node tools\dump-frame-raw.js home-2026-10-16
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9222';

async function evaluate(wsUrl, expr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) {
        ws.close();
        if (m.result && m.result.exceptionDetails) return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)));
        resolve(m.result && m.result.result ? m.result.result.value : null);
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout')); }, timeoutMs || 90000);
  });
}

(async () => {
  const name = process.argv[2];
  if (!name) { console.error('用法: node tools/dump-frame-raw.js <名字>'); process.exit(1); }

  const list = await (await fetch(CDP + '/json/list')).json();
  const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
  const page = pages.find(p => /start\.qq\.com/.test(p.url)) || pages[0];
  if (!page) { console.error('找不到页面'); process.exit(1); }

  // 必须激活，否则后台标签的帧可能是旧的（naruto-ka 教训）
  try { await fetch(CDP + '/json/activate/' + page.id); } catch (_) {}
  await new Promise(r => setTimeout(r, 700));

  // 降到 1280x720（脚本坐标系）导出，正好 1:1，省掉离线换算
  const expr = `(() => {
    const v = document.querySelector('video');
    if (!v || !v.videoWidth) return JSON.stringify({error:'没有可用的 video 帧'});
    const W=1280, H=720;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const cx=c.getContext('2d');
    cx.drawImage(v,0,0,W,H);
    const d=cx.getImageData(0,0,W,H).data;
    // 压成 RGB 三通道
    const out=new Uint8Array(W*H*3);
    for(let i=0,j=0;i<d.length;i+=4){ out[j++]=d[i]; out[j++]=d[i+1]; out[j++]=d[i+2]; }
    // 逐字节转 base64：避免 String.fromCharCode.apply 大数组爆栈 / 分块边界错位
    // （2026-10-16 事故：分块拼接导致导出的 .raw 出现横向拖影，全部测量作废）
    const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s='';
    for(let i=0;i<out.length;i+=3){
      const b0=out[i], b1=out[i+1], b2=out[i+2];
      s += B64[b0>>2];
      s += B64[((b0&3)<<4) | (b1===undefined?0:b1>>4)];
      s += (b1===undefined)?'=':B64[((b1&15)<<2) | (b2===undefined?0:b2>>6)];
      s += (b2===undefined)?'=':B64[b2&63];
    }
    let A = window.__narutoAuto;
    let scene='?'; try{ scene=A.scenes.detect(false).scene; }catch(e){ scene='err'; }
    return JSON.stringify({ w:W, h:H, scene, b64: s });
  })()`;

  const r = JSON.parse(await evaluate(page.webSocketDebuggerUrl, expr));
  if (r.error) { console.error(r.error); process.exit(1); }

  const dir = path.join(__dirname, '..', 'samples');
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(r.b64, 'base64');
  const raw = path.join(dir, name + '.raw');
  fs.writeFileSync(raw, buf);
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ w: r.w, h: r.h, scene: r.scene, bytes: buf.length }));

  console.log(`已存 ${name}.raw  ${r.w}x${r.h}  场景判定=${r.scene}  ${buf.length} 字节`);
  console.log(`期望字节数 = ${r.w * r.h * 3}  ${buf.length === r.w * r.h * 3 ? '✅ 匹配' : '❌ 不匹配'}`);
})();
