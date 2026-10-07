// 验证弹窗持久化：合成一个 .message-wrap 覆盖层，看 readPopup 能否识别 + 存档
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
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + String(JSON.stringify(r.result.exceptionDetails)).slice(0, 220);
    return r.result.result.value;
  };

  console.log('① 清空旧记录:', await ev(`window.__narutoAuto.popupLogClear()`));

  console.log('\n② 注入一个「续期」风格的 .message-wrap 覆盖层…');
  console.log(await ev(`(function(){
    const old=document.getElementById('__test_wrap'); if(old) old.remove();
    const w=document.createElement('div');
    w.id='__test_wrap'; w.className='message-wrap';
    w.style.cssText='position:fixed;left:400px;top:180px;width:600px;height:300px;z-index:99999;background:#222;display:block';
    w.innerHTML='<div class="message-container">'
      +'<div class="title">体验时长不足</div>'
      +'<div class="message-list">您的免费体验时长已用完，请续时后继续游戏</div>'
      +'<div class="footer-btn">退出</div>'
      +'<div class="footer-btn primary">继续体验</div>'
      +'<div class="close-btn">x</div>'
      +'</div>';
    document.body.appendChild(w);
    return 'injected, rect='+JSON.stringify(w.getBoundingClientRect().toJSON?w.getBoundingClientRect().toJSON():{}).slice(0,90);})()`));

  console.log('\n③ readPopup() 识别结果:');
  console.log(await ev(`JSON.stringify(window.__narutoAuto.popup(), null, 1)`));

  console.log('\n④ 手动触发一次存档（看门狗轮询会做，这里直接调）:');
  console.log(await ev(`(function(){const p=window.__narutoAuto.popup();
    if(!p) return 'readPopup 返回 null';
    window.__narutoAuto.vision._recordPopup(p);
    return 'recorded kind='+p.kind;})()`));

  console.log('\n⑤ 读回持久化记录:');
  console.log(await ev(`JSON.stringify(window.__narutoAuto.popupLog(), null, 1)`));

  console.log('\n⑥ 清理注入层:');
  console.log(await ev(`(function(){const w=document.getElementById('__test_wrap');if(w)w.remove();return 'removed';})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
