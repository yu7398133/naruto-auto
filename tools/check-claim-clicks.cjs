// 对齐「领取礼包」的声明坐标 vs 实际点击坐标，判断是否有真实位移。
// 用法：node tools/check-claim-clicks.cjs <log.txt>
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);

// 脚本里声明的领取坐标
const DECLARED = [[1128, 177], [1128, 177], [1128, 177], [1124, 290]];

console.log('=== 日志里所有「打开奖励面板」与「领取」的上下文 ===\n');
for (let i = 0; i < lines.length; i++) {
  if (!/打开忍术奖励面板|奖励面板已打开|奖励面板\*\*没打开|奖励状态|开始领取/.test(lines[i])) continue;
  console.log('---');
  for (let k = i; k < Math.min(i + 9, lines.length); k++) {
    const s = lines[k].replace(/\[(\d\d:\d\d:\d\d)\]/, '[$1]');
    console.log('  ' + s.trim());
  }
}
