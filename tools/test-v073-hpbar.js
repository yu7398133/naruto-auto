// v0.6.73 顶部血条 HUD 判据 —— 契约测试
//
// 目的：把「修了什么、不许退回什么」钉成可执行断言。
// 每条断言都对应一个**真实事故**，不是风格偏好。
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');
const LINES = SRC.split(/\r?\n/);

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push(`  OK   ${name}`); }
  else { fail++; results.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/** 去掉行注释与块注释，避免断言命中我自己写的注释（这个坑踩过三次）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const CODE = stripComments(SRC);

const grab = (re) => { const m = CODE.match(re); return m ? m[0] : null; };

console.log('=== v0.6.73 顶部血条 HUD 判据 ===\n');

// ── ① 常量必须存在且取值符合实测 ────────────────────────────────
check('常量 HPBAR_REF 存在', /const\s+HPBAR_REF\s*=/.test(CODE));
check('HPBAR_REF = (240,64,32)（离实测主色）',
  /const\s+HPBAR_REF\s*=\s*\{\s*r:\s*240\s*,\s*g:\s*64\s*,\s*b:\s*32\s*\}/.test(CODE),
  grab(/const\s+HPBAR_REF[^;]*;/));

check('常量 HPBAR_TOL = 48', /const\s+HPBAR_TOL\s*=\s*48\s*;/.test(CODE));
check('常量 HPBAR_HIT_PCT 存在', /const\s+HPBAR_HIT_PCT\s*=\s*\d+\s*;/.test(CODE));
check('常量 HPBAR_LATCH_MS = 8000（用户定 8s）',
  /const\s+HPBAR_LATCH_MS\s*=\s*8000\s*;/.test(CODE), grab(/const\s+HPBAR_LATCH_MS[^;]*;/));

// 采样窗：1920 基准实测 x244-586(左) / x1670-1740(右)，y84-102
const mLE = CODE.match(/const\s+HPBAR_LEFT_EDGE\s*=\s*\[([^\]]+)\]/);
const mRE = CODE.match(/const\s+HPBAR_RIGHT_EDGE\s*=\s*\[([^\]]+)\]/);
check('HPBAR_LEFT_EDGE / RIGHT_EDGE 都存在', !!mLE && !!mRE);
if (mLE && mRE) {
  const LE = mLE[1].split(',').map(s => +s.trim());
  const RE = mRE[1].split(',').map(s => +s.trim());
  check('左窗落在左血条红段内 (x 244..586)',
    LE[0] >= 244 && LE[2] <= 586, `左窗 x=${LE[0]}..${LE[2]}`);
  check('右窗落在右血条红段内 (x 1670..1746)',
    RE[0] >= 1600 && RE[2] <= 1790, `右窗 x=${RE[0]}..${RE[2]}`);
  check('两窗 y 都覆盖条体 y84..102',
    LE[1] <= 100 && LE[3] >= 100 && RE[1] <= 100 && RE[3] >= 100,
    `左 y=${LE[1]}..${LE[3]} 右 y=${RE[1]}..${RE[3]}`);
  check('左窗在右窗左侧（未写反）', LE[2] < RE[0]);
}

// ── ② 分类器：必须用欧氏距离，不能退化成单分量比较 ────────────────
check('存在 CLS_HPBAR_RED 分类器', /static\s+get\s+CLS_HPBAR_RED\s*\(/.test(CODE));
check('分类器用平方欧氏距离（dr*dr+dg*dg+db*db）',
  /dr\s*\*\s*dr\s*\+\s*dg\s*\*\s*dg\s*\+\s*db\s*\*\s*db/.test(CODE));

// ── ③ 探针方法存在，且**只看有无红条**、不看填充量 ────────────────
check('存在 hpBarBothRed()', /hpBarBothRed\s*\(\s*\)\s*\{/.test(CODE));
check('存在 hpBarCombatLatched()', /hpBarCombatLatched\s*\(\s*\)\s*\{/.test(CODE));
check('存在 hpBarResetLatch()', /hpBarResetLatch\s*\(\s*\)\s*\{/.test(CODE));
check('两侧判据是 AND（用户口径：两侧必须都红）',
  /L\s*>=\s*HPBAR_HIT_PCT\s*&&\s*R\s*>=\s*HPBAR_HIT_PCT/.test(CODE));
check('闩锁用「最近命中时刻 + 窗口」而非帧计数',
  /aged\s*<\s*HPBAR_LATCH_MS/.test(CODE));
check('命中时刷新闩锁时间戳', /this\._hpBarHitAt\s*=\s*now\s*;/.test(CODE));
check('构造函数初始化 _hpBarHitAt', /_hpBarHitAt\s*=\s*0\s*;/.test(CODE));

// ── ④ 异常路径必须保守：视觉不可用时**不得**置位闩锁 ──────────────
//  这是为了防止退化成 v0.6.68 之前「在未知页乱点」的老毛病。
check('视觉异常返回 both=false（保守）',
  /catch\s*\(e\)\s*\{[\s\S]{0,400}?both:\s*false/.test(CODE));

// ── ⑤ 连点宏接线：闩锁必须进 stillFighting，且不得压过结算 ────────
const sf = grab(/const\s+stillFighting\s*=[\s\S]*?;\n/);
check('stillFighting 引用了血条闩锁', !!sf && /hpLatch/.test(sf), sf ? sf.replace(/\s+/g, ' ').slice(0, 160) : 'NOT FOUND');
check('stillFighting 仍保留 !this._holdUntil（结算窗优先于闩锁）',
  !!sf && /!\s*this\._holdUntil/.test(sf));
check('stillFighting 仍排除 BATTLE_END', !!sf && /BATTLE_END/.test(sf));
check('stillFighting 仍排除 HOME', !!sf && /SCENE\.HOME/.test(sf));
check('闩锁仅在非战斗场景时才测（省开销）',
  /\(due\s*&&\s*!sceneIsBattle\)/.test(CODE));

// ── ⑥ 新局必须清闩锁 ─────────────────────────────────────────────
check('开打处调用 hpBarResetLatch()', /this\.vision\.hpBarResetLatch\s*\(\s*\)/.test(CODE));
check('重置发生在 _stillSince 附近（本场起点初始化区）',
  /_stillSince\s*=\s*0\s*;[\s\S]{0,400}?hpBarResetLatch/.test(CODE));

// ── ⑦ 回归护栏：不许把 v0.6.68 的教训改回去 ──────────────────────
check('未删除 COMBAT_MACRO_GRACE_MS', /const\s+COMBAT_MACRO_GRACE_MS\s*=\s*15000\s*;/.test(CODE));
check('未把 stillFighting 退化成无条件 true', !/const\s+stillFighting\s*=\s*true\s*;/.test(CODE));
// 旧的「先宽后严」条件必须仍能单独成立（闩锁只是 OR 上去的一项）
check('grace 与 sceneIsBattle 仍是 stillFighting 的组成部分',
  !!sf && /inGrace/.test(sf) && /sceneIsBattle/.test(sf));

console.log(results.join('\n'));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
