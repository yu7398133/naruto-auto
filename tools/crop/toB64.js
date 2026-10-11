// 把三张模板转成 base64 字符串（单行，供嵌入 userscript）
const fs = require('fs');
for (const [f, name] of [['F_shop.png', '商店'], ['segB.png', '特权商店'], ['T2_jifen.png', '特权积分']]) {
  const b = fs.readFileSync(__dirname + '/' + f);
  console.log('=== ' + name + ' (' + f + ', ' + b.length + ' bytes) ===');
  console.log(b.toString('base64'));
  console.log('');
}
