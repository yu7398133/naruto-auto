#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用新烈焰录制替换脚本里的 lieyan 宏，lead 置 0（用户口径：识别到名字立即按键）。"""
import json, re, io, sys, shutil, datetime, os

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
NEW = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\dd\dd64b0f69ace201809c5d6d153a5f705049b4373fbaec96627ecbd2b6e9684c2\烈焰秘境.json"

d = json.load(open(NEW, encoding='utf-8'))
base = d[0]['t']
keys = [{'key': e['key'], 'hold': e.get('hold') or 0, 't': (e.get('t0') or e.get('t')) - base}
        for e in d if e.get('kind') == 'key']

macro = [{'kind': 'lead', 'ms': 0}]        # ← 用户口径：识别到秘境名后立即按键
prev = None
for k in keys:
    dt = 0 if prev is None else k['t'] - prev
    macro.append({'kind': 'key', 'key': k['key'], 'hold': k['hold'], 'dt': dt})
    prev = k['t']

new_js = json.dumps(macro, ensure_ascii=False, separators=(',', ':'))

src = open(SCRIPT, encoding='utf-8').read()
# 定位 SECRET_REALM_MACROS = { ... }; 里 "lieyan":[...] 这一段（到下一个 "xxx": 或结尾）
start = src.index('const SECRET_REALM_MACROS = ')
brace = src.index('{', start)
# 找匹配的收尾 '};'
i, depth = brace, 0
while i < len(src):
    if src[i] == '{': depth += 1
    elif src[i] == '}':
        depth -= 1
        if depth == 0: break
    i += 1
end = src.index(';', i) + 1
block = src[brace:end]

m = re.search(r'"lieyan":(\[.*?\])(?=,"|\}$)', block, re.S)
if not m:
    print('✗ 没找到 lieyan 段'); sys.exit(1)
old_seg = m.group(1)
old_obj = json.loads(old_seg)

block2 = block[:m.start(1)] + new_js + block[m.end(1):]
out = src[:brace] + block2 + src[end:]

# 校验：能解析回来且等于新宏
m2 = re.search(r'"lieyan":(\[.*?\])(?=,"|\}$)', block2, re.S)
got = json.loads(m2.group(1))
assert got == macro, '回读不一致'

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-lieyan-replace.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(out)

print(f'✓ lieyan 已替换')
print(f'  旧: lead={old_obj[0]["ms"]}  {len(old_obj)-1} 键  ' +
      ''.join(s['key'] for s in old_obj if s['kind'] == 'key'))
print(f'  新: lead={macro[0]["ms"]}  {len(macro)-1} 键  ' + ''.join(s['key'] for s in macro if s['kind'] == 'key'))
print(f'  备份: {os.path.basename(bak)}')
