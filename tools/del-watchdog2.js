// 勾选「火影后台保活看门狗」并用批量操作删除
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
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 120);
    return r.result.result.value;
  };

  // 找含看门狗的那一行，勾上它的 checkbox
  const r1 = await ev(`(function(){
    const rows=[...document.querySelectorAll('tr')];
    for(const row of rows){
      if(!/火影后台保活看门狗/.test(row.textContent||'')) continue;
      const cb=row.querySelector('input[type=checkbox]');
      if(!cb) return 'row-no-checkbox';
      cb.checked=true;
      cb.dispatchEvent(new Event('change',{bubbles:true}));
      cb.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return 'checked:'+(row.querySelector('td,th')?row.querySelector('td,th').textContent.trim().slice(0,8):'?');
    }
    return 'not-found';
  })()`);
  console.log('勾选结果:', r1);
  await sleep(800);

  // 选批量操作下拉里的「删除」
  const r2 = await ev(`(function(){
    const sels=[...document.querySelectorAll('select')];
    for(const s of sels){
      const opt=[...s.options].find(o=>/删除/.test(o.textContent));
      if(opt){ s.value=opt.value; s.dispatchEvent(new Event('change',{bubbles:true})); return 'selected:'+opt.textContent.trim()+' val='+opt.value; }
    }
    return 'no-delete-option';
  })()`);
  console.log('下拉选择:', r2);
  await sleep(1500);

  // 可能弹确认
  const r3 = await ev(`(function(){
    const btns=[...document.querySelectorAll('button,a,input[type=button]')];
    const b=btns.find(x=>/^(删除|确定|是|OK)$/i.test((x.textContent||x.value||'').trim()));
    if(b){ b.click(); return 'clicked:'+(b.textContent||b.value).trim(); }
    return 'no-confirm-btn';
  })()`);
  console.log('确认按钮:', r3);
  await sleep(1500);

  const left = await ev(`(function(){
    return [...document.querySelectorAll('tr')].some(r=>/火影后台保活看门狗/.test(r.textContent||'')) ? '仍在' : '已删除';
  })()`);
  console.log('看门狗状态:', left);
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
