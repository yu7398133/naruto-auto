import json, io, re

CAL = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\b0\b0c7cb471b9b6843537f142e9e341dd09c663b34eb81f0922a0c7a7e67494170\naruto-calib-2026-09-21T06-35-52-351Z.json"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

d = json.load(io.open(CAL, encoding='utf-8'))
t0 = d[0]['t']
keys = [s for s in d if s.get('kind') == 'key']
first_dt = keys[0]['t'] - t0

print(f'录制首键相对开始: {first_dt}ms → 按用户口径丢弃，lead 改用 200ms')
print(f'按键数: {len(keys)}')

# 生成新宏：lead=200，dt 相对首键
steps = [{"kind": "lead", "ms": 200}]
for s in keys:
    steps.append({
        "kind": "key",
        "key": s["key"],
        "hold": int(s.get("hold") or 0),
        "dt": int(s["t"] - keys[0]["t"]),   # 相对首键
    })

print('\n=== 新 dufeng 宏 ===')
print('键序: ' + ''.join(x['key'] for x in keys))
print(json.dumps(steps, ensure_ascii=False))

# ── 写回 user.js ────────────────────────────────────────────────
src = io.open(SCRIPT, encoding='utf-8').read()
line_start = 'const SECRET_REALM_MACROS = '
i = src.index(line_start)
j = src.index('\n', i)
old_line = src[i:j]
macros = json.loads(old_line[len(line_start):].rstrip().rstrip(';'))
old_dufeng = macros['dufeng']
macros['dufeng'] = steps
new_line = line_start + json.dumps(macros, ensure_ascii=False, separators=(',', ':')) + ';'
src = src[:i] + new_line + src[j:]
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(src)

print(f"\n✓ 已替换 dufeng：{len([x for x in old_dufeng if x.get('kind')=='key'])} 键 → {len(keys)} 键")
print(f"  其他秘境未动: {[k for k in macros.keys()]}")
