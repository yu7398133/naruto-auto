// 列出 TM 里所有「火影」相关脚本的完整信息（含 id / 版本 / 启用状态）
const http = require('http');
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tm = tabs.find(t => t.type === 'page' && t.url.includes('gcalenpjmijncebpfijmoaglllgpjagf') && t.url.includes('options'));
  if (!tm) { console.log('无 TM 管理页'); return; }
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

  console.log(await ev(`(function(){
    const out=[];
    for(const tr of document.querySelectorAll('tr[id^=tr_]')){
      const n=tr.querySelector('.script_name');
      const nm=n?n.textContent.trim().split('\\n')[0]:'';
      if(!/火影/.test(nm)) continue;
      const cb=tr.querySelector('input[type=checkbox]');
      const txt=tr.textContent.replace(/\\s+/g,' ');
      const ver=(txt.match(/\\b(\\d+\\.\\d+\\.\\d+)\\b/)||[])[1]||'?';
      out.push({name:nm.slice(0,24), ver, rowId:tr.id.slice(0,50), cbId:(cb&&cb.id||'').slice(0,60), enabled:!tr.className.includes('disabled')});
    }
    return JSON.stringify(out,null,1);
  })()`));

  console.log('\n全部含「火影」的行文本：');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('tr[id^=tr_]')].map(tr=>tr.textContent.replace(/\\s+/g,' ').trim()).filter(t=>/火影/.test(t)).map(t=>t.slice(0,90)),null,1)`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
