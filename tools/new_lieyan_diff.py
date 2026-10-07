#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""新烈焰录制 → lieyan 宏，逐条对比。"""
import json, re

NEW = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\dd\dd64b0f69ace201809c5d6d153a5f705049b4373fbaec96627ecbd2b6e9684c2\烈焰秘境.json"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

d = json.load(open(NEW, encoding='utf-8'))
base = d[0]['t']
src = open(SCRIPT, encoding='utf-8').read()
macros = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', src, re.S).group(1))
old = macros['lieyan']

newkeys = [{'key': e['key'], 'hold': e.get('hold') or 0,
            't': (e.get('t0') or e.get('t')) - base}
           for e in d if e.get('kind') == 'key']
oldkeys = [s for s in old if s.get('kind') == 'key']
oldlead = next((s.get('ms') for s in old if s.get('kind') == 'lead'), 0)

print("新录制 key 序列（t 相对录制首条 click）")
print(f"{'#':>3} {'key':>4} {'t':>7} {'dt':>7} {'hold':>6}   | 旧key 旧dt  旧hold  | 差异")
prev = None
for i, k in enumerate(newkeys):
    dt = 0 if prev is None else k['t'] - prev
    ok = oldkeys[i] if i < len(oldkeys) else None
    diff = ''
    if ok:
        if k['key'] != ok.get('key'):
            diff = f"键 {ok.get('key')}→{k['key']}"
        elif k['hold'] != (ok.get('hold') or 0):
            diff = f"hold {ok.get('hold')}→{k['hold']}"
    print(f"{i+1:>3} {k['key']:>4} {k['t']:>7} {dt:>7} {k['hold']:>6}   | "
          f"{str(ok.get('key')) if ok else '-':>5} {str(ok.get('dt')) if ok else '-':>5}  "
          f"{str(ok.get('hold')) if ok else '-':>6} | {diff}")
    prev = k['t']

print()
print(f"旧宏 lead={oldlead}   新录制首键 t={newkeys[0]['t']}")
print(f"旧宏 {len(oldkeys)} 键 / 新录制 {len(newkeys)} 键")
print()
print("首键 dt 应为 0；新录制首键 t 就是 lead（含用户预留的 5s 缓冲）")

# 生成新宏条目
print()
print("=" * 88)
print("新 lieyan 宏（可直接替换）")
print("=" * 88)
out = [{'kind': 'lead', 'ms': newkeys[0]['t']}]
prev = None
for k in newkeys:
    dt = 0 if prev is None else k['t'] - prev
    out.append({'kind': 'key', 'key': k['key'], 'hold': k['hold'], 'dt': dt})
    prev = k['t']
js = json.dumps(out, ensure_ascii=False)
lines = []
for o in out:
    parts = ', '.join(f'{k}: {json.dumps(v, ensure_ascii=False)}' for k, v in o.items())
    lines.append('      { ' + parts + ' },')
print('    lieyan: [\n' + '\n'.join(lines) + '\n    ],')
