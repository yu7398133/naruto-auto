// 从页面内存拉「任务结果表」+ 每日分享的完整日志段。
const CDP = 'http://127.0.0.1:9222';

async function main() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  if (!page) { console.log('未找到游戏页'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({err:'no __narutoAuto'});
    const panel = A.panel;
    const logs = (panel && panel.logs) || [];
    // 1) 任务结果表：scheduler 里通常有 results / stats
    let results = null;
    try {
      const s = A.scheduler;
      results = {
        stats: s && s.stats ? JSON.parse(JSON.stringify(s.stats)) : null,
        results: s && s.results ? JSON.parse(JSON.stringify(s.results)).slice(-30) : null,
        running: s ? !!s.running : null,
      };
    } catch (e) { results = {err: String(e)}; }
    // 2) 含「分享」的日志行（含上下文）
    const shareIdx = [];
    logs.forEach((l, i) => { if (/分享/.test(l)) shareIdx.push(i); });
    const ctxLines = [];
    const seen = new Set();
    for (const i of shareIdx) {
      for (let k = Math.max(0, i - 12); k <= Math.min(logs.length - 1, i + 12); k++) {
        if (!seen.has(k)) { seen.add(k); ctxLines.push(k + ': ' + logs[k]); }
      }
    }
    return JSON.stringify({ total: logs.length, shareCount: shareIdx.length, results, ctx: ctxLines.slice(0, 120) }, null, 1);
  })()`;

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const v = r.result && r.result.result && r.result.result.value;
  console.log(v || JSON.stringify(r).slice(0, 2000));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
