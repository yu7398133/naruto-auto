#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""评估录制器缺陷：用真实录制 JSON 检查 dt/t 字段、重复键、hold 一致性。"""
import json, glob, os

REC = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
files = [f for f in glob.glob(os.path.join(REC, '**', '*.json'), recursive=True)
         if '秘境' in os.path.basename(f) or '战斗' in os.path.basename(f)]

print(f"找到 {len(files)} 份录制\n")

# 关键：录制器 _recordKey 里 t 和 t0 都是 Date.now()，而 click/drag 只有 t
print("=" * 78)
print("① t / t0 / dt 字段完整性（脚本 buildKeyTimeline 依赖 dt）")
print("=" * 78)
for f in sorted(files, key=os.path.basename)[:6]:
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list) or not d: continue
    name = os.path.basename(f)[:24]
    n = len(d)
    has_t  = sum(1 for e in d if isinstance(e, dict) and 't' in e)
    has_t0 = sum(1 for e in d if isinstance(e, dict) and 't0' in e)
    has_dt = sum(1 for e in d if isinstance(e, dict) and 'dt' in e)
    has_kind = sum(1 for e in d if isinstance(e, dict) and 'kind' in e)
    kinds = {}
    for e in d:
        if isinstance(e, dict): kinds[e.get('kind')] = kinds.get(e.get('kind'), 0) + 1
    print(f"  {name:26s} n={n:3d}  t={has_t} t0={has_t0} dt={has_dt} kind={has_kind}  {kinds}")

print()
print("=" * 78)
print("② 字段总览：录制器导出的真实字段（第一份完整列出）")
print("=" * 78)
for f in sorted(files, key=os.path.basename):
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list) or not d: continue
    keys = set()
    for e in d:
        if isinstance(e, dict): keys |= set(e.keys())
    print(f"  {os.path.basename(f)[:30]:32s} -> {sorted(k for k in keys if k != 'frame')}")

print()
print("=" * 78)
print("③ 「同一时刻多个键」的真实形态（这是 dt=0 的来源）")
print("=" * 78)
for f in sorted(files, key=os.path.basename):
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list): continue
    ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
    if not ks: continue
    zero_dt = sum(1 for e in ks if (e.get('dt') or 0) == 0)
    print(f"  {os.path.basename(f)[:30]:32s} key={len(ks):3d}  dt=0 的 {zero_dt:3d}  dt值样本={[e.get('dt') for e in ks[:8]]}")
