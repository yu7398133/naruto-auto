// 实测「战斗画面」下所有探针的真实得分 —— 用于定位 battle 探针为何 0 命中。
//
// 背景（2026-10-16 16:35 日志，秘境挑战）：
//   连点宏在战斗中被自己停手：
//     ⏸ 连点宏停手（场景=other 且已超出开打宽限 15000ms）
//   整份日志 场景= 只出现 other(20) / loading(13)，battle **0 次**。
//   ⇒ 战斗中画面被判成 other ⇒ v0.6.68「先宽后严」15s 后停手 ⇒ 整场不出刀。
//
// 本工具**只读**：不改脚本、不点任何东西，只把当前帧的探针实测值打出来。
//
// 用法：秘境/角斗场打到战斗画面时（别切走），运行：
//   node tools/probe-battle-frame.js
const CDP = 'http://127.0.0.1:9222';

async function list() {
  const r = await fetch(CDP + '/json/list');
  const all = await r.json();
  return all.filter(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
}

async function evaluate(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const send = (method, params) => ws.send(JSON.stringify({ id: ++id, method, params }));
    ws.onopen = () => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) {
        ws.close();
        if (m.result && m.result.exceptionDetails) return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400)));
        resolve(m.result && m.result.result ? m.result.result.value : null);
      }
    };
    ws.onerror = (e) => reject(new Error('ws error'));
    setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout')); }, 30000);
  });
}

(async () => {
  const pages = await list();
  const page = pages.find(p => /start\.qq\.com/.test(p.url)) || pages[0];
  if (!page) { console.error('找不到页面'); process.exit(1); }
  console.log('页面:', page.url);

  // 每轮必须激活目标，否则后台标签的帧是旧的
  try { await fetch(CDP + '/json/activate/' + page.id); } catch (_) {}
  await new Promise(r => setTimeout(r, 500));

  const expr = `(() => {
    const A = window.__narutoAuto;
    if (!A) return JSON.stringify({ error: '__narutoAuto 不存在（脚本没加载？）' });
    const out = { hasScript: true, version: (A.config && A.config.get && A.config.version) || null };

    // ① 场景判定
    try {
      const d = A.scenes.detect(false);
      out.detect = { scene: d.scene, brightness: d.brightness, error: d.error ? String(d.error).slice(0,200) : null };
      out.hits = d.hits;
    } catch (e) { out.detect = { error: String(e).slice(0,300) }; }

    // ② 逐个探针实测（这才是关键：battle 探针到底多少分）
    const probeRows = [];
    try {
      const PROBES = A.probes;
      const keys = Object.keys(PROBES || {});
      for (const k of keys) {
        const p = PROBES[k];
        let row = { key: k, label: p.label || '', dynamic: !!p.dynamic, hasColor: !!p.color };
        try {
          if (p.color && p.area) {
            const m = A.vision.match(p);
            row.kind = 'color';
            row.dist = (m && typeof m.dist === 'number') ? +m.dist.toFixed(1) : null;
            row.tol = (m && typeof m.tol === 'number') ? m.tol : null;
            row.ok = !!(m && m.ok);
          } else if (p.detRegion) {
            const r = A.vision.findRedX(p.detRegion);
            row.kind = 'redX';
            row.ok = !!(r && r.ok);
            row.dist = (r && typeof r.dist === 'number') ? +r.dist.toFixed(1) : null;
          } else {
            row.kind = 'n/a';
          }
        } catch (e) { row.err = String(e).slice(0, 120); }
        probeRows.push(row);
      }
    } catch (e) { out.probesError = String(e).slice(0, 300); }
    // 命中的排前面，便于一眼看出有没有 battle
    probeRows.sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0));
    out.probes = probeRows;

    // ③ 当前帧基本信息（确认不是黑屏/静止）
    try {
      const v = document.querySelector('video');
      out.video = v ? { w: v.videoWidth, h: v.videoHeight } : null;
      const c = document.querySelector('canvas');
      out.canvas = c ? { w: c.width, h: c.height } : null;
    } catch (e) {}
    return JSON.stringify(out);
  })()`;

  const raw = await evaluate(page.webSocketDebuggerUrl, expr);
  const r = JSON.parse(raw);

  if (r.error) { console.error(r.error); process.exit(1); }

  console.log('\n=== ① 场景判定 ===');
  console.log('  scene      =', r.detect && r.detect.scene);
  console.log('  brightness =', r.detect && r.detect.brightness);
  if (r.detect && r.detect.error) console.log('  error      =', r.detect.error);
  console.log('  命中探针   =', JSON.stringify(r.hits));

  console.log('\n=== ② 探针逐个实测（✅=命中）===');
  const hit = (r.probes || []).filter(p => p.ok);
  const miss = (r.probes || []).filter(p => !p.ok);
  console.log('  命中 ' + hit.length + ' / 共 ' + ((r.probes || []).length) + ' 个');
  console.log('  --- 命中 ---');
  hit.forEach(p => console.log(`  ✅ ${p.key.padEnd(22)} dist=${p.dist} tol=${p.tol} ${p.label}`));
  console.log('  --- 未命中（只列最接近的 12 个）---');
  miss.slice(0, 12).forEach(p => console.log(`  ❌ ${p.key.padEnd(22)} dist=${p.dist} tol=${p.tol} ${p.label}`));

  console.log('\n=== ③ 关键：battle 相关探针 ===');
  const battleish = (r.probes || []).filter(p => /battle|fight|combat|loading/i.test(p.key + ' ' + p.label));
  if (!battleish.length) {
    console.log('  ⚠ PROBES 里**没有**名字带 battle/loading 的探针 ——');
    console.log('    说明「战斗」判定不是靠某个 battle 探针，需要看 detect() 的 PROBES 遍历规则。');
  } else {
    battleish.forEach(p => console.log(`  ${p.ok ? '✅' : '❌'} ${p.key.padEnd(22)} dist=${p.dist} tol=${p.tol} ${p.label}`));
  }

  console.log('\n=== ④ 帧来源 ===');
  console.log('  video  =', JSON.stringify(r.video));
  console.log('  canvas =', JSON.stringify(r.canvas));
})();
