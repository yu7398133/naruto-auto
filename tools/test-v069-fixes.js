// v0.6.69 回归测试：秘境挑战「回不到主界面 → 2 秒谎报成功」。
//
// 事故（2026-10-16 10:16:09~11，用户提供完整日志）：
//   [10:16:09] ▶ 秘境挑战
//   [10:16:11]    ⚠ [首次导航] 起点不在主界面（场景=undefined） → 先不点秘境入口
//   [10:16:11]    ⚠ [首次导航] 回主界面未确认（场景=undefined） → **不继续点秘境入口**
//   [10:16:11]    ❌ [首次导航] 导航失败，抓取现场供事后定位
//   [10:16:11] ✓ 秘境挑战 (2秒)          ← 一次入口都没点，却判成功
//
// 根因（v0.6.68 引入）：把「前置条件失败」和「导航失败」都写成 `continue`。
//   前置失败白白吃掉 navTry 的 2 次机会 → 循环空转结束 → 但 navFailStreak++
//   在循环末尾走不到 ⇒ 停在 1 < 阈值 2 ⇒ 一个 stepResult(false) 都没记 ⇒ 谎报成功。
//
// 教训：**"没开始做"和"做了但失败"是两种失败，混在一起会让计数失真到够不上阈值。**
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

// 抽出 realmNavGated 的完整函数体
function navBody() {
  const i = SRC.indexOf('const realmNavGated = async (tag) =>');
  if (i < 0) return '';
  const open = SRC.indexOf('{', i + 30);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(open, k + 1); }
  }
  return '';
}
const NAV = navBody();

console.log('=== ① 前置条件独立于重试循环 ===');
t('存在独立的前置重试次数 PREP_HOME_TRIES', /const PREP_HOME_TRIES\s*=\s*\d+/.test(NAV));
t('前置检查是独立循环（for t <= PREP_HOME_TRIES）',
  /for \(let t = 1; t <= PREP_HOME_TRIES/.test(NAV));
t('前置失败不再用裸 continue 消耗 navTry',
  !/回主界面未确认[\s\S]{0,200}?continue;/.test(NAV),
  '仍存在"前置失败→continue"写法');

console.log('\n=== ② 前置失败明确记失败 ===');
t('前置失败调用了 stepResult(false)', /一次都没能导航[\s\S]{0,200}?ctx\.stepResult\(false\)/.test(NAV));
t('前置失败抓了现场', /captureFailure\(-1,\s*`秘境导航失败\[\$\{tag\}·回不到主界面\]`\)/.test(NAV));
t('前置失败返回 reason=no-home', /reason: 'no-home'/.test(NAV));

console.log('\n=== ③ 不重复记失败（双计数防护）===');
t('存在 navNoHome 标志', /let navNoHome = false/.test(NAV));
t('重试分支设 navNoHome = true', /navNoHome = true;/.test(NAV));
t('navNoHome 时提前 return（跳过末尾的 navFailStreak++）',
  /if \(navNoHome\) \{[\s\S]{0,120}?return \{ ok: false, navTry: 0/.test(NAV));
// 关键：navNoHome 的 return 必须出现在**末尾那次** navFailStreak++ 之前。
// ⚠ navFailStreak++ 出现两次（前置分支一次、末尾一次）；必须比对**最后一个**，
//   用 indexOf 会命中前置那个，得出假阳性（本测试初版就踩了这个坑）。
const allInc = [];
for (let p = NAV.indexOf('navFailStreak++'); p >= 0; p = NAV.indexOf('navFailStreak++', p + 1)) allInc.push(p);
const posGuard = NAV.indexOf('if (navNoHome)');
const lastInc = allInc[allInc.length - 1];
t('navNoHome 守卫位置早于末尾 navFailStreak++',
  posGuard > 0 && lastInc > 0 && posGuard < lastInc,
  `guard@${posGuard} lastInc@${lastInc}（共 ${allInc.length} 处自增）`);

console.log('\n=== ④ 场景显示不再出现裸 undefined ===');
t('用占位文案代替裸 hr.sc 输出', /goHome 无返回/.test(NAV));
t('前置日志用 homeLast 变量而非直接插值 undefined',
  /场景=\$\{homeLast\}/.test(NAV));

console.log('\n=== ⑤ 原有能力未被破坏（v0.6.65 的连续失败升级）===');
t('navFailStreak 仍存在并递增', /navFailStreak\+\+/.test(NAV));
t('仍按 NAV_FAIL_STREAK_FAIL 阈值升级为失败',
  /navFailStreak >= NAV_FAIL_STREAK_FAIL/.test(NAV));
t('成功仍清零 navFailStreak', /navFailStreak = 0;/.test(NAV));
t('仍保留"连续 2 次都没进入第 2 场景"分支', /连续 2 次都没进入第 2 场景/.test(NAV));
t('仍抓取导航失败现场', /captureFailure\(-1,\s*`秘境导航失败\[\$\{tag\}\]`\)/.test(NAV));

console.log('\n=== ⑥ 模拟：复现原 bug 的场景不再漏记失败 ===');
// 用简化的状态机复刻控制流：前置 3 次全失败时，是否恰好记 1 次失败。
function simulate(prepTries, homeOkOn) {
  let navFailStreak = 0, stepFails = 0;
  const NAV_FAIL_STREAK_FAIL = 2;
  let homeOk = false;
  for (let t2 = 1; t2 <= prepTries && !homeOk; t2++) {
    if (homeOkOn.includes(t2)) { homeOk = true; break; }
  }
  if (!homeOk) { navFailStreak++; stepFails++; return { navFailStreak, stepFails, reason: 'no-home' }; }
  return { navFailStreak, stepFails, reason: 'nav-ok' };
}
const r1 = simulate(3, []);              // 主界面永远回不去（就是事故现场）
t('前置全失败时恰好记 1 次失败（原 bug 下是 0 次）', r1.stepFails === 1, `实际 ${r1.stepFails}`);
const r2 = simulate(3, [2]);             // 第 2 次成功 → 不该记失败
t('前置第 2 次成功时不记失败', r2.stepFails === 0, `实际 ${r2.stepFails}`);

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
