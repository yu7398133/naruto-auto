// 从 trace HTML 提取所有内嵌帧，并标注每帧对应的日志行（用于定位"结算帧"和"战斗帧"）
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3] || 'trace-frames-arena';
const html = fs.readFileSync(SRC, 'utf8');

// 1) 提取所有 data:image base64 帧，记录出现顺序
const re = /data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)/g;
const frames = [];
let m;
while ((m = re.exec(html)) !== null) {
  frames.push({ idx: frames.length, ext: m[1], b64: m[2], pos: m.index });
}
console.log(`共 ${frames.length} 个内嵌帧`);

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// 2) 找出每帧附近的动作描述（trace HTML 里帧通常跟着 label/时间戳）
//    取帧前 400 字符里最后一段可见文本，作为该帧的"上下文标签"
const ctxOf = (pos) => {
  const seg = html.slice(Math.max(0, pos - 1200), pos);
  const texts = seg.match(/>([^<>{}]{4,80})</g) || [];
  const clean = texts.map(t => t.slice(1, -1).trim()).filter(Boolean);
  return clean.slice(-3).join(' | ');
};

const manifest = [];
for (const f of frames) {
  const name = `f${String(f.idx).padStart(3, '0')}.${f.ext === 'jpeg' ? 'jpg' : 'png'}`;
  fs.writeFileSync(path.join(OUT, name), Buffer.from(f.b64, 'base64'));
  manifest.push({ idx: f.idx, name, ctx: ctxOf(f.pos) });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

// 3) 打印前后若干帧的上下文，便于挑正负样本
manifest.slice(0, 8).forEach(r => console.log(`  [${r.idx}] ${r.name}  ${r.ctx.slice(0, 110)}`));
console.log('  ...');
manifest.slice(-8).forEach(r => console.log(`  [${r.idx}] ${r.name}  ${r.ctx.slice(0, 110)}`));
