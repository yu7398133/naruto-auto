#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一 lead：默认 200ms，雷霆单独 5000ms。

用户口径（2026-09-21）：
  · 「lead还是需要，不然会把第一个按键吃掉，统一建议0.2s」
  · 「雷霆秘境特别修改一下lead改为5s」
"""
import json, os, shutil, datetime, io

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
DEFAULT_LEAD = 200
OVERRIDE = {'leiting': 5000}

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
    lead = OVERRIDE.get(k, DEFAULT_LEAD)
    for s in v:
        if s['kind'] == 'lead':
            s['ms'] = lead
            break
    else:
        v.insert(0, {'kind': 'lead', 'ms': lead})

new_js = json.dumps(macros, ensure_ascii=False, separators=(',', ':'))
out = src[:brace] + new_js + src[end + 1:]
assert json.loads(new_js) == macros

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-lead200.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(out)

TARGETS = ['luoyan', 'dufeng', 'leiting', 'lieyan', 'shuilao']
print("✓ lead 已设置（打 √ = 实际会打的目标）")
print(f"{'realm':>10} {'旧':>7} → {'新':>6}   {'':>3} 键序列")
for k, v in macros.items():
    ks = ''.join(s['key'] for s in v if s['kind'] == 'key')
    mark = '√' if k in TARGETS else '✗跳过'
    print(f"{k:>10} {before[k]:>7} → {OVERRIDE.get(k, DEFAULT_LEAD):>6}   {mark:>5} {ks}")
print(f"\n备份: {os.path.basename(bak)}")
