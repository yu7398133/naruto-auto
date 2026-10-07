#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sinceMs 基准改成「识别完成」后，各宏 lead 的实际效果。"""
import json, re

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
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

print(f"{'realm':>10} {'lead':>7} {'键数':>5}  键序列")
print("-" * 62)
for k, v in macros.items():
    lead = next((s['ms'] for s in v if s['kind'] == 'lead'), 0)
    keys = ''.join(s['key'] for s in v if s['kind'] == 'key')
    print(f"{k:>10} {lead:>7} {len(keys):>5}  {keys}")

print()
print("=" * 62)
print("⚠ sinceMs 改成「识别完成」后，lead 的语义变成：")
print("   「识别到名字后，再等 lead 毫秒才按第一个键」")
print()
print("   lieyan  lead=0     → 立即按键 ✓（符合用户口径）")
for k, v in macros.items():
    if k == 'lieyan': continue
    lead = next((s['ms'] for s in v if s['kind'] == 'lead'), 0)
    print(f"   {k:<8} lead={lead:<5} → 识别后还要等 {lead}ms 才开打")
print()
print("   这 6 个宏的 lead 原本是「点匹配→第一键」的录制间隔，")
print("   现在会被当成额外的等待 → **整体晚开打 lead 毫秒**。")
print()
print("   要不要一并置 0？取决于用户是否也要重录这 6 个秘境。")
