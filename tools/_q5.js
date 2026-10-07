(() => {
  const out = { url: location.href, title: document.title };
  out.bodyText = document.body.innerText.slice(0, 1200);
  // 找按钮
  const btns = Array.from(document.querySelectorAll('button, input[type=button], input[type=submit], a.button'));
  out.buttons = btns.map(b => ({
    tag: b.tagName, id: b.id, cls: (b.className || '').toString().slice(0, 50),
    text: (b.innerText || b.value || '').trim().slice(0, 40)
  })).slice(0, 20);
  // 版本信息
  const m = document.body.innerText.match(/版本[^\n]*/g);
  out.versionLines = m ? m.slice(0, 5) : [];
  return JSON.stringify(out, null, 1);
})()
