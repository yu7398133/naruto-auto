// 真实执行 v0.6.62 新增的拦截分支：在活体弹窗上点一次【确定】，并确认弹窗消失。
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

  const before=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto; A.vision.capture(true);
    const d=A.nav.detectExitConfirm();
    const s=A.scenes.detect(false);
    return JSON.stringify({xcOk:d.ok, goldPct:d.goldPct, dist:d.dist, scene:s.scene});
  })()`,returnByValue:true});
  console.log('点击前: ' + before.result.result.value);

  // 真实点击【确定】(637,449) —— 走脚本自己的 op.tap
  const tap=await send('Runtime.evaluate',{expression:`(async()=>{
    const A=window.__narutoAuto;
    const op = (A.battle && A.battle.op) || A.op || null;
    if(!op) return 'NO_OP (battle.op=' + typeof (A.battle&&A.battle.op) + ')';
    try{ await op.tap(637,449,'delay.short'); return 'tapped'; }catch(e){ return 'ERR '+e.message; }
  })()`,returnByValue:true,awaitPromise:true});
  console.log('点击: ' + JSON.stringify(tap.result.result.value));

  await new Promise(r=>setTimeout(r,2500));

  const after=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto; A.vision.capture(true);
    const d=A.nav.detectExitConfirm();
    const s=A.scenes.detect(false);
    return JSON.stringify({xcOk:d.ok, goldPct:d.goldPct, dist:d.dist, scene:s.scene});
  })()`,returnByValue:true});
  console.log('点击后: ' + after.result.result.value);
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
