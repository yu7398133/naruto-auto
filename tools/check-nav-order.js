// 列出 realmNavGated 内控制流标记的相对顺序，确认 navNoHome 守卫在末尾计数之前。
const fs = require('fs');
const SRC = fs.readFileSync('naruto-auto.user.js', 'utf8');
const i = SRC.indexOf('const realmNavGated = async (tag) =>');
const open = SRC.indexOf('{', i + 30);
let d = 0, end = 0;
for (let k = open; k < SRC.length; k++) {
  if (SRC[k] === '{') d++;
  else if (SRC[k] === '}') { d--; if (d === 0) { end = k; break; } }
}
const NAV = SRC.slice(open, end);

const marks = [];
const push = (re, label) => { let m; const r = new RegExp(re, 'g'); while ((m = r.exec(NAV))) marks.push([m.index, label]); };
push('navFailStreak\\+\\+', 'navFailStreak++');
push('ctx\\.stepResult\\(false\\)', 'stepResult(false)');
push('if \\(navNoHome\\)', 'GUARD if(navNoHome)');
push('return \\{ ok: false', 'return ok:false');
push('return \\{ ok: true', 'return ok:true');
push('for \\(let t = 1', 'for t (前置循环)');
push('for \\(let navTry = 1', 'for navTry (导航循环)');
marks.sort((a, b) => a[0] - b[0]);

console.log('realmNavGated 内标记顺序：');
for (const [p, l] of marks) {
  const line = NAV.slice(0, p).split('\n').length;
  console.log('  NAV行' + String(line).padStart(4) + '  ' + l);
}

// 断言：守卫必须位于"末尾那一次" navFailStreak++ 之前。
// 末尾那次 = 最后一个 navFailStreak++。
const allInc = marks.filter(m => m[1] === 'navFailStreak++').map(m => m[0]);
const guard = marks.find(m => m[1] === 'GUARD if(navNoHome)');
const lastInc = Math.max(...allInc);
console.log('\n最后一个 navFailStreak++ 偏移: ' + lastInc);
console.log('守卫偏移: ' + (guard ? guard[0] : 'NOT FOUND'));
console.log(guard && guard[0] < lastInc
  ? '✅ 守卫早于末尾计数 —— navNoHome 时会提前 return，不会双计数'
  : '❌ 守卫晚于末尾计数 —— 会双计数');
