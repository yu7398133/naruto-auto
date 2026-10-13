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
const captureSrc = cutMethod('captureFailure(stepIdx)');
const grabSrc    = cutMethod('_grabShot(ts, seq, head)');
const resetReal  = cutMethod('resetFailureShots()');
const digestSrc  = cutMethod('_dumpFailureDigest(task)');

// 依赖的最小桩
const ARENA_PANEL_DIM_NEED = 4, ARENA_PANEL_DIM_LUMA_MAX = 80;
const logs = [];
const Utils = { log: (lv, ...a) => logs.push(lv + ': ' + a.join(' ')) };
const FlowChart = { steps: [{ title: 'A步' }, { title: 'B步' }], results: ['fail', null] };
const document = { querySelector: () => null };   // video 未就绪 → 走"截图跳过"分支

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
console.log('--- 摘要样张 ---');
console.log(logs.join('\n'));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
