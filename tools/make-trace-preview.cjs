// 用真实的历史数据重建一份「新格式」报告，用于预览新 UI 效果。
// 数据来自 2026-09-21 那次实跑（含 clearSettlement 盲点事故）。
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.resolve(__dirname, '..', 'trace-preview-new.html');
const SRC = process.argv[3];   // 可选：旧报告 HTML，抽其帧图复用

let frames = [];
if (SRC && fs.existsSync(SRC)) {
  const html = fs.readFileSync(SRC, 'utf8');
  const m = html.match(/var STEPS=(\[[\s\S]*?\]);\n/);
  if (m) {
    try { frames = JSON.parse(m[1]).map(s => s.frame).filter(Boolean); } catch (e) {}
  }
}
const F = (i) => frames[i % Math.max(1, frames.length)] || null;

// 复刻那次实跑的步骤流（含新增的 phase/decide/note）
const steps = [];
let seq = 0, t = 0;
const push = (o) => { steps.push(Object.assign({ seq: ++seq, t }, o)); };

push({ kind:'phase', label:'秘境 第1场/导航', coord:null,key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:null,phase:'秘境 第1场/导航' });
t=1500; push({ kind:'tap', label:'', coord:[615,406], key:null,hold:0,scene:'other',brightness:96,probeHits:[{name:'backBtnX',dist:0}],frame:F(0),phase:'秘境 第1场/导航' });
t=5500; push({ kind:'tap', label:'', coord:[77,325], key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:F(1),phase:'秘境 第1场/导航' });
t=9500; push({ kind:'tap', label:'', coord:[947,530], key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:F(2),phase:'秘境 第1场/导航' });

push({ kind:'phase', label:'秘境 第1场/读券', coord:null,key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:null,phase:'秘境 第1场/读券' });
t=9800; push({ kind:'decide', label:'ticket → miss', coord:null,key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:F(3),phase:'秘境 第1场/读券',
  decide:{ raw:null, score:null, ok:true, streak:0, verdict:'miss' } });

push({ kind:'phase', label:'秘境 第1场/匹配', coord:null,key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:null,phase:'秘境 第1场/匹配' });
t=13400; push({ kind:'tap', label:'', coord:[1187,616], key:null,hold:0,scene:'other',brightness:96,probeHits:[],frame:F(4),phase:'秘境 第1场/匹配' });
t=13700; push({ kind:'note', label:'探测到「继续挑战无法获得饰品」提示弹窗 → 勾选不再提示 + 确定', coord:null,key:null,hold:0,scene:'popup',brightness:80,probeHits:[],frame:null,phase:'秘境 第1场/匹配' });
t=14200; push({ kind:'decide', label:'realmName → hit', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:F(5),phase:'秘境 第1场/匹配',
  decide:{ realm:'lieyan', verdict:'hit', sinceTapMs:1889 } });

