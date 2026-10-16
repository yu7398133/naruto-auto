// v0.6.71：奖励面板入口前的「等回到战斗准备界面」守卫 —— 行为自证。
//
// 事故（2026-10-16 07:16 日志）：
//   首次进场 点前暗块 3/5 → 点(791,644) → ✓ 面板打开 5/5
//   第1批打完 点前暗块 5/5 → 点(795,643) → ⚠ 没打开，画面落到主界面
//   坐标没变、位置没变（用户口径），差别在**时机** —— 局循环最后一局走
//   ctx.fight → 点k → sleep(1200) → return，这 1200ms 后画面未必已回准备界面。
//   用户口径：「最后一局打完后，是回到战斗准备界面，这时候需要点奖励面板的入口」。
//
// 本测试锁死三条不变量：
//   ① 点入口**之前**必定先等准备界面
//   ② 等不到**也不判失败**（成败仍由面板判据决定，不新增假失败）
//   ③ 守卫放在真正点入口那一句之前
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

const i0 = SRC.indexOf('const claimArenaRewards = async');
const i1 = SRC.indexOf('const peek = await claimArenaRewards', i0);
const FN = SRC.slice(i0, i1 > i0 ? i1 : i0 + 9000);

// ⚠ 断言前必须剥注释 —— 否则"不记 stepResult(false)"这类**说明性注释**
//   会被当成代码命中（本测试初版就误报过一次；同类坑在 v0.6.69 探针测试
//   的 `.score` 上也踩过）。剥掉块注释和行注释后再做关键词断言。
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const FN_CODE = stripComments(FN);

console.log('=== ① 守卫存在且用现成判据 ===');
t('claimArenaRewards 已定位', FN.length > 800);
t('调用 waitArenaReady（与局循环同一个判据，不是新造）',
  /ctx\.waitArenaReady\(/.test(FN));
t('有 v0.6.71 标记便于将来定位', /v0\.6\.71/.test(SRC));

console.log('\n=== ② 顺序：先等，后点入口 ===');
const iWait = FN.indexOf('ENENTRY_READY_WAIT_MS') >= 0
  ? FN.indexOf('ENENTRY_READY_WAIT_MS')
  : FN.indexOf('ENTRY_READY_WAIT_MS');
const iClick = FN.indexOf("clickNatural(ARENA_REWARD_ENTRY");
t('找到等待段', iWait > 0, 'iWait=' + iWait);
t('找到点入口语句', iClick > 0, 'iClick=' + iClick);
t('等待段在点入口之前', iWait > 0 && iClick > 0 && iWait < iClick,
  `wait@${iWait} click@${iClick}`);

console.log('\n=== ③ 等不到 → 回主场景重走，且不记失败 ===');
// 用户口径（2026-10-16）：「如果没有回到准备界面的救场，可以重头开始整个任务，
//   因为重头开始会先回到主场景，重新来走」
const guardEnd = FN_CODE.indexOf('取原图', iClick) > 0 ? FN_CODE.indexOf('取原图', iClick) : iClick;
const guardSeg = FN_CODE.slice(Math.max(0, iWait - 400), iClick);
t('守卫段内无 stepResult(false)（复位 ≠ 失败）', !/stepResult\(false\)/.test(guardSeg));
t('守卫段内无 captureFailure', !/captureFailure/.test(guardSeg));
t('等不到时 goHome 回主场景', /goHome/.test(guardSeg));
t('之后重新进场 enterArena', /enterArena\(/.test(guardSeg));
t('回主界面也失败时不盲点（有兜底分支）', /不盲点|回主界面也失败/.test(guardSeg));

console.log('\n=== ③b 调用方正确区分「复位」与「真失败」===');
// restarted:true 绝不能被当成 !opened 走记失败分支
const callers = SRC.slice(i1, i1 + 4000);
t('返回体带 restarted 标志', /restarted:\s*true/.test(FN));
t('首批调用方先判 restarted 再判 opened',
  /if \(peek\.restarted\)/.test(callers) &&
  callers.indexOf('peek.restarted') < callers.indexOf('!peek.opened'));
t('批尾调用方先判 restarted 再判 opened',
  /if \(cl\.restarted\)/.test(callers) &&
  callers.indexOf('cl.restarted') < callers.indexOf('!cl.opened'));
// restarted 分支里不能有 stepResult(false)
const iR1 = callers.indexOf('peek.restarted');
const iR2 = callers.indexOf('!peek.opened');
t('首批 restarted 分支内无 stepResult(false)',
  !/stepResult\(false\)/.test(callers.slice(iR1, iR2)));

console.log('\n=== ④ 首次进场那次不受影响（本就在准备界面）===');
// 首拍 2500ms 命中即直接往下走，不额外等待
t('首拍用短超时 2500ms 快速命中', /waitArenaReady\(2500\)/.test(FN));
t('只有未命中才进二次等待', /if \(!atPrep\)/.test(FN));

console.log('\n=== ⑤ 面板判据未被改动（用户口径：判据是对的）===');
t('未改 ARENA_PANEL_DIM_NEED 的使用',
  /sawArenaRewardPanel\(/.test(FN));
const DIM = SRC.match(/ARENA_PANEL_DIM_NEED\s*=\s*(\d+)/);
const LUMA = SRC.match(/ARENA_PANEL_DIM_LUMA_MAX\s*=\s*(\d+)/);
t('ARENA_PANEL_DIM_NEED 仍为 4', DIM && DIM[1] === '4', DIM && DIM[1]);
t('ARENA_PANEL_DIM_LUMA_MAX 仍为 80', LUMA && LUMA[1] === '80', LUMA && LUMA[1]);
t('ARENA_REWARD_ENTRY 未被改动（坐标本身没变）',
  /ARENA_REWARD_ENTRY = \[793, 642\]/.test(SRC));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
