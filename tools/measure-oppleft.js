// 从当前 live-frame.png（1920x1080 源）里量出「确定」按钮的真实几何，
// 并换算到 1280x720 视觉空间。用于给「对手离开」弹窗做标定。
const fs=require('fs');
const path=require('path');
const {PNG}=(()=>{try{return require('pngjs');}catch(e){return {};}})();
const imgPath=path.join(__dirname,'live-frame.png');
if(!PNG){console.log('NO_PNGJS');process.exit(0);}
const png=PNG.sync.read(fs.readFileSync(imgPath));
const W=png.width,H=png.height;
console.log(`源图 ${W}x${H}, 视觉空间 1280x720, 系数 ${(1280/W).toFixed(4)}`);
const sc=1280/W;
// 扫描：找橙色确定按钮（高R、中G、低B）的连通区域包围盒
function isBtn(r,g,b){ return r>190 && g>110 && g<190 && b<90 && (r-b)>110; }
let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
// 限定搜索：弹窗下半部中心区域（源图坐标）
const X0=Math.round(560*W/1280), X1=Math.round(760*W/1280);
const Y0=Math.round(400*H/720), Y1=Math.round(560*H/720);
for(let y=Y0;y<Y1;y++){
  for(let x=X0;x<X1;x++){
    const i=(y*W+x)*4;
    if(isBtn(png.data[i],png.data[i+1],png.data[i+2])){
      n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
    }
  }
}
if(n===0){ console.log('未找到橙色按钮，放宽条件重试'); }
else{
  console.log(`橙色像素 ${n}`);
  console.log(`源图包围盒 x[${minX},${maxX}] y[${minY},${maxY}]  (${maxX-minX+1}x${maxY-minY+1})`);
  const bx1=Math.round(minX*sc),bx2=Math.round(maxX*sc),by1=Math.round(minY*sc),by2=Math.round(maxY*sc);
  console.log(`1280空间包围盒 x[${bx1},${bx2}] y[${by1},${by2}]  (${bx2-bx1+1}x${by2-by1+1})`);
  console.log(`1280空间中心点 (${Math.round((bx1+bx2)/2)}, ${Math.round((by1+by2)/2)})`);
  // 采样中心色
  const cx=Math.round((minX+maxX)/2), cy=Math.round((minY+maxY)/2);
  const ci=(cy*W+cx)*4;
  console.log(`按钮中心色 rgb(${png.data[ci]},${png.data[ci+1]},${png.data[ci+2]})`);
  // 取一块内部区域统计均值/方差，供探针 color/minStd 标定
  const ix1=Math.round(minX+(maxX-minX)*0.25), ix2=Math.round(minX+(maxX-minX)*0.75);
  const iy1=Math.round(minY+(maxY-minY)*0.3), iy2=Math.round(minY+(maxY-minY)*0.7);
  let sr=0,sg=0,sb=0,cnt=0;const vals=[];
  for(let y=iy1;y<=iy2;y++)for(let x=ix1;x<=ix2;x++){
    const i=(y*W+x)*4; sr+=png.data[i];sg+=png.data[i+1];sb+=png.data[i+2];cnt++;
    vals.push(png.data[i]);
  }
  const mr=sr/cnt,mg=sg/cnt,mb=sb/cnt;
  let vr=0;for(const v of vals)vr+=(v-mr)*(v-mr); const sdr=Math.sqrt(vr/vals.length);
  console.log(`内部区域均值 rgb(${mr.toFixed(0)},${mg.toFixed(0)},${mb.toFixed(0)}) R标准差 ${sdr.toFixed(1)}`);
  console.log(`→ 探针可写 color:{r:${mr.toFixed(0)},g:${mg.toFixed(0)},b:${mb.toFixed(0)}} tol:${Math.max(30,Math.round(sdr*2))} minStd:${Math.max(8,Math.round(sdr*0.6))}`);
  console.log(`→ 探针可写 area:[${bx1},${by1},${bx2},${by2}] click:[${Math.round((bx1+bx2)/2)},${Math.round((by1+by2)/2)}]`);
}
