// 极简静态服务：把 naruto-auto.user.js 挂在 127.0.0.1:8899
// 用途：脚本头部 @updateURL/@downloadURL 指向它，Tampermonkey 可直接从本地拉最新版。
// 用法：node tools/serve8899.cjs   （后台跑）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8899;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(ROOT, decodeURIComponent(url.replace(/^\//, '')) || 'naruto-auto.user.js');
  // 只允许在工作区内取文件，防目录穿越
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + url); return; }
    const ver = (data.toString('utf8', 0, 4000).match(/@version\s+([\d.]+)/) || [])[1] || '?';
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });
    res.end(data);
    console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${url} → 200 (${data.length}B, v${ver})`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}/  (Ctrl+C to stop)`);
});
