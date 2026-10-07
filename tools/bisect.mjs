/** 二分定位：二分截断文件，找到第一次出现语法错误的行 */
import fs from 'fs';
const P = new URL('../naruto-auto.user.js', import.meta.url);
const lines = fs.readFileSync(P, 'utf8').split('\n');
// 该文件最后是 IIFE /顶层代码，直接用 new Function 检查前 N 行是否「仅仅是未闭合」不可靠。
// 改用：对每种截断点，包一层 try/catch 用 acorn 不可用 -> 用 node 的 vm.compileFunction 也不行。
// 退而求其次：把前 N 行当作脚本片段，用 `new Function(prefix)` 会因未闭合而报不同的错；
// 真正可靠的是逐行累计 depth 并报告「本该闭合却没闭合」的位置。
// 这里做「累计 depth 快照」，打印所有 depth 从 >0 跌到 0 再反弹的可疑点。
let d = 0; const events = [];
const stack = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  // 粗略剥离 // 注释（不含字符串内的 //）
  const code = l.replace(/\/\/.*$/, '');
  for (let j = 0; j < code.length; j++) {
    const ch = code[j];
    if (ch === '{' || ch === '(' || ch === '[') { d += 1; stack.push({ ln: i + 1, ch, j }); }
    else if (ch === '}' || ch === ')' || ch === ']') {
      const top = stack.pop();
      const pair = { '{': '}', '(': ')', '[': ']' };
      if (top && pair[top.ch] !== ch) {
        events.push(`❌ 行${i + 1} 列${j + 1}: 遇到 '${ch}' 但期望 '${pair[top.ch] || '?'}'（开于行${top.ln}）`);
      }
    }
  }
}
console.log('=== 括号类型不匹配 ===');
console.log(events.length ? events.slice(0, 20).join('\n') : '  无');
console.log('\n=== 未闭合的括号（栈顶） ===');
for (const s of stack.slice(-15)) console.log(`  行${s.ln} 列${s.j + 1}: '${s.ch}' 未闭合`);
