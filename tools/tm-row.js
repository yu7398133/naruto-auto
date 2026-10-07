// 定位目标脚本行，并搜索「检查更新」入口
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
    if (r?.result?.exceptionDetails) return 'EXC: ' + r.result.exceptionDetails.text;
    return r?.result?.result?.value;
  };

  // 1) 找到火影那一行
  console.log('=== 定位脚本行 ===');
  console.log(await ev(`(() => {
    const trs = Array.from(document.querySelectorAll('tr'));
    const hit = trs.find(tr => /火影忍者云游戏自动化/.test(tr.innerText||''));
    if (!hit) return 'row not found';
    window.__tmRow = hit;
    return 'found row, html length=' + hit.innerHTML.length;
  })()`));

  // 2) 列出该行所有可点击元素（操作列的 ☰ 菜单）
  console.log('\n=== 该行可点击元素 ===');
  console.log(await ev(`(() => {
    const tr = window.__tmRow;
    const els = Array.from(tr.querySelectorAll('*')).filter(e => {
      const cs = getComputedStyle(e);
      return cs.cursor === 'pointer' || e.tagName === 'A' || e.tagName === 'BUTTON' || e.onclick;
    });
    return JSON.stringify(els.map(e => ({
      tag: e.tagName, cls: (e.className||'').toString().slice(0,60),
      title: e.title || e.getAttribute('title') || '',
      href: e.getAttribute('href') || '',
      text: (e.innerText||'').trim().slice(0,20)
    })).slice(0, 25), null, 1);
  })()`));

  // 3) 检查「实用工具」页有没有「检查脚本更新」
  console.log('\n=== 全局查找更新入口 ===');
  console.log(await ev(`(() => {
    const all = Array.from(document.querySelectorAll('a,button,div,span'));
    return JSON.stringify(all.filter(e => /检查更新|统一更新|Update|update/i.test((e.innerText||'').slice(0,30)))
      .slice(0,15).map(e => e.tagName + ':' + (e.innerText||'').trim().slice(0,30)), null, 1);
  })()`));

  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
