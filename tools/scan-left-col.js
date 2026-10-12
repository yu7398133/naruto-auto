// 用真实画面定位「好友」「邮件」图标的真实坐标：
// 沿 x=40..100 的竖条扫描，找出与期望色相近的行段。
const fs=require('fs'),zlib=require('zlib'),path=require('path');
function readPNG(p){const b=fs.readFileSync(p);let off=8,w=0,h=0,ct=0;const idat=[];
 while(off<b.length){const len=b.readUInt32BE(off),type=b.toString('ascii',off+4,off+8);const data=b.slice(off+8,off+8+len);
  if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);ct=data[9];}else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;off+=12+len;}
 const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:4,stride=w*ch;
 const out=Buffer.alloc(w*h*ch);let prev=Buffer.alloc(stride),pos=0;
 for(let y=0;y<h;y++){const ft=raw[pos++];const line=Buffer.from(raw.slice(pos,pos+stride));pos+=stride;
  for(let i=0;i<stride;i++){const a=i>=ch?line[i-ch]:0,bb=prev[i],c=i>=ch?prev[i-ch]:0;let v=line[i];
   if(ft===1)v+=a;else if(ft===2)v+=bb;else if(ft===3)v+=(a+bb)>>1;
   else if(ft===4){const pp=a+bb-c,pa=Math.abs(pp-a),pb=Math.abs(pp-bb),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);}line[i]=v&255;}
  line.copy(out,y*stride);prev=line;}
 return{w,h,ch,data:out};}
function resize(img,tw,th){const out=Buffer.alloc(tw*th*4);
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const sx=x*img.w/tw,sy=y*img.h/th;
  const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,img.w-1),y1=Math.min(y0+1,img.h-1),fx=sx-x0,fy=sy-y0;
  for(let c=0;c<3;c++){const p00=img.data[(y0*img.w+x0)*img.ch+c],p10=img.data[(y0*img.w+x1)*img.ch+c],
   p01=img.data[(y1*img.w+x0)*img.ch+c],p11=img.data[(y1*img.w+x1)*img.ch+c];
   out[(y*tw+x)*4+c]=Math.round((p00*(1-fx)+p10*fx)*(1-fy)+(p01*(1-fx)+p11*fx)*fy);}
  out[(y*tw+x)*4+3]=255;}
 return{w:tw,h:th,ch:4,data:out};}

const f = resize(readPNG(path.join(__dirname,'live-frame.png')),1280,720);
const px=(x,y)=>{const i=(y*f.w+x)*f.ch;return[r=f.data[i],g=f.data[i+1],b=f.data[i+2]];};
const goal = { friends:{r:44,g:89,b:116}, mail:{r:205,g:170,b:52} };
const dist=(c,g2)=>Math.abs(c[0]-g2.r)+Math.abs(c[1]-g2.g)+Math.abs(c[2]-g2.b);

// 沿 x=58..74 每 5px 采样一条竖直剖面
console.log('竖向剖面 x=58..74 平均色（每 5px 一行）:');
for(let y=100;y<=400;y+=5){
  let r=0,g=0,b=0,n=0;
  for(let x=58;x<74;x++){const c=px(x,y);r+=c[0];g+=c[1];b+=c[2];n++;}
  const avg=[Math.round(r/n),Math.round(g/n),Math.round(b/n)];
  const df=dist(avg,goal.friends), dm=dist(avg,goal.mail);
  const tag = df<60?'  <== 像 friendsIcon':(dm<60?'  <== 像 mailNav':'');
  console.log(`  y=${String(y).padStart(3)}  (${String(avg[0]).padStart(3)},${String(avg[1]).padStart(3)},${String(avg[2]).padStart(3)})  dF=${String(df).padStart(3)} dM=${String(dm).padStart(3)}${tag}`);
}
