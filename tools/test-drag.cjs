// 实测 NAV 的前两步 drag 到底有没有效果：逐帧抓图 + 像素对比
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const NAV = [
  { kind: 'drag', x1: 973, y1: 299, x2: 12, y2: 299, duration: 652 },
  { kind: 'drag', x1: 981, y1: 312, x2: 117, y2: 296, duration: 505 },
];

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const outDir = path.join(__dirname, '..', 'trace-frames');
  fs.mkdirSync(outDir, { recursive: true });

  const grab = async (tag) => {
    const d = await p.evaluate(() => {
      const A = window.__narutoAuto;
      A.vision.capture(true);
      const c = A.vision.canvas;
      return c ? c.toDataURL('image/png') : null;
    });
    if (!d) { console.log(tag + ': 抓图失败'); return null; }
    const f = path.join(outDir, `dragtest-${tag}.png`);
    fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
    console.log(`${tag}: ${f}`);
    return f;
  };

  // 场景 + 抓图
  console.log('=== 拖动前 ===');
  const s0 = await p.evaluate(() => {
    const A = window.__narutoAuto;
    const d = A.scenes.detect(false);
    return { scene: d.scene, byProbe: d.byProbe };
  });
  console.log('scene:', JSON.stringify(s0));
  await grab('0-before');

  // 逐步执行 drag，每步后抓图 + 看 scene
  for (let i = 0; i < NAV.length; i++) {
    const s = NAV[i];
    console.log(`\n=== 执行 drag#${i + 1}  (${s.x1},${s.y1}) -> (${s.x2},${s.y2}) dur=${s.duration} ===`);
    const r = await p.evaluate(async (s) => {
      const A = window.__narutoAuto;
      const t0 = Date.now();
      try {
        await A.op.swipe(s.x1, s.y1, s.x2, s.y2, s.duration);
      } catch (e) { return { err: e.message }; }
      return {
        ms: Date.now() - t0,
        lastSend: A.sdk.lastSend ? JSON.parse(JSON.stringify(A.sdk.lastSend)) : null,
      };
    }, s);
    console.log('swipe 结果:', JSON.stringify(r));
    await new Promise(r => setTimeout(r, 1200));
    const sc = await p.evaluate(() => {
      const A = window.__narutoAuto;
      const d = A.scenes.detect(false);
      return { scene: d.scene, byProbe: d.byProbe };
    });
    console.log('scene:', JSON.stringify(sc));
    await grab(`${i + 1}-after-drag${i + 1}`);
  }
  await b.close();
})();
