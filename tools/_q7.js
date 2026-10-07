(() => {
  const out = { url: location.href, title: document.title };
  out.text = (document.body.innerText || '').slice(0, 700);
  // 是否有错误/提示
  out.alerts = Array.from(document.querySelectorAll('.error, .warning, .notice, [class*="alert"]'))
    .map(e => (e.innerText || '').slice(0, 200)).slice(0, 5);
  // 按钮现状
  out.buttons = Array.from(document.querySelectorAll('input.button, button')).map(b => ({
    id: b.id, value: b.value || b.innerText, disabled: b.disabled,
    visible: !!(b.offsetParent), cls: (b.className || '').toString()
  }));
  // 是否有 iframe / shadow
  out.iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src || '(none)');
  return JSON.stringify(out, null, 1);
})()
