// 检查批量操作区域结构，找真正的「应用」控件
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => s(JSON.parse(d)));
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
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

  // 下拉框的父容器里有什么
  console.log(await ev(`(function(){
    const s=document.querySelector('#select_c2VsZWN0X3Ntcy1zZWxlY3R1bmRlZmluZWQ_dd');
    let p=s.parentElement, out=[];
    for(let i=0;i<3&&p;i++){
      out.push('--- 层级 '+i+' <'+p.tagName+' id='+p.id+' class='+p.className+'>');
      [...p.children].forEach(c=>{
        out.push('   <'+c.tagName+' id='+(c.id||'')+' class='+(typeof c.className==='string'?c.className:'')+'> '+(c.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40));
      });
      p=p.parentElement;
    }
    return out.join('\\n');
  })()`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
