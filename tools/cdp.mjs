// cdp.mjs — 极简 CDP 客户端（WebSocket，无依赖）
// 用法: node cdp.mjs <method> [jsonParams]
//   或 import { connect } from './cdp.mjs'

const PORT = 9222;

export async function listPages() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = e => rej(new Error('ws error: ' + (e.message || 'unknown')));
    setTimeout(() => rej(new Error('ws open timeout')), 8000);
  });

  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) { pending.delete(mid); rej(new Error(method + ' timeout')); }
    }, 30000);
  });

  return { send, events, close: () => ws.close(), ws };
}

/** 在页面里执行 JS，返回 JSON 化结果 */
export async function evaluate(conn, expr, { awaitPromise = true } = {}) {
  const r = await conn.send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result?.value;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const pages = await listPages();
  console.log(JSON.stringify(pages.map(p => ({ type: p.type, title: p.title, url: p.url.slice(0, 120), id: p.id })), null, 2));
}
