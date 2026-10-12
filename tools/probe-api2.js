// 确定性验证：造一个必然失败的步骤，确认 Runner 把任务记为「未完成」而不是「完成」。
// 选取一个安全的任务(邮件领取)，用 stepResult(false) 注入一次失败，观察 history 结果。
const http=require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list=JSON.parse(await get('/json/list'));
  const page=list.find(t=>t.type==='page'&&/start\.qq\.com\/game/.test(t.url));
  if(!page){console.log('NO_GAME_PAGE');return;}
  const sock=new WebSocket(page.webSocketDebuggerUrl);
  let id=0;const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));

  const r=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto;
    if(!A) return JSON.stringify({err:'NO_API'});
    const S=A.scheduler;
    if(!S) return JSON.stringify({err:'NO_SCHEDULER', keys:Object.keys(A)});
    return JSON.stringify({
      schedKeys: Object.keys(S),
      hasCtx: !!S.ctx,
      ctxKeys: S.ctx ? Object.keys(S.ctx).slice(0,50) : null,
      stepFailsNow: S.ctx ? S.ctx.stepFails : null,
      hasResetStepFails: S.ctx ? (typeof S.ctx.resetStepFails) : 'n/a'
    });
  })()`,returnByValue:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
