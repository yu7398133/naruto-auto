#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""水牢宏末尾追加「i 之后 0.2s，长按 j 0.5s」。

用户口径（2026-09-21 实跑 13:04:29）：
  「水牢自定义战斗脚本需要修改，战斗最后 i 之后 0.2s，增加长按 j 0.5s，
    然后自定义战斗脚本才算结束」

dt 计算：dt 是「距上一键**按下**」的间隔（buildKeyTimeline 里 abs += dt）。
  上一键 i: dt=980, hold=594  →  按下于 T，松开于 T+594
  新键 j 要「i 之后 0.2s」按下 →  从 i 按下算 = ?
  用户说的「i 之后」应指 i **松开**之后 → j 按下 = T + 594 + 200 = T + 794
"""
import json, os, shutil, datetime, io

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
GAP_AFTER_I = 200     # 用户口径 0.2s
J_HOLD = 500          # 用户口径 长按 0.5s

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
# ⚠ 这个宏声明**没有分号**（靠 ASI 断句）：`...}]}` 之后直接换行接
#   `const SECRET_REALM_NAME_TEMPLATES`。所以 end 就停在 `}` 之后，
#   拼接时必须用 src[end:]（含换行）。写成 src[end+1:] 会吃掉 '\n' →
#   两句粘成 `}const ...` → SyntaxError（0.6.03 踩过，从备份恢复过一次）。

macros = json.loads(src[brace:end])
sl = macros['shuilao']
last = [s for s in sl if s['kind'] == 'key'][-1]
assert last['key'] == 'i', f"水牢末键是 {last['key']}，不是 i"

# 幂等：若末尾已是 j(500) 就不重复加
if not (sl[-1]['kind'] == 'key' and sl[-1]['key'] == 'j' and sl[-1]['hold'] == J_HOLD):
    new_dt = last['hold'] + GAP_AFTER_I
    sl.append({'kind': 'key', 'key': 'j', 'hold': J_HOLD, 'dt': new_dt})
    print(f"追加: j hold={J_HOLD} dt={new_dt}  (= i 的 hold {last['hold']} + {GAP_AFTER_I})")
else:
    print("已是目标形态，跳过")

new_js = json.dumps(macros, ensure_ascii=False, separators=(',', ':'))
out = src[:brace] + new_js + src[end:]
assert json.loads(new_js) == macros

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-shuilao-append.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(out)

print("\n水牢宏最终形态：")
for s in macros['shuilao']:
    if s['kind'] == 'lead':
        print(f"  lead {s['ms']}ms")
    else:
        print(f"  {s['key']}  dt={s['dt']:<6} hold={s['hold']}")
tot = sum(s.get('dt', 0) for s in macros['shuilao'])
print(f"  跨度 {tot}ms")
