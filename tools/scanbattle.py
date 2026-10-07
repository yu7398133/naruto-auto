import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = {
 '雷霆战斗': r'9d\9d6f4d6469294515e275bbe7291af13b9f03f34e6788aa22c7c0fb75829487be\雷霆秘境战斗.json',
 '烈焰战斗': r'4f\4f043c47ddbc88d13ec0263a5306be975c51e3c612f7c980c3e0f78e29b7a4e1\烈焰秘境战斗.json',
 '落岩战斗': r'35\352659c2cfd2ce028a12c0a549edcb025744f2a1edfd909797d7b09e4fba6413\落岩秘境战斗.json',
 '阴阳战斗': r'ac\ac140e27ae862a8ceba7aed81f7cd41fc30000a7843f8de0bf38ed335229ab41\阴阳秘境战斗.json',
 '水牢战斗': r'c9\c9da9c945895e39c3a31eee52eb5ff9dc2a4a7860073fdd01481a3c3839c4349\水牢秘境战斗.json',
 '毒风战斗': r'23\234aa296e5a3c842b4bf5fd70de22aab811df96a031cf23afcd8c24039c11f5c\毒风秘境战斗.json',
}

for name, rel in files.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        print(f'❌ {name}: 不存在'); continue
    arr = json.load(open(p, encoding='utf-8'))
    if not arr: print(f'⚠ {name}: 空'); continue
    print(f'\n=== {name}  {len(arr)} 步 ===')
    print('  键:', list(arr[0].keys()))
    # 时间跨度
    ts = [s.get('t') for s in arr if s.get('t')]
    if ts:
        dur = (max(ts) - min(ts)) / 1000.0
        print(f'  时长: {dur:.1f}s')
    # kind 分布
    kinds = {}
    for s in arr:
        k = s.get('kind')
        kinds[k] = kinds.get(k, 0) + 1
    print('  kind 分布:', kinds)
    # 前 12 步
    print('  前 12 步:')
    for s in arr[:12]:
        parts = []
        for k in ('seq','t','kind','name','x','y','key','hold','dt','scene'):
            if s.get(k) is not None: parts.append(f'{k}={s[k]}')
        print('    ' + '  '.join(parts))
