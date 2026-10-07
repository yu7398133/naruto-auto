// 从追踪 HTML 里抽出 STEPS 数组（含 base64 帧）并列出动作时间线。
// 用法：node tools/dump-trace-steps.cjs <trace.html> [outJson]
const fs = require('fs');

const src = process.argv[2];
const outJson = process.argv[3] || 'tools/_trace_steps.json';
const c = fs.readFileSync(src, 'utf8');

const marker = 'var STEPS=';
const i = c.indexOf(marker);
if (i < 0) { console.error('未找到 var STEPS='); process.exit(1); }
const start = c.indexOf('[', i);

// 括号配对（跳过字符串内的括号）
let depth = 0, inStr = false, esc = false, end = -1;
for (let k = start; k < c.length; k++) {
  const ch = c[k];
  if (inStr) {
    if (esc) esc = false;
    else if (ch === '\\') esc = true;
    else if (ch === '"') inStr = false;
    continue;
  }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { end = k + 1; break; } }
}
if (end < 0) { console.error('数组未闭合'); process.exit(1); }

const json = c.slice(start, end);
fs.writeFileSync(outJson, json, 'utf8');
const arr = JSON.parse(json);

console.log('步骤数:', arr.length);
console.log('字段:', Object.keys(arr[0]).filter(k => k !== 'frame').join(','));
console.log('');
const t0 = arr[0].t;
for (const x of arr) {
  const dt = ((x.t - t0) / 1000).toFixed(2).padStart(6);
  const e = [];
  if (x.coord) e.push('coord=(' + x.coord + ')');
  if (x.scene) e.push('scene=' + x.scene);
  if (x.brightness != null) e.push('bri=' + Math.round(x.brightness));
  if (x.probeHits && x.probeHits.length) {
    e.push('hits=' + x.probeHits.map(h => h.name + ':' + h.dist + (h.click ? '@' + h.click : '')).join(' '));
  }
  if (x.verdict) e.push('verdict=' + x.verdict);
  if (x.why) e.push('why=' + x.why);
  console.log(dt + 's ' + String(x.kind).padEnd(8) + String(x.label || '').padEnd(26) + ' ' + e.join('  '));
}
