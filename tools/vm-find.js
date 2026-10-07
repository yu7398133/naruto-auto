// 通过 CDP 驱动 Violentmonkey 更新脚本：
// 1) 找到/打开 Violentmonkey 的某个页面
// 2) 直接导航到本地 updateURL（Violentmonkey 会拦截并弹安装/更新确认）
const http = require('http');

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const VM_ID = 'gcalenpjmijncebpfijmoaglllgpjagf';

(async () => {
  const tabs = await getJSON('/json/list');
  console.log('=== 当前所有标签 ===');
  tabs.filter(t => t.type === 'page' || t.type === 'background_page' || t.type === 'service_worker')
      .forEach(t => console.log(`[${t.type}] ${t.title}\n    ${t.url.slice(0,140)}`));

  // 找 Violentmonkey 的页面
  const vmTab = tabs.find(t => t.url.includes(VM_ID));
  if (vmTab) {
    console.log('\n=== 找到 Violentmonkey 页面 ===');
    console.log(`title: ${vmTab.title}`);
    console.log(`url  : ${vmTab.url}`);
    console.log(`id   : ${vmTab.id}`);
  } else {
    console.log('\n未找到 Violentmonkey 页面（扩展页面通常不暴露在 /json/list）');
  }
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
