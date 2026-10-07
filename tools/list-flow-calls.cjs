// 列出所有「字符串形式」调用 flow() 的位置 —— 这些没有 task key，
// 会退回到 name 做 waitKey；若 name 里含变量（如 "第 N 场"），每轮都会重新等待。
const fs = require('fs');
const lines = fs.readFileSync('naruto-auto.user.js', 'utf8').split('\n');
console.log('=== 字符串/模板串形式调 flow() ===');
lines.forEach((l, i) => {
  if (/ctx\.flow\(\s*[`'"]/.test(l)) {
    const dyn = /\$\{/.test(l) ? '  ⚠ 含变量（每轮不同）' : '';
    console.log(`  L${i + 1}: ${l.trim()}${dyn}`);
  }
});
console.log('\n=== 对象形式（有 key，稳定）===');
let n = 0;
lines.forEach((l, i) => { if (/ctx\.flow\(this\)|ctx\.flow\(\{/.test(l)) n++; });
console.log(`  共 ${n} 处`);
