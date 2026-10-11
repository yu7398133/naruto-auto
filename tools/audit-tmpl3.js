// 列出其它模板常量的尺寸（它们不是内联 base64，而是别的形式）。先看它们的定义形态。
const fs = require('fs');
const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js', 'utf8');
const lines = src.split('\n');

const names = ['ARENA_ROUND_DI_TMPL', 'ARENA_READY_ICON_TMPL', 'ARENA_END_ICON_TMPL', 'SECRET_REALM_SETTLE_BACK_TMPL', 'SIGN_MENU_TMPL_SRC', 'RECRUIT_TAB_TMPL_SRC'];
for (const n of names) {
  console.log('=== ' + n + ' ===');
  let shown = 0;
  lines.forEach((l, i) => {
    if (l.includes(n) && shown < 4) {
      // 只打印定义行，且截断 base64
      let t = l.trim();
      t = t.replace(/(base64,)[A-Za-z0-9+/=]{40,}/, '$1<...B64...>');
      if (t.length > 160) t = t.slice(0, 160) + ' ...';
      console.log('  L' + (i + 1) + ': ' + t);
      shown++;
    }
  });
  if (!shown) console.log('  (未找到)');
  console.log('');
}
