// 确定性验证 v0.6.58 的「步骤失败 → 任务记失败」逻辑。
// 不依赖游戏画面：直接在页面里造一个必然失败的步骤，看 Runner 是否记 failed。
const http=require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list=JSON.parse(await get('/json/list'));
  const page=list.find(t=>t.type==='page'&&/start\.qq\.com/.test(t.url));
  if(!page){console.log('NO_GAME_PAGE');return;}
  const sock=new WebSocket(page.webSocketDebuggerUrl);
  let id=0;const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));

  // 1) 直接测 ctx 的计数器语义（不跑真实任务）
  const r=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto;
    if(!A) return 'NO_API';
    const out={};
    // 找到 runner 与 ctx
    const R=A.scheduler||A.runner;
    out.hasScheduler=!!A.scheduler;
    out.schedulerKeys=A.scheduler?Object.keys(A.scheduler).slice(0,40):null;
    out.hasCtx=!!(A.scheduler&&A.scheduler.ctx);
    return JSON.stringify(out);
  })()`,returnByValue:true});
  console.log('API 探测: '+r.result.result.value);
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
