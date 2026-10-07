// 后台取证探针：零依赖直连 CDP，实测游戏页视觉链路
const http = require('http');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const out = { ok: true, t: new Date().toISOString() };
  try {
    out.hidden = document.hidden;
    out.visibility = document.visibilityState;
    out.hasFocus = document.hasFocus();

    const vids = Array.from(document.querySelectorAll('video'));
    out.videoCount = vids.length;
    out.videos = vids.map(v => {
      const r = v.getBoundingClientRect();
      return {
        readyState: v.readyState, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
        paused: v.paused, ended: v.ended, currentTime: +(v.currentTime||0).toFixed(2),
        clientW: v.clientWidth, clientH: v.clientHeight,
        rect: {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)},
        srcType: v.src ? (v.src.startsWith('blob:')?'blob':v.src.slice(0,20)) : '(none)'
      };
    });

    const v = vids[0];
    if (v && v.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const cx = c.getContext('2d');
      cx.drawImage(v, 0, 0, 64, 64);
      const d = cx.getImageData(0, 0, 64, 64).data;
      let sum=0, mx=0, distinct=new Set();
      for (let i=0;i<d.length;i+=4){
        const l=(d[i]+d[i+1]+d[i+2])/3;
        sum+=l; if(l>mx)mx=l;
        distinct.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4));
      }
      out.frame = {avg:+(sum/(d.length/4)).toFixed(1), max:mx,
                   nonBlack: mx>8, distinctColors: distinct.size};
    } else {
      out.frame = null;
    }

    const A = window.__narutoAuto;
    if (A) {
      out.hasApp = true;
      out.visionStatus = A.vision && A.vision.status ? A.vision.status() : 'n/a';
      out.visionAvailable = A.vision && A.vision.available ? A.vision.available() : null;
      out.videoEl = A.vision && A.vision.video ? A.vision.video.tagName : null;
      if (A.probe) { try { out.probeResult = A.probe(); } catch(e){ out.probeErr = String(e); } }
    } else { out.hasApp = false; }
  } catch (e) { out.ok = false; out.err = String(e); }
  return JSON.stringify(out);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const page = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  if (!page) { console.log('未找到游戏页'); process.exit(1); }
  console.log('目标页:', page.title);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (method, params) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));

  const r = await send('Runtime.evaluate', {
    expression: PROBE, returnByValue: true
  });

  console.log('\n=== 实测结果 ===');
  const val = r?.result?.result?.value;
  if (val) console.log(JSON.stringify(JSON.parse(val), null, 2));
  else console.log(JSON.stringify(r, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
