// 验收：模拟「新实例已在运行，旧实例又被注入」——旧实例必须自动退出
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJ = p => new Promise((s, j) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { try { s(JSON.parse(d)); } catch (e) { j(new Error('bad')); } });
}).on('error', j));

(async () => {
  const tabs = await getJ('/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('arm-game'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', e => { const j = JSON.parse(e.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable', {});
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 80);
    return r.result.result.value;
  };

  const snap = async () => await ev(`JSON.stringify({
    panels:[...document.querySelectorAll('#na-panel')].map(p=>(p.textContent.match(/v([\\d.]+)/)||[])[1]),
    fabs:document.querySelectorAll('#na-fab').length,
    owner:window.__narutoAutoOwnerVer||null
  })`);

  console.log('初始:', await snap());

  console.log('\n=== 模拟旧实例(0.6.47)被再次注入 ===');
  // 把锁改成 0.6.47 会认为自己更新吗？不会——它比自己旧就该退出。
  // 真正要验的是：当页面 owner 已是 0.6.51，再跑一份 0.6.47 源码，它必须不建面板。
  const res = await ev(`(async()=>{
    const before = document.querySelectorAll('#na-panel').length;
    // 造一个假的"旧版本"注入：直接把 VERSION 判定逻辑跑一遍
    const LOCK='__narutoAutoOwner';
    const prev = Number(window[LOCK]||0);
    const f = v=>Number(v.split('.').map((x,i)=>(+x)*Math.pow(1000,2-i)).reduce((a,b)=>a+b,0));
    const mineOld = f('0.6.47');
    return JSON.stringify({prev, mineOld, 旧实例应退出: prev > mineOld});
  })()`);
  console.log(res);

  console.log('\n=== 真实注入：跑一份 0.6.47 源码 ===');
  const fs = require('fs');
  const oldSrc = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/backups/naruto-auto.v0.6.47.user.js', 'utf8');
  console.log('0.6.47 源码长度:', oldSrc.length);
  const inj = await ev(`(function(){ try { ${oldSrc}\n return 'injected'; } catch(e){ return 'ERR:'+e.message } })()`, true);
  console.log('注入结果:', String(inj).slice(0, 60));
  await sleep(3000);
  console.log('注入后:', await snap());
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
