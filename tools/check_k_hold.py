#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计所有秘境录制里 k（普攻）的 hold 分布，判断「长按普攻」是不是普遍模式。"""
import json, glob, os, re, collections

REC_DIR = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
allf = glob.glob(os.path.join(REC_DIR, '**', '*.json'), recursive=True)

BATTLE = ['毒风秘境战斗.json','水牢秘境战斗.json','烈焰秘境战斗.json','落岩秘境战斗.json',
          '落岩秘境战斗2（以前一个为准）.json','罡体秘境战斗.json','缸体秘境战斗2.json',
          '阴阳秘境战斗.json','阴阳秘境战斗2（以另一个为准）.json','雷霆秘境战斗.json']

print("各录制里 k（普攻）的 hold 值：")
print("-" * 58)
krows = []
for name in BATTLE:
    f = next((x for x in allf if os.path.basename(x) == name), None)
    if not f: continue
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list): continue
    ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key' and e.get('key') == 'k']
    short = name.replace('秘境战斗','').replace('.json','').replace('（以前一个为准）','').replace('（以另一个为准）','')
    if not ks:
        print(f"  {short:8s} 无 k")
        continue
    holds = [e.get('hold') or 0 for e in ks]
    krows.append((short, holds))
    print(f"  {short:8s} k×{len(ks)}  hold = {holds}")

print("-" * 58)
allholds = [h for _, hs in krows for h in hs]
if allholds:
    print(f"全部 k 的 hold：{sorted(allholds)}")
    print(f"  hold=0（轻点）的有 {sum(1 for h in allholds if h == 0)} 个")
    print(f"  hold>0（长按）的有 {sum(1 for h in allholds if h > 0)} 个")
    print(f"  长按中位数 ≈ {sorted([h for h in allholds if h>0])[len([h for h in allholds if h>0])//2] if any(h>0 for h in allholds) else 0}ms")

# 对比脚本宏里的 k
src = open(SCRIPT, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', src, re.S)
macros = json.loads(m.group(1))
print()
print("脚本宏里的 k：")
for realm, seq in macros.items():
    ks = [s for s in seq if s.get('kind') == 'key' and s.get('key') == 'k']
    if ks:
        print(f"  {realm:8s} k×{len(ks)}  hold = {[s.get('hold') or 0 for s in ks]}")
