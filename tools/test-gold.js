// v0.6.66 招财按钮状态识别 —— 用**两张真机截图**做判定测试。
// 这是最强证据：判据的输入不是合成数据，而是 2026-10-15 用户提供的真实画面。
//
// 验证两件事：
//   ① 决策逻辑（goldButtonState）在三态下的输出是否正确；
//   ② 判据常量（[779,555,837,575] / 8% / 4%）在两态真图上确实可分离。
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// ── PNG 解码（与 measure 脚本同源）──
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch, out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 3] = cur[x * ch]; out[(y * w + x) * 3 + 1] = cur[x * ch + 1]; out[(y * w + x) * 3 + 2] = cur[x * ch + 2]; }
    prev = cur;
  }
  return { w, h, data: out };
}

// ── 从用户脚本里抽出真实实现，而不是复写一遍逻辑 ──
// 复写会让测试失去意义（改了源码测试还是绿的）。
const SRC = fs.readFileSync(path.join(__dirname, '..', 'naruto-auto.user.js'), 'utf8');
function cutMethod(signature) {
  const s = SRC.indexOf('\n    ' + signature);
  if (s < 0) throw new Error('未找到方法定义: ' + signature);
  const afterSig = SRC.indexOf('{', s);
  let depth = 0, i = afterSig;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error('大括号未配平: ' + signature);
  return { sig: SRC.slice(s + 5, afterSig).trim(), body: SRC.slice(afterSig, i + 1) };
}
const stateSrc = cutMethod('goldButtonState()');
const ratioSrc = cutMethod('ratioIn(area, cls)');

// 从源码里读 PROBES 的两个新探针定义，保证测试与实现同源
function grabProbe(name) {
  const re = new RegExp(name + ':\\s*\\{[^}]*\\}', 'm');
  const m = SRC.match(re);
  if (!m) throw new Error('未找到探针 ' + name);
  const o = {};
  const area = m[0].match(/area:\s*\[([^\]]+)\]/);
  o.area = area[1].split(',').map(x => Number(x.trim()));
  const bm = m[0].match(/brightMin:\s*(\d+)/); if (bm) o.brightMin = Number(bm[1]);
  const dm = m[0].match(/darkMin:\s*(\d+)/); if (dm) o.darkMin = Number(dm[1]);
  return o;
}
const PROBES = { goldFreeNow: grabProbe('goldFreeNow'), goldPaidNow: grabProbe('goldPaidNow') };
console.log('源码探针 goldFreeNow:', JSON.stringify(PROBES.goldFreeNow));
console.log('源码探针 goldPaidNow:', JSON.stringify(PROBES.goldPaidNow));

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

// ── 用真图构造 VisionCore 桩：getImageData 直接从 PNG 取像素 ──
const SCALE = 1.5;   // 脚本视口 1280 → 样本 1920
function makeVision(img, opts) {
  const o = Object.assign({ fresh: true, broken: false }, opts || {});
  const v = {
    ctx: {
      getImageData(x, y, w, h) {
        if (o.broken) throw new Error('canvas unavailable');
        const out = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const sx = Math.min(img.w - 1, Math.round((x + i) * SCALE));
          const sy = Math.min(img.h - 1, Math.round((y + j) * SCALE));
          const si = (sy * img.w + sx) * 3, di = (j * w + i) * 4;
          out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
        }
        return { data: out };
      },
    },
    _fresh() { },
  };
  // 挂上真实实现
  const asFn = (m) => 'function ' + m.sig + ' ' + m.body;
  eval('v.ratioIn = ' + asFn(ratioSrc));
  // goldButtonState 里用 `VisionCore.CLS_*` 引用静态分类器 —— 抽出来的方法体
  // 依赖这个**具名绑定**，必须在本作用域里声明，否则 ReferenceError。
  const VisionCore = { CLS_BRIGHT_YELLOW, CLS_DARK, CLS_GOLD };
  eval('v.goldButtonState = ' + asFn(stateSrc));
  return v;
}
// 分类器从源码抽出来（保证测试用的是线上那份阈值）。
// 用字符串切片而不是正则：分类器都是单行 `get CLS_X() { return (r,g,b)=>...; }`。
function grabCls(getter) {
  const head = 'get ' + getter + '() { return ';
  const i = SRC.indexOf(head);
  if (i < 0) throw new Error('未找到分类器 ' + getter);
  const start = i + head.length;
  const end = SRC.indexOf('; }', start);
  if (end < 0) throw new Error('分类器结尾未找到: ' + getter);
  return eval('(' + SRC.slice(start, end) + ')');
}
const CLS_BRIGHT_YELLOW = grabCls('CLS_BRIGHT_YELLOW');
const CLS_DARK = grabCls('CLS_DARK');
const CLS_GOLD = grabCls('CLS_GOLD');
console.log('分类器 亮黄:', CLS_BRIGHT_YELLOW.toString());
console.log('分类器 深色:', CLS_DARK.toString());
console.log('');

