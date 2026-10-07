#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""雷霆专用：去掉开头的「点出战」k，从 j 起算，lead = 出战→开打的间隔。

用户口径（2026-09-21）：
  · 第 1 条 k(t=0,hold=52) 是「点击出战」，不是战斗操作 → 删
  · 战斗从 j 那个按键开始
  · 录制已含缓冲，战斗从 j 开始
"""
import json, os, re, shutil, datetime, io

NEW = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\6b\6b128435ea33b77e549bd34e9646b87d392859189a88a66272ea614a48b35b\雷霆秘境.json"
NEW = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\6b\6b128435ea33b77e5da49bd34e9646b87d392859189a88a66272ea614a48b35b\雷霆秘境.json"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

d = json.load(open(NEW, encoding='utf-8'))
base = d[0]['t']
allkeys = [{'seq': e['seq'], 'key': e['key'], 'hold': e.get('hold') or 0,
            't': (e.get('t0') or e.get('t')) - base} for e in d if e.get('kind') == 'key']

# 去掉开头的「点出战」k（用户明确说：k 是点击出战的，那不是战斗的，从 j 开始）
first_j = next(i for i, k in enumerate(allkeys) if k['key'] == 'j')
dropped = allkeys[:first_j]
keys = allkeys[first_j:]

# lead = 0：用户口径（2026-09-21）「改成 lead=0，识别后立即按 j」。
#   那 10.6s 在录制里确实是「出战动画 → 开打」的间隔，但用户判断识别本身
#   已经花掉几秒（要等进入战斗才看得见秘境名），所以不必再等 —— 立即打。
lead = 0

print("丢弃的步骤（点出战）:")
for k in dropped:
    print(f"  seq{k['seq']} {k['key']} t={k['t']} hold={k['hold']}")
print(f"\n保留 {len(keys)} 键，lead={lead}ms（出战→开打间隔）")
print("  " + ' '.join(f"{k['key']}({k['hold']})" for k in keys))

macro = [{'kind': 'lead', 'ms': lead}]
prev = None
for k in keys:
    dt = 0 if prev is None else k['t'] - prev
    macro.append({'kind': 'key', 'key': k['key'], 'hold': k['hold'], 'dt': dt})
    prev = k['t']

new_js = json.dumps(macro, ensure_ascii=False, separators=(',', ':'))

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
end = src.index(';', i) + 1
block = src[brace:end]

m = re.search(r'"leiting":(\[.*?\])(?=,"|\}$)', block, re.S)
if not m:
    print('✗ 没找到 leiting 段'); raise SystemExit(1)
old_obj = json.loads(m.group(1))

block2 = block[:m.start(1)] + new_js + block[m.end(1):]
out = src[:brace] + block2 + src[end:]

m2 = re.search(r'"leiting":(\[.*?\])(?=,"|\}$)', block2, re.S)
assert json.loads(m2.group(1)) == macro, '回读不一致'

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-leiting-replace.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(out)

print(f"\n✓ leiting 已替换")
print(f"  旧: lead={old_obj[0]['ms']} {len(old_obj)-1} 键 " +
      ' '.join(s['key'] for s in old_obj if s['kind'] == 'key'))
print(f"  新: lead={macro[0]['ms']} {len(macro)-1} 键 " +
      ' '.join(s['key'] for s in macro if s['kind'] == 'key'))
print(f"  备份: {os.path.basename(bak)}")
