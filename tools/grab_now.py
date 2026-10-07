import json, os, base64, sys, io, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
os.makedirs(OUT, exist_ok=True)
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'

# 1) 从战斗录制 seq1（点匹配前 = 准备界面）提取准备界面帧
files = {
 '雷霆': r'9d\9d6f4d6469294515e275bbe7291af13b9f03f34e6788aa22c7c0fb75829487be\雷霆秘境战斗.json',
 '烈焰': r'4f\4f043c47ddbc88d13ec0263a5306be975c51e3c612f7c980c3e0f78e29b7a4e1\烈焰秘境战斗.json',
 '落岩': r'35\352659c2cfd2ce028a12c0a549edcb025744f2a1edfd909797d7b09e4fba6413\落岩秘境战斗.json',
 '阴阳': r'ac\ac140e27ae862a8ceba7aed81f7cd41fc30000a7843f8de0bf38ed335229ab41\阴阳秘境战斗.json',
 '水牢': r'c9\c9da9c945895e39c3a31eee52eb5ff9dc2a4a7860073fdd01481a3c3839c4349\水牢秘境战斗.json',
 '毒风': r'23\234aa296e5a3c842b4bf5fd70de22aab811df96a031cf23afcd8c24039c11f5c\毒风秘境战斗.json',
}
print('=== 提取准备界面帧（seq1，点匹配前）===')
for n, rel in files.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p): print(f'  ❌ {n}'); continue
    arr = json.load(open(p, encoding='utf-8'))
    s = arr[0]
    raw = s.get('frame', '')
    b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
    data = base64.b64decode(b)
    fp = os.path.join(OUT, f'{n}-prepare.jpg')
    open(fp, 'wb').write(data)
    print(f'  {n}: {len(data):,} bytes, click=({s.get("x")},{s.get("y")}) → {fp}')
