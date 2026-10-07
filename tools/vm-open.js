// 打开 Violentmonkey 管理页并检查脚本列表
const http = require('http');
const VM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';

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
  // 用 HTTP 端点新建标签指向 VM 管理页
  const openUrl = `http://127.0.0.1:9222/json/new?${encodeURIComponent('chrome-extension://' + VM_ID + '/options.html')}`;
  const created = await new Promise((res, rej) => {
    http.get(openUrl, { method: 'PUT' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        try { res(JSON.parse(d)); } catch(e) { res({ raw: d }); }
      });
    }).on('error', rej);
  });
  console.log('新建标签:', JSON.stringify(created).slice(0, 300));

  await new Promise(r => setTimeout(r, 3000));

  const tabs = await getJSON('/json/list');
  const vm = tabs.find(t => t.url.includes(VM_ID));
  if (!vm) { console.log('未找到 VM 页面'); process.exit(1); }
  console.log('VM 页面:', vm.title, '\n  ', vm.url);

  const { ws, send } = await cdp(vm.webSocketDebuggerUrl);
  await send('Runtime.enable', {});

  const PROBE = `(() => {
    const o = {};
    o.title = document.title;
    o.href = location.href;
    // 找脚本列表
    const items = document.querySelectorAll('a[href*="scripts"], .script, [id*="script"]');
    o.itemCount = items.length;
    o.bodyText = document.body.innerText.slice(0, 1500);
    return JSON.stringify(o);
  })()`;

  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const v = r?.result?.result?.value;
  console.log('\n=== 页面内容 ===');
  console.log(v ? JSON.parse(v).bodyText : JSON.stringify(r).slice(0,600));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
