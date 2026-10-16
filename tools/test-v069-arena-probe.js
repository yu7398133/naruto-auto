// v0.6.69 临时探针「跳过结算点 k 位」取证 —— 结构自证。
//
// 用途（用户 2026-10-16）：忍术对战三局连败，唯一未达成步骤是「循环⑤跳过结算：点 k 位」，
//   现场读数 backBtnX=0（二级页返回键完美命中）⇒ 疑似点 k 点进了二级页。
//   但**不能只凭读数下结论**，必须先拿「点 k 之前 / 之后」两个时刻的读数对比。
//
// 本测试只保证探针**接线正确**（不保证它读得准 —— 那要靠实跑证据）：
//   ① 探针方法存在且只调用 VisionCore 自己的成员（不误用 TaskContext 的东西）
//   ② 两个调用点都在 playOneArenaRound 内，且分列 clickNatural 两侧
//   ③ 探针不会抛异常打断主流程（调用点都有 try/catch）
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

// 取方法体
function methodBody(name) {
  const i = SRC.indexOf(name + '(phase, seq)');
  if (i < 0) return '';
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(open, k + 1); }
  }
  return '';
}
const PROBE = methodBody('_probeArenaSkipK');

console.log('=== ① 探针方法存在且自洽 ===');
t('_probeArenaSkipK 已定义', PROBE.length > 100);
t('用 this._fresh() 刷新帧缓存', /this\._fresh\(\)/.test(PROBE));
t('用 this.match(p) 读探针分数', /this\.match\(p\)/.test(PROBE));
t('用 this.ctx.getImageData 读像素', /this\.ctx\.getImageData/.test(PROBE));

console.log('\n=== ② 不误用 VisionCore 没有的成员（本探针初版踩过的坑）===');
t('没有调用 this.scenes（那是 GameOperator/TaskContext 的）',
  !/this\.scenes/.test(PROBE), 'VisionCore 上无 this.scenes');
t('没有调用 this.captureFailure（那是 TaskContext 的）',
  !/this\.captureFailure/.test(PROBE), 'VisionCore 上无 this.captureFailure');
t('没有调用 this.ctx.captureFailure（ctx 是 canvas context，没有此方法）',
  !/this\.ctx\.captureFailure/.test(PROBE));

console.log('\n=== ②b 读探针用对了字段与读法（实跑自查发现：初版全打成 err）===');
// 实跑证据 2026-10-16 11:11:47：
//   🧪[探针·跳过结算] phase=selftest ... backBtnX=err closeX=err friendsIcon=err
// 两个错：① match() 返回 {ok,dist,tol,...}，**没有 score**；
//         ② backBtnX 是 dynamic 探针，必须走 findRedX()，调 match() 无意义。
// ⚠ 断言前必须剥掉注释：本探针的**注释里**正好写着 ".score 字段不存在"，
//   不剥就会把自己的说明文字当成违规代码（本测试初版就误报了一次）。
const PROBE_CODE = PROBE
  .replace(/\/\*[\s\S]*?\*\//g, '')   // 块注释
  .replace(/\/\/[^\n]*/g, '');        // 行注释

t('没有读不存在的 .score 字段', !/\.score/.test(PROBE_CODE), 'match() 返回的是 dist');
t('普通探针读 .dist（match 的真实字段）', /m\.dist/.test(PROBE_CODE));
t('dynamic 探针分流走 findRedX', /p\.dynamic/.test(PROBE_CODE) && /this\.findRedX/.test(PROBE_CODE));
t('dynamic 探针不落进 match 分支（先判 dynamic 再判 color）',
  PROBE_CODE.indexOf('p.dynamic') < PROBE_CODE.indexOf('p.color'),
  '顺序反了会把 dynamic 探针喂给 match');

console.log('\n=== ③ 两个取证点分列 clickNatural 两侧 ===');
const iA = SRC.indexOf("_probeArenaSkipK('before-k'");
const iClick = SRC.indexOf("clickNatural(1137, 589, null, '跳过结算（点 k 位）')");
const iB = SRC.indexOf("_probeArenaSkipK('after-k'");
t('before-k 调用点存在', iA > 0);
t('after-k 调用点存在', iB > 0);
t('顺序为 before-k → clickNatural → after-k',
  iA > 0 && iClick > 0 && iB > 0 && iA < iClick && iClick < iB,
  `A@${iA} click@${iClick} B@${iB}`);
t('两处都在 playOneArenaRound 内', (() => {
  const fn = SRC.indexOf('const playOneArenaRound = async');
  const end = SRC.indexOf('const claimArenaRewards = async', fn);
  return fn > 0 && end > fn && iA > fn && iB < end;
})());

console.log('\n=== ④ 探针不会打断主流程 ===');
t('before-k 调用点有 try/catch 包裹',
  /try \{ ctx\.vision\._probeArenaSkipK\('before-k'[^}]*\} catch/.test(SRC));
t('after-k 调用点有 try/catch 包裹',
  /try \{ ctx\.vision\._probeArenaSkipK\('after-k'[^}]*\} catch/.test(SRC));
t('探针内部有 try/catch 兜底', /catch \(e\)/.test(PROBE));

console.log('\n=== ⑤ 带标记，便于将来删除 ===');
t('方法注释带 [临时探针 v0.6.69] 标记', /\[临时探针 v0\.6\.69\]/.test(SRC));
const marker = (SRC.match(/🧪\[探针·跳过结算\]/g) || []).length;
t('日志前缀 🧪[探针·跳过结算] 可被 grep 定位', marker >= 1, `出现 ${marker} 次`);

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
