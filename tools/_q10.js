(async () => {
  location.hash = '#nav=dashboard';
  await new Promise(r => setTimeout(r, 3000));
  const rows = Array.from(document.querySelectorAll('tr'))
    .map(t => (t.innerText || '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 3);
  const hits = rows.filter(s => /火影|看门狗|watchdog/i.test(s));
  return JSON.stringify({
    url: location.href,
    totalRows: rows.length,
    hits: hits,
    lastFive: rows.slice(-5),
  }, null, 1);
})()
