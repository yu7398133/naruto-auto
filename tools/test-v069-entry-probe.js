// v0.6.70 追加：奖励面板入口前的**原图**取证 —— 结构自证。
//
// 为什么改取证方式（2026-10-16 事故）：
//   原先只记 5 块亮度（_probeArenaPanelRaw）。亮度是**代理量**，
//   同类亮度可以对应完全不同的画面。我当天连续两次拿亮度倒推画面：
//     ① 猜「#5 采样块采到面板外」      → 用户纠正：截图是进场③界面
//     ② 猜「打完后自动弹面板」          → 用户纠正：是回准备界面，需要点入口
//   两次都错。教训：与其从数字反推画面，不如**把原图存下来直接看**。
//
// 本测试保证：
//   ① 存图用的是现成的内存通道（ctx._failShotData），与面板按钮对接
//   ② 不自动落盘（v0.6.65 用户口径：脚本自动截图会卡确认框）
//   ③ 异常不打断主流程
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

// claimArenaRewards 函数体
const i0 = SRC.indexOf('const claimArenaRewards = async');
const i1 = SRC.indexOf('const peek = await claimArenaRewards', i0);
const FN = SRC.slice(i0, i1 > i0 ? i1 : i0 + 8000);

console.log('=== ① 存图走现成内存通道 ===');
t('claimArenaRewards 已定位', FN.length > 500);
t('使用 ctx._failShotData（与面板按钮同一条通道）',
  /ctx\._failShotData/.test(FN));
t('有容量上限，避免长跑累积',
  /FAIL_SHOT_KEEP/.test(FN));
t('name 里的 tag 做了文件名净化', /tag\.replace\(/.test(FN));

console.log('\n=== ② 不自动落盘（v0.6.65 用户口径）===');
// 只有 saveFailureShots（面板按钮触发）才允许 a.click() 下载
const probePart = FN.slice(FN.indexOf('探针·入口前') >= 0 ? FN.indexOf('ctx.op.releaseHold()') : 0,
                           FN.indexOf('_probeArenaPanelRaw'));
t('探针段里没有 a.click() 自动下载', !/a\.click\(\)/.test(probePart));
t('探针段里没有 download 属性', !/\.download\s*=/.test(probePart));

console.log('\n=== ③ 不会打断主流程 ===');
// ⚠ 窗口要放够：探针体含注释约 1066 字符，900 的窗口够不到 catch 会误报
//   （本测试初版就因为这个误报过一次）。改用"就近配对"判断。
t('存图包在 try/catch 里', (() => {
  const a = FN.indexOf('const video = document.querySelector');
  const b = FN.indexOf('存图异常');
  if (a < 0 || b < 0 || b < a) return false;
  const span = FN.slice(a, b);
  // try{...}catch(e){...存图异常} —— try 在 video 行之前，catch 紧挨异常日志
  return /try \{/.test(FN.slice(Math.max(0, a - 200), a)) && /catch \(e\)/.test(span);
})(), 'try/catch 未包住存图段');
t('有 video 时的回退分支（video 未就绪则用 canvas）', /video\.videoWidth/.test(FN));

console.log('\n=== ④ 与既有取证并存，没有顶掉旧的 ===');
t('_probeArenaPanelRaw 仍在调用', /_probeArenaPanelRaw\('before-click'\)/.test(FN));

console.log('\n=== ⑤ 带标记便于将来删除 ===');
t('有 [临时探针 v0.6.69] 标记', /\[临时探针 v0\.6\.69\]/.test(SRC));
t('日志前缀 🧪[探针·入口前] 可被 grep 定位', /🧪\[探针·入口前\]/.test(SRC));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
