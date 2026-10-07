// 解析追踪 HTML，抽出 STEPS 数据看这次实跑真相。
const fs = require('fs');
const p = process.argv[2];
const html = fs.readFileSync(p, 'utf8');
const m = html.match(/var STEPS=(\[[\s\S]*?\]);/);
if (!m) { console.log('没找到 STEPS'); process.exit(1); }
const steps = JSON.parse(m[1]);
console.log('步数:', steps.length);
console.log('='.repeat(90));
for (const s of steps) {
  const fr = s.frame ? 'F' : '-';
  let extra = '';
  if (s.kind === 'key') extra = `key=${s.key} hold=${s.hold}`;
  else if (s.coord) extra = `coord=[${s.coord}]`;
  const hits = (s.probeHits || []).map(h => `${h.name}:${h.dist}`).join(',');
  console.log(`#${String(s.seq).padStart(2)} ${String(s.t).padStart(6)}ms ${s.kind.padEnd(8)} ${fr} ` +
    `scene=${String(s.scene).padEnd(8)} ${extra} ${hits ? '| ' + hits : ''}`);
}
console.log('='.repeat(90));
const kinds = {};
for (const s of steps) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
console.log('kind 分布:', kinds);
console.log('有帧的步数:', steps.filter(s => s.frame).length, '/', steps.length);
