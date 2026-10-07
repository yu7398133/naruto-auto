import json, os, base64, sys, io
from PIL import Image
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'

# 阴阳秘境战斗2（以另一个为准）→ 券应为 6
p = os.path.join(SRC, r'83\838a5035ec85fb0fd2192287f713c4621213af5b3b3f2f1ef399f105b7d5eb11\阴阳秘境战斗2（以另一个为准）.json')
arr = json.load(open(p, encoding='utf-8'))
s0 = arr[0]
raw = s0.get('frame', '')
b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
data = base64.b64decode(b)
fp = os.path.join(OUT, '阴阳2-prepare.jpg')
open(fp, 'wb').write(data)
print('已存 %s (%s B), 首步 click=(%s,%s), 共%d步' % (fp, format(len(data), ','), s0.get('x'), s0.get('y'), len(arr)))
