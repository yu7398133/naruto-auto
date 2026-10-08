// 校验 v0.6.49 已生效
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 100);
    return r.result.result.value;
  };

  console.log('面板标题:', await ev(`(function(){
    const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /火影自动化/.test(e.textContent||''));
    return els.length?els[0].textContent.trim():'(未找到)';
  })()`));
  console.log('页面 URL:', await ev('location.href.slice(0,60)'));
  console.log('视频状态:', await ev(`(function(){const v=document.querySelector('video');return v?('rs='+v.readyState+' paused='+v.paused):'无video';})()`));
  console.log('弹窗:', await ev(`(function(){try{const p=__narutoAuto.popup();return p?p.kind:'无';}catch(e){return 'ERR '+e.message}})()`));
  console.log('kaSeenAt(代理是否在ping):', await ev(`(function(){try{return Date.now()-__narutoAuto.kaSeenAt()<15000?'✅ 代理在线':'❌ 代理离线';}catch(e){return 'EXC'}})()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
