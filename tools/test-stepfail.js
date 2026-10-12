// 决定性测试：注入一个必然失败的步骤，确认任务被记为 failed 而非 success。
// 做法：直接在页面里跑 ctx.step/stepResult(false) 序列，然后读回调度器的 history 判定路径。
// 更稳妥：单元级验证 —— 复用脚本自身的判定表达式，确认 sf>0 时走 failed 分支。
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
    const A=window.__narutoAuto, S=A.scheduler, ctx=S.ctx;
    const log=[];
    // —— 场景 1：任务里某步失败（模拟「定位不到 → stepResult(false) → return」）——
    ctx.resetStepFails();
    ctx._flowIdx=0;
    ctx.stepResult(true);
    ctx._flowIdx=1;
    ctx.stepResult(false);            // ← 关键：一步没达成
    const sf1 = ctx.stepFails;
    log.push({case:'任务内有1步失败', stepFails:sf1, 判定: sf1>0?'failed(未完成)':'success'});

    // —— 场景 2：home() 导航降级（不该算任务失败）——
    ctx.resetStepFails();
    ctx._flowIdx=0;
    ctx._advance(null);               // home() 内部会 _advance
    ctx.clearStepFail();              // home() 内部会 clearStepFail
    const sf2 = ctx.stepFails;
    log.push({case:'home()导航降级', stepFails:sf2, 判定: sf2>0?'failed(未完成)':'success'});

    // —— 场景 3：全部步骤成功 ——
    ctx.resetStepFails();
    for(let i=0;i<5;i++){ ctx._flowIdx=i; ctx.stepResult(true); }
    const sf3 = ctx.stepFails;
    log.push({case:'5步全成功', stepFails:sf3, 判定: sf3>0?'failed(未完成)':'success'});

    // —— 场景 4：先失败后同一位置被清除（stepResult(true) 覆盖）——
    ctx.resetStepFails();
    ctx._flowIdx=0; ctx.stepResult(false);
    const a=ctx.stepFails;
    ctx.stepResult(true);
    const b=ctx.stepFails;
    log.push({case:'失败后被true覆盖', 失败时:a, 覆盖后:b, 判定: b>0?'failed':'success'});

    ctx.resetStepFails();
    ctx._flowIdx=null;
    return JSON.stringify(log,null,1);
  })()`,returnByValue:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