push({ kind:'phase', label:'秘境 第1场/战斗', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/战斗' });
t=14300; push({ kind:'note', label:'✅ 目标秘境 lieyan，开始回放宏（点匹配后已过 1889ms）', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/战斗' });
// 战斗按键若干
for (let i = 0; i < 8; i++) {
  t += 1800;
  const ks = ['a','s','d','j','i','o','k','d'];
  push({ kind:'key', label:'', coord:null, key:ks[i], hold:(ks[i]==='k'?1567:0), scene:'battle', brightness:70,
         probeHits:[], frame:F(6+i), phase:'秘境 第1场/战斗' });
}

push({ kind:'phase', label:'秘境 第1场/结算', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/结算' });
t=28300; push({ kind:'decide', label:'settleBack@afterMacro → miss', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:F(14),phase:'秘境 第1场/结算',
  decide:{ score:72.7, thresh:55, tries:16, waitedMs:30000, verdict:'miss' } });
t=28300; push({ kind:'note', label:'⏳ 30s 内未探到结算返回按钮（最后 score=72.7，阈值 55） → 交给连点兜底', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/结算' });
t=46000; push({ kind:'decide', label:'settleBack@turbo → hit', coord:[128,668],key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:F(15),phase:'秘境 第1场/结算',
  decide:{ score:27.4, thresh:55, at:[128,668], elapsedS:15, verdict:'hit' } });
t=46000; push({ kind:'note', label:'🔔 连点期间探到结算（score=27.4，+15s）→ 立即停手', coord:null,key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/结算' });
t=47000; push({ kind:'tap', label:'', coord:[638,604], key:null,hold:0,scene:'battle',brightness:70,probeHits:[],frame:F(16),phase:'秘境 第1场/结算' });
t=47500; push({ kind:'decide', label:'clearSettlement → skip-not-settle', coord:null,key:null,hold:0,scene:'other',brightness:70,probeHits:[],frame:F(17),phase:'秘境 第1场/结算',
  decide:{ scene:'other', round:1, verdict:'skip-not-settle', why:'场景非结算页 → 不盲点' } });
t=48000; push({ kind:'note', label:'⚠ 场景=other 非结算页 → 不盲点（防误点）', coord:null,key:null,hold:0,scene:'other',brightness:70,probeHits:[],frame:null,phase:'秘境 第1场/结算' });
t=52000; push({ kind:'tap', label:'', coord:[129,671], key:null,hold:0,scene:'other',brightness:70,probeHits:[{name:'backBtnX',dist:4}],frame:F(18),phase:'秘境 第1场/结算' });

const data = JSON.stringify(steps).replace(/</g, '\\u003c');
const parts = [];
parts.push('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">');
parts.push('<title>火影自动运行追踪 · 新格式预览</title>');
parts.push('<style>');
parts.push('*{box-sizing:border-box}body{margin:0;background:#0f1420;color:#e6edf3;font:14px/1.5 -apple-system,"Microsoft YaHei",sans-serif}');
parts.push('header{padding:12px 16px;background:#16213e;border-bottom:1px solid #2a3a5a;display:flex;align-items:center;gap:12px;flex-wrap:wrap}');
parts.push('header h1{font-size:16px;margin:0}header small{color:#7f8c8d}#pos{margin-left:auto;color:#7f8c8d}');
parts.push('#wrap{display:flex;gap:12px;padding:12px;height:calc(100vh - 56px)}');
parts.push('#left{flex:0 0 480px;display:flex;flex-direction:column;gap:10px}');
parts.push('#frame{background:#000;border:1px solid #2a3a5a;border-radius:8px;overflow:hidden}');
parts.push('#frame img{width:100%;display:block}');
parts.push('#ctrls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}');
parts.push('button{background:#e94560;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}');
parts.push('button.sec{background:#2a3a5a}');
parts.push('input{background:#1a2336;color:#e6edf3;border:1px solid #2a3a5a;border-radius:5px;padding:5px;width:80px}');
parts.push('#info{background:#16213e;border:1px solid #2a3a5a;border-radius:8px;padding:10px 12px;font-size:13px}');
parts.push('#info .row{display:flex;gap:8px;margin:3px 0}.row b{flex:0 0 84px;color:#7f8c8d;font-weight:600}');
parts.push('#hits{margin-top:6px}#hits span{display:inline-block;background:#10331f;color:#2ecc71;border:1px solid #1d5c39;border-radius:10px;padding:1px 8px;font-size:11px;margin:2px}');
parts.push('#list{flex:1;overflow:auto;background:#11182a;border:1px solid #2a3a5a;border-radius:8px;padding:6px}');
parts.push('#list .it{padding:5px 8px;border-bottom:1px solid #1c2740;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:center}');
parts.push('#list .it:hover{background:#1a2742}#list .it.cur{background:#3a2a1a}');
parts.push('#list .it .k{color:#e94560;flex:0 0 52px}#list .it .t{color:#7f8c8d;flex:0 0 56px}#list .it .lb{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
parts.push('.kind-key{color:#3498db}.kind-swipe{color:#9b59b6}.kind-hold{color:#e67e22}.kind-release{color:#95a5a6}.kind-tap{color:#e6edf3}');
parts.push('.kind-decide{color:#f1c40f}.kind-note{color:#7f8c8d}.kind-phase{color:#2ecc71}');
parts.push('#decide{margin-top:8px;background:#2a2410;border:1px solid #5c4a1d;border-radius:6px;padding:8px 10px;font-size:12px}');
parts.push('#decide .d{display:flex;gap:8px;margin:2px 0}#decide .d b{flex:0 0 92px;color:#c9a227;font-weight:600}');
parts.push('#decide .v-hit{color:#2ecc71;font-weight:700}#decide .v-miss{color:#e94560;font-weight:700}#decide .v-skip{color:#95a5a6}');
parts.push('#decide h4{margin:0 0 6px;font-size:12px;color:#f1c40f}');
parts.push('#list .it.ph{background:#12261a;border-top:1px solid #1d5c39;font-weight:700;color:#2ecc71}');
parts.push('#list .it.dec{background:#231d0c}');
parts.push('#list .it .ph-tag{flex:0 0 auto;color:#2ecc71;font-size:11px}');
parts.push('</style></head><body>');
parts.push('<header><h1>🔬 火影自动运行追踪 <small>v0.5.95 · ' + steps.length + ' 步 · 新格式预览</small></h1>');
parts.push('<span id="pos"></span></header>');
parts.push('<div id="wrap"><div id="left">');
parts.push('<div id="frame"><img id="img" alt="帧"></div>');
parts.push('<div id="ctrls"><button id="prev">◀ 上一步</button><button id="next">下一步 ▶</button>');
parts.push('<button id="play" class="sec">▶ 自动播放</button><span>跳到</span>');
parts.push('<input id="jump" type="number" min="1" value="1"><button id="go" class="sec">前往</button></div>');
parts.push('<div id="info"></div></div>');
parts.push('<div id="list"></div></div>');
parts.push('<script>');
parts.push('var STEPS=' + data + ';');
parts.push('var i=0,timer=null;');
parts.push('var $=function(id){return document.getElementById(id)};');
parts.push('function fmt(ms){var s=ms/1000;return (s<60?s.toFixed(1)+"s":Math.floor(s/60)+"m"+((s%60)|0)+"s")}');
parts.push('function render(){var s=STEPS[i];if(!s)return;');
parts.push('$("img").src=s.frame||"";$("img").alt=s.frame?"点击时画面":"（无帧图）";');
parts.push('var c=s.coord?(s.coord.length===4?s.coord.slice(0,2).join(",")+" → "+s.coord.slice(2).join(","):s.coord.join(",")):"—";');
parts.push('var extra=(s.kind==="key")?("键: "+s.key+(s.hold?(" 按"+s.hold+"ms"):"")):("坐标: "+c);');
parts.push('var hits=(s.probeHits||[]).map(function(h){return "<span>"+h.name+" d="+h.dist+"</span>"}).join("");');
parts.push('var dv=s.decide;var dh="";');
parts.push('if(dv){var rows="";for(var k in dv){var v=dv[k];');
parts.push('var cls=(k==="verdict")?("v-"+String(v).replace(/[^a-z]/gi,"")):"";');
parts.push('rows+="<div class=d><b>"+k+"</b><span class=\\""+cls+"\\">"+(typeof v==="object"?JSON.stringify(v):v)+"</span></div>"}');
parts.push('dh="<div id=decide><h4>🎯 判定详情</h4>"+rows+"</div>"}');
parts.push('$("info").innerHTML="<div class=row><b>步骤</b><span>#"+s.seq+" / "+STEPS.length+"</span></div>"+');
parts.push('(s.phase?"<div class=row><b>阶段</b><span class=kind-phase>"+s.phase+"</span></div>":"")+');
parts.push('"<div class=row><b>时间</b><span>"+fmt(s.t)+"</span></div>"+');
parts.push('"<div class=row><b>类型</b><span class=kind-"+s.kind+">"+s.kind+"</span></div>"+');
parts.push('"<div class=row><b>说明</b><span>"+(s.label||"—")+"</span></div>"+');
parts.push('"<div class=row><b>动作</b><span>"+extra+"</span></div>"+');
parts.push('"<div class=row><b>场景</b><span>"+(s.scene||"—")+" / 亮度 "+(s.brightness>=0?s.brightness.toFixed(1):"-")+"</span></div>"+');
parts.push('dh+');
parts.push('"<div class=row><b>命中探针</b></div><div id=hits>"+(hits||"<span style=\\"background:#331;color:#a55\\">无</span>")+"</div>";');
parts.push('$("pos").textContent="第 "+(i+1)+" / "+STEPS.length+" 步";');
parts.push('var its=document.querySelectorAll("#list .it");for(var k=0;k<its.length;k++){its[k].className="it"+(k===i?" cur":"")}');
parts.push('if(its[i])its[i].scrollIntoView({block:"nearest"})}');
parts.push('function go(n){i=Math.max(0,Math.min(STEPS.length-1,n));render()}');
parts.push('$("prev").onclick=function(){go(i-1)};$("next").onclick=function(){go(i+1)};');
parts.push('$("go").onclick=function(){go((parseInt($("jump").value,10)||1)-1)};');
parts.push('$("play").onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent="▶ 自动播放";return}this.textContent="⏸ 暂停";timer=setInterval(function(){if(i>=STEPS.length-1){clearInterval(timer);timer=null;$("play").textContent="▶ 自动播放";return}go(i+1)},900)};');
parts.push('var listHtml="";for(var j=0;j<STEPS.length;j++){var s=STEPS[j];var lb=(s.label||s.kind);');
parts.push('var cls="it"+(s.kind==="phase"?" ph":(s.kind==="decide"?" dec":""));');
parts.push('var tag=s.phase?"<span class=ph-tag>"+s.phase.split("/").pop()+"</span>":"";');
parts.push('listHtml+="<div class=\\""+cls+"\\" data-i="+j+"><span class=k>"+s.kind+"</span><span class=t>"+fmt(s.t)+"</span><span class=lb>"+(lb||"")+"</span>"+tag+"</div>"}');
parts.push('$("list").innerHTML=listHtml;');
parts.push('$("list").onclick=function(e){var d=e.target.closest(".it");if(d)go(parseInt(d.getAttribute("data-i"),10))};');
parts.push('render();');
parts.push('</script></body></html>');

fs.writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log('wrote', OUT, fs.statSync(OUT).size, 'B,', steps.length, 'steps,', 'frames reused:', frames.length);
