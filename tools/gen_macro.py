#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用：读新录制 → 生成宏（lead=0），与现有宏对比。用法: script.py <json> <realm>"""
import json, re, sys

NEW = sys.argv[1]
REALM = sys.argv[2]
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

d = json.load(open(NEW, encoding='utf-8'))
base = d[0]['t']
keys = [{'key': e['key'], 'hold': e.get('hold') or 0, 't': (e.get('t0') or e.get('t')) - base}
        for e in d if e.get('kind') == 'key']

print(f"{'seq':>4} {'kind':>6} {'t':>7} {'hold':>6} {'key':>5}  scene")
for e in d:
    print(f"{e.get('seq'):>4} {e.get('kind'):>6} {e.get('t',0)-base:>7} "
          f"{str(e.get('hold','-')):>6} {str(e.get('key')):>5}  {e.get('scene')}")

src = open(SCRIPT, encoding='utf-8').read()
start = src.index('const SECRET_REALM_MACROS = ')
brace = src.index('{', start)
i, depth = brace, 0
while i < len(src):
    if src[i] == '{': depth += 1
    elif src[i] == '}':
        depth -= 1
        if depth == 0: break
    i += 1
macros = json.loads(src[brace:i+1])
old = macros.get(REALM, [])
oldkeys = [s for s in old if s.get('kind') == 'key']

print()
print("=" * 88)
print(f"新录制 {len(keys)} 键 vs 现有 {REALM} 宏 {len(oldkeys)} 键")
print("=" * 88)
def fmt(arr):
    return ' '.join(str(a.get('key')) + (f"({a.get('hold')})" if a.get('hold') else '') for a in arr)

print(f"  新: {fmt(keys)}")
print(f"  旧: {fmt(oldkeys)}")

print()
print("=" * 88)
print(f"新 {REALM} 宏（lead=0，立即执行）")
print("=" * 88)
out = [{'kind': 'lead', 'ms': 0}]
prev = None
for k in keys:
    dt = 0 if prev is None else k['t'] - prev
    out.append({'kind': 'key', 'key': k['key'], 'hold': k['hold'], 'dt': dt})
    prev = k['t']
print(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
