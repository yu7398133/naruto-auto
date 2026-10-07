// 打开菜单 → 采样整个画面找"可安全点击退出"的位置 → 退出
(async () => {
  const http = require('http');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', ev => { const j = JSON.parse(ev.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});

  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(900);
  };
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;

  // 打开菜单
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 126, button: 'none' });
  await sleep(450);
  await click(36, 126);
  console.log('菜单已打开:', await ev(`(function(){
    const sb=document.querySelector('.setting-box');
    return sb? sb.className : '?';})()`));

  // 采样：菜单态下各点的元素
  const grid = await ev(`(function(){
    const rows=[];
    for(let y=60;y<=640;y+=58){
      const row=[];
      for(let x=200;x<=1880;x+=120){
        const e=document.elementFromPoint(x,y);
        const cn=e?String(e.className).split(' ')[0]:'';
        row.push(cn==='setting-container'?'C':(e&&e.tagName==='VIDEO'?'V':(cn||e.tagName).slice(0,6)));
      }
      rows.push(y+': '+row.join(' '));
    }
    return rows.join('\\n');
  })()`);
  console.log('\n菜单态采样（C=setting-container 遮挡, V=video 可点）:');
  console.log('      x=200 320 440 560 680 800 920 1040 1160 1280 1400 1520 1640 1760 1880');
  console.log(grid);

  // 找最右侧的点退出
  const safe = await ev(`(function(){
    for (const [x,y] of [[1880,600],[1880,400],[1800,620],[1880,100],[1800,60]]) {
      const e=document.elementFromPoint(x,y);
      if (e && e.tagName==='VIDEO') return JSON.stringify({x,y});
    }
    return 'none';
  })()`);
  console.log('\n最右侧可点的 video 位置:', safe);

  if (safe !== 'none') {
    const p = JSON.parse(safe);
    await click(p.x, p.y);
    const st = await ev(`(function(){
      const sl=document.querySelector('.setting-list');
      const sb=document.querySelector('.setting-box');
      const e=document.elementFromPoint(960,400);
      return JSON.stringify({ listX: sl?Math.round(sl.getBoundingClientRect().x):null,
        boxCls: sb?sb.className:null, at960: e?e.tagName:null });})()`);
    console.log('点 (' + p.x + ',' + p.y + ') 退出后:', st);
  }
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
