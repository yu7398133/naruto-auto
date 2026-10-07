#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验：录制里每个 key 事件的 (key, code, keyCode) 三元组，与脚本 KEY_CODE_MAP 是否一致。"""
import json, re, glob, os, collections

REC_DIR = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
BATTLE = ['毒风秘境战斗.json','水牢秘境战斗.json','烈焰秘境战斗.json','落岩秘境战斗.json',
          '落岩秘境战斗2（以前一个为准）.json','罡体秘境战斗.json','缸体秘境战斗2.json',
          '阴阳秘境战斗.json','阴阳秘境战斗2（以另一个为准）.json','雷霆秘境战斗.json']

src = open(SCRIPT, encoding='utf-8').read()
m = re.search(r'const KEY_CODE_MAP = \{(.*?)\n\};', src, re.S)
block = m.group(1)
# 直接从块文本里抽 "key: 'x' ... code: 'KeyX' ... keyCode: N"，键名取 key 字段（与录制一致）
script_map = {}
for mm in re.finditer(r"key:\s*'([^']*)',\s*code:\s*'([^']*)',\s*keyCode:\s*(\d+)", block):
    script_map[mm.group(1)] = (mm.group(1), mm.group(2), int(mm.group(3)))

print("[脚本 KEY_CODE_MAP]")
for k, v in sorted(script_map.items()):
    print(f"   {k:6s} -> key={v[0]!r:6s} code={v[1]:8s} keyCode={v[2]}")
print()

allf = glob.glob(os.path.join(REC_DIR, '**', '*.json'), recursive=True)
def find(name):
    for f in allf:
        if os.path.basename(f) == name:
            return f

# 收集录制里所有 key 事件的三元组
rec_triples = collections.Counter()
rec_by_short = {}
for name in BATTLE:
    f = find(name)
    if not f:
        print(f"!! 找不到 {name}"); continue
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list):
        print(f"!! {name} 不是 list"); continue
    short = name.replace('秘境战斗', '').replace('.json','').replace('（以前一个为准）','').replace('（以另一个为准）','')
    n = 0
    for e in d:
        if not isinstance(e, dict) or e.get('kind') != 'key':
            continue
        tri = (e.get('key'), e.get('code'), e.get('keyCode'))
        rec_triples[tri] += 1
        rec_by_short.setdefault(short, collections.Counter())[e.get('key')] += 1
        n += 1
    print(f"   {short:10s} key事件 {n:4d} 个")

print()
print("[录制里出现的 (key, code, keyCode) 三元组]")
for tri, cnt in sorted(rec_triples.items(), key=lambda x: -x[1]):
    print(f"   {str(tri):48s} x{cnt}")
print()

# 逐键核对
print("=" * 72)
print("[核对]")
ok = True
rec_keys = set(t[0] for t in rec_triples if isinstance(t[0], str))
for k in sorted(rec_keys):
    if k not in script_map:
        print(f"   !! 脚本缺 {k!r}")
        ok = False
        continue
    # 找录制里这个键的三元组
    tris = set(t for t in rec_triples if t[0] == k)
    exp = script_map[k]
    matches = [t for t in tris if (t[1], t[2]) == (exp[1], exp[2])]
    if matches:
        print(f"   OK {k:6s} 脚本={exp[1]}/{exp[2]:3d}  录制={sorted(set((t[1],t[2]) for t in tris))}")
    else:
        print(f"   !! {k:6s} 不匹配！脚本={exp[1]}/{exp[2]}  录制={sorted(set((t[1],t[2]) for t in tris))}")
        ok = False

extra = set(script_map) - rec_keys
if extra:
    print(f"\n   (录制未用到: {sorted(extra)})")
print()
print("结论:", "全部一致 ✓" if ok else "存在不一致 ✗")
