#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""读新烈焰录制（含前置 5s 缓冲），与现有 lieyan 宏逐条对比。"""
import json, os, re

NEW = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\dd\dd64b0f69ace201809c5d6d153a5f705049b4373fbaec96627ecbd2b6e9684c2\烈焰秘境.json"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

d = json.load(open(NEW, encoding='utf-8'))
print("=" * 88)
print(f"新录制：{len(d)} 条")
print("=" * 88)
base = d[0]['t']
print(f"{'seq':>4} {'kind':>6} {'t_rel':>8} {'t0_rel':>8} {'hold':>6} {'key':>5}  scene")
for e in d:
    t0 = e.get('t0')
    print(f"{e.get('seq'):>4} {e.get('kind'):>6} {e.get('t',0)-base:>8} "
          f"{'—' if t0 is None else t0-base:>8} {e.get('hold','—'):>6} "
          f"{str(e.get('key')):>5}  {e.get('scene')}")

print()
print("=" * 88)
print("现有 lieyan 宏")
print("=" * 88)
src = open(SCRIPT, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', src, re.S)
macros = json.loads(m.group(1))
old = macros.get('lieyan')
print(json.dumps(old, ensure_ascii=False, indent=1)[:1500])

print()
print("=" * 88)
print("对比：新录制的 key 事件 vs 现有宏")
print("=" * 88)
newkeys = [{'key': e['key'], 'hold': e.get('hold') or 0,
            't': (e.get('t0') or e.get('t')) - base}
           for e in d if e.get('kind') == 'key']
oldkeys = [s for s in old if s.get('kind') == 'key']
lead_old = next((s.get('ms') for s in old if s.get('kind') == 'lead'), None)
print(f"  新录制: {len(newkeys)} 键, 首键 t={newkeys[0]['t'] if newkeys else '-'}ms")
print(f"  现有宏: {len(oldkeys)} 键, lead={lead_old}ms")
print()
print(f"  {'#':>3} {'新key':>6} {'新hold':>7} {'新dt':>7}  |  {'旧key':>6} {'旧hold':>7} {'旧dt':>7}")
n = max(len(newkeys), len(oldkeys))
prev_n = prev_o = None
for i in range(n):
    nk = newkeys[i] if i < len(newkeys) else None
    ok = oldkeys[i] if i < len(oldkeys) else None
    ndt = '-' if nk is None else (0 if prev_n is None else nk['t'] - prev_n)
    odt = '-' if ok is None else (ok.get('dt') or 0)
    mark = ''
    if nk and ok:
        if nk['key'] != ok.get('key'): mark = ' ← 键不同'
        elif nk['hold'] != (ok.get('hold') or 0): mark = ' ← hold 不同'
    print(f"  {i+1:>3} {str(nk['key']) if nk else '-':>6} {nk['hold'] if nk else '-':>7} {ndt:>7}  |  "
          f"{str(ok.get('key')) if ok else '-':>6} {ok.get('hold') if ok else '-':>7} {odt:>7}{mark}")
    if nk: prev_n = nk['t']
