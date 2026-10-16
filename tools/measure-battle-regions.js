// 在**当前战斗帧**上实测若干候选区域的颜色，用于重标定 battle 探针。
//
// 背景：战斗帧上 battleStick dist=164(tol45)、battleSkill dist=124(tol55) 全废，
//   导致 detect() 判 other → 连点宏 15s 后停手 → 整场不出刀。
// 本工具只读：导出一帧，打印现区域均值 + 候选区域均值，并保存带标注的图供人眼核对。
//
// 用法：战斗画面时 node tools/measure-battle-regions.js
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9222';

async function evaluate(wsUrl, expr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    ws.onopen = () => ws.send(JSON.stringify({
      id: ++id, method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) {
        ws.close();
        if (m.result && m.result.exceptionDetails) {
          return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 500)));
        }
        resolve(m.result && m.result.result ? m.result.result.value : null);
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout')); }, timeoutMs || 60000);
  });
}

(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
  const page = pages.find(p => /start\.qq\.com/.test(p.url)) || pages[0];
  if (!page) { console.error('找不到页面'); process.exit(1); }
  try { await fetch(CDP + '/json/activate/' + page.id); } catch (_) {}
  await new Promise(r => setTimeout(r, 600));

  // 候选区域：脚本坐标 (1280x720) → 视频像素 (1920x1080) 需 ×1.5
  //   已知约定：_grabShot 从 video 取 1920x1080；探针 area 用**脚本坐标**，
  //   内部自行换算。这里直接把 area 喂给同一套 match()，保证与脚本一致。
  const cands = [
    // 现役（全废）
    ['battleStick_现役', [190, 520, 280, 610]],
    ['battleSkill_现役', [1080, 550, 1180, 640]],
    // 截图上看得到的东西（脚本坐标，= 截图px / 1.5）
    //   右下技能盘：截图 (1345~1870, 590~1030) → /1.5 ≈ (897~1247, 393~687)
    ['右下技能盘_大', [930, 420, 1230, 660]],
    ['普攻黄拳', [1150, 550, 1230, 640]],
    ['技能圈_蓝', [1170, 260, 1240, 340]],
    //   左下摇杆：截图 (60~300, 730~980) → /1.5 ≈ (40~200, 487~653)
    ['左下摇杆', [40, 490, 200, 650]],
    ['摇杆外圈', [60, 520, 180, 630]],
    //   顶部血条：截图 (60~1000, 30~110) → /1.5 ≈ (40~667, 20~73)
    ['顶部血条_左', [60, 25, 400, 70]],
    //   顶部中央回合数：截图 (900~1080, 20~180) → /1.5 ≈ (600~720, 13~120)
    ['中央回合数', [620, 20, 720, 100]],
    //   右上小地图/时间：截图 (1800~1910, 10~90) → /1.5 ≈ (1200~1273, 7~60)
    ['右上时间', [1205, 10, 1270, 55]],
  ];

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({error:'__narutoAuto 不存在'});
    const v = document.querySelector('video');
    if (!v) return JSON.stringify({error:'没有 video'});
    const W = v.videoWidth, H = v.videoHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(v, 0, 0, W, H);
    const cx = c.getContext('2d');
    const sx = W / 1280;   // 脚本坐标 → 视频像素

    const stat = (a) => {
      const x0 = Math.round(a[0]*sx), y0 = Math.round(a[1]*sx);
      const x1 = Math.round(a[2]*sx), y1 = Math.round(a[3]*sx);
      const w = Math.max(1, x1-x0), h = Math.max(1, y1-y0);
      const d = cx.getImageData(x0, y0, w, h).data;
      let r=0,g=0,b=0,n=0;
      for (let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
      return { r:+(r/n).toFixed(1), g:+(g/n).toFixed(1), b:+(b/n).toFixed(1), px:n };
    };
    const out = { video:{W,H}, scale:+sx.toFixed(3), rows:[] };
    const CANDS = ${JSON.stringify(cands)};
    for (const [name, area] of CANDS) out.rows.push({ name, area, avg: stat(area) });

    // 再存一张缩略图（960x540）供人眼核对
    const t = document.createElement('canvas'); t.width=960; t.height=540;
    t.getContext('2d').drawImage(c, 0, 0, 960, 540);
    out.thumb = t.toDataURL('image/jpeg', 0.85);
    return JSON.stringify(out);
  })()`;

  const r = JSON.parse(await evaluate(page.webSocketDebuggerUrl, expr, 90000));
  if (r.error) { console.error(r.error); process.exit(1); }

  console.log('video = ', r.video.W + 'x' + r.video.H, ' scale(脚本→像素) =', r.scale);
  console.log('\n=== 各区域实测均值（脚本坐标）===');
  console.log('  名称'.padEnd(24) + 'area'.padEnd(26) + 'avg RGB'.padEnd(24) + 'px');
  for (const row of r.rows) {
    const a = row.avg;
    console.log('  ' + row.name.padEnd(22) + JSON.stringify(row.area).padEnd(26) +
      `(${a.r},${a.g},${a.b})`.padEnd(24) + a.px);
  }

  const outPng = path.join(__dirname, '..', 'battle-frame-now.jpg');
  fs.writeFileSync(outPng, Buffer.from(String(r.thumb).split(',')[1], 'base64'));
  console.log('\n缩略图已存 → ' + outPng);
})();
