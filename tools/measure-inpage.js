// 在浏览器内直接量「确定」按钮几何（复用页面已有的 video + canvas，无需 pngjs）。
// 输出 1280 空间的 area/click/color/minStd，用于标定「对手离开」弹窗探针。
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
    const A=window.__narutoAuto, V=A.vision;
    V.capture(true);                        // 强制新帧到 1280x720 canvas
    const ctx=V.ctx, W=1280, H=720;
    const img=ctx.getImageData(0,0,W,H).data;
    const at=(x,y)=>{const i=(y*W+x)*4;return [img[i],img[i+1],img[i+2]];};
    // 橙色按钮判据（从截图目视：亮橙 ~ rgb(230,150,45)）
    const isBtn=(r,g,b)=> r>185 && g>100 && g<195 && b<95 && (r-b)>105;
    // 搜索弹窗下半部中心区
    let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
    for(let y=380;y<560;y++)for(let x=520;x<780;x++){
      const [r,g,b]=at(x,y);
      if(isBtn(r,g,b)){n++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
    }
    const out={orangePixels:n};
    if(n>0){
      out.area=[minX,minY,maxX,maxY];
      out.size=[maxX-minX+1,maxY-minY+1];
      out.click=[Math.round((minX+maxX)/2),Math.round((minY+maxY)/2)];
      // 内部统计（避开描边）
      const ix1=Math.round(minX+(maxX-minX)*0.3), ix2=Math.round(minX+(maxX-minX)*0.7);
      const iy1=Math.round(minY+(maxY-minY)*0.3), iy2=Math.round(minY+(maxY-minY)*0.7);
      let sr=0,sg=0,sb=0,c=0;const rs=[];
      for(let y=iy1;y<=iy2;y++)for(let x=ix1;x<=ix2;x++){const [r,g,b]=at(x,y);sr+=r;sg+=g;sb+=b;c++;rs.push(r);}
      const mr=sr/c,mg=sg/c,mb=sb/c;
      let v=0;for(const x of rs)v+=(x-mr)*(x-mr);const sd=Math.sqrt(v/rs.length);
      out.mean=[+mr.toFixed(0),+mg.toFixed(0),+mb.toFixed(0)];
      out.redStd=+sd.toFixed(1);
      out.suggest={color:{r:+mr.toFixed(0),g:+mg.toFixed(0),b:+mb.toFixed(0)},
                   tol:Math.max(30,Math.round(sd*2)), minStd:Math.max(8,Math.round(sd*0.6))};
    }
    // 同时报告现有 settleConfirm 区域(560,580,720,630)里的实际颜色，证明它为何未命中
    const sc=[];
    for(const [x,y] of [[600,600],[640,605],[680,600],[640,590]]) sc.push({xy:[x,y],rgb:at(x,y)});
    out.settleConfirmAreaSamples=sc;
    return JSON.stringify(out,null,1);
  })()`,returnByValue:true});
  console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r));
  sock.close();
})().catch(e=>console.log('ERR '+e.message));
