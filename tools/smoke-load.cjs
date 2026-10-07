// 静态冒烟测试：在 Node 里真跑一遍脚本顶层，验证
//   ① VisionCore 上的新方法真的存在（catch「放错类」这类运行时错误）
//   ② 常量不触发 TDZ
// 只做"加载 + 反射检查"，不驱动浏览器。
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');

// 用极小 DOM 桩，让脚本顶层（只定义类/常量，不执行任务）能跑起来
const stubEl = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
  setAttribute() {}, getAttribute: () => null, querySelector: () => null,
  querySelectorAll: () => [], getContext: () => ({
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    drawImage() {}, fillRect() {}, save() {}, restore() {}, clearRect() {},
  }),
  width: 1280, height: 720, innerHTML: '', textContent: '', value: '', dataset: {},
});
const doc = {
  createElement: stubEl, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, body: stubEl(),
  documentElement: stubEl(), head: stubEl(),
};

const sandbox = {
  document: doc, window: { addEventListener() {}, location: { href: '' } },
  navigator: { userAgent: 'node' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  GM_getValue: undefined, GM_setValue: undefined,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (f) => setTimeout(f, 0),
  Image: function () {}, URL: { createObjectURL: () => '' },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  console,
};
sandbox.window.document = doc;
sandbox.globalThis = sandbox;

const vm = require('vm');
const ctx = vm.createContext(sandbox);

let loaded = false;
try {
  vm.runInContext(src, ctx, { filename: 'naruto-auto.user.js' });
  loaded = true;
  console.log('✅ 脚本顶层加载成功（无 TDZ / 无语法/引用错误）');
} catch (e) {
  console.log('❌ 加载失败:', e.message);
  process.exit(1);
}

// 反射：从 sandbox 里找出被挂到 window/global 上的类？
// 脚本是 IIFE，类不外泄 —— 改用源码级断言：确认方法定义在 VisionCore 内。
const lines = src.split('\n');
function classOf(lineNo) {
  for (let i = lineNo - 1; i >= 0; i--) {
    if (/^\s*class \w+/.test(lines[i])) return lines[i].trim().replace(/\s*\{$/, '');
  }
  return '?';
}
const checks = [
  // 这些必须挂在 VisionCore 上（= ctx.vision），因为 ctx.vision.xxx 被任务层调用
  ['sawArenaRewardClaimed', 'class VisionCore'],
  ['arenaRewardsAllClaimed', 'class VisionCore'],
  ['sawArenaRewardPanel', 'class VisionCore'],
  ['sawBattlePause', 'class VisionCore'],
  ['findPauseBars', 'class VisionCore'],
  ['sawRedX', 'class VisionCore'],
  // 这些挂在 Navigator 上（由 nav.tapExitConfirm 内部调用），只要自身闭环即可
  ['detectExitConfirm', 'class Navigator'],
  ['sawDarkMask', 'class Navigator'],
];
let bad = 0;
for (const [name, want] of checks) {
  const ln = lines.findIndex(l => new RegExp('^\\s{4}' + name + '\\(').test(l));
  const got = ln < 0 ? 'NOT FOUND' : classOf(ln + 1);
  const okk = got === want;
  if (!okk) bad++;
  console.log(`${okk ? '✅' : '❌'} ${name.padEnd(24)} → ${got}${okk ? '' : '  (期望 ' + want + ')'}`);
}
console.log(bad ? `\n❌ ${bad} 个方法归属错误` : '\n✅ 方法归属全部正确');
process.exit(bad ? 1 : 0);
