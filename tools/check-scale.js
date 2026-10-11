// 判定 scale 假设：脚本 vision 工作在哪套坐标？
// 读脚本源码里 findTemplate / vision 抓帧的实现，确认模板应与哪个分辨率同尺度
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
const lines = src.split('\n');

function show(re, ctx, label) {
  console.log('=== ' + label + ' ===');
  let n = 0;
  lines.forEach((l, i) => { if (re.test(l) && n < 12) { console.log((i + 1) + ': ' + l.trim().slice(0, 150)); n++; } });
  if (!n) console.log('  (none)');
}
show(/BASE_W|BASE_H\b/, 0, 'BASE 常量');
show(/findTemplate\s*\(/, 0, 'findTemplate 定义/调用');
show(/drawImage\s*\(/, 0, 'drawImage 抓帧');
show(/_map\s*\(|function _map/, 0, '_map 坐标映射');
show(/videoWidth|videoHeight/, 0, 'video 原始尺寸');
