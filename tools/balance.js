// 括号配平扫描，定位语法错误的真实位置（node --check 只报 token 位置，不报根因）
const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const BS = String.fromCharCode(92);
let i = 0, n = s.length, line = 1;
const st = [];
let inS = null, inC = null, inT = false;

while (i < n) {
  const c = s[i], c2 = s[i + 1];
  if (c === '\n') { line++; if (inC === '//') inC = null; }
  if (inC === '//') { i++; continue; }
  if (inC === '/*') { if (c === '*' && c2 === '/') { inC = null; i += 2; continue; } i++; continue; }
  if (inS) { if (c === BS) { i += 2; continue; } if (c === inS) inS = null; i++; continue; }
  if (inT) { if (c === BS) { i += 2; continue; } if (c === '`') inT = false; i++; continue; }
  if (c === '/' && c2 === '/') { inC = '//'; i += 2; continue; }
  if (c === '/' && c2 === '*') { inC = '/*'; i += 2; continue; }
  if (c === "'" || c === '"') { inS = c; i++; continue; }
  if (c === '`') { inT = true; i++; continue; }
  if (c === '{' || c === '(' || c === '[') st.push({ c, line });
  else if (c === '}' || c === ')' || c === ']') {
    const m = { ')': '(', ']': '[', '}': '{' }[c];
    const t = st.pop();
    if (!t || t.c !== m) {
      console.log(`MISMATCH at line ${line}: got '${c}' but expected close for '${t ? t.c : '(none)'}' (opened line ${t ? t.line : '?'})`);
      process.exit(0);
    }
  }
  i++;
}
console.log(`END ok-ish. unclosed=${st.length}  inS=${inS} inT=${inT} inC=${inC}`);
st.slice(-10).forEach(x => console.log(`  unclosed '${x.c}' opened at line ${x.line}`));
