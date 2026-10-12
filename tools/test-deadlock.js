// 验证 v0.6.60 死锁保险：注入「第X回不可达」并模拟准备界面探针命中，
// 确认连点器被立刻松开（而不是干等 45s）。
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
    const bf = A.battle;            // BattleFlow 实例
    const out={};
    out.hasBattle = !!bf;
    if(!bf) return JSON.stringify(out);
    // 1) 确认新状态字段存在
    out.fields = {
      _rbStallMs: bf._rbStallMs,
      _rbReadyTries: bf._rbReadyTries,
      _rbReadyAt: bf._rbReadyAt,
      _rbStallSince: bf._rbStallSince
    };
    // 2) 确认 nav.waitArenaReady 可达（快速通道依赖它）
    out.navType = typeof bf.nav;
    out.waitArenaReadyType = bf.nav ? typeof bf.nav.waitArenaReady : 'NO_NAV';
    // 3) 真实跑一次探针，看返回结构与耗时（决定 900ms 预算够不够）
    const t0=Date.now();
    return (async()=>{
      let res=null;
      try{ res = await bf.nav.waitArenaReady(900); }catch(e){ res={err:e.message}; }
      out.probe = res;
      out.probeMs = Date.now()-t0;
      return JSON.stringify(out,null,1);
    })();
  })()`,returnByValue:true,awaitPromise:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
