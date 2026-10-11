// 读 live 版本 + 实测三张模板能否解码、并做一次「同图自匹配」与「异图对照」
const http = require('http');
function get(p) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
(async () => {
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t => t.type === 'page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise(r => sock.addEventListener('open', r));

  const expr = `(async () => {
    const out = { version: window.__narutoAutoOwnerVer || 'n/a' };
    const api = window.__narutoAuto;
    out.apiKeys = api ? Object.keys(api).slice(0, 30) : null;
    // 从运行中的脚本里拿模板：__narutoAuto 没暴露就退回读源码常量（脚本已在闭包里，改用 DOM 探测）
    // 这里只验证「图片能不能被 decode」——直接用 webext 注入过的常量不可达，
    // 改成把 base64 通过 evaluate 传进去测（由外部拼装）。
    return JSON.stringify(out);
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(r.result.result.value);

  // 菜单按钮探测：脚本注入成功 -> 面板/悬浮球可用
  const r2 = await send('Runtime.evaluate', { expression: `(() => {
    const fab = document.getElementById('na-fab'), panel = document.getElementById('na-panel');
    return JSON.stringify({ fab: !!fab, panel: !!panel, ownerVer: window.__narutoAutoOwnerVer || null, owner: window.__narutoAutoOwner || null });
  })()`, returnByValue: true });
  console.log(r2.result.result.value);
  sock.close();
})().catch(e => console.log('ERR ' + e.message));
