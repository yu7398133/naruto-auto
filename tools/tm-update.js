// 触发「一次性更新」：选中该 option 并派发 change 事件
const http = require('http');
const TM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pend = new Map();
    const send = (m, p) => new Promise(r => {
      const i = ++id; pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    ws.addEventListener('message', ev => {
      const j = JSON.parse(ev.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({ ws, send }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  const tabs = await getJSON('/json/list');
  const tm = tabs.find(t => t.url.includes(TM_ID) && t.type === 'page');
  const { ws, send } = await cdp(tm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0,300);
    return r?.result?.result?.value;
  };

  // 先安装错误捕获，看是否有提示
  await ev(`window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(String(e.message))); 'ok'`);

  console.log('=== 触发一次更新 ===');
  console.log(await ev(`(() => {
    const trs = Array.from(document.querySelectorAll('tr'));
    const tr = trs.find(t => /火影忍者云游戏自动化/.test(t.innerText||''));
    if (!tr) return 'row not found';
    const sel = tr.querySelector('select');
    if (!sel) return 'no select';
    const opt = Array.from(sel.options).find(o => /触发一次更新/.test(o.textContent||''));
    if (!opt) return 'option not found; opts=' + Array.from(sel.options).map(o=>o.textContent.trim()).join('/');
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'change dispatched, value=' + sel.value + ' text=' + opt.textContent.trim();
  })()`));

  // 观察后续 DOM 变化
  for (let i = 0; i < 8; i++) {
    await sleep(2000);
    const st = await ev(`(() => {
      const trs = Array.from(document.querySelectorAll('tr'));
      const tr = trs.find(t => /火影忍者云游戏自动化/.test(t.innerText||''));
      const ver = tr ? (tr.innerText||'').match(/火影忍者云游戏自动化\\s+([\\d.]+)/) : null;
      return JSON.stringify({ ver: ver?ver[1]:null, errs: window.__errs.slice(0,3) });
    })()`);
    console.log(`+${(i+1)*2}s`, st);
  }

  console.log('\n=== 最终页面提示 ===');
  console.log(await ev(`document.body.innerText.slice(0,600)`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
