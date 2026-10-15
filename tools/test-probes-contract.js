// v0.6.67 回归测试：PROBES 表的**结构契约**。
//
// 背景（真实事故，2026-10-15 v0.6.66）：
//   我加了两个「按像素占比」判定的招财探针（brightMin / darkMin），它们**没有 color 字段**。
//   但 SceneDetector.detect() 里有一个循环，按约定假设「每个探针都是 avg 色距判据」，
//   无条件读 probe.color.r ⇒ `Cannot read properties of undefined (reading 'r')` 抛异常，
//   被外层 catch 兜住 ⇒ **整轮场景判定作废**。
//   结果：所有任务失去视觉能力，集体退化成盲按空转，主界面永远判不出来，
//   连「赠送体力」都只是蒙对的**假成功**。整个 20 任务批量跑废掉。
//
// 这个测试的价值：那次事故**离线测试全绿**——因为 test-gold.js 只测招财逻辑本身，
// 没有任何测试覆盖「PROBES 表被别的消费者怎么读」。教训是**改了共享数据结构，
// 就必须测它的消费者契约**，而不是只测自己新写的那段逻辑。
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

// ── 抽出 PROBES 对象字面量并按顶层 key 切段 ──
const start = SRC.indexOf('const PROBES = {');
if (start < 0) throw new Error('未找到 PROBES 定义');
// 找到与之配平的大括号
let depth = 0, i = SRC.indexOf('{', start), end = -1;
for (; i < SRC.length; i++) {
  if (SRC[i] === '{') depth++;
  else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = SRC.slice(start, end + 1);

// 顶层探针：行首 4 空格 + key: { ... }
const probeRe = /^ {4}(\w+):\s*\{/gm;
const probes = [];
let m;
while ((m = probeRe.exec(body))) {
  const kstart = m.index;
  // 该探针段一直延伸到下一个顶层 key 或对象结束
  probeRe.lastIndex = kstart + m[0].length;
  const nxt = body.slice(probeRe.lastIndex).search(/^ {4}\w+:\s*\{/m);
  const kend = nxt < 0 ? body.length : probeRe.lastIndex + nxt;
  probes.push({ key: m[1], seg: body.slice(kstart, kend) });
  probeRe.lastIndex = kstart;   // 让下一轮从当前 key 重新匹配
  probeRe.lastIndex = kstart + m[0].length;
  // 手动前进：跳过已消费部分
  probeRe.lastIndex = kend;
}
console.log(`解析到 ${probes.length} 个顶层探针`);
t('解析到足够多的探针', probes.length >= 25, '只有 ' + probes.length);

// ── 契约①：SceneDetector 遍历时排除 non-color 探针 ──
console.log('\n=== ① 场景遍历必须按 color 是否存在分流 ===');
const hasGuard = /if\s*\(!probe\.color\)\s*continue;/.test(SRC);
t('detect() 里有 `if (!probe.color) continue;` 守卫', hasGuard,
  '没有守卫的话，任何非 color 探针都会让整轮场景判定抛异常');

// 守卫必须在 `probe.color.r` 读取之前
const guardIdx = SRC.indexOf('if (!probe.color) continue;');
const readIdx = SRC.indexOf('期望(${probe.color.r}');
t('守卫位于 probe.color.r 读取之前', guardIdx > 0 && guardIdx < readIdx,
  `guard@${guardIdx} read@${readIdx}`);

// ── 契约②：non-color 探针必须自带判定字段 ──
console.log('\n=== ② 非 color 探针必须自带可判定字段 ===');
const nonColor = probes.filter(p => !/\bcolor:/.test(p.seg));
console.log('  非 color 探针: ' + JSON.stringify(nonColor.map(p => p.key)));
const JUDGE = /(\bbrightMin:|\bdarkMin:|\bminStd:|\bmaxStd:|\bgoldPct:|\bclick:)/;
for (const p of nonColor) {
  t(`${p.key} 含可判定字段(brightMin/darkMin/…)`, JUDGE.test(p.seg),
    '既没有 color 又没有判定字段 = 这个探针没有任何判据');
}

// ── 契约③：所有探针都要有 area + label（遍历/日志都读） ──
console.log('\n=== ③ 每个探针都有 area / label ===');
const noArea = probes.filter(p => !/\barea:/.test(p.seg) && !/detRegion:/.test(p.seg));
const noLabel = probes.filter(p => !/\blabel:/.test(p.seg));
t('全部探针都有 area', noArea.length === 0, '缺: ' + noArea.map(p => p.key).join(','));
t('全部探针都有 label', noLabel.length === 0, '缺: ' + noLabel.map(p => p.key).join(','));

// ── 契约④：PROBES 只被一处遍历（新增消费者时要在此处同步） ──
console.log('\n=== ④ PROBES 遍历点唯一性 ===');
const iters = (SRC.match(/Object\.(entries|values|keys)\(PROBES\)/g) || []);
t('只有一个 PROBES 遍历点', iters.length === 1, '实际 ' + iters.length + ' 个：' + JSON.stringify(iters));

// ── 契约⑤：还原事故——模拟遍历，确认不再抛异常 ──
console.log('\n=== ⑤ 事故复现：遍历所有探针不得抛异常 ===');
// 按 detect() 的真实读法逐个访问
let threw = [];
for (const p of probes) {
  // 从段里粗略还原该探针对象（够用：color / dynamic）
  const probe = {};
  probe.dynamic = /\bdynamic:\s*true/.test(p.seg);
  const cm = p.seg.match(/color:\s*\{\s*r:\s*(\d+),\s*g:\s*(\d+),\s*b:\s*(\d+)/);
  if (cm) probe.color = { r: +cm[1], g: +cm[2], b: +cm[3] };
  try {
    // 复刻修好后的 detect() 循环体
    if (probe.dynamic) continue;
    if (!probe.color) continue;
    const _ = `${probe.color.r},${probe.color.g},${probe.color.b}`;
  } catch (e) {
    threw.push(p.key + ': ' + e.message);
  }
}
t('无探针在遍历中抛异常', threw.length === 0, threw.join(' | '));

// 反向确认：如果不加守卫，确实会抛（证明这个测试不是空的）
console.log('\n=== ⑥ 反向自证：去掉守卫必须复现事故 ===');
let threwNoGuard = [];
for (const p of probes) {
  const probe = {};
  probe.dynamic = /\bdynamic:\s*true/.test(p.seg);
  const cm = p.seg.match(/color:\s*\{\s*r:\s*(\d+),\s*g:\s*(\d+),\s*b:\s*(\d+)/);
  if (cm) probe.color = { r: +cm[1], g: +cm[2], b: +cm[3] };
  try {
    if (probe.dynamic) continue;
    const _ = `${probe.color.r},${probe.color.g},${probe.color.b}`;   // ← 故意不守卫
  } catch (e) {
    threwNoGuard.push(p.key);
  }
}
console.log('  无守卫时抛异常的探针: ' + JSON.stringify(threwNoGuard));
t('无守卫确实会抛（测试有效）', threwNoGuard.includes('goldFreeNow') && threwNoGuard.includes('goldPaidNow'),
  'got ' + JSON.stringify(threwNoGuard));

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
