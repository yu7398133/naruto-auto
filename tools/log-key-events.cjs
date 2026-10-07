// 从角斗场日志里抽出「非连点」的关键事件行，定位"第 1 把打完之后点错"的位置。
// 用法：node tools/log-key-events.cjs <log.txt>
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
// 这个日志是纯 UTF-8（脚本导出时已写好）
const raw = buf.toString('utf8');
const lines = raw.split(/\r?\n/);

// 连点器的指纹：click(85x,63x) / click(10xx,49x) / click(11xx,17x~43x) 等
const NOISE = /click\((8[0-9]{2},6[0-9]{2}|9[0-9]{2},6[0-9]{2}|10[0-9]{2},4[0-9]{2}|11[0-9]{2},(1[0-9]{2}|2[0-9]{2}|3[0-9]{2}|4[0-9]{2}))\)/;
const KEY = /结算|红叉|准备界面|批次|局|进场|奖励|最右|暗块|结束|打完|松手|跳过|解卡|识别|未命中|失败|导航|冲突|面板|开战|等待|releaseHold|松|停手|超时|放弃|重来|返回/;

const out = [];
lines.forEach((l, i) => {
  const s = l.trim();
  if (!s) return;
  if (NOISE.test(s) && !KEY.test(s)) return;
  if (!KEY.test(s)) return;
  out.push(`${i + 1}: ${s}`);
});
console.log(`关键事件 ${out.length} 行 / 共 ${lines.length} 行\n`);
console.log(out.join('\n'));
