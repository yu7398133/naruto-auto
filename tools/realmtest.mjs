import { listPages, connect, evaluate } from './cdp.mjs';
const pages = await listPages();
const game = pages.find(p => p.type === 'page' && p.title.includes('火影忍者'));
const conn = await connect(game.webSocketDebuggerUrl);
await conn.send('Runtime.enable');

// ① 模板加载情况
const t = await evaluate(conn, `(() => {
  const t = window.__narutoAuto.__realmNameTemplates || null;
  return { has: !!t, keys: t ? Object.keys(t) : null };
})()`);
console.log('模板缓存:', JSON.stringify(t));

// ② 直接调 identifyRealmName（异步、需要 awaitPromise）
try {
  const r = await evaluate(conn, `window.__narutoAuto.tasks ? 'has tasks' : 'no tasks'`);
  console.log('tasks:', r);
} catch (e) { console.log('tasks err:', e.message); }

// ③ 看 SECRET_REALM_NAME_REGION 与 findTemplate 是否可访问
const info = await evaluate(conn, `(() => {
  const a = window.__narutoAuto;
  const out = {};
  out.visionKeys = Object.keys(a.vision || {});
  out.hasFindTemplate = !!(a.vision && a.vision.findTemplate);
  // 找 ctx 实例
  out.appKeys = Object.keys(a.app || {});
  return out;
})()`);
console.log(JSON.stringify(info, null, 2));

conn.close();
