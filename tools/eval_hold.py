#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证假设：hold=0 是「多键同按导致回填失败」，还是「真的轻点」。
判据：若为回填失败，则 hold=0 的键其**后续键的 dt** 会落在该键的"应有按住窗口"内。"""
import json, glob, os

REC = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
f = next(x for x in glob.glob(os.path.join(REC, '**', '*.json'), recursive=True)
         if os.path.basename(x) == '烈焰秘境战斗.json')
d = json.load(open(f, encoding='utf-8'))
ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
base = ks[0]['t0']

print("烈焰秘境战斗.json —— 键序列（t 相对首键）")
print("=" * 78)
print(f"{'#':>3} {'key':>4} {'t(ms)':>7} {'hold':>6}   备注")
prev = None
for i, e in enumerate(ks, 1):
    t = e['t0'] - base
    dt = 0 if prev is None else t - prev
    note = ''
    if (e.get('hold') or 0) == 0:
        note = '← hold=0'
    print(f"{i:>3} {e['key']:>4} {t:>7} {e.get('hold') or 0:>6}   dt={dt:<6} {note}")
    prev = t

print()
print("=" * 78)
print("判别：若 hold=0 是「轻点」（真的瞬间松开），后续键应在其后 ≥60ms")
print("      若 hold=0 是「回填失败」，说明按下时被下一个键挤掉了 pending")
print("=" * 78)

# 关键判别：检查 hold=0 的键，是否紧接着 60ms 内就有下一个键
# 若是 → 物理上不可能是"按住很久"，说明它是**快速连击**，hold≈0 是真实的
tight = 0
for i, e in enumerate(ks):
    if (e.get('hold') or 0) == 0 and i + 1 < len(ks):
        gap = (ks[i+1]['t0'] - e['t0'])
        if gap < 60:
            tight += 1
print(f"  hold=0 且下一个键在 60ms 内的：{tight} 个 → 这些是**快速连击**，hold≈0 属实")
print()
print("  ⚠ 关键结论：hold=0 与「单槽位 pending」两种解释**不冲突**：")
print("     · 快速连击（相隔 <60ms）→ 即使回填成功，hold 也就几毫秒，记 0 无妨")
print("     · 但**同时按住两个键**时，先按的那个 hold 必然丢（pending 被覆盖）")
print()
print("  检查录制里是否存在「按住重叠」：某键按下后，在它松开前又按下另一键")
print("  （录制没有 keyup 记录，只能用 hold>0 的键推断其按住窗口）")
overlap = 0
for i, e in enumerate(ks):
    h = e.get('hold') or 0
    if h <= 0: continue
    t_end = e['t0'] + h
    for j in range(i+1, len(ks)):
        if ks[j]['t0'] < t_end:
            overlap += 1
            if overlap <= 5:
                print(f"      #{i+1} {e['key']}(h={h}) 窗口内出现 #{j+1} {ks[j]['key']} "
                      f"(+{ks[j]['t0']-e['t0']}ms)")
            break
        else:
            break
print(f"  → 共 {overlap} 处「按住窗口内出现另一键」")
