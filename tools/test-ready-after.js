// 弹窗消除后，确认画面已回「忍术对战准备界面」——用两个探针交叉验证：
//   ① TaskContext.waitArenaReady（感叹号模板 + 红X红色占比）
//   ② BattleFlow.sawArenaReady（v0.6.61 新增的同判据复刻版）
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
  const r=await send('Runtime.evaluate',{expression:`(async()=>{
    const A=window.__narutoAuto, out={};
    A.vision.capture(true);
    // ① TaskContext 版（经 ctx）
    try{
      const ctx=A.app && A.app.ctx;
      out.hasCtx = !!ctx;
      if(ctx){ const rr=await ctx.waitArenaReady(3000); out.ctxWaitArenaReady={ok:rr.ok,ms:rr.ms,why:rr.why}; }
    }catch(e){ out.ctxErr=e.message; }
    // ② BattleFlow 版（v0.6.61 新增）
    try{ const bf=A.battle; out.bfHasMethod = bf? typeof bf.sawArenaReady : 'NO_BF';
         if(bf && typeof bf.sawArenaReady==='function'){ const rr=await bf.sawArenaReady(3000); out.bfSawArenaReady={ok:rr.ok,ms:rr.ms,why:rr.why}; }
    }catch(e){ out.bfErr=e.message; }
    return JSON.stringify(out,null,1);
  })()`,returnByValue:true,awaitPromise:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
