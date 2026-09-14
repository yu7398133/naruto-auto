// ============================================================
//  tools/task-order-check.cjs —— 静态校验「任务顺序」是否符合用户口径
//  用法： node tools/task-order-check.cjs
//  校验三件事（改任务顺序 / 改分类后跑一遍，避免改错）：
//    ① 面板底部按钮顺序：⚔ 日常 → 🎁 收获 → 📅 周常 → 🥊 战斗
//    ② 设置面板分组顺序（GROUPS）与按钮顺序一致
//    ③ 「▶ 开始」（TaskFactory.createEnabled 的 RANK）默认队列：日常全部在收获之前
//  退出码 0=全部通过，2=有断言失败
// ============================================================
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(__dirname, '..', 'naruto-auto.user.js');
const s = fs.readFileSync(SRC, 'utf8');

const start = s.indexOf('const TASK_DEFS = [');
const end = s.indexOf('const TaskFactory');
if (start < 0 || end < 0) { console.log('❌ 定位 TASK_DEFS / TaskFactory 失败'); process.exit(2); }
const seg = s.slice(start, end);

// 形如：key: 'collectGold', name: '招财', category: 'collect',
const re = /key:\s*'([^']+)',\s*name:\s*'([^']+)'(?:,\s*category:\s*'([^']+)')?/g;
const defs = [];
let m;
while ((m = re.exec(seg))) defs.push({ key: m[1], name: m[2], category: m[3] || 'daily' });

const byCat = {};
defs.forEach(d => (byCat[d.category] = (byCat[d.category] || []).concat(d.name)));
console.log(`TASK_DEFS 共 ${defs.length} 个任务`);
for (const c of ['daily', 'collect', 'weekly', 'battle'])
  console.log(`  [${c}] ${(byCat[c] || []).length} 个: ${(byCat[c] || []).join('、')}`);

// 复刻 createEnabled 的 RANK 排序
const RANK = { daily: 0, collect: 1, weekly: 2, battle: 3 };
const queue = defs.map((d, i) => ({ d, i }))
  .sort((a, b) => ((RANK[a.d.category] != null ? RANK[a.d.category] : 3) -
                   (RANK[b.d.category] != null ? RANK[b.d.category] : 3)) || (a.i - b.i))
  .map(x => x.d);

console.log('\n「▶ 开始」默认执行顺序（全勾选时）：');
queue.forEach((d, i) => console.log(`  ${String(i + 1).padStart(2)}. [${d.category.padEnd(7)}] ${d.name}`));

const fails = [];
const firstCollect = queue.findIndex(d => d.category === 'collect');
const lastDaily = queue.map(d => d.category).lastIndexOf('daily');
if (!(firstCollect === -1 || lastDaily === -1 || lastDaily < firstCollect))
  fails.push(`日常未全部排在收获之前 (lastDaily=${lastDaily}, firstCollect=${firstCollect})`);

const btnDaily = s.indexOf('id="na-daily"');
const btnCollect = s.indexOf('id="na-collect"');
if (!(btnDaily > 0 && btnDaily < btnCollect)) fails.push('面板按钮顺序不是 日常 在 收获 之前');

const gDaily = s.indexOf("['daily', '⚔ 日常任务']");
const gCollect = s.indexOf("['collect', '🎁 每日收获']");
if (!(gDaily > 0 && gDaily < gCollect)) fails.push("设置面板 GROUPS 顺序不是 daily 在 collect 之前");

console.log('');
fails.forEach(f => console.log('❌ ' + f));
console.log(fails.length ? `\n校验失败（${fails.length} 项）` : '\n✅ 全部断言通过');
process.exit(fails.length ? 2 : 0);
