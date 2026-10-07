// 扫描「拖动 / 开页之后紧跟的短延时」——这些是固定的界面等待，
// 应统一为标准常量而不是散落的字面量 1000。
// 用法：node tools/scan-tap-delays.cjs
const fs = require('fs');
const lines = fs.readFileSync('naruto-auto.user.js', 'utf8').split('\n');

const OPEN_RE = /ctx\.go\(|dragScene\(ctx|ctx\.tap\(\[/;
const SLEEP_RE = /Utils\.sleep\((\d+)\)/;

console.log('行号   前置动作                              紧跟延时');
console.log('-'.repeat(78));
let count1000 = 0, countOther = 0;
for (let i = 0; i < lines.length; i++) {
  if (!OPEN_RE.test(lines[i])) continue;
  // 往下找 1~2 行内的 sleep
  for (let k = i + 1; k <= i + 2 && k < lines.length; k++) {
    const m = lines[k].match(SLEEP_RE);
    if (m) {
      const ms = +m[1];
      if (ms === 1000) count1000++; else countOther++;
      const prev = lines[i].trim().slice(0, 44).padEnd(44);
      console.log(String(i + 1).padStart(5) + '  ' + prev + '  ' + ms);
      break;
    }
  }
}
console.log('-'.repeat(78));
console.log('紧跟 1000ms 的处数：', count1000, '   其它值：', countOther);
