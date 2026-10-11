// 找出脚本里所有其它模板来源（@resource / GM_getResourceText / 内联 canvas / 硬编码像素）
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
const lines = src.split('\n');
const pats = [
  [/TMPL|Template|模板/, '模板相关'],
  [/@resource/, '@resource'],
  [/GM_getResource/, 'GM_getResource'],
  [/createImageData|putImageData/, '像素级构造'],
  [/new Image\(\)/, 'new Image'],
  [/loadTmpl|_tmpl|Tmpl\b/, '模板加载器'],
];
const seen = new Set();
for (const [re, label] of pats) {
  console.log('=== ' + label + ' ===');
  let n = 0;
  lines.forEach((l, i) => {
    if (re.test(l) && n < 22) { const t = (i + 1) + ': ' + l.trim().slice(0, 130); if (!seen.has(t)) { seen.add(t); console.log(t); n++; } }
  });
  console.log('');
}
