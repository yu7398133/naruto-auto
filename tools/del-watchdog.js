// 在 Tampermonkey 管理页删除「火影后台保活看门狗」用户脚本
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
  if (!tm) { console.log('没找到 TM 页'); process.exit(1); }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };

  await send('Page.reload', {});
  await sleep(4000);

  // 找到目标脚本所在行
  const info = await ev(`(function(){
    const rows=[...document.querySelectorAll('#tabs tr, table tr')];
    for(let i=0;i<rows.length;i++){
      const t=(rows[i].textContent||'');
      if(/火影后台保活看门狗/.test(t)) return JSON.stringify({idx:i, text:t.trim().slice(0,60)});
    }
    return 'not-found';
  })()`);
  console.log('目标行:', info);
  if (info === 'not-found' || info === 'EXC') { ws.close(); return; }

  // 取消按钮在行内（通常是删除图标）
  const del = await ev(`(function(){
    const rows=[...document.querySelectorAll('#tabs tr, table tr')];
    for(const r of rows){
      if(/火影后台保活看门狗/.test(r.textContent||'')){
        const as=[...r.querySelectorAll('a,button,span[title]')];
        return JSON.stringify(as.map(a=>({t:(a.title||a.textContent||'').trim().slice(0,14), cls:a.className.slice(0,30)})));
      }
    }
    return '[]';
  })()`);
  console.log('该行操作元素:', del);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
