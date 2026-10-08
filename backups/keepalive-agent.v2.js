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
const RETRY_MS = 15000;   // 找不到云游戏页时的重试间隔（开机自启时页面可能还没开）

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// VBS 静默启动时没有控制台可写 —— 自己写日志文件，否则排障时是黑盒
const LOG_FILE = require('path').join(__dirname, '..', 'logs', 'keepalive-agent.log');
const fs = require('fs');
try { fs.mkdirSync(require('path').dirname(LOG_FILE), { recursive: true }); } catch (e) {}
function writeLog(s) {
  const line = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + ' ' + s;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
  return line;
}
const log = (...a) => writeLog(a.join(' '));

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
  // ⚠ CDP 的 Input 域是惰性附着的：**第一条** Input 命令会触发域初始化，
  //    而它本身不会被应答 —— 表现为 Promise 永不 resolve。
  //    实测：不热身时 dispatchMouseEvent 超时；先随便发一条（哪怕报 -32601）之后就正常。
  //    这里发一次带超时的热身，丢掉结果。
  try {
    await Promise.race([
      send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1, button: 'none' }),
      new Promise(r => setTimeout(r, 700)),
    ]);
  } catch (e) { /* 唤醒用，失败无所谓 */ }
  return { tab, send };
}

let send = null;

// CDP 调用必须有超时：WebSocket 半死时 Runtime.evaluate 永不 resolve，
// 整个保活循环会静默卡死（实测踩到过：日志停在"收到保活请求"就没有下文）。
function withTimeout(p, ms, what) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('超时 ' + ms + 'ms: ' + what)), ms)),
  ]);
}

async function ev(expr, timeout = 4000) {
  const r = await withTimeout(send('Runtime.evaluate', { expression: expr, returnByValue: true }), timeout, 'evaluate');
  if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 200) };
  return r.result.result.value;
}

/** 执行一个步骤数组：move = 纯移动；click = move+down+up（真实指针） */
async function runSteps(steps) {
  for (const s of steps) {
    const x = Math.round(s.x), y = Math.round(s.y);
    if (s.type === 'move') {
      await withTimeout(send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }), 3000, 'move');
      await sleep(120);
    } else if (s.type === 'click') {
      await withTimeout(send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }), 3000, 'click-move');
      await sleep(120);
      await withTimeout(send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }), 3000, 'moveDown');
      await sleep(70);
      await withTimeout(send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }), 3000, 'mouseUp');
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
  // 开机自启时云游戏标签页可能还没打开 —— 轮询等待，别退出
  for (let i = 0; ; i++) {
    try {
      ({ send } = await connect());
      break;
    } catch (e) {
      if (i === 0 || i % 4 === 0) log('等待云游戏标签页…（' + ((e && e.message) || e) + '）');
      await sleep(RETRY_MS);
    }
  }
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
        log('  步骤已发完，检查菜单状态…');
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
