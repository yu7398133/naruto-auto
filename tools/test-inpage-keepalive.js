// 验证「页内保活」可行性：同一 tick 内 推按钮+点击，重复多轮看稳定性
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
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + String(JSON.stringify(r.result.exceptionDetails)).slice(0, 240);
    return r.result.result.value;
  };
  const isOpen = () => ev(`(function(){const b=document.querySelector('.setting-box');return b?/focus/.test(b.className):null;})()`);

  // 一次完整的「页内保活」，实现方式与将要写进脚本的一致
  const inPageKeepAlive = `(function(){
    const btn = document.querySelector('.setting-btn');
    if (!btn) return 'no .setting-btn';
    const box = btn.closest('.setting-box');
    if (box && /focus/.test(box.className)) return 'already-open';

    // ① 记下原样式，强制把按钮推入视口（同一 tick 内立即点击，不给平台动画程序改回的机会）
    const oldTf = btn.style.transform, oldTr = btn.style.transition;
    btn.style.transition = 'none';
    btn.style.transform = 'translateX(0px)';

    const r = btn.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    if (r.width <= 0 || r.height <= 0) { btn.style.transform = oldTf; btn.style.transition = oldTr; return 'btn zero-size'; }

    // ② 合成完整点击序列
    const init = { bubbles:true, cancelable:true, composed:true, view:window,
                   clientX:cx, clientY:cy, button:0, buttons:0 };
    const P = window.PointerEvent || MouseEvent;
    const seq = [['pointerover',P],['pointerenter',P],['pointerdown',P],['mousedown',MouseEvent],
                 ['pointerup',P],['mouseup',MouseEvent],['click',MouseEvent]];
    for (const [t,C] of seq) { let e; try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)} btn.dispatchEvent(e); }

    // ③ 立刻还原样式（避免长时间残留影响视觉）
    btn.style.transform = oldTf; btn.style.transition = oldTr;
    return 'clicked @'+cx+','+cy;
  })()`;

  const exitInPage = `(function(){
    // 退出：点画面中央遮罩（合成事件对这个 handler 有效，已实测）
    const el = document.elementFromPoint(960, 400);
    if (!el) return 'no element at 960,400';
    const init = { bubbles:true, cancelable:true, composed:true, view:window,
                   clientX:960, clientY:400, button:0, buttons:0 };
    const P = window.PointerEvent || MouseEvent;
    for (const [t,C] of [['pointerdown',P],['mousedown',MouseEvent],['pointerup',P],['mouseup',MouseEvent],['click',MouseEvent]]) {
      let e; try{e=new C(t,init)}catch(_){e=new MouseEvent(t,init)} el.dispatchEvent(e);
    }
    return 'clicked mask on '+el.tagName;
  })()`;

  console.log('== 连续 6 轮「纯页内 开→关」稳定性测试 ==');
  let okOpen = 0, okClose = 0;
  for (let i = 1; i <= 6; i++) {
    const st0 = await isOpen();
    const o = await ev(inPageKeepAlive);
    await sleep(900);
    const st1 = await isOpen();
    const c = await ev(exitInPage);
    await sleep(900);
    const st2 = await isOpen();
    if (st1 === true) okOpen++;
    if (st2 === false) okClose++;
    console.log(`  第${i}轮: 起始=${st0} → 开(${o}) → ${st1} → 关(${c}) → ${st2}   ${st1 === true && st2 === false ? '✅' : '❌'}`);
  }
  console.log(`\n结果: 打开成功 ${okOpen}/6，关闭成功 ${okClose}/6`);

  console.log('\n== 画面活性（确认保活不打断视频）==');
  console.log(await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,paused:v.paused,t:+v.currentTime.toFixed(2)}):'no video';})()`));
  await sleep(2500);
  console.log(await ev(`(function(){const v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,paused:v.paused,t:+v.currentTime.toFixed(2)}):'no video';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
