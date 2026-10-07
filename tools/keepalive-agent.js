// 云游戏保活代理：常驻进程，轮询页面上的保活请求，用 CDP 发**真实**鼠标事件。
//
// 为什么需要它（2026-10-07 实测结论）：
//   `.setting-btn` 靠 CSS `:hover` 滑入（transform: translateX(-60px)，transition .2s），
//   而浏览器**不允许脚本伪造 :hover**。页内 dispatchEvent 造的合成事件：
//     · 引不出按钮（translateX 不动）
//     · 就算 CSS 强推出来，click 也被平台前端忽略（domClick 报 ok:true 但菜单没开）
//   只有 CDP `Input.dispatchMouseEvent`（真实指针）才生效。
//
// 协议（页面侧 __narutoAuto 暴露）：
//   kaTake()  → {id, steps:[{type:'move'|'click', x, y}]} | null   取一个待办
//   kaDone(id, ok)                                                  回报结果
//   kaPing()                                                        心跳（页面据此判断代理在线）
//
// 用法：node tools/keepalive-agent.js        （Ctrl+C 退出）
//       node tools/keepalive-agent.js --once （只处理一轮，用于测试）

const http = require('http');

const POLL_MS = 1000;
const CDP_PORT = 9222;
const ONCE = process.argv.includes('--once');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('zh-CN', { hour12: false }), ...a);

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

let ws = null, msgId = 0;
const pending = new Map();

async function connect() {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && /arm-game|start\.qq\.com\/game/.test(t.url));
  if (!tab) throw new Error('没找到云游戏标签页');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const send = (m, p) => new Promise(r => { const i = ++msgId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send('Runtime.enable', {});
  return { tab, send };
}

let send = null;

async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 200) };
  return r.result.result.value;
}

/** 执行一个步骤数组：move = 纯移动；click = move+down+up（真实指针） */
async function runSteps(steps) {
  for (const s of steps) {
    const x = Math.round(s.x), y = Math.round(s.y);
    if (s.type === 'move') {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await sleep(120);
    } else if (s.type === 'click') {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await sleep(120);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(70);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(700);
    }
  }
}

/** 页面上的菜单是否已退出（.setting-box 无 focus） */
async function menuClosed() {
  const v = await ev(`(function(){const b=document.querySelector('.setting-box');return b?!/focus/.test(b.className):true;})()`);
  return v === true;
}

async function main() {
  ({ send } = await connect());
  log('保活代理已连接云游戏页');

  // 菜单展开时会盖住左侧并压暗全屏 → 代理启动时先确保它是关的
  if (!await menuClosed()) {
    log('检测到菜单处于展开态，先退出…');
    await runSteps([{ type: 'click', x: 960, y: 400 }]);
    log(await menuClosed() ? '已退出菜单' : '⚠ 未能退出菜单');
  }

  let idle = 0;
  for (;;) {
    try {
      // 心跳：页面据此判断代理在线（kaExternalAlive）
      await ev('window.__narutoAuto && window.__narutoAuto.kaPing && window.__narutoAuto.kaPing()');

      const job = await ev('window.__narutoAuto && window.__narutoAuto.kaTake ? window.__narutoAuto.kaTake() : null');
      if (job && job.steps) {
        idle = 0;
        log(`收到保活请求 ${job.id}：${job.steps.map(s => s.type + '(' + s.x + ',' + s.y + ')').join(' → ')}`);
        await runSteps(job.steps);
        const ok = await menuClosed();
        await ev(`window.__narutoAuto.kaDone(${JSON.stringify(job.id)}, ${ok})`);
        log(`  ${ok ? '✓ 菜单已关，画面复原' : '⚠ 菜单仍未关'}`);
        if (ONCE) { log('--once：处理完一轮退出'); ws.close(); return; }
      } else {
        idle++;
        if (idle % 60 === 0) log(`待命中…（已轮询 ${idle} 次）`);
      }
    } catch (e) {
      log('轮询异常：' + ((e && e.message) || e));
      try { ws.close(); } catch (_) {}
      await sleep(3000);
      try { ({ send } = await connect()); log('已重连'); } catch (e2) { log('重连失败：' + e2.message); }
    }
    await sleep(POLL_MS);
  }
}

main().catch(e => { log('致命：' + ((e && e.message) || e)); process.exit(1); });
