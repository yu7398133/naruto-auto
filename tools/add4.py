import json, os, base64, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'

p = os.path.join(SRC, r'b1\b1b064f8cec72996fc14d1aef1f39074b17d9c17088ea825d3e3cc96e8468f6c\落岩秘境战斗2（以前一个为准）.json')
arr = json.load(open(p, encoding='utf-8'))
s0 = arr[0]
raw = s0.get('frame', '')
b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
data = base64.b64decode(b)
fp = os.path.join(OUT, '落岩2-prepare.jpg')
open(fp, 'wb').write(data)
print('已存 %s (%s B), 首步 click=(%s,%s), 共%d步' % (fp, format(len(data), ','), s0.get('x'), s0.get('y'), len(arr)))
