// 找出所有「读 this.ctx.getImageData」但没有先调 this._fresh() 的方法。
// 这是本次 bug 的通用形态：不刷新帧 → 读到陈旧画面 → 静默误判。
// 用法：node tools/scan-missing-fresh.cjs
const fs = require('fs');
const lines = fs.readFileSync('naruto-auto.user.js', 'utf8').split('\n');

// 收集所有方法定义（VisionCore / Navigator 内 4 空格缩进的方法）
const methods = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^    (?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
  if (m) methods.push({ name: m[1], line: i, body: [] });
}
// 每个方法的体：到下一个同缩进方法或类结束
for (let k = 0; k < methods.length; k++) {
  const end = k + 1 < methods.length ? methods[k + 1].line : lines.length;
  methods[k].body = lines.slice(methods[k].line, end);
}

let bad = 0, ok = 0;
console.log('方法名                        读像素  有 _fresh  ');
console.log('-'.repeat(60));
for (const m of methods) {
  const reads = m.body.some(l => /this\.ctx\.getImageData/.test(l));
  if (!reads) continue;
  const fresh = m.body.some(l => /this\._fresh\(\)/.test(l));
  if (fresh) ok++;
  else { bad++; console.log(`${m.name.padEnd(28)}  ✅       ❌ 缺失  ← L${m.line + 1}`); }
}
console.log('-'.repeat(60));
console.log(`读像素的方法：有 _fresh ${ok} 个 / 缺失 ${bad} 个`);
if (bad === 0) console.log('\n✅ 全部已刷新帧');
