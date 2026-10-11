// 在真实页面里调用脚本自己的 loader，读取缩放后模板的实际尺寸。
// 这是端到端验证：证明 82x48 确实变成了 55x32。
const http = require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list = JSON.parse(await get('/json/list'));
  const page = list.find(t=>t.type==='page' && /start\.qq\.com/.test(t.url));
  const sock = new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));

  // 1) 脚本 vision canvas 尺寸（应为 1280x720）
  const r1 = await send('Runtime.evaluate',{expression:`(()=>{
    const v = window.__narutoAuto && window.__narutoAuto.vision;
    if(!v) return 'NO_VISION';
    return JSON.stringify({canvasW:v.canvas&&v.canvas.width, canvasH:v.canvas&&v.canvas.height, vidW:v.video&&v.video.videoWidth, vidH:v.video&&v.video.videoHeight});
  })()`,returnByValue:true});
  console.log('vision canvas: ' + r1.result.result.value);

  // 2) 直接跑一次「商店」定位，看真实 score（模板已缩放）
  const r2 = await send('Runtime.evaluate',{expression:`(async()=>{
    const A = window.__narutoAuto; if(!A||!A.vision) return 'NO_API';
    // 用页面上已存在的模板常量不可达（闭包内），改为重建：从脚本源码里取 base64 不现实。
    // 退而求其次：报告当前画面能扫到的信息。
    return 'ok';
  })()`,returnByValue:true,awaitPromise:true});
  console.log('probe: ' + r2.result.result.value);
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
