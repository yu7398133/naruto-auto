// v0.6.63 代次闸门（epoch gate）确定性验证。
// 关键三问：
//   ① 僵尸任务被作废后，ctx.tap/home/replaySeq/drag 是否**抛 AbortError 停手**（而不是继续点画面）
//   ② 正常任务（代次有效）是否**畅通无阻**（不能误伤）
//   ③ 代次 0（非任务上下文）是否放行
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

  const r=await send('Runtime.evaluate',{expression:`(async()=>{
    const A=window.__narutoAuto, out={};
    const RT = A.runtime;                  // Runtime 对象
    const ctx = A.app && A.app.ctx;
    out.hasRuntime = !!RT;
    out.hasCtx = !!ctx;
    if(!RT || !ctx) return JSON.stringify(out);
    out.hasNewEpoch = typeof RT.newEpoch === 'function';
    out.hasAssert  = typeof RT.assertEpoch === 'function';

    // ── ① 僵尸：拿一个代次 → 作废 → 再操作画面，必须抛 AbortError ──
    const zEpoch = RT.newEpoch();
    ctx.epoch = zEpoch;
    RT.retireEpoch(zEpoch);
    const probe = async (name, fn) => {
      try { await fn(); return name + ': 未拦住 ❌（闸门失效）'; }
      catch(e){ return name + ': ' + (e.name==='AbortError' ? 'AbortError ✅' : '非Abort异常⚠ '+e.message); }
    };
    out.zombie = [];
    out.zombie.push(await probe('tap',      ()=>ctx.tap([1,1],null,'闸门测试')));
    out.zombie.push(await probe('home',     ()=>ctx.home()));
    out.zombie.push(await probe('replaySeq',()=>ctx.replaySeq([],{label:'闸门测试'})));
    out.zombie.push(await probe('drag',     ()=>ctx.drag(1,1,2,2,10,'闸门测试')));
    // 直接查闸门本身（不触发真实点击）
    try { ctx._epochGate('直测'); out.zombie.push('_epochGate: 未拦住 ❌'); }
    catch(e){ out.zombie.push('_epochGate: ' + (e.name==='AbortError'?'AbortError ✅':'⚠ '+e.message)); }

    // ── ③ 代次 0（非任务上下文）必须放行 ──
    ctx.epoch = 0;
    try { ctx._epochGate('零代次'); out.zeroEpoch = '放行 ✅'; }
    catch(e){ out.zeroEpoch = '被误拦 ❌ ' + e.message; }

    // ── ② 有效代次必须放行 ──
    const live = RT.newEpoch();
    ctx.epoch = live;
    try { ctx._epochGate('有效代次'); out.liveEpoch = '放行 ✅'; }
    catch(e){ out.liveEpoch = '被误拦 ❌ ' + e.message; }
    // 作废旧代次不应影响新代次
    RT.retireEpoch(live);
    const live2 = RT.newEpoch();
    ctx.epoch = live2;
    try { ctx._epochGate('新代次'); out.newAfterRetire = '放行 ✅'; }
    catch(e){ out.newAfterRetire = '被误拦 ❌ ' + e.message; }

    // 复位：交还给真实调度器状态
    ctx.epoch = 0;
    return JSON.stringify(out,null,1);
  })()`,returnByValue:true,awaitPromise:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
