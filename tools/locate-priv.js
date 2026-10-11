// 找「特权商店」在 shop2 上的真实位置：从左菜单和顶栏两侧都扫，输出强匹配点
const fs = require('fs'); const zlib = require('zlib'); const path = require('path');
function readPNG(p) {
  const b = fs.readFileSync(p); let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < b.length) { const len = b.readUInt32BE(off), type = b.toString('ascii', off+4, off+8); const data = b.slice(off+8, off+8+len);
    if (type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);ct=data[9];} else if(type==='IDAT') idat.push(data); else if(type==='IEND') break; off += 12+len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct===6?4:ct===2?3:4, stride = w*ch;
  const out = Buffer.alloc(w*h*ch); let prev = Buffer.alloc(stride), pos=0;
  for (let y=0;y<h;y++){ const ft=raw[pos++]; const line=Buffer.from(raw.slice(pos,pos+stride)); pos+=stride;
    for(let i=0;i<stride;i++){ const a=i>=ch?line[i-ch]:0,bb=prev[i],c=i>=ch?prev[i-ch]:0; let v=line[i];
      if(ft===1)v+=a; else if(ft===2)v+=bb; else if(ft===3)v+=(a+bb)>>1;
      else if(ft===4){const pp=a+bb-c,pa=Math.abs(pp-a),pb=Math.abs(pp-bb),pc=Math.abs(pp-c); v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);} line[i]=v&255; }
    line.copy(out,y*stride); prev=line; }
  return {w,h,ch,data:out};
}
function resize(img,tw,th){ const out=Buffer.alloc(tw*th*4);
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){ const sx=x*img.w/tw,sy=y*img.h/th;
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,img.w-1),y1=Math.min(y0+1,img.h-1),fx=sx-x0,fy=sy-y0;
    for(let c=0;c<3;c++){ const p00=img.data[(y0*img.w+x0)*img.ch+c],p10=img.data[(y0*img.w+x1)*img.ch+c],
      p01=img.data[(y1*img.w+x0)*img.ch+c],p11=img.data[(y1*img.w+x1)*img.ch+c];
      out[(y*tw+x)*4+c]=Math.round((p00*(1-fx)+p10*fx)*(1-fy)+(p01*(1-fx)+p11*fx)*fy); }
    out[(y*tw+x)*4+3]=255; }
  return {w:tw,h:th,ch:4,data:out}; }
function sadAt(f,t,fx,fy){ let s=0,n=0;
  for(let y=0;y<t.h;y++)for(let x=0;x<t.w;x++){ const fi=((fy+y)*f.w+(fx+x))*f.ch,ti=(y*t.w+x)*t.ch;
    s+=Math.abs(f.data[fi]-t.data[ti])+Math.abs(f.data[fi+1]-t.data[ti+1])+Math.abs(f.data[fi+2]-t.data[ti+2]); n+=3; }
  return s/n; }

const src = fs.readFileSync('C:/Users/chenyu/dsh/火影忍者/naruto-auto.user.js','utf8');
function decodeConst(name){ const re=new RegExp('const\\s+'+name+"\\s*=\\s*((?:'[^']*'|\\s*\\+\\s*)+);");
  const m=src.match(re); if(!m) return null; const parts=[...m[1].matchAll(/'([^']*)'/g)].map(x=>x[1]);
  let j=parts.join('').replace(/^data:image\/[a-z]+;base64,/,'').replace(/[^A-Za-z0-9+/=]/g,'');
  const tmp=path.join(__dirname,'_t.png'); fs.writeFileSync(tmp,Buffer.from(j,'base64'));
  const im=readPNG(tmp); fs.unlinkSync(tmp); return im; }

const K = 1280/1920;
const raw = decodeConst('PRIV_TAB_TMPL_SRC');
const t = resize(raw, Math.round(raw.w*K), Math.round(raw.h*K));
console.log('「特权商店」模板 ' + raw.w + 'x' + raw.h + ' → ' + t.w + 'x' + t.h);

const shop2 = resize(readPNG(path.join(__dirname,'crop','shop2.png')), 1280, 720);
// 全屏低密度扫描，列出前 12 个最佳点（找它到底在哪）
const cands = [];
for (let y = 0; y <= shop2.h - t.h - 1; y += 4)
  for (let x = 0; x <= shop2.w - t.w - 1; x += 4)
    cands.push({ d: sadAt(shop2, t, x, y), x, y });
cands.sort((a,b)=>a.d-b.d);
console.log('');
console.log('shop2 全屏最佳点（step4 粗扫）:');
cands.slice(0,12).forEach(c => console.log(`  SAD=${c.d.toFixed(1)} @(${c.x},${c.y})`));
