// 扫描所有任务：找出「run(ctx) 开头第一个动作之前没有等待」的任务。
// 依据用户口径（2026-09-24）：「在所有脚本的第一步前面留 1.5s 的延迟」。
// 用法：node tools/scan-first-step-delay.cjs
const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8').split('\n');

const rows = [];
let curKey = '?', curName = '?';
for (let i = 0; i < lines.length; i++) {
  const km = lines[i].match(/^\s*key: '([A-Za-z0-9_]+)',\s*name: '([^']+)'/);
  if (km) { curKey = km[1]; curName = km[2]; }
  if (!/^\s*async run\(ctx\)\s*\{/.test(lines[i])) continue;

  // 从 run 开始往后找第一条「实际操作」或「等待」
  let firstOp = null, hasWaitBefore = false;
  for (let k = i + 1; k < Math.min(i + 40, lines.length); k++) {
    const s = lines[k].trim();
    if (/^(await\s+)?ctx\.(flow|log|step|stepResult)\(/.test(s) || /^\/\//.test(s) || s === '' ) continue;
    if (/Utils\.sleep\(\s*(UI_WAIT_MS|1500|1200|1000)\s*\)/.test(s)) { hasWaitBefore = true; break; }
    if (/await\s+ctx\.(go|tap|drag|home|op\.)/.test(s) || /await\s+dragScene/.test(s) || /await\s+ctx\.battle/.test(s)) {
      firstOp = { line: k + 1, text: s }; break;
    }
  }
  if (firstOp) rows.push({ key: curKey, name: curName, line: firstOp.line, hasWaitBefore, text: firstOp.text.slice(0, 60) });
}

const missing = rows.filter(r => !r.hasWaitBefore);
console.log(`扫描到 ${rows.length} 个 run() 入口\n`);
console.log(`=== ❌ 缺「第一步前等待」的任务（${missing.length} 个）===`);
for (const r of missing) console.log(`  L${String(r.line).padStart(5)}  [${r.key}] ${r.name}\n          ${r.text}`);
console.log(`\n=== ✅ 已有等待的（${rows.length - missing.length} 个）===`);
for (const r of rows.filter(x => x.hasWaitBefore)) console.log(`  L${String(r.line).padStart(5)}  [${r.key}] ${r.name}`);
