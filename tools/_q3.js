(async () => {
  const out = {};
  try {
    // TM 的 options 页面暴露 chrome.runtime，但需要正确的消息结构
    const r = await chrome.runtime.sendMessage({ cmd: 'GetScriptList' });
    out.a = JSON.stringify(r).slice(0, 400);
  } catch (e) { out.aErr = String(e); }

  try {
    const r2 = await chrome.runtime.sendMessage({ method: 'getScripts' });
    out.b = JSON.stringify(r2).slice(0, 400);
  } catch (e) { out.bErr = String(e); }

  // 检查页面内的 DOM 是否含 script id
  const links = Array.from(document.querySelectorAll('a[href*="id="]')).map(a => a.getAttribute('href')).slice(0, 30);
  out.links = links;

  // TM 的每行可能有 data-id
  const rows = Array.from(document.querySelectorAll('tr')).filter(t => /火影/.test(t.innerText || ''));
  if (rows[0]) {
    out.rowAttrs = {};
    for (const a of rows[0].attributes) out.rowAttrs[a.name] = a.value;
    out.rowHTML = rows[0].innerHTML.slice(0, 1200);
  }
  return JSON.stringify(out, null, 1);
})()
