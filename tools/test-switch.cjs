// 正确流程：勾选 → 点 #na-save → 验证 config 变化
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = b.contexts()[0].pages().find(x => /start\.qq\.com\/game/.test(x.url()));
  const r = await p.evaluate(() => {
    const A = window.__narutoAuto;
    const out = { ver: A.runtime.version, before: A.config.get('secretRealm.ignoreZeroTicket') };

    try { A.panel._renderSettings(); } catch (e) {}
    const inp = document.querySelector('input[data-c="secretRealm.ignoreZeroTicket"]');
    out.found = !!inp;
    if (!inp) return out;

    out.checkedNow = inp.checked;
    // 勾上 → 点保存 → 读 config
    inp.checked = true;
    document.querySelector('#na-save').click();
    out.afterSaveOn = A.config.get('secretRealm.ignoreZeroTicket');
    // 保存后重新渲染，看 UI 是否回显勾选
    try { A.panel._renderSettings(); } catch (e) {}
    out.uiReflectsOn = document.querySelector('input[data-c="secretRealm.ignoreZeroTicket"]').checked;

    // 恢复：取消勾选 + 保存
    const inp2 = document.querySelector('input[data-c="secretRealm.ignoreZeroTicket"]');
    inp2.checked = false;
    document.querySelector('#na-save').click();
    out.afterRestore = A.config.get('secretRealm.ignoreZeroTicket');
    return out;
  }).catch(e => ({ fatal: e.message }));
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
