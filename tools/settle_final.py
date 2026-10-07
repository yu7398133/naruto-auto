import io, sys, os, json, glob, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image
import statistics as st

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
names = ['落岩', '雷霆', '阴阳', '毒风', '水牢', '烈焰', '罡体', '落岩22', '阴阳22']
load = lambda n: Image.open(os.path.join(OUT, 'settleback-%s.jpg' % n)).convert('L')

# 模板取大一点（含按钮外框），以落岩的返回点 (122,666) 为中心
TX0, TY0, TX1, TY1 = 105, 653, 141, 685    # 36x32
tmpl = load('落岩').crop((TX0, TY0, TX1, TY1))
tw, th = tmpl.size
tb = list(tmpl.getdata())
print('模板 %s (%d,%d,%d,%d) %dx%d' % ('落岩', TX0, TY0, TX1, TY1, tw, th))

SR = (85, 640, 190, 705)
def best(im_g):
    x0, y0, x1, y1 = SR
    b = (1e9, -1, -1)
    for y in range(y0, y1 - th):
        for x in range(x0, x1 - tw):
            c = im_g.crop((x, y, x + tw, y + th))
            px = list(c.getdata())
            s = sum(abs(a - b) for a, b in zip(tb, px)) / len(px)
            if s < b[0]:
                b = (s, x, y)
    return b

print()
print('=== 正样本（9 份结算帧）===')
pos = []
for n in names:
    s, x, y = best(load(n))
    pos.append(s)
    print('  %-8s 差=%6.2f  位置(%3d,%3d)' % (n, s, x, y))

print()
print('=== 负样本（落岩宏全部 6 个按键帧）===')
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
p = [q for q in glob.glob(os.path.join(BASE, '**', '落岩秘境战斗.json'), recursive=True)][0]
tmp = os.path.join(OUT, '_t.jpg')
neg = []
for s in json.load(open(p, encoding='utf-8')):
    if s.get('kind') == 'key' and s.get('frame'):
        open(tmp, 'wb').write(base64.b64decode(s['frame'].split(',', 1)[1]))
        sc, x, y = best(Image.open(tmp).convert('L'))
        neg.append(sc)
        print('  seq%-3s 差=%6.2f  位置(%3d,%3d)' % (s['seq'], sc, x, y))
os.remove(tmp)

print()
print('=== 结论 ===')
print('  正样本: min=%.1f  max=%.1f' % (min(pos), max(pos)))
print('  负样本: min=%.1f  max=%.1f' % (min(neg), max(neg)))
lo, hi = max(pos), min(neg)
print('  分离区间: (%.1f, %.1f)  宽度=%.1f' % (lo, hi, hi - lo))
print('  → 建议阈值 %.0f（距两侧各 %.1f / %.1f）' % ((lo + hi) / 2, (lo + hi) / 2 - lo, hi - (lo + hi) / 2))
