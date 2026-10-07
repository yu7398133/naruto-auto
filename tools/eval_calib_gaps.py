#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校准器最终评估：列出与宏回放直接相关的缺口，每条附真实数据证据。"""
import json, glob, os

REC = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
files = [f for f in glob.glob(os.path.join(REC, '**', '*秘境战斗*.json'), recursive=True)]

print("=" * 88)
print("缺口① hold 丢失率（_pending 单槽位被覆盖）")
print("=" * 88)
tot = lost = 0
for f in sorted(files, key=os.path.basename):
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list): continue
    ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
    if not ks: continue
    # 判定：hold==0 但「其后 60ms 内有下一个键」且「该键本身不是最后一个」
    z = sum(1 for i, e in enumerate(ks[:-1])
            if (e.get('hold') or 0) == 0 and ks[i+1]['t0'] - e['t0'] < 60)
    # 另一个判据：hold==0 且 后面还有键 且 间隔 < 200ms（快速连击区）
    z2 = sum(1 for i, e in enumerate(ks[:-1])
             if (e.get('hold') or 0) == 0 and ks[i+1]['t0'] - e['t0'] < 200)
    tot += len(ks); lost += z2
    print(f"  {os.path.basename(f)[:28]:30s} 键{len(ks):3d}  hold=0 {sum(1 for e in ks if (e.get('hold') or 0)==0):3d}  其中紧随<200ms {z2:3d}")
print(f"\n  合计 {tot} 键，疑似被覆盖丢 hold 的 {lost} 个（{lost*100//max(1,tot)}%）")

print()
print("=" * 88)
print("缺口② 录制无 keyup 时间戳 → 无法还原「真实的按住窗口」")
print("=" * 88)
f = next(x for x in files if os.path.basename(x) == '烈焰秘境战斗.json')
d = json.load(open(f, encoding='utf-8'))
ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
print("  录制字段只有 t（按下时刻）+ hold（时长，且常丢）；**没有 keyup 的 t**")
print("  宏回放需要的却是 (按下时刻, 抬起时刻)：")
print()
print(f"  {'键':>4} {'按下t':>8} {'hold':>6} {'抬起t':>8}   能否还原")
for e in ks[:6] + ks[-2:]:
    t = e['t0'] - ks[0]['t0']
    h = e.get('hold') or 0
    ok = '✅' if h > 0 else '❌ hold=0，抬起时刻未知（宏按 60ms 兜底）'
    print(f"  {e['key']:>4} {t:>8} {h:>6} {t+h:>8}   {ok}")

print()
print("=" * 88)
print("缺口③ 点击/拖动没有 duration 一致性；drag 的 hold 从鼠标事件算，click 没有")
print("=" * 88)
for f in sorted(files, key=os.path.basename)[:4]:
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list): continue
    cs = [e for e in d if isinstance(e, dict) and e.get('kind') == 'click']
    ds = [e for e in d if isinstance(e, dict) and e.get('kind') == 'drag']
    print(f"  {os.path.basename(f)[:28]:30s} click={len(cs)} drag={len(ds)}  "
          f"click字段={sorted(set(k for c in cs for k in c if k!='frame'))}")

print()
print("=" * 88)
print("缺口④ 场景(scene)标注不准 —— 秘境录制 scene 全是 other/popup，无 battle")
print("=" * 88)
allscene = {}
for f in files:
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list): continue
    for e in d:
        if isinstance(e, dict):
            allscene[e.get('scene')] = allscene.get(e.get('scene'), 0) + 1
print(f"  10 份战斗录制的 scene 分布: {allscene}")
print("  → 战斗中的键也标 other，说明 SceneDetector 在战斗里识别不出（预料之中）")
print("     影响：录制产物无法用于「按场景自动分段」，也无法验证回放时场景对不对")
