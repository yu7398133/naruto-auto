import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'

# 用户标注：落岩/阴阳各2份，取「前一个」/「另一个」= 即不带"2"的那份
files = {
 'leiting':  ('雷霆', r'9d\9d6f4d6469294515e275bbe7291af13b9f03f34e6788aa22c7c0fb75829487be\雷霆秘境战斗.json'),
 'lieyan':   ('烈焰', r'4f\4f043c47ddbc88d13ec0263a5306be975c51e3c612f7c980c3e0f78e29b7a4e1\烈焰秘境战斗.json'),
 'luoyan':   ('落岩', r'35\352659c2cfd2ce028a12c0a549edcb025744f2a1edfd909797d7b09e4fba6413\落岩秘境战斗.json'),
 'yinyang':  ('阴阳', r'ac\ac140e27ae862a8ceba7aed81f7cd41fc30000a7843f8de0bf38ed335229ab41\阴阳秘境战斗.json'),
 'shuilao':  ('水牢', r'c9\c9da9c945895e39c3a31eee52eb5ff9dc2a4a7860073fdd01481a3c3839c4349\水牢秘境战斗.json'),
 'dufeng':   ('毒风', r'23\234aa296e5a3c842b4bf5fd70de22aab811df96a031cf23afcd8c24039c11f5c\毒风秘境战斗.json'),
}

out = {}
for key, (cn, rel) in files.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p): print(f'❌ {cn}'); continue
    arr = json.load(open(p, encoding='utf-8'))
    keys = [s for s in arr if s.get('kind') == 'key']
    clicks = [s for s in arr if s.get('kind') == 'click']
    if not keys: print(f'⚠ {cn}: 无按键'); continue

    t0 = keys[0]['t']
    t_match = clicks[0]['t'] if clicks else t0
    t_last = arr[-1]['t']
    macro = []
    prev = t0
    for s in keys:
        dt = s['t'] - prev
        prev = s['t']
        macro.append({'kind': 'key', 'key': s['key'], 'hold': s.get('hold', 0), 'dt': int(round(dt))})
    macro[0]['dt'] = 0

    macro_dur = (keys[-1]['t'] + keys[-1].get('hold', 0) - t0) / 1000.0
    gap_to_settle = (clicks[1]['t'] - keys[-1]['t']) / 1000.0 if len(clicks) > 1 else -1
    out[key] = macro
    print(f'\n=== {cn} ({key}) ===')
    print(f'  匹配→首键: {(t0-t_match)/1000.0:.1f}s   宏时长: {macro_dur:.1f}s   末键→结算1: {gap_to_settle:.1f}s   总: {(t_last-t_match)/1000.0:.1f}s')
    print(f'  按键序列: ' + ''.join(f"{m['key']}({m['hold']})" + (f"+{m['dt']}ms " if m['dt'] else ' ') for m in macro))

# 输出 JS
print('\n\n===== 生成的 JS =====')
print('const SECRET_REALM_MACROS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';')
open(r'C:\Users\chenyu\dsh\火影忍者\tools\macros.json', 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('\n已存 tools/macros.json')
