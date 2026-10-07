(() => {
  const out = {};
  const trs = Array.from(document.querySelectorAll('tr.tr_script, tr[id^="tr_"]'));
  const rows = trs.filter(t => /火影忍者云游戏自动化/.test(t.innerText || ''));
  out.matched = rows.length;
  if (rows[0]) {
    const tr = rows[0];
    out.rowId = tr.id;
    // 解码 row id
    const m = tr.id.match(/^tr_(.+)$/);
    if (m) {
      try { out.decodedRowId = atob(m[1]); } catch (e) { out.decodeErr = String(e); }
    }
    // 该行内所有带 id 的元素
    out.childIds = Array.from(tr.querySelectorAll('[id]')).map(e => e.id).slice(0, 40);
    // 编辑链接
    out.links = Array.from(tr.querySelectorAll('a')).map(a => ({
      href: a.getAttribute('href'), cls: a.className, text: (a.innerText || '').trim().slice(0, 30)
    })).slice(0, 20);
  }
  out.totalRows = trs.length;
  return JSON.stringify(out, null, 1);
})()
