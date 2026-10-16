// v0.6.72：goHome() 返回值契约 —— 回归自证。
//
// 事故（2026-10-16 15:35 实跑，日志 naruto-log-2026-10-16T07-36-09.txt）：
//   秘境挑战「3 次都没能确认回到主界面 → 一次都没能导航」，5 秒判失败。
//   但同一行失败记录写着：场景=home 亮度=113.7 命中探针=[friendsIcon=46 mailNav=30 ...]
//   —— detect() 明明看到主界面。是**检查代码**把成功当成了失败。
//
// 根因：v0.6.69 把 ctx.home() 当成 `{sc}` 对象读，但它的契约是 **boolean**：
//   ctx.home() → nav.goHome() → `return true` / `return false` / 末尾 `return ok`
//   `typeof true === 'object'` 恒假 ⇒ homeOk 永不为 true ⇒ 3 次全"失败"。
//
// 本测试做两件事：
//   ① 从**源码**里提取 goHome 的所有 return，钉死它是 boolean（防止将来改回对象）
//   ② 断言秘境两处前置检查都不再用 object/sc 判据
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const CODE = stripComments(SRC);

console.log('=== ① 钉死 goHome() 的返回契约 ===');
// 抽出 goHome 函数体（从签名到下一个同缩进的 }
const lines = CODE.split('\n');
const i0 = lines.findIndex(l => /async goHome\s*\(/.test(l));
t('找到 goHome 定义', i0 > 0);
// ⚠ 只取 goHome **自身作用域**的 return。
//   goHome 体内嵌了 detectScene 箭头函数，它有自己的 `return { sc, rr }`（缩进 8）。
//   而 goHome 自己的 return 缩进是 6 和 10 —— **缩进区间分不开**，别用缩进。
//   可靠判据：判断该 return 所处的**花括号作用域**是不是那个嵌套箭头函数。
//   做法：先框定 detectScene 的行范围，落在其中的 return 一律排除。
const dStart = lines.findIndex((l, i) => i > i0 && /const detectScene = /.test(l));
let dEnd = dStart, dd = 0, dStarted = false;
for (let i = dStart; i < dStart + 40 && dStart > 0; i++) {
  const l = lines[i] || '';
  for (const c of l) { if (c === '{') { dd++; dStarted = true; } else if (c === '}') dd--; }
  if (dStarted && dd <= 0) { dEnd = i; break; }
}
t('定位到嵌套 detectScene 作用域', dStart > i0 && dEnd > dStart);

const body = [];
let depth = 0, started = false;
const ownRets = [];
for (let i = i0; i < i0 + 260; i++) {
  const l = lines[i] || '';
  body.push(l);
  if (i < dStart || i > dEnd) {           // ← 排除嵌套箭头函数体内的 return
    if (!l.trim().startsWith('//') && !l.trim().startsWith('*')) {
      const m = l.match(/return\s+([^;]+);/);
      if (m) ownRets.push(m[1].trim());
    }
  }
  for (const c of l) { if (c === '{') { depth++; started = true; } else if (c === '}') depth--; }
  if (started && depth <= 0) break;
}
const BODY = body.join('\n');
const rets = ownRets;
console.log('  goHome 自身作用域的 return：', JSON.stringify(rets));
t('存在 return true', rets.includes('true'));
t('存在 return false', rets.includes('false'));
t('**没有任何** return 对象字面量（契约是 boolean）',
  rets.length >= 3 && !rets.some(r => r.startsWith('{')),
  '发现对象返回：' + rets.filter(r => r.startsWith('{')).join(' | '));
// 反向确保嵌套 helper 仍存在（不是被误删导致断言虚假通过）
t('嵌套 detectScene 的 `return { sc, rr }` 仍在（说明过滤是按深度生效的）',
  /return \{ sc, rr \}/.test(BODY));

console.log('\n=== ② 秘境两处前置检查不再用 object/sc 判据 ===');
const realmStart = SRC.indexOf('const realmNavGated = async');
const realmEnd = SRC.indexOf('const SECRET_REALM_NAV_ENTRY', realmStart) > 0
  ? SRC.indexOf('const SECRET_REALM_NAV_ENTRY', realmStart)
  : realmStart + 6000;
const REALM = stripComments(SRC.slice(realmStart, Math.min(realmEnd, realmStart + 9000)));

// 唯一允许出现的 'sc' 是注释里的历史说明；代码里不得再有 hr.sc 做主判据
const codeLines = REALM.split('\n').filter(l => /hr\.sc|'sc' in hr/.test(l));
t('已无 `hr.sc !== SCENE.HOME` 硬判据', !/hr\.sc\s*!==/.test(REALM));
t('已无 `typeof hr !== \'object\'` 硬判据', !/typeof hr\s*!==\s*'object'/.test(REALM));
t('改为认 boolean（typeof hr === \'boolean\'）', /typeof hr === 'boolean'/.test(REALM));
t('并用场景探针做二次确认（byScene/sceneNow）', /byScene|sceneNow/.test(REALM));
t('确认跳出的条件是 `byRet === true || byScene`',
  /byRet === true\s*\|\|\s*byScene/.test(REALM));

console.log('\n=== ③ 不再把 undefined 说成「goHome 无返回，多半是超时」===');
t('旧占位语已从代码中移除',
  !/goHome 无返回，多半是超时/.test(REALM));

console.log('\n=== ④ 保留 v0.6.69 的正确部分（不因修 bug 而回退）===');
t('前置条件仍是独立重试（PREP_HOME_TRIES）', /PREP_HOME_TRIES/.test(REALM));
t('前置彻底失败时仍如实记失败（captureFailure + stepResult(false)）',
  /captureFailure\(-1/.test(REALM) && /stepResult\(false\)/.test(REALM));
t('reason: \'no-home\' 仍在', /reason: 'no-home'/.test(REALM));
t('navNoHome 机制仍在', /navNoHome/.test(REALM));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
