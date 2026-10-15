// 精确判定 L8989 的 break 会跳出哪个循环。
// 用括号配对从 break 位置向上找真正**词法包含**它的 for/while。
const fs = require('fs');
const src = fs.readFileSync('naruto-auto.user.js', 'utf8');
const lines = src.split('\n');
const BN = 8989;                       // break 所在行号(1-based)
let off = 0;
for (let i = 0; i < BN - 1; i++) off += lines[i].length + 1;
const bpos = off + lines[BN - 1].indexOf('break');

// 从 break 向前扫描，维护"我是否被某个 {} 包住"，并记下每个 for/while 的起始偏移
// 简单做法：对每个候选 for/while，判断它的函数体区间是否包含 bpos。
function findBlockEnd(startIdx) {
  // startIdx 指向 '{' 的位置
  let d = 0;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
    else if (c === '"' || c === "'" || c === '`') {           // 跳过字符串/模板
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    } else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    else if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; }
  }
  return -1;
}

const cands = [];
const re = /\b(for|while)\s*\(/g;
let m;
while ((m = re.exec(src))) {
  // 找到该语句的 { （跳过 () 里的内容）
  let i = re.lastIndex, d = 1;
  while (i < src.length && d > 0) { if (src[i] === '(') d++; else if (src[i] === ')') d--; i++; }
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '{') continue;
  const end = findBlockEnd(i);
  if (end < 0) continue;
  if (i < bpos && bpos < end) cands.push({ off: m.index, open: i, end, line: src.slice(0, m.index).split('\n').length, head: src.slice(m.index, m.index + 70).split('\n')[0] });
}
cands.sort((a, b) => b.off - a.off);
console.log('词法上真正包含这个 break 的循环（由内到外）：');
cands.forEach((c, k) => console.log(`  ${k === 0 ? '★ 最近(即 break 的作用对象)' : '  外层'} L${c.line}: ${c.head.trim()}`));
if (!cands.length) console.log('  ⚠ 没找到 —— break 不在任何循环里！');
