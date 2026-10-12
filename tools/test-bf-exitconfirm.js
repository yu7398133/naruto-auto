// 端到端验证：确认 BattleFlow 能通过 this.nav.detectExitConfirm() 命中当前弹窗，
// 并检查常量在 BattleFlow 作用域内可见（模块级 const，应可见）。
const http=require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list=JSON.parse(await get('/json/list'));
  const page=list.find(t=>t.type==='page'&&/start\.qq\.com\/game/.test(t.url));
  const sock=new WebSocket(page.webSocketDebuggerUrl);
  let id=0;const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));
  const r=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto;
    const out={};
    const bf=A.battle;
    out.hasBattle=!!bf;
    out.battleNavType = bf ? typeof bf.nav : 'n/a';
    out.battleNavHasDetect = bf && bf.nav ? (typeof bf.nav.detectExitConfirm) : 'NO';
    // 复刻我在 waitForEnd 里写的那一段，看是否真的命中
    try{
      A.vision.capture(true);
      const xc = bf.nav.detectExitConfirm();
      out.xc = xc;
      out.wouldFire = !!(xc && xc.ok);
    }catch(e){ out.xcErr = e.message; }
    return JSON.stringify(out,null,1);
  })()`,returnByValue:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