const dir = path.join(__dirname, 'zc');
const A = decodePNG(fs.readFileSync(path.join(dir, 'free.png')));     // 免费一次
const B = decodePNG(fs.readFileSync(path.join(dir, 'zhaocai.png')));  // 招财

// makeVision 已经把 VisionCore.CLS_* 通过闭包绑好，这里直接用。
const visionFor = (img) => makeVision(img);

console.log('=== ① 真图 · 免费一次态 → 必须判 free ===');
const vA = visionFor(A);
const sA = vA.goldButtonState();
console.log('  ' + sA.msg);
t('state === free', sA.state === 'free', 'got ' + sA.state);
t('亮黄占比 > 阈值', sA.bright > PROBES.goldFreeNow.brightMin, 'bright=' + sA.bright.toFixed(1));
t('深色占比 < 阈值', sA.dark < PROBES.goldPaidNow.darkMin, 'dark=' + sA.dark.toFixed(1));

console.log('=== ② 真图 · 招财态 → 必须判 paid ===');
const vB = visionFor(B);
const sB = vB.goldButtonState();
console.log('  ' + sB.msg);
t('state === paid', sB.state === 'paid', 'got ' + sB.state);
t('深色占比 > 阈值', sB.dark > PROBES.goldPaidNow.darkMin, 'dark=' + sB.dark.toFixed(1));
t('亮黄占比 < 阈值', sB.bright < PROBES.goldFreeNow.brightMin, 'bright=' + sB.bright.toFixed(1));

console.log('=== ③ 两态判据互斥（不能同时命中）===');
t('免费态不是 paid', sA.state !== 'paid');
t('招财态不是 free', sB.state !== 'free');

console.log('=== ④ 分离度：判据必须留有大裕度 ===');
const brRatio = sA.bright / Math.max(sB.bright, 0.01);
const dkRatio = sB.dark / Math.max(sA.dark, 0.01);
console.log(`  亮黄 ${sA.bright.toFixed(1)}% vs ${sB.bright.toFixed(1)}%  (${brRatio.toFixed(1)}x)`);
console.log(`  深色 ${sB.dark.toFixed(1)}% vs ${sA.dark.toFixed(1)}%  (${dkRatio.toFixed(1)}x)`);
t('亮黄分离 > 10x', brRatio > 10, brRatio.toFixed(1) + 'x');
t('深色分离 > 10x', dkRatio > 10, dkRatio.toFixed(1) + 'x');
t('免费态亮黄裕度 > 阈值2倍', sA.bright > PROBES.goldFreeNow.brightMin * 2, sA.bright.toFixed(1) + '% vs ' + PROBES.goldFreeNow.brightMin + '%');
t('招财态深色裕度 > 阈值2倍', sB.dark > PROBES.goldPaidNow.darkMin * 2, sB.dark.toFixed(1) + '% vs ' + PROBES.goldPaidNow.darkMin + '%');

console.log('=== ⑤ 场景错误：随便一块别的区域 → 必须 unknown ===');
// 取主界面底部导航条（两张图都不是按钮区），两态判据都应落空
const AREA_BACKUP = PROBES.goldFreeNow.area;
PROBES.goldFreeNow.area = [300, 300, 358, 320];
PROBES.goldPaidNow.area = [300, 300, 358, 320];
const vWrong = visionFor(A);
const sW = vWrong.goldButtonState();
console.log('  ' + sW.msg);
t('非按钮区 → unknown', sW.state === 'unknown', 'got ' + sW.state);
t('unknown 提示含「场景错误」', /场景错误/.test(sW.msg), sW.msg);
PROBES.goldFreeNow.area = AREA_BACKUP;
PROBES.goldPaidNow.area = AREA_BACKUP;

console.log('=== ⑥ 老探针区对比（证明「换窗口」是必要的）===');
// 旧区 [804,544,864,584] 用均值法：两态几乎无差 —— 这正是它不稳的根因。
PROBES.goldFreeNow.area = [804, 544, 864, 584];
PROBES.goldPaidNow.area = [804, 544, 864, 584];
const oldA = visionFor(A).goldButtonState();
const oldB = visionFor(B).goldButtonState();
console.log(`  旧区 免费态: 亮黄 ${oldA.bright.toFixed(1)}% 深色 ${oldA.dark.toFixed(1)}% → ${oldA.state}`);
console.log(`  旧区 招财态: 亮黄 ${oldB.bright.toFixed(1)}% 深色 ${oldB.dark.toFixed(1)}% → ${oldB.state}`);
t('旧区无法区分两态（至少一态判 unknown）', oldA.state === 'unknown' || oldB.state === 'unknown' || oldA.state === oldB.state,
  `A=${oldA.state} B=${oldB.state}`);
PROBES.goldFreeNow.area = AREA_BACKUP;
PROBES.goldPaidNow.area = AREA_BACKUP;

console.log('\n结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
