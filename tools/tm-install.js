// 安装用户脚本：打开 .user.js → 轮询捕获 ask.html → 立刻点「安装/重新安装」。
//
// 2026-10-15 实测得出的三个要点（旧版 tm-install-flow.js 就是栽在这里）：
//   ① ask.html 是**瞬时**页面，出现后要尽快点，否则它自己关掉 → 必须紧凑轮询捕获，不能固定 sleep 一次。
//   ② /json/new 开的是后台标签，确认页仍会出现，但要 /json/activate 之后 Input.* 才生效
//      （后台标签的 Input 会被静默吞掉，既不报错也不应答）。
//   ③ 目标页 script_installation.php 只是 TM 官方文档页，**没有**安装按钮；
//      真正的按钮在 chrome-extension://.../ask.html 上。找错页面就会报「未找到安装按钮」。
const http = require('http');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TARGET = process.argv[2] || 'http://127.0.0.1:8899/naruto-auto.user.js';

const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const put = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p, method: 'PUT' }, r => {
    r.resume(); r.on('end', res);
  }).on('error', rej);
});
function conn(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(u); let id = 0; const pend = new Map();
    ws.addEventListener('message', e => {
      const j = JSON.parse(e.data);
      if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
    });
    ws.addEventListener('open', () => resolve({
      ws, send: (m, p) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); })
    }));
    ws.addEventListener('error', reject);
  });
}

(async () => {
  console.log('目标: ' + TARGET);
  // 清掉可能残留的安装页，避免误点上一次的旧确认框
  const pre = await get('/json/list');
  for (const t of pre.filter(x => x.url.includes('script_installation'))) {
    await new Promise(r => http.get({ host: '127.0.0.1', port: 9222, path: '/json/close/' + t.id }, q => { q.resume(); q.on('end', r); }).on('error', r));
  }
  await put('/json/new?' + encodeURIComponent(TARGET));

  // 紧凑轮询捕获 ask.html（瞬时页面）
  let hit = null;
  for (let k = 0; k < 60 && !hit; k++) {
    await sleep(300);
    const l = await get('/json/list');
    hit = l.find(t => t.url.includes('ask.html'));
  }
  if (!hit) { console.log('未捕获 ask.html（确认页瞬时消失）'); process.exit(1); }
  console.log('确认页: ' + hit.title);

  await put('/json/activate/' + hit.id);
  await sleep(600);
  const { ws, send } = await conn(hit.webSocketDebuggerUrl);
  await send('Runtime.enable', {});

  let clicked = null;
  for (let k = 0; k < 20; k++) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        // ⚠ 按钮文案不止一种：首次安装=「安装」，已装过=「更新」，还有「重新安装」。
        //   同时页面上还有一个「禁用更新」按钮 —— 必须排除，否则会误点成"再也不要更新"。
        const RE_OK = /^(安装|更新|重新安装)$/;
        const RE_BAD = /禁用|取消/;
        const all = [...document.querySelectorAll('input,button,a')];
        const b = all.find(x => {
          const s = ((x.value || x.innerText || '') + '').trim();
          return RE_OK.test(s) && !RE_BAD.test(s);
        });
        if (!b) return JSON.stringify({ none: true, seen: all.map(x => ((x.value || x.innerText || '') + '').trim()).filter(Boolean).slice(0, 12) });
        const q = b.getBoundingClientRect();
        return JSON.stringify({ txt: (b.value || b.innerText || '').trim(), x: q.x + q.width/2, y: q.y + q.height/2 });
      })()`, returnByValue: true
    });
    const v = r.result && r.result.result && r.result.result.value;
    if (v) {
      const btn = JSON.parse(v);
      if (btn.none) { await sleep(400); continue; }
      console.log('按钮: ' + btn.txt + ' @(' + Math.round(btn.x) + ',' + Math.round(btn.y) + ')');
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
        await sleep(120);
      }
      clicked = btn.txt;
      break;
    }
    await sleep(400);
  }
  ws.close();
  console.log(clicked ? ('已点击: ' + clicked) : '未找到安装按钮');
  process.exit(clicked ? 0 : 1);
})();
