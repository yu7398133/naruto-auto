(() => {
  const txt = document.body.innerText || '';
  const m = txt.match(/火影忍者云游戏自动化\s+([\d.]+)/);
  const rows = Array.from(document.querySelectorAll('tr')).filter(t => /火影忍者云游戏自动化/.test(t.innerText || ''));
  return JSON.stringify({
    installedVersion: m ? m[1] : null,
    rowCount: rows.length,
    rowText: rows[0] ? (rows[0].innerText || '').replace(/\s+/g, ' ').slice(0, 160) : null,
  }, null, 1);
})()
