// 从游戏页拉取当前日志缓冲，落盘供分析。
const http = require('http');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const put = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p, method: 'PUT' }, r => { r.resume(); r.on('end', res); }).on('error', rej);
});
function conn(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(u); let id = 0; const pend = new Map();
    ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
    ws.addEventListener('open', () => resolve({ ws, send: (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); }) }));
    ws.addEventListener('error', reject);
  });
}
(async () => {
  const l = await get('/json/list');
  const t = l.find(x => x.url.includes('start.qq.com/game'));
  if (!t) { console.log('未找到游戏页'); return; }
  await put('/json/activate/' + t.id);
  await sleep(800);
  const { ws, send } = await conn(t.webSocketDebuggerUrl);
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const a = window.__narutoAuto;
      const out = { ver: a.version || (a.app && a.app.version) || '?' };
      // 日志缓冲在 panel.logs（见源码 L11883 的 this.logs.push）
      try { out.logs = (a.panel && a.panel.logs) ? a.panel.logs.slice(-900) : null; } catch (e) { out.logsErr = String(e); }
      if (!out.logs) { try { out.logs = (a.runtime && a.runtime.logs) ? a.runtime.logs.slice(-900) : null; } catch (e) {} }
      if (!out.logs) { try { out.logs = (a.app && a.app.logs) ? a.app.logs.slice(-900) : null; } catch (e) {} }
      // 失败现场内存数据（截图/取证）
      try {
        const c = a.scheduler && a.scheduler.ctx;
        if (c) {
          out.shots = (c._failShotData || []).map(s => ({ name: s.name, w: s.w, h: s.h, at: s.at }));
          out.failKeys = (c._failShotKeys ? [...c._failShotKeys] : []);
        }
      } catch (e) { out.shotErr = String(e); }
      return JSON.stringify(out);
    })()`, returnByValue: true
  });
  const val = r.result && r.result.result && r.result.result.value;
  const o = JSON.parse(val);
  console.log('版本: ' + o.ver);
  console.log('截图条数: ' + (o.shots ? o.shots.length : 'n/a'));
  if (o.shots) o.shots.forEach(s => console.log('  ' + s.name + '  ' + s.w + 'x' + s.h));
  console.log('失败去重键: ' + JSON.stringify(o.failKeys));
  if (o.logs) {
    const lines = (Array.isArray(o.logs) ? o.logs : String(o.logs).split('\n')).map(x => typeof x === 'string' ? x : (x.text || x.msg || JSON.stringify(x)));
    fs.writeFileSync('tools/_live-log.txt', lines.join('\n'), 'utf8');
    console.log('日志条数: ' + lines.length + ' → tools/_live-log.txt');
  } else {
    console.log('未取到日志缓冲；logsErr=' + (o.logsErr || 'none') + ' shotErr=' + (o.shotErr || 'none'));
  }
  ws.close();
})();
