// v0.6.68 回归测试：2026-10-15 实跑暴露的四个缺陷。
//
// 事故背景（用户提供 6 张失败截图 + 在线日志复现）：
//   17:53~18:08 那次运行，秘境打完一场后陷入"重导航↔乱点"死循环，
//   并把状态污染给排队中的「一乐拉面」，用户只能手动中止。
//
//   链路：
//     ① 战斗超时(6min)退出 → 人还在战斗里      → prep 图标 score=83.7 判"不在准备界面"
//     ② 回主界面失败(18:06:47) 却继续点秘境入口  → 在未知画面上盲点
//     ③ 连点宏把 OTHER 也当战斗中                → 11 秒内几十下，点开「木叶赛事」等无关页
//     ④ 秘境退出确认弹窗点了不消失               → goHome 打地鼠(17:59:14 / 17:59:50)
//
// 教训：**"识别错误"会被宽进的连点宏放大成"到处乱点"，而乱点会污染全局**。
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};
const has = (re) => re.test(SRC);

// 取某函数体（从签名起到配平大括号）
function bodyOf(sig) {
  const i = SRC.indexOf(sig);
  if (i < 0) return '';
  const open = SRC.indexOf('{', i + sig.length - 1);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(open, k + 1); }
  }
  return '';
}

console.log('=== ① 连点宏白名单化（C）===');
t('存在 COMBAT_MACRO_GRACE_MS 常量', has(/const COMBAT_MACRO_GRACE_MS\s*=\s*\d+/));
t('stillFighting 纳入 inGrace || sceneIsBattle',
  has(/const stillFighting[\s\S]{0,260}\(inGrace \|\| sceneIsBattle\)/),
  '白名单/宽限逻辑缺失');
t('inGrace 由 combatElapsed 与 GRACE 比较得出',
  has(/const inGrace = combatElapsed < COMBAT_MACRO_GRACE_MS/));
t('sceneIsBattle 覆盖 BATTLE 与 LOADING',
  has(/const sceneIsBattle = this\._lastScene === SCENE\.BATTLE \|\| this\._lastScene === SCENE\.LOADING/));
t('停手/恢复有日志（可观测）',
  has(/连点宏停手/) && has(/连点宏恢复/));
// 反向自证：旧的两行式 stillFighting 必须已被替换
t('旧的「只排除结算/主界面」写法已不复存在',
  !has(/const stillFighting = !this\._holdUntil && this\._lastScene !== SCENE\.BATTLE_END\n\s*&& this\._lastScene !== SCENE\.HOME;/),
  '旧宽进写法还在');

console.log('\n=== ② 回主界面未确认则不得继续（A）===');
const nav = bodyOf('const realmNavGated = async (tag) =>');
t('找到 realmNavGated', nav.length > 200);
t('首次导航前校验起点在主界面', has(/起点不在主界面/));
t('重试分支校验回主界面成功', has(/回主界面未确认/));
t('校验用 sc !== SCENE.HOME 判据', /hr0?\.sc !== SCENE\.HOME/.test(nav) || has(/!hr0? \|\| hr0?\.sc !== SCENE\.HOME/));
t('未确认时 continue（不继续点入口）',
  /回主界面未确认[\s\S]{0,120}continue;/.test(nav) || /起点不在主界面[\s\S]{0,120}continue;/.test(nav));

console.log('\n=== ③ 秘境退出确认弹窗点后复检（D）===');
t('存在 verifyExitConfirmGone 方法', has(/async verifyExitConfirmGone\(/));
t('tapExitConfirm 记录点击次数', has(/_exitConfirmTries/));
t('两处调用点都接了复检', (SRC.match(/verifyExitConfirmGone\('goHome/g) || []).length >= 2,
  '实际 ' + (SRC.match(/verifyExitConfirmGone\('goHome/g) || []).length + ' 处');
t('复检失败不再无条件 continue',
  has(/点完必须复检是否真关掉/));

console.log('\n=== ④ 战斗未结束不做重导航（B）===');
t('prep 失败分支检测 inFight', has(/const inFight = ctx\.scenes\.detect\(false\)\.scene === SCENE\.BATTLE/));
t('仍战斗时记失败并退出本轮', has(/秘境战斗未结束\[准备图标/) && has(/ctx\.stepResult\(false\)/));
t('仍战斗时不重导航（break 早于重导航）',
  SRC.indexOf('秘境战斗未结束[') < SRC.indexOf("realmNavGated('不在准备界面→重导航')"),
  'break 位置比重导航晚 → 仍会重导航');

console.log('\n=== ⑤ 全局：不引入语法/结构破坏 ===');
// 大括号配平（粗查）
const bal = (SRC.match(/\{/g) || []).length - (SRC.match(/\}/g) || []).length;
t('花括号配平（考虑字符串内假象，容差 ±5）', Math.abs(bal) <= 5, '差值 ' + bal);

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
