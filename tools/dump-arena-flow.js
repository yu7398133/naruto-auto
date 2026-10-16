// 抽取 arenaBattle 任务的控制流骨架（只读，便于核对流程图与代码一致）
const fs = require('fs');
const s = fs.readFileSync('naruto-auto.user.js', 'utf8').split('\n');
// ⚠ 任务定义在 L9572 `key: 'arenaBattle', name: '角斗场忍术对战'`。
//   不要用 /arenaBattle/ 做宽松定位 —— 会先命中 L376 的 `secretRealm: true, arenaBattle: true`。
let i0 = s.findIndex(l => /key:\s*'arenaBattle'/.test(l));
if (i0 < 0) { console.log('未找到 arenaBattle 定义'); process.exit(1); }
console.log('=== arenaBattle @L' + (i0 + 1) + ' ===');
const RE = /^(if\s*\(|while\s*\(|for\s*\(|return|\}|break|continue|await |const |let )/;
const KW = /playOneArenaRound|claimArenaRewards|enterArena|waitArenaReady|stepResult|ctx\.fight|ctx\.flow|batch\+\+|rounds|标记|未完成|失败|收工|解卡/;
for (let i = i0; i < Math.min(i0 + 260, s.length); i++) {
  const t = (s[i] || '').trim();
  if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
  if (RE.test(t) || KW.test(t)) console.log('L' + (i + 1) + ' | ' + t.slice(0, 116));
}
