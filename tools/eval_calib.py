#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校准器 (Calibrator) 评估：查清 t/t0/hold/dt 的真实语义与关键缺口。"""
import json, glob, os

REC = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
f = next(x for x in glob.glob(os.path.join(REC, '**', '烈焰秘境战斗.json'), recursive=True))
d = json.load(open(f, encoding='utf-8'))

print("=" * 92)
print("烈焰秘境战斗.json 原始数据（前 6 条 + 末 3 条）")
print("=" * 92)
print(f"{'seq':>4} {'kind':>6} {'t':>8} {'t0':>8} {'hold':>6} {'key':>5}  name")
base = d[0]['t']
for e in d[:6] + d[-3:]:
    print(f"{e.get('seq'):>4} {e.get('kind'):>6} {e.get('t',0)-base:>8} "
          f"{'—' if 't0' not in e else e['t0']-base:>8} {e.get('hold','—'):>6} "
          f"{str(e.get('key')):>5}  {e.get('name')}")

print()
print("=" * 92)
print("ⓐ t 的基准是什么？（第一条 click = 用户按下校准开始？）")
print("=" * 92)
print(f"  第 1 条 t   = {d[0]['t']}  (={d[0]['t']-d[0]['t']} 相对自身)")
print(f"  第 2 条 t   = {d[1]['t']}  相对第1条 = {d[1]['t']-d[0]['t']}ms")
print("  → t 是**绝对 Date.now() 毫秒**，不是相对时间！")
print("     脚本宏里的 dt 是后处理算的差值（t[i]-t[i-1]），lead 是 t[0]-录制开始")

print()
print("=" * 92)
print("ⓑ t0 只出现在 key 上，且 t0 == t？（_recordKey 里两个都是 Date.now()）")
print("=" * 92)
ks = [e for e in d if e.get('kind') == 'key']
same = sum(1 for e in ks if e.get('t0') == e.get('t'))
sentinel = [e.get('t0') for e in ks]
print(f"  key 条数 = {len(ks)}，t0==t 的 = {same}/{len(ks)}")
print(f"  前 5 个 t0 值 = {[x-base for x in sentinel[:5]]}")
print("  → t0 是 **_recordKey 创建时的时间戳**（与 t 同一行 Date.now()）")
print("     它的唯一用途：keyup 时算 hold = Date.now() - t0")
print("     ⚠ 但它**只对最后一个未释放的键生效**（this._pending 单槽位）")

print()
print("=" * 92)
print("ⓒ 致命缺口：_pending 单槽位 → 多键同按时 hold 丢失")
print("=" * 92)
print("   _onKeyDown → _recordKey → this._pending = step")
print("   _onKeyRelease → 用 this._pending 回填 hold")
print()
print("   场景：按 A（pending=A）→ 再按 B（pending=B，A 丢失引用）→ 松 A")
print("         → keyup A 时 p=this._pending=B，p.key!==e.key 且 p.code!==e.code → **直接 return，不记录**")
print("         → A 的 hold 永远停留在 0（初值）")
print()
# 统计真实录制里 hold 异常的键
print("   真实录制里的 hold=0 键（说明按下后没被正确回填）:")
for ff in sorted(glob.glob(os.path.join(REC, '**', '*秘境战斗*.json'), recursive=True)):
    dd = json.load(open(ff, encoding='utf-8'))
    if not isinstance(dd, list): continue
    kk = [e for e in dd if isinstance(e, dict) and e.get('kind') == 'key']
    if not kk: continue
    z = [(e.get('key'), e.get('hold')) for e in kk if (e.get('hold') or 0) == 0]
    if z:
        print(f"     {os.path.basename(ff)[:26]:28s} hold=0 的键: {z}")
