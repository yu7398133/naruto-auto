import io, sys, os, json, glob, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image, ImageChops
import statistics as st

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
names = ['落岩', '雷霆', '阴阳', '毒风', '水牢', '烈焰', '罡体', '落岩22', '阴阳22']
def load(n):
    return Image.open(os.path.join(OUT, 'settleback-%s.jpg' % n)).convert('L')

# 用一个足够大的搜索区域（覆盖所有录制的按钮 x 范围 112~146）
SR = (90, 645, 180, 700)   # 90x55
print('=== 搜索区域 %s，用落岩做模板，在各份里找最佳匹配 ===' % (SR,))
base = load('落岩')
tmpl = base.crop((112, 660, 134, 682))     # 22x22，以落岩实际按钮中心为中心的紧致模板
tw, th = tmpl.size
print('  模板 = 落岩 (112,660,134,682) %dx%d' % (tw, th))
tb = list(tmpl.getdata())

def best_in(im_g, region):
    x0, y0, x1, y1 = region
    best = (1e9, -1, -1)
    for y in range(y0, y1 - th):
        for x in range(x0, x1 - tw):
            c = im_g.crop((x, y, x + tw, y + th))
            px = list(c.getdata())
            s = sum(abs(a - b) for a, b in zip(tb, px)) / len(px)
            if s < best[0]:
                best = (s, x, y)
    return best

for n in names:
    s, x, y = best_in(load(n), SR)
    print('  %-8s 最佳 (x=%3d,y=%3d) 平均差=%.1f' % (n, x, y, s))

print()
print('=== 负样本：战斗中同一区域 ===')
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
p = [q for q in glob.glob(os.path.join(BASE, '**', '落岩秘境战斗.json'), recursive=True)][0]
d = json.load(open(p, encoding='utf-8'))
tmp = os.path.join(OUT, '_tmp_b.jpg')
cnt = 0
for s in d:
    if s.get('kind') == 'key' and s.get('frame'):
        open(tmp, 'wb').write(base64.b64decode(s['frame'].split(',', 1)[1]))
        g = Image.open(tmp).convert('L')
        sc, x, y = best_in(g, SR)
        print('  落岩宏 seq%-2s 最佳 (x=%3d,y=%3d) 平均差=%.1f' % (s['seq'], x, y, sc))
        cnt += 1
        if cnt >= 6: break
os.path.exists(tmp) and os.remove(tmp)
