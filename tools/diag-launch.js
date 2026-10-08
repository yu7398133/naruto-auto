// 逐层验证启动链
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');

const REPO = 'C:\\Users\\chenyu\\dsh\\火影忍者';
const VBS = REPO + '\\tools\\start-keepalive-agent.vbs';
const NODE = 'C:\\Program Files\\nodejs\\node.exe';

console.log('== A. 文件是否都在 ==');
for (const p of [VBS, REPO + '\\tools\\keepalive-agent.js', NODE]) {
  console.log(`  ${fs.existsSync(p) ? '✓' : '✗'} ${p}`);
}

console.log('\n== B. 仓库 VBS 能否通过 cscript 解析（只看语法）==');
try {
  const out = execFileSync('cscript.exe', ['//nologo', VBS], { encoding: 'utf8', timeout: 8000 });
  console.log('  输出:', JSON.stringify(out.slice(0, 200)));
} catch (e) {
  console.log('  退出码:', e.status);
  console.log('  stderr:', JSON.stringify((e.stderr || '').slice(0, 300)));
  console.log('  stdout:', JSON.stringify((e.stdout || '').slice(0, 300)));
}

console.log('\n== C. VBS 实际拉起的命令是什么（把 Run 的命令打印出来，不执行）==');
const probe = REPO + '\\tools\\_vbs_probe.vbs';
const src = fs.readFileSync(VBS, 'utf8')
  .replace(/shell\.Run [^\n]*/, 'WScript.Echo cmd');
fs.writeFileSync(probe, src, 'utf8');
try {
  const out = execFileSync('cscript.exe', ['//nologo', probe], { encoding: 'utf8', timeout: 8000 });
  console.log('  将执行的命令:\n   ', out.trim());
} catch (e) {
  console.log('  失败 exit=', e.status, JSON.stringify((e.stdout || '').slice(0, 400)));
}
fs.unlinkSync(probe);

console.log('\n== D. 日志目录是否可写 ==');
const logDir = REPO + '\\logs';
console.log('  logs 存在:', fs.existsSync(logDir));
try {
  fs.writeFileSync(logDir + '\\_wtest.txt', 'ok'); fs.unlinkSync(logDir + '\\_wtest.txt');
  console.log('  ✓ 可写');
} catch (e) { console.log('  ✗ 不可写:', e.message); }
