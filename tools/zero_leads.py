#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把所有宏的 lead 置 0（用户口径：识别到秘境名后立即执行按键）。"""
import json, os, sys, shutil, datetime, io

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
end = i + 1

macros = json.loads(src[brace:end])
before = {k: next((s['ms'] for s in v if s['kind'] == 'lead'), None) for k, v in macros.items()}

for k, v in macros.items():
    for s in v:
        if s['kind'] == 'lead':
            s['ms'] = 0
    if not any(s['kind'] == 'lead' for s in v):
        v.insert(0, {'kind': 'lead', 'ms': 0})

new_js = json.dumps(macros, ensure_ascii=False, separators=(',', ':'))
out = src[:brace] + new_js + src[end + 1:]

assert json.loads(new_js) == macros

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-lead-zero.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(out)

print("✓ 全部 lead 置 0")
print(f"{'realm':>10} {'旧lead':>8} → 0")
for k, v in macros.items():
    n = len([s for s in v if s['kind'] == 'key'])
    print(f"{k:>10} {before[k]:>8} → 0   ({n} 键)")
print(f"\n备份: {os.path.basename(bak)}")
