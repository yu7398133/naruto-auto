// 直接采样 friendsIcon / mailNav 两个区域的实际像素，并对比期望色。
// 同时报告页面上是否有脚本自身 UI 覆盖该区域。
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

  const r = await send('Runtime.evaluate',{expression:`(()=>{
    const A = window.__narutoAuto; if(!A||!A.vision) return 'NO_API';
    A.vision.capture(true);
    const c = A.vision.canvas, g = c.getContext('2d');
    // 读区域平均色
    const avg = (x0,y0,x1,y1)=>{ const d=g.getImageData(x0,y0,x1-x0,y1-y0).data;
      let r=0,gg=0,b=0,n=0; for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}
      return {r:Math.round(r/n),g:Math.round(gg/n),b:Math.round(b/n)}; };
    const P = A.probes || {};
    const fi = P.friendsIcon, mn = P.mailNav;
    return JSON.stringify({
      canvas: c.width+'x'+c.height,
      friends: fi ? { area: fi.area, expect: fi.color, actual: avg.apply(null, fi.area) } : null,
      mail:    mn ? { area: mn.area, expect: mn.color, actual: avg.apply(null, mn.area) } : null,
      // 脚本自己的 UI 在页面上的位置
      fab: (()=>{ const e=document.getElementById('na-fab'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),vis:getComputedStyle(e).display}; })(),
      flow: (()=>{ const e=document.getElementById('na-flow-panel'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; })()
    });
  })()`,returnByValue:true});
  const v = r.result.result.value;
  try { const o = JSON.parse(v);
    console.log('canvas: ' + o.canvas);
    console.log('');
    if(o.friends){ console.log('friendsIcon area=' + JSON.stringify(o.friends.area));
      console.log('   期望 (' + o.friends.expect.r + ',' + o.friends.expect.g + ',' + o.friends.expect.b + ')');
      console.log('   实际 (' + o.friends.actual.r + ',' + o.friends.actual.g + ',' + o.friends.actual.b + ')'); }
    if(o.mail){ console.log('mailNav area=' + JSON.stringify(o.mail.area));
      console.log('   期望 (' + o.mail.expect.r + ',' + o.mail.expect.g + ',' + o.mail.expect.b + ')');
      console.log('   实际 (' + o.mail.actual.r + ',' + o.mail.actual.g + ',' + o.mail.actual.b + ')'); }
    console.log('');
    console.log('脚本自身 UI: fab=' + JSON.stringify(o.fab) + '  flow=' + JSON.stringify(o.flow));
  } catch(e){ console.log('RAW: ' + v); }
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
