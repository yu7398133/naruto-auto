(async () => {
  // 强制重新加载整个 options 页面，绕开缓存
  location.href = location.href.split('#')[0] + '#nav=dashboard';
  location.reload();
  await new Promise(r => setTimeout(r, 4000));
  return 'reloaded';
})()
