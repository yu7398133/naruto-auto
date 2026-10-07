import json, io, os, base64, glob

OUT = r'C:\Users\chenyu\dsh\火影忍者\battle-frames'
os.makedirs(OUT, exist_ok=True)

RECS = {
    'realm3': r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\e0\e047d67f98f7dcf6a20399d0637c68afd656a5cb010c91b58039fe02a971f38a\秘境探险3.json',
    'lieyan': r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\4f\4f043c47ddbc88d13ec0263a5306be975c51e3c612f7c980c3e0f78e29b7a4e1\烈焰秘境战斗.json',
    'leiting': r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\9d\9d6f4d6469294515e275bbe7291af13b9f03f34e6788aa22c7c0fb75829487be\雷霆秘境战斗.json',
    'luoyan': r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\35\352659c2cfd2ce028a12c0a549edcb025744f2a1edfd909797d7b09e4fba6413\落岩秘境战斗.json',
    'dufeng': r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\23\234aa296e5a3c842b4bf5fd70de22aab811df96a031cf23afcd8c24039c11f5c\毒风秘境战斗.json',
}

total = 0
for tag, p in RECS.items():
    if not os.path.exists(p):
        print(f'缺失 {tag}')
        continue
    d = json.load(io.open(p, encoding='utf-8'))
    arr = d if isinstance(d, list) else d.get('items', [])
    n = 0
    for it in arr:
        fr = it.get('frame')
        if not fr:
            continue
        # 只导出战斗相关帧：有按键的、或 scene 为 popup/other 且有键
        k = it.get('key')
        if not k:
            continue
        b64 = fr.split(',', 1)[-1]
        fn = os.path.join(OUT, f'{tag}_s{it.get("seq"):03d}_{str(k).strip() or "sp"}.jpg')
        with open(fn, 'wb') as f:
            f.write(base64.b64decode(b64))
        n += 1
    total += n
    print(f'{tag}: 导出 {n} 帧（共 {len(arr)} 帧）')

print('\n合计导出', total, '到', OUT)
