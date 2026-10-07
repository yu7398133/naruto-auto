// 从帧图里量「秘境探险」标题区域的颜色 + 券数区域的颜色。
// JPEG 是 1280x720，与 BASE_W/BASE_H 一致，坐标可直接用。
const sharp = require('sharp');
const path = require('path');

(async () => {
  const files = process.argv.slice(2);
  for (const f of files) {
    const img = sharp(f);
    const meta = await img.metadata();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    console.log(`\n=== ${path.basename(f)}  ${info.width}x${info.height} ===`);
    if (info.width !== 1280 || info.height !== 720) {
      console.log('  ⚠ 尺寸不是 1280x720，坐标需换算');
    }
    const px = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const mean = (x1, y1, x2, y2) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
        const [R, G, B] = px(x, y); r += R; g += G; b += B; n++;
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    // ① 左上角标题带（猜「秘境探险」四字在这）
    console.log('  左上角横条扫一遍（y=10..120, 每 20px 一条，x=0..400）：');
    for (let y = 10; y < 130; y += 20) {
      const m = mean(0, y, 400, y + 20);
      console.log(`    y=${String(y).padStart(3)}  mean=(${m.join(',')})`);
    }
    // ② 各候选标题区
    const cands = {
      '券数区 496,620,40,52': [496, 620, 536, 672],
      '左上 0,0,300,120': [0, 0, 300, 120],
      '左上 0,20,260,90': [0, 20, 260, 90],
      '顶部中 400,0,900,60': [400, 0, 900, 60],
    };
    for (const [name, [x1, y1, x2, y2]] of Object.entries(cands)) {
      const m = mean(x1, y1, x2, y2);
      console.log(`  ${name.padEnd(24)} mean=(${m.join(',')})`);
    }
  }
})();
