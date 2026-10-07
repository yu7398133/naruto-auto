(() => {
  return new Promise((resolve) => {
    // 强制刷新列表数据：TM 有内部的 refresh 入口，这里用整页 reload 最稳
    location.reload();
    resolve('reloading');
  });
})()
