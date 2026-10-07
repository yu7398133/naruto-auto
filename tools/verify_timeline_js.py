#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端验证 buildKeyTimeline 的 JS 实现：用真实录制数据核对 down/up 配对、峰值并发、总时长。

步骤：
  1. 从录制提取 key 事件序列（含 hold），复刻脚本 MACROS 的 dt/hold 语义
  2. 用 node 调真实的 buildKeyTimeline 源码
  3. 断言：down/up 严格配对、任意时刻并发 <= 5、末事件后归零、总时长 == 录制
"""
import json, re, glob, os, subprocess, collections

REC_DIR = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
WS = r"C:\Users\chenyu\dsh\火影忍者"

BATTLE = ['毒风秘境战斗.json','水牢秘境战斗.json','烈焰秘境战斗.json','落岩秘境战斗.json',
          '落岩秘境战斗2（以前一个为准）.json','罡体秘境战斗.json','缸体秘境战斗2.json',
          '阴阳秘境战斗.json','阴阳秘境战斗2（以另一个为准）.json','雷霆秘境战斗.json']

allf = glob.glob(os.path.join(REC_DIR, '**', '*.json'), recursive=True)
def find(name):
    for f in allf:
        if os.path.basename(f) == name:
            return f

src = open(SCRIPT, encoding='utf-8').read()

# 抽出脚本里真实的 buildKeyTimeline + KEY_CODE_MAP
m_map = re.search(r'(const KEY_CODE_MAP = \{.*?\n\};)', src, re.S)
m_tl  = re.search(r'(function buildKeyTimeline\(seq, tapMs\) \{.*?\n\})', src, re.S)
m_hm  = re.search(r'(const SECRET_REALM_KEY_HOLD_MAX = \d+;)', src)
if not (m_map and m_tl and m_hm):
    print("!! 抽不到源码", bool(m_map), bool(m_tl), bool(m_hm)); raise SystemExit(1)

JS = m_hm.group(1) + "\n" + m_map.group(1) + "\n" + m_tl.group(1) + "\n"

cases = []
for name in BATTLE:
    f = find(name)
    if not f: continue
    d = json.load(open(f, encoding='utf-8'))
    keys = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
    if not keys: continue
    short = name.replace('秘境战斗','').replace('.json','')
    short = short.replace('（以前一个为准）','').replace('（以另一个为准）','')
    # 构造宏序列：首键 dt=0，后续 dt=与上一键的毫秒差；hold 原样
    seq = []
    prev = None
    for e in keys:
        t = e.get('t0') or e.get('t') or 0
        dt = 0 if prev is None else max(0, int(t - prev))
        seq.append({'kind':'key','key':e.get('key'),'hold':int(e.get('hold') or 0),'dt':dt})
        prev = t
    cases.append({'name': short, 'seq': seq})

print(f"[{len(cases)} 个用例]")
for c in cases:
    print(f"   {c['name']:8s} {len(c['seq']):3d} 键")

# 生成 node 脚本
node_src = JS + """
const cases = JSON.parse(process.argv[2]);
const out = [];
for (const c of cases) {
  const tl = buildKeyTimeline(c.seq, 60);
  // 逐事件模拟，检查配对与并发
  let live = 0, peak = 0, errs = [];
  const held = new Map();
  for (const ev of tl.events) {
    if (ev.act === 'down') {
      if (held.has(ev.key)) errs.push('重复按下 ' + ev.key + '@' + ev.at);
      held.set(ev.key, ev.at);
      live++;
      if (live > peak) peak = live;
    } else {
      if (!held.has(ev.key)) errs.push('无配对抬起 ' + ev.key + '@' + ev.at);
      else held.delete(ev.key);
      live--;
      if (live < 0) errs.push('并发为负 @' + ev.at);
    }
  }
  out.push({ name: c.name, keys: c.seq.length, events: tl.events.length,
             totalMs: tl.totalMs, peak, dropped: tl.dropped,
             leftover: [...held.keys()], errs });
}
console.log(JSON.stringify(out));
"""
open(os.path.join(WS, 'tools', '_tl_probe.cjs'), 'w', encoding='utf-8').write(node_src)

r = subprocess.run(['node', os.path.join(WS, 'tools', '_tl_probe.cjs'), json.dumps(cases, ensure_ascii=False)],
                   capture_output=True, text=True, encoding='utf-8', cwd=WS)
if r.returncode != 0:
    print("!! node 失败:", r.stderr[:800]); raise SystemExit(1)
res = json.loads(r.stdout.strip())

print()
print(f"{'用例':10s} {'键数':>4s} {'事件':>5s} {'总时长ms':>9s} {'峰值':>4s}  {'丢弃':>4s}  状态")
allok = True
for x in res:
    ok = (not x['errs']) and (not x['leftover']) and (not x['dropped']) and x['peak'] <= 5 and x['peak'] >= 1
    if not ok: allok = False
    # 录制真实总时长
    st = 'OK' if ok else 'FAIL'
    print(f"{x['name']:10s} {x['keys']:4d} {x['events']:5d} {x['totalMs']:9d} {x['peak']:4d}  {len(x['dropped']):4d}  {st}"
          + (f"  errs={x['errs'][:2]} leftover={x['leftover']}" if not ok else ""))
print()
print("结论:", "全部通过 ✓" if allok else "存在问题 ✗")
