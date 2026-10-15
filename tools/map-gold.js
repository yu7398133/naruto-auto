// 校正：脚本坐标空间 vs 样本 px 的映射关系。
// 事实：点击 (830,555) 落在按钮内(x 1112..1299, y 802..887)——
//   555*1.5=833 ✓ 在 y 带内；830*1.5=1245 ✓ 在 x 带内。
// 所以脚本坐标 *1.5 = 样本坐标。据此换算文字区。
const SX = 1.5;
console.log('=== 换算：样本 → 脚本 ===');
const conv = (x, y) => `(${Math.round(x / SX)},${Math.round(y / SX)})`;
console.log(' 左按钮金色外框 样本 x[1112..1299] y[802..887]');
console.log('   → 脚本 x[' + Math.round(1112 / SX) + '..' + Math.round(1299 / SX) + '] y[' + Math.round(802 / SX) + '..' + Math.round(887 / SX) + ']');
console.log(' 文字区 样本 x[1160..1262] y[826..864]');
console.log('   → 脚本 x[' + Math.round(1160 / SX) + '..' + Math.round(1262 / SX) + '] y[' + Math.round(826 / SX) + '..' + Math.round(864 / SX) + ']');
console.log(' 按钮中心 样本 (1206,845) → 脚本', conv(1206, 845));
console.log(' 现有点击 (830,555) → 样本 (' + 830 * SX + ',' + 555 * SX + ')  ✓ 在按钮内');

// 但探针 goldFreeText 的旧区域是 [804,544,864,584]（脚本坐标）
const OLD = [804, 544, 864, 584];
console.log('\n=== 旧探针区 [804,544,864,584] 换算到样本 ===');
console.log(' 样本 x[' + Math.round(OLD[0] * SX) + '..' + Math.round(OLD[2] * SX) + '] y[' + Math.round(OLD[1] * SX) + '..' + Math.round(OLD[3] * SX) + ']');
console.log(' 该区域 x 1088..1188 —— 只覆盖按钮**左边缘+金框**，正好避开了文字(x 1160..1262)!');
console.log(' ⇒ 这就是 old 探针没有区分度(1.8x)的根因：取样窗整体偏左，主要取到纯金框。');
console.log('\n=== 建议新探针区（脚本坐标，含文字主体）===');
const NX0 = Math.round(1168 / SX), NY0 = Math.round(832 / SX);
const NX1 = Math.round(1256 / SX), NY1 = Math.round(862 / SX);
console.log(' [' + [NX0, NY0, NX1, NY1].join(',') + ']');
console.log(' 该区在样本中 x ' + NX0 * SX + '..' + NX1 * SX + ' y ' + NY0 * SX + '..' + NY1 * SX);
