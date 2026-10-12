// 在真实页面上跑 scenes.detect(true)，拿到每个探针的实际 dist/ok，
// 判断 home 判定失败到底卡在 friendsIcon 还是 mailNav。
const http = require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t=>t.type==='page' && /start\.qq\.com/.test(t.url));
  if(!page){ console.log('NO_GAME_PAGE'); return; }
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));

  const r = await send('Runtime.evaluate',{expression:`(()=>{
    const A = window.__narutoAuto;
    if(!A || !A.scenes) return 'NO_API';
    const out = { scene:null, err:null, probes:{} };
    try {
      const s = A.scenes.detect(false);
      out.scene = s.scene; out.error = s.error; out.brightness = s.brightness;
      for (const [k,v] of Object.entries(s.hits||{})) {
        out.probes[k] = { ok:!!v.ok, dist:Math.round(v.dist*10)/10, tol:v.tol };
      }
    } catch(e){ out.err = e.message; }
    return JSON.stringify(out);
  })()`,returnByValue:true});
  const v = r.result.result.value;
  try{
    const o = JSON.parse(v);
    console.log('scene = ' + o.scene + '   error=' + o.error + '   brightness=' + o.brightness);
    console.log('');
    console.log('探针命中情况（HOME 需要 friendsIcon + mailNav 同时 ok）:');
    for (const [k,p] of Object.entries(o.probes||{})) {
      const mark = p.ok ? '✅' : '❌';
      console.log(`  ${mark} ${k.padEnd(16)} dist=${String(p.dist).padStart(6)}  tol=${p.tol}`);
    }
  }catch(e){ console.log('RAW: ' + v); }
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
