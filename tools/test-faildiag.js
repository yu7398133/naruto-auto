// v0.6.64 失败诊断系统 —— 离线逻辑验证（无需浏览器/CDP）。
//
// 验证目标（都是纯逻辑，可在 Node 里跑）：
//   ① captureFailure 去重：同一步+同场景只抓一次
//   ② 上限 6 次
//   ③ 场景读数与 hits 解析正确（hits 是对象，不是数组）
//   ④ _dumpFailureDigest 的汇总文本包含关键字段
//   ⑤ resetFailureShots 清零
//
// 做法：把源码里的 TaskContext.captureFailure / _dumpFailureDigest 原文抽出来，
//   配一个假的 this（scenes/vision/FlowChart/document），直接调用。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

// ── 按方法签名起点 + 大括号配平，切出一个完整方法 ──
// 返回 { sig, body }：sig 是 `name(args)`，body 是 `{...}` 全文。
// 签名起点由调用方用**包含参数表**的完整签名给出，方法体开括号从签名末尾之后找，
// 因此不会误命中上方 JSDoc 里的大括号。
function cutMethod(signature) {
  // ⚠ 必须找**定义**而非调用点：同一签名在调用处也会出现（实测踩到 ——
  //   indexOf 命中了 `this._dumpFailureDigest(task);` 那个调用）。
  //   定义的特征是签名后紧跟 `{`。
  let s = -1, from = 0;
  for (;;) {
    const p = src.indexOf(signature, from);
    if (p < 0) break;
    const rest = src.slice(p + signature.length);
    if (/^\s*\{/.test(rest)) { s = p; break; }
    from = p + 1;
  }
  if (s < 0) throw new Error('未找到方法定义: ' + signature);
  const afterSig = s + signature.length;
  const open = src.indexOf('{', afterSig);
  if (open < 0) throw new Error('未找到方法体: ' + signature);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error('大括号未配平: ' + signature);
  return { sig: src.slice(s, afterSig), body: src.slice(open, i + 1) };
}
const captureSrc = cutMethod('captureFailure(stepIdx, reason)');
const grabSrc    = cutMethod('_grabShot(ts, seq, head)');
const resetReal  = cutMethod('resetFailureShots()');
const saveSrc    = cutMethod('saveFailureShots()');
const digestSrc  = cutMethod('_dumpFailureDigest(task)');

// 依赖的最小桩
const ARENA_PANEL_DIM_NEED = 4, ARENA_PANEL_DIM_LUMA_MAX = 80;
// ★ v0.6.65：_grabShot 用 FAIL_SHOT_KEEP 做内存上限裁剪，不声明会抛
//   ReferenceError → 截图静默不落内存。这类"缺桩导致的假通过"必须靠
//   「先清空 logs / _failShotData 再断言」才能暴露（见 ⑩ 段落注释）。
const FAIL_SHOT_KEEP = 6;
const logs = [];
const Utils = { log: (lv, ...a) => logs.push(lv + ': ' + a.join(' ')) };
const FlowChart = { steps: [{ title: 'A步' }, { title: 'B步' }], results: ['fail', null] };
// ⚠ document 必须是**可重新赋值**的绑定：抽出的方法里 `document.querySelector(...)`
//   走的是模块作用域。用 `const document = {...}` 之后，
//   `global.document = ...` 改的是另一个东西，方法内部仍看到旧的 null 桩
//   （实测症状：drawn=0、_failShotData 为空，但断言「未触发下载」假通过）。
//   ⇒ 声明为 `let`，⑩ 段落里直接重新赋值。
let document = { querySelector: () => null };   // video 未就绪 → 走"截图跳过"分支
const ARENA_PANEL_DIM_AREAS_STUB = [[0,0,1,1],[1,1,2,2],[2,2,3,3],[3,3,4,4],[4,4,5,5]];

// 场景桩：hits 是**对象**（复刻真实结构）
let sceneStub = () => ({ scene: 'other', brightness: 48, hits: { closeX: { ok: true, dist: 137 }, closeGray: { ok: false, dist: 104 } } });
let panelStub = () => ({ ok: false, dark: 3, total: 5, lumas: [100, 91, 55, 30, 79] });

// 拼装一个可调用的 ctx 桩
const ctx = {
  scenes: { detect: () => sceneStub() },
  vision: { sawArenaRewardPanelRaw: () => panelStub() },
  _failShots: [], _failShotKeys: new Set(), _failShotFiles: [],
};
// 把抽出的方法挂上去。
// ⚠ 单行方法（如 resetFailureShots）抽出来是 `name() { ... }` 的整体，
//   不能直接拼成函数表达式 —— 拆成 `function name(args)` + 方法体。
// 把切出来的 { sig, body } 拼成函数表达式 —— 无需解析，直接拼接。
const asFn = (m) => 'function ' + m.sig + ' ' + m.body;
eval('ctx.captureFailure = ' + asFn(captureSrc));
eval('ctx._grabShot = ' + asFn(grabSrc));
eval('ctx.resetFailureShots = ' + asFn(resetReal));
eval('ctx.saveFailureShots = ' + asFn(saveSrc));
Object.defineProperty(ctx, 'failureShots', { get: function () { return this._failShots || []; } });

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

console.log('=== ① 基本抓取 + hits 对象解析 ===');
ctx.resetFailureShots();
ctx.captureFailure(0);
const s1 = ctx.failureShots;
t('抓到 1 条现场', s1.length === 1, 'got ' + s1.length);
t('步骤名取自 FlowChart.steps', s1[0] && s1[0].stepName === 'A步', s1[0] && s1[0].stepName);
t('场景/亮度正确', s1[0] && s1[0].scene === 'other' && s1[0].brightness === 48);
t('hits 只收 ok=true 的，且格式 probe=dist',
  s1[0] && s1[0].hits.length === 1 && s1[0].hits[0] === 'closeX=137',
  s1[0] && JSON.stringify(s1[0].hits));
t('奖励面板亮度被记录', s1[0] && JSON.stringify(s1[0].lumas) === '[100,91,55,30,79]');
t('日志里出现了现场标题', logs.some(l => l.includes('失败现场 #1')));
t('日志里出现了奖励面板读数', logs.some(l => l.includes('暗块 3/5') && l.includes('100/91/55/30/79')));

console.log('=== ② 去重：同一步 + 同场景 只抓一次 ===');
logs.length = 0;
ctx.captureFailure(0);          // 同 stepIdx 同 scene
ctx.captureFailure(0);
t('重复不再新增', ctx.failureShots.length === 1, 'got ' + ctx.failureShots.length);

console.log('=== ③ 不同场景 / 不同步骤 各自记录 ===');
sceneStub = () => ({ scene: 'home', brightness: 120, hits: {} });
ctx.captureFailure(0);
t('换场景 → 新增一条', ctx.failureShots.length === 2, 'got ' + ctx.failureShots.length);
sceneStub = () => ({ scene: 'other', brightness: 48, hits: {} });
ctx.captureFailure(1);
t('换步骤 → 新增一条', ctx.failureShots.length === 3, 'got ' + ctx.failureShots.length);
t('无命中探针时显示「无」', logs.some(l => l.includes('命中探针=[无]')));

console.log('=== ④ 上限 6 次 ===');
ctx.resetFailureShots();
for (let i = 0; i < 12; i++) {
  sceneStub = () => ({ scene: 'scene' + i, brightness: i, hits: {} });
  ctx.captureFailure(i);
}
t('最多 6 条', ctx.failureShots.length === 6, 'got ' + ctx.failureShots.length);

console.log('=== ⑤ resetFailureShots 清零 ===');
ctx.resetFailureShots();
t('清空', ctx.failureShots.length === 0);
t('去重键也清空', ctx._failShotKeys.size === 0);

console.log('=== ⑥ _dumpFailureDigest 输出字段完整 ===');
logs.length = 0;
// 造 2 条现场
sceneStub = () => ({ scene: 'other', brightness: 48, hits: { closeX: { ok: true, dist: 137 } } });
ctx.resetFailureShots();
ctx.captureFailure(0);
sceneStub = () => ({ scene: 'home', brightness: 120, hits: {} });
ctx.captureFailure(1);
logs.length = 0;
const sched = { ctx };
eval('sched._dumpFailureDigest = ' + asFn(digestSrc));
const task = { name: '测试任务', steps: [{ title: 'A步' }, { title: 'B步' }] };
sched._dumpFailureDigest(task);
const dump = logs.join('\n');
t('含诊断摘要标题', dump.includes('诊断摘要 [测试任务]'));
t('含未达成步骤计数', dump.includes('未达成步骤(1)') && dump.includes('A步'));
t('含现场数量', dump.includes('失败现场 2 处'));
t('含场景与亮度', dump.includes('场景=other') && dump.includes('亮度=120'));
t('含命中探针', dump.includes('closeX=137'));
t('含截图清单行', dump.includes('截图：无（video 未就绪') || dump.includes('截图('));
t('有闭合边框', dump.includes('└'));

console.log('=== ⑦ v0.6.65：reason 来源标记 ===');
logs.length = 0;
ctx.resetFailureShots();
ctx.captureFailure(-1, '秘境导航失败[首次导航]');
t('reason 被记录', ctx.failureShots[0] && ctx.failureShots[0].reason === '秘境导航失败[首次导航]',
  ctx.failureShots[0] && ctx.failureShots[0].reason);
t('日志含来源', logs.some(l => l.includes('来源=秘境导航失败')));

console.log('=== ⑧ v0.6.65：去重键含 reason（导航失败不再互相顶掉）===');
// 同一 stepIdx(-1) + 同一 scene(other)，但 reason 不同 → 必须各记一条。
// ⚠ 这是 v0.6.64 的真实缺陷：秘境 8 分钟内 6 轮导航失败全在「其它页」，
//   旧键 `-1|other` 会让第 2 轮之后全部被去重掉 → 只剩 1 条，看不到「反复失败」。
ctx.resetFailureShots();
sceneStub = () => ({ scene: 'other', brightness: 48, hits: {} });
ctx.captureFailure(-1, '秘境导航失败[首次导航]');
ctx.captureFailure(-1, '秘境导航失败[不在准备界面→重导航]');
t('不同 reason 各记一条', ctx.failureShots.length === 2, 'got ' + ctx.failureShots.length);
ctx.captureFailure(-1, '秘境导航失败[不在准备界面→重导航]');
t('同 reason 仍去重', ctx.failureShots.length === 2, 'got ' + ctx.failureShots.length);

console.log('=== ⑨ v0.6.65：探针全量（未命中距离）===');
logs.length = 0;
ctx.resetFailureShots();
sceneStub = () => ({
  scene: 'other', brightness: 157,
  hits: {
    closeX: { ok: false, dist: 156 },
    friendsIcon: { ok: false, dist: 209 },
    mailNav: { ok: false, dist: 384 },
    titleStore: { ok: true, dist: 12 },
  },
});
ctx.captureFailure(-1, '秘境导航失败[首次导航]');
const p9 = ctx.failureShots[0];
t('probeAll 记录了探针总数', p9 && p9.probeAll && p9.probeAll.n === 4, p9 && JSON.stringify(p9.probeAll));
t('未命中按距离升序', p9 && p9.probeAll.miss[0] === 'closeX=156' && p9.probeAll.miss[2] === 'mailNav=384',
  p9 && JSON.stringify(p9.probeAll.miss));
t('已命中的不混进未命中列表', p9 && !p9.probeAll.miss.some(m => m.startsWith('titleStore')));
t('日志含「最接近的未命中」', logs.some(l => l.includes('最接近的未命中') && l.includes('closeX=156')));

console.log('=== ⑩ v0.6.65：截图只存内存，不触发下载 ===');
// 用户实测：「脚本自动截图保存不了，每次都需要我手动确认」。
// ⇒ _grabShot 绝不能调 a.click()（那会弹保存确认、卡住无人值守）。
//   这里用一个假的 document/canvas 探测是否发生了 click。
let downloadClicks = 0;
let canvasDrawn = 0;
// 直接给模块作用域的 document 重新赋值（不是 global.document —— 见上方 let 的说明）
document = {
  querySelector: () => ({ videoWidth: 1920, videoHeight: 1080 }),
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: () => { canvasDrawn++; } }),
        toDataURL: () => 'data:image/png;base64,AAAA',
      };
    }
    // <a>：一旦被 click() 就说明走了自动下载的老路 → 判失败
    return { click: () => { downloadClicks++; } };
  },
};
ctx.resetFailureShots();
ctx._failShotData = [];
logs.length = 0;                 // ⚠ 必须清空：否则断言会读到 ⑨ 段落的旧日志（假通过）
ctx._grabShot('2026-10-14T10-45-32', 1, 'head');
t('未触发任何下载点击', downloadClicks === 0, 'clicks=' + downloadClicks);
t('canvas 确实画了帧', canvasDrawn === 1, 'drawn=' + canvasDrawn);
t('图存进了内存', ctx._failShotData.length === 1 && ctx._failShotData[0].name === 'naruto-fail-2026-10-14T10-45-32-#1.png',
  JSON.stringify(ctx._failShotData.map(x => x.name)));
t('日志说明「不自动落盘」', logs.some(l => l.includes('不自动落盘')));

console.log('=== ⑪ v0.6.65：saveFailureShots 只在用户点按钮时导出 ===');
logs.length = 0;
downloadClicks = 0;
ctx.saveFailureShots();
t('导出时才 click', downloadClicks === 1, 'clicks=' + downloadClicks);
ctx._failShotData = [];
const r11 = ctx.saveFailureShots();
t('无图时明确报「没有失败截图」', r11.ok === false && /没有失败截图/.test(r11.msg), JSON.stringify(r11));

console.log('--- 摘要样张 ---');
console.log(logs.join('\n'));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
