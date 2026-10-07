// 读取已安装脚本的真实 updateURL/downloadURL 设置
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
    if (r?.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0,400);
    return r?.result?.result?.value;
  };

  // 点开该行的「编辑」按钮，进入脚本详情
  console.log('=== 打开脚本详情 ===');
  console.log(await ev(`(() => {
    const trs = Array.from(document.querySelectorAll('tr'));
    const tr = trs.find(t => /火影忍者云游戏自动化/.test(t.innerText||''));
    if (!tr) return 'row not found';
    // 「编辑」按钮通常是 name 链接
    const link = tr.querySelector('a.name, a[href*="edit"], .script_icon');
    if (link) { link.click(); return 'clicked link: ' + link.tagName + ' ' + (link.className||''); }
    // 退而求其次：点名称文字
    const cells = Array.from(tr.querySelectorAll('td'));
    for (const c of cells) {
      const a = c.querySelector('a');
      if (a && /火影/.test(a.innerText||'')) { a.click(); return 'clicked name anchor'; }
    }
    return 'no edit entry; cells=' + cells.slice(0,3).map(c=>c.innerHTML.slice(0,80)).join(' || ');
  })()`));

  await sleep(3500);
  console.log('URL:', await ev('location.href'));
  console.log('\n=== 详情页正文 ===');
  console.log(await ev(`document.body.innerText.slice(0,2500)`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
