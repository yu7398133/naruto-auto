// 找注入源：检查所有可能的注入痕迹
const http = require('http');
const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const PROBE = `(() => {
  const o = {};

  // 1) 页面里所有 script 标签
  o.scripts = Array.from(document.querySelectorAll('script')).map(s => ({
    src: s.src ? s.src.slice(0, 120) : '(inline)',
    len: (s.textContent || '').length,
    type: s.type || 'text/javascript'
  }));

  // 2) 检查 chrome 扩展注入 (isolated world 的脚本会以 file:// 或 chrome-extension:// 出现)
  o.extScripts = Array.from(document.querySelectorAll('script'))
      .filter(s => s.src && (s.src.startsWith('chrome-extension://') || s.src.startsWith('file://')))
      .map(s => s.src.slice(0, 150));

  // 3) 脚本自身的元信息 —— VERSION 常量在闭包里,尝试从面板标题拿
  const t = document.title;
  o.title = t;
  const panel = document.querySelector('#na-panel');
  o.panelText = panel ? panel.textContent.slice(0, 200) : null;

  // 4) 关键的:能否访问 vision / nav / config (决定能否热补丁)
  const A = window.__narutoAuto;
  o.canPatch = {
    vision: !!(A && A.vision),
    visionVideo: !!(A && A.vision && A.vision.video),
    nav: !!(A && A.nav),
    config: !!(A && A.config),
    app: !!(A && A.app),
    diag: typeof (A && A.diag),
    hasProbes: !!(A && A.probes),
    hasScenes: !!(A && A.scenes),
  };

  // 5) vision 对象的方法列表
  if (A && A.vision) o.visionMethods = Object.keys(A.vision);

  // 6) 是否已有看门狗 (防重复安装)
  o.hasWatchdog = !!window.__na_bg_watchdog__;

  // 7) 检查 config 里 nav 段
  if (A && A.config && A.config.get) {
    try { o.navCfg = A.config.get('nav'); } catch(e) { o.navCfgErr = String(e); }
    try { o.visionCfg = A.config.get('vision'); } catch(e) { o.visionCfgErr = String(e); }
  }

  return JSON.stringify(o, null, 1);
})()`;

(async () => {
  const tabs = await getJSON('/json/list');
  const page = tabs.find(t => t.type === 'page' && t.url.includes('start.qq.com'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p) => new Promise(r => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', ev => {
    const j = JSON.parse(ev.data);
    if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const v = r?.result?.result?.value;
  console.log(v || JSON.stringify(r, null, 1));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
