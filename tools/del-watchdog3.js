// 精确定位看门狗行的 checkbox（列表行，非表头）
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 100);
    return r.result.result.value;
  };

  // 枚举所有含该名称的元素，看结构
  const dump = await ev(`(function(){
    const out=[];
    document.querySelectorAll('*').forEach(el=>{
      if(el.children.length===0 && /火影后台保活看门狗/.test(el.textContent||'')){
        let p=el, chain=[];
        for(let i=0;i<6&&p;i++){
          chain.push(p.tagName+(p.id?'#'+p.id:'')+(p.className&&typeof p.className==='string'?'.'+p.className.split(' ').filter(Boolean).slice(0,2).join('.'):''));
          p=p.parentElement;
        }
        out.push({tag:el.tagName, id:el.id, text:(el.textContent||'').trim().slice(0,20), chain:chain.join(' < ')});
      }
    });
    return JSON.stringify(out.slice(0,6),null,1);
  })()`);
  console.log('元素链:', dump);

  // TM 的删除通常是行内一个含 trash 图标的元素，或双击名称弹出编辑器后删除
  const cand = await ev(`(function(){
    const rows=[...document.querySelectorAll('#tabs tr, tbody tr')];
    for(let i=0;i<rows.length;i++){
      const t=rows[i].textContent||'';
      if(!/火影后台保活看门狗/.test(t)) continue;
      const cb=rows[i].querySelector('input[type=checkbox]');
      const others=[...rows[i].querySelectorAll('*')].filter(e=>/trash|delete|remove/i.test((e.className||'')+' '+(e.title||'')+' '+(e.id||'')));
      return JSON.stringify({
        rowTag:rows[i].tagName, rowId:rows[i].id,
        hasCb:!!cb, cbId:cb?cb.id:null, cbChecked:cb?cb.checked:null,
        others:others.map(e=>e.tagName+'.'+(e.className||'')+'#'+(e.id||'')).slice(0,5),
      });
    }
    return 'none';
  })()`);
  console.log('\n行内详情:', cand);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
