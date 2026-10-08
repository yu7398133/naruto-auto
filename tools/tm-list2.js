// 用 CDP HTTP PUT /json/new 开标签（新版 Chrome 要求 PUT），
// 然后列出 TM 里所有「火影」脚本。
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const req = (method, path) => new Promise((s, j) => {
  const r = http.request({ host: '127.0.0.1', port: 9222, path, method }, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { try { s(JSON.parse(d)); } catch (e) { s({ _raw: d.slice(0, 120) }); } });
  });
  r.on('error', j); r.end();
});

(async () => {
  const url = 'chrome-extension://gcalenpjmijncebpfijmoaglllgpjagf/options.html#nav=scripts';
  const t = await req('PUT', '/json/new?' + encodeURIComponent(url));
  console.log('新标签:', t.id ? t.id.slice(0, 16) : JSON.stringify(t).slice(0, 90));

  await sleep(5000);
  const list = await req('GET', '/json/list');
  const tm = list.find(x => x.type === 'page' && x.url.includes('gcalenpjmijncebpfijmoaglllgpjagf'));
  if (!tm) { console.log('没找到 TM 页'); return; }
  const ws = new WebSocket(tm.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  await sleep(3500);
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC';
    return r.result.result.value;
  };
  console.log('标题:', await ev('document.title'));
  console.log('总脚本行:', await ev(`document.querySelectorAll('tr[id^=tr_]').length`));
  console.log('\n火影相关:');
  console.log(await ev(`JSON.stringify([...document.querySelectorAll('tr[id^=tr_]')].map(tr=>{
    const txt=tr.textContent.replace(/\\s+/g,' ').trim();
    if(!/火影|naruto/i.test(txt)) return null;
    const n=tr.querySelector('.script_name');
    const cb=tr.querySelector('input[type=checkbox]');
    return {name:(n?n.textContent.trim().split('\\n')[0]:'?').slice(0,26), txt:txt.slice(0,64), row:tr.id.slice(0,30), cb:(cb&&cb.id||'').slice(0,40)};
  }).filter(Boolean), null, 1)`));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
