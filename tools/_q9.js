(() => {
  const rows = Array.from(document.querySelectorAll('tr'))
    .map(t => (t.innerText || '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 3);
  const hits = rows.filter(s => /火影|看门狗|watchdog/i.test(s));
  return JSON.stringify({
    totalRows: rows.length,
    hits: hits,
    count: hits.length,
  }, null, 1);
})()
