const fs=require('fs');
const s=fs.readFileSync('naruto-auto.user.js','utf8').split('\n');
for(let i=10004;i<10100;i++){
  const t=(s[i]||'').trim();
  if(!t||t.startsWith('//')||t.startsWith('*')||t.startsWith('/*')) continue;
  console.log('L'+(i+1)+' | '+t.slice(0,120));
}
