import io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image, ImageChops
import statistics as st

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
names = ['落岩', '雷霆', '阴阳', '毒风', '水牢', '烈焰', '罡体', '落岩22', '阴阳22']

def load(n):
    return Image.open(os.path.join(OUT, 'settleback-%s.jpg' % n)).convert('L')

# ── 1) 按钮框 [110,654,134,678] 是录制工具给的 area，验证 9 份在该处是否同款 ──
print('=== 1) 录制 area 内的像素一致性（以落岩为基准）===')
base = load('落岩').crop((110, 654, 134, 678))
print('  基准 = 落岩 (110,654,134,678)')
for n in names[1:]:
    im = load(n).crop((110, 654, 134, 678))
    diff = ImageChops.difference(base, im)
    px = list(diff.getdata())
    print('  %-8s 平均差=%.1f 最大差=%d 不同像素=%d/%d' % (
        n, st.mean(px), max(px), sum(1 for v in px if v > 30), len(px)))

# ── 2) 战斗帧里这个位置是什么？用宏期间的帧做「负样本」 ──
print()
print('=== 2) 负样本：战斗中的同一位置（应明显不同）===')
import json, glob, base64
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
# 落岩录制的 seq7（最后一个宏按键，战斗中）
d = json.load(open([p for p in glob.glob(os.path.join(BASE, '**', '落岩秘境战斗.json'), recursive=True)][0], encoding='utf-8'))
for s in d:
    if s.get('kind') == 'key' and s.get('frame'):
        b64 = s['frame'].split(',', 1)[1]
        tmp = os.path.join(OUT, '_tmp_battle.jpg')
        open(tmp, 'wb').write(base64.b64decode(b64))
        im_b = Image.open(tmp).convert('L').crop((110, 654, 134, 678))
        diff = ImageChops.difference(base, im_b)
        px = list(diff.getdata())
        print('  战斗帧(落岩 seq%s) 平均差=%.1f 最大差=%d 不同像素=%d/%d' % (
            s['seq'], st.mean(px), max(px), sum(1 for v in px if v > 30), len(px)))
        os.remove(tmp)
        break
