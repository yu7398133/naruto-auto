// 把 tools/di-tmpl.png 作为 base64 内嵌常量插入 naruto-auto.user.js。
// 选点：ARENA_END_ICON_TMPL 常量之后（同属「忍术对战探针模板」区）。
// 用法：node tools/embed-di-tmpl.cjs
const fs = require('fs');
const path = require('path');

const b64 = fs.readFileSync(path.join(__dirname, 'di-tmpl.png')).toString('base64');
const file = path.join(__dirname, '..', 'naruto-auto.user.js');
let src = fs.readFileSync(file, 'utf8');

const MARK = 'const ARENA_ROUND_DI_TMPL =';
if (src.includes(MARK)) {
  // 替换已有常量
  src = src.replace(/const ARENA_ROUND_DI_TMPL = 'data:image\/png;base64,[A-Za-z0-9+/=]+';/,
    `const ARENA_ROUND_DI_TMPL = 'data:image/png;base64,${b64}';`);
  console.log('已替换现有 ARENA_ROUND_DI_TMPL');
  fs.writeFileSync(file, src, 'utf8');
  process.exit(0);
}

// 找锚点：ARENA_END_ICON_REGION 定义之后
const anchor = /const ARENA_END_ICON_REGION = \[[\d, ]+\];[^\n]*\n/;
if (!anchor.test(src)) { console.error('未找到锚点 ARENA_END_ICON_REGION'); process.exit(1); }

const block = `
// ── 忍术对战「在战斗中」探针：画面顶部中央的「第 X 回」回合指示器 ────────────
//  用户口径（2026-09-28）：「忍术对战不能使用暂停探针…战斗页面中间有『第x回』
//    这样的字样，以这个作为**战斗中**的判定 —— **有这个才执行战斗连点器，
//    没有就连点器停下来**，这样避免连点器乱按导致误入其他页面。这个探针 1s 间隔都可以」。
//
//  ⚠ 只抠**「第」一个字**（不含数字、不含「回」）—— 用户口径：
//    「不需要第1回 第2回这些，你只需要匹配第 和 回就行，甚至，只匹配第就行」。
//    ⇒ 回合数变化（1/2/3/4/5）**不影响**匹配，模板只有 40x49，匹配也快。
//
//  来源：2026-09-28 实机截图（第 3 回）1920 空间 x∈[886,946] y∈[25,99]，
//    缩放到 1280 空间得 40x49。回验：搜索区内最优 SAD=6.4（位置 (591,17) 与实测吻合）。
//
//  为什么不用颜色判据：该区域背景是红金色，实测「红色占比」整片都高
//    （目标 63.1% vs 右侧同高区 74.8% / 上方 98.2%）→ 无判别力，必须用字形模板。
const ARENA_ROUND_DI_TMPL = 'data:image/png;base64,${b64}';
// 搜索区（1280 空间）：模板落点在 (591,17)，四周留余量
const ARENA_ROUND_REGION = [575, 5, 720, 90];
const ARENA_ROUND_THRESH = 25;   // 与 findTemplate 默认一致；实测 6.4，余量充足
`.replace('${b64}', b64);

src = src.replace(anchor, (m) => m + block);
fs.writeFileSync(file, src, 'utf8');
console.log(`已插入 ARENA_ROUND_DI_TMPL（base64 ${b64.length} 字符）`);
