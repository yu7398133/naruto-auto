// 在当前真实「对手离开」弹窗上，直接跑 detectExitConfirm()，看它为何没命中。
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
    const A=window.__narutoAuto, nav=A.nav;
    A.vision.capture(true);
    const out={};
    // 1) 直接调用导航层的退出确认检测
    try{ out.detectExitConfirm = nav.detectExitConfirm(); }catch(e){ out.detectExitConfirm={err:e.message}; }
    // 2) 手工复算 goldPct / dist，定位是哪一项不达标
    const R=[542,421,731,477], ref={r:214,g:183,b:111};
    const d=A.vision.ctx.getImageData(R[0],R[1],R[2]-R[0],R[3]-R[1]).data;
    let sr=0,sg=0,sb=0,n=0,gold=0;
    for(let i=0;i<d.length;i+=4){const Rr=d[i],G=d[i+1],B=d[i+2];sr+=Rr;sg+=G;sb+=B;n++;if(Rr>150&&G>120&&B<110)gold++;}
    const mean=[Math.round(sr/n),Math.round(sg/n),Math.round(sb/n)];
    const gp=gold/n;
    const dist=Math.sqrt((mean[0]-ref.r)**2+(mean[1]-ref.g)**2+(mean[2]-ref.b)**2);
    out.manual={mean, goldPct:+gp.toFixed(3), dist:Math.round(dist),
      need:{goldMin:0.5, distMax:120}};
    out.manual.goldOk = gp>=0.5;
    out.manual.distOk = dist<=120;
    // 3) 遮罩检测
    try{ out.darkMask = nav.sawDarkMask(); }catch(e){ out.darkMask={err:e.message}; }
    // 4) 当前场景
    try{ const s=A.scenes.detect(false); out.scene=s.scene; out.sceneErr=s.error; }catch(e){ out.scene={err:e.message}; }
    return JSON.stringify(out,null,1);
  })()`,returnByValue:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
