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

/** 底层发送：只发不等超时（超时由调用方控制） */
function rawSend(method, params) {
  const i = ++msgId;
  return new Promise(res => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}

async function connect() {
  const tabs = await getJSON('/json/list');
  const tab = tabs.find(t => t.type === 'page' && /arm-game|start\.qq\.com\/game/.test(t.url));
  if (!tab) throw new Error('没找到云游戏标签页');
  targetId = tab.id;
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const send = (m, p) => rawSend(m, p);
  await send('Runtime.enable', {});
  // 连上就把标签页激活：后台标签的 Input 命令会被静默吞掉（见 ensureActive 注释）
  await ensureActive();
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

/**
 * 等菜单**稳定**关闭：连续两次相隔 400ms 都读到关闭才算数。
 *
 * 2026-10-08 用户实测反馈：「打开菜单还没点，然后就到了任务集会所了」。
 * 日志佐证 —— 保活宣告成功 2 秒后（11:51:18 → 11:51:20）任务就点了 (62,677)。
 * 原因是 `.setting-box` 的 focus 类在**退场动画开始**时就没了，
 * 而遮罩（.setting-container）此时还在淡出、平台的输入队列也还没消化完。
 * 脚本以为"已复原"就放行，任务的下一次点击落在**半退场状态**的画面上，
 * 被游戏解释成点到了任务集会所入口。
 *
 * 所以要等到"关"这个状态**连续成立**，并且在返回前再留一段沉降时间，
 * 让遮罩动画和游戏输入队列都排空。
 */
async function menuSettledClosed() {
  if (!await menuClosed()) return false;
  await sleep(400);
  return await menuClosed();
}

/** 当前标签页的 targetId（激活用） */
let targetId = null;

/**
 * 丢弃当前连接，强制下一次用到时重建（页面 reload 后旧会话会失效）。
 */
function dropConnection() {
  try { if (ws) ws.close(); } catch (e) {}
  ws = null;
  for (const [, res] of pending) { try { res({}); } catch (e) {} }
  pending.clear();
}

/**
 * 确保游戏标签是「活动标签」，否则 CDP 的 Input 命令会被**静默吞掉**。
 *
 * 2026-10-08 实测（这是本代理最关键的一条结论）：
 *   当游戏页处于后台（`document.visibilityState === 'hidden'`）时，
 *   `Input.dispatchMouseEvent` **既不应答也不报错** —— Promise 永不 resolve，
 *   日志表现为 `超时 3000ms: move`。而同一时刻 `Runtime.evaluate` 完全正常。
 *   对照实验：调用 `Target.activateTarget` 之后，
 *   连续 4 条 mouseMoved **全部**立即应答（4/4）。
 *
 *   所以「热身」是错的解释：真正决定成败的是标签页可见性。后台标签不发 Input。
 *   ⇒ 每次保活前先激活标签，做完之后不再管（用户切走自然会再 hidden，
 *     下一轮保活又会重新激活一次）。
 */
async function ensureActive() {
  if (!targetId) return;
  try {
    await withTimeout(rawSend('Target.activateTarget', { targetId }), 2000, 'activate');
  } catch (e) { /* 激活失败也继续，后面自然超时重连 */ }
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
        // 用户可能切走了标签（后台标签不发 Input）→ 先激活再操作
        await ensureActive();
        await sleep(250);
        await runSteps(job.steps);
        log('  步骤已发完，等待画面沉降…');
        // 关键：必须等菜单**稳定**关闭再回报，否则上层会在退场动画中途放行任务
        const ok = await menuSettledClosed();
        if (ok) await sleep(500);   // 再留一段，让平台输入队列排空
        await ev(`window.__narutoAuto.kaDone(${JSON.stringify(job.id)}, ${ok})`);
        log(`  ${ok ? '✓ 菜单已关且已沉降，画面复原' : '⚠ 菜单仍未关'}`);
        if (ONCE) { log('--once：处理完一轮退出'); ws.close(); return; }
      } else {
        idle++;
        if (idle % 60 === 0) log(`待命中…（已轮询 ${idle} 次）`);
      }
    } catch (e) {
      log('轮询异常：' + ((e && e.message) || e) + ' → 丢弃旧连接重建');
      dropConnection();
      await sleep(1500);
      try { ({ send } = await connect()); log('已重连'); } catch (e2) { log('重连失败：' + e2.message); }
    }
    await sleep(POLL_MS);
  }
}

main().catch(e => { log('致命：' + ((e && e.message) || e)); process.exit(1); });
