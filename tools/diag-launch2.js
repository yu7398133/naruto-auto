// 直接从 VBS 里取出它将执行的 cmd，并原样跑一遍
const { execFileSync, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'C:\\Users\\chenyu\\dsh\\火影忍者';
const VBS = REPO + '\\tools\\start-keepalive-agent.vbs';

// 1. 让 VBS 把 cmd 打印出来而不是执行
const probe = REPO + '\\tools\\_vbs_probe.vbs';
let src = fs.readFileSync(VBS, 'utf16le').replace(/^\uFEFF/, '');
src = src.replace(/shell\.Run ([^\r\n]*)/, 'WScript.Echo $1');
fs.writeFileSync(probe, '\uFEFF' + src, 'utf16le');

let cmd = '';
try {
  cmd = execFileSync('cscript.exe', ['//nologo', probe], { encoding: 'utf8', timeout: 8000 }).trim();
  console.log('VBS 将执行的命令:\n  ' + cmd);
} catch (e) {
  console.log('探测失败 exit=' + e.status, JSON.stringify((e.stdout || '').slice(0, 300)));
}
fs.unlinkSync(probe);

if (!cmd) process.exit(1);

// 2. 原样执行它（cmd /c ...），看报什么错
console.log('\n== 原样执行该命令（同步，3 秒超时）==');
try {
  execSync(cmd, { timeout: 3000, encoding: 'utf8', stdio: 'pipe' });
  console.log('  命令正常结束');
} catch (e) {
  console.log('  exit=' + e.status + ' signal=' + e.signal);
  console.log('  stdout:', JSON.stringify(String(e.stdout || '').slice(0, 400)));
  console.log('  stderr:', JSON.stringify(String(e.stderr || '').slice(0, 400)));
}

// 3. 简化：不走 cmd，直接 spawn node，确认 node 本身能起
console.log('\n== 直接 spawn node（不经 cmd）3 秒 ==');
const child = spawn('C:\\Program Files\\nodejs\\node.exe',
  [REPO + '\\tools\\keepalive-agent.js'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
let so = '', se = '';
child.stdout.on('data', d => so += d);
child.stderr.on('data', d => se += d);
setTimeout(() => {
  console.log('  stdout:', JSON.stringify(so.slice(0, 300)));
  console.log('  stderr:', JSON.stringify(se.slice(0, 300)));
  child.kill();
  process.exit(0);
}, 3000);
