// 战斗判定「结构判据」实测：在当前帧上量候选区域，并与人眼已知的非战斗帧对照。
//
// 目的：找**不随大招特效变化**的战斗特征，替代固定颜色采样。
//
// 候选思路（从截图观察）：
//   A. 右下技能盘：5 个圆形按钮环形布局，位置固定、边缘深色描边，火焰盖不满
//   B. 右上小地图区：截图右上有一块矩形迷你地图
//   C. 顶部双方血条：红/彩色长条 + 定宽，非战斗页没有
//   D. 左下摇杆：圆形半透明底盘，位置固定
//
// 判据用「结构统计」而非「单一均值」：
//   - edgePct  ：边缘像素占比（UI 有硬边框，特效是软的）
//   - std      ：标准差（UI 稳定，特效在变）
//   - darkPct  ：深色像素占比（按钮描边）
//   - ringPct  ：环形区域亮像素占比
//
// 本工具只读。
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
        if (m.result && m.result.exceptionDetails) return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 500)));
        resolve(m.result && m.result.result ? m.result.result.value : null);
      }
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout')); }, timeoutMs || 90000);
  });
}

const REGIONS = [
  ['右下技能盘外框', [1140, 300, 1250, 690]],
  ['普攻黄拳', [1150, 555, 1235, 645]],
  ['技能圈_中', [1165, 355, 1235, 435]],
  ['右上小地图', [1150, 5, 1275, 90]],
  ['顶部血条_左', [60, 25, 380, 62]],
  ['顶部血条_右', [1000, 25, 1275, 62]],
  ['左下摇杆盘', [45, 490, 195, 650]],
  ['中央回合数', [615, 15, 725, 105]],
];

(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const pages = list.filter(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
  const page = pages.find(p => /start\.qq\.com/.test(p.url)) || pages[0];
  if (!page) { console.error('找不到页面'); process.exit(1); }
  try { await fetch(CDP + '/json/activate/' + page.id); } catch (_) {}
  await new Promise(r => setTimeout(r, 600));

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({error:'__narutoAuto 不存在'});
    const v = document.querySelector('video');
    if (!v) return JSON.stringify({error:'没有 video'});
    const W=v.videoWidth, H=v.videoHeight;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    c.getContext('2d').drawImage(v,0,0,W,H);
    const cx=c.getContext('2d');
    const sx=W/1280;

    const analyze = (area) => {
      const x0=Math.round(area[0]*sx), y0=Math.round(area[1]*sx);
      const x1=Math.round(area[2]*sx), y1=Math.round(area[3]*sx);
      const w=Math.max(1,x1-x0), h=Math.max(1,y1-y0);
      const d=cx.getImageData(x0,y0,w,h).data;
      const N=w*h;
      let r=0,g=0,b=0, dark=0, bright=0, lum=[];
      for(let i=0;i<d.length;i+=4){
        const R=d[i],G=d[i+1],B=d[i+2];
        r+=R; g+=G; b+=B;
        const L=0.299*R+0.587*G+0.114*B;
        if(L<60) dark++;
        if(L>170) bright++;
        lum.push(L);
      }
      const mr=r/N, mg=g/N, mb=b/N;
      let var_=0; for(const L of lum) var_+=(L-(0.299*mr+0.587*mg+0.114*mb))**2;
      const std=Math.sqrt(var_/N);

      // 边缘占比：水平相邻像素亮度差 > 40 视为一条边
      let edges=0, tot=0;
      for(let y=0;y<h;y++){
        for(let x=1;x<w;x++){
          const i=(y*w+x)*4, j=(y*w+x-1)*4;
          const L1=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
          const L2=0.299*d[j]+0.587*d[j+1]+0.114*d[j+2];
          if(Math.abs(L1-L2)>40) edges++;
          tot++;
        }
      }
      return {
        avg:[+mr.toFixed(1),+mg.toFixed(1),+mb.toFixed(1)],
        std:+std.toFixed(1),
        darkPct:+(dark/N*100).toFixed(1),
        brightPct:+(bright/N*100).toFixed(1),
        edgePct:+(edges/Math.max(1,tot)*100).toFixed(1),
      };
    };

    const out={ video:{W,H}, rows:[] };
    for(const [name,area] of ${JSON.stringify(REGIONS)}) out.rows.push({name,area,st:analyze(area)});

    // 当前场景判定（作对照）
    try { out.scene = A.scenes.detect(false).scene; } catch(e){ out.scene='err'; }

    const t=document.createElement('canvas'); t.width=960; t.height=540;
    t.getContext('2d').drawImage(c,0,0,960,540);
    out.thumb=t.toDataURL('image/jpeg',0.85);
    return JSON.stringify(out);
  })()`;

  const r = JSON.parse(await evaluate(page.webSocketDebuggerUrl, expr));
  if (r.error) { console.error(r.error); process.exit(1); }

  console.log('video =', r.video.W + 'x' + r.video.H, ' 当前 scene =', r.scene);
  console.log('\n=== 结构统计（脚本坐标）===');
  console.log('  区域'.padEnd(18) + 'avg RGB'.padEnd(22) + 'std'.padEnd(8) + 'dark%'.padEnd(8) + 'bright%'.padEnd(9) + 'edge%');
  for (const row of r.rows) {
    const s = row.st;
    console.log('  ' + row.name.padEnd(16) +
      JSON.stringify(s.avg).padEnd(22) +
      String(s.std).padEnd(8) + String(s.darkPct).padEnd(8) +
      String(s.brightPct).padEnd(9) + s.edgePct);
  }

  const out = path.join(__dirname, '..', 'battle-struct-now.jpg');
  fs.writeFileSync(out, Buffer.from(String(r.thumb).split(',')[1], 'base64'));
  console.log('\n图已存 → ' + out);
})();
