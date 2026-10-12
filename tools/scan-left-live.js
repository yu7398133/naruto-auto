// 抓「当前」活帧并立即在同一帧上扫描左列，找出 friendsIcon/mailNav 的真实 y 范围。
// 关键：采样与判定必须同一帧，避免用旧 PNG 得出错误结论。
const http=require('http');
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const list=JSON.parse(await get('/json/list'));
  const page=list.find(t=>t.type==='page'&&/start\.qq\.com/.test(t.url));
  const sock=new WebSocket(page.webSocketDebuggerUrl);
  let id=0;const pend=new Map();
  sock.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  await new Promise(r=>sock.addEventListener('open',r));

  // 保证页面在前台且帧新鲜
  const r=await send('Runtime.evaluate',{expression:`(()=>{
    const A=window.__narutoAuto; if(!A||!A.vision) return 'NO_API';
    A.vision.capture(true);
    const g=A.vision.canvas.getContext('2d');
    const P=A.probes;
    const rowAvg=(y,x0,x1)=>{const d=g.getImageData(x0,y,x1-x0,1).data;let r=0,gg=0,b=0,n=0;
      for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}return[Math.round(r/n),Math.round(gg/n),Math.round(b/n)];};
    const gf=P.friendsIcon.color, gm=P.mailNav.color;
    const df=c=>Math.abs(c[0]-gf.r)+Math.abs(c[1]-gf.g)+Math.abs(c[2]-gf.b);
    const dm=c=>Math.abs(c[0]-gm.r)+Math.abs(c[1]-gm.g)+Math.abs(c[2]-gm.b);
    const rows=[];
    for(let y=140;y<=420;y+=2){const c=rowAvg(y,58,74);rows.push({y,c,df:df(c),dm:dm(c)});}
    return JSON.stringify({scene:A.scenes.detect(false).scene, rows,
      curFriends:P.friendsIcon.area, curMail:P.mailNav.area});
  })()`,returnByValue:true});
  const v=r.result.result.value;
  let o; try{o=JSON.parse(v);}catch(e){console.log('RAW '+v);sock.close();return;}
  console.log('当前场景: '+o.scene);
  console.log('现有 friendsIcon 区 '+JSON.stringify(o.curFriends)+'   mailNav 区 '+JSON.stringify(o.curMail));
  console.log('');
  const near=o.rows.filter(r=>r.df<=40||r.dm<=40);
  console.log('命中行（dF<=40 或 dM<=40）:');
  near.forEach(r=>console.log(`  y=${String(r.y).padStart(3)} (${r.c.join(',')})  dF=${String(r.df).padStart(3)} dM=${String(r.dm).padStart(3)} ${r.df<=40?'<=friends':''}${r.dm<=40?' <=mail':''}`));
  if(!near.length) console.log('  （无）');
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
