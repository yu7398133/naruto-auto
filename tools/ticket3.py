from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)
CH = ' .:-=+*#%@'

def amap(x0, y0, x1, y1, cols=130, rows=16):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

print('=== 整行细看 x 30~600 / y 414~470  (cols=130 → 每字符≈4.4px) ===')
print(amap(30, 414, 600, 470, cols=130, rows=18))

print()
print('=== 找「金色/黄色」像素（数字常用色）—— 整幅图的含金区 Top 区块 ===')
r, g, b = a[:,:,0], a[:,:,1], a[:,:,2]
L = a.mean(axis=2)
gold = (r > 180) & (g > 140) & (b < 150) & (r - b > 60) & (L > 130)
ys, xs = np.where(gold)
print(f'  金色像素总数={len(xs)}')
# 按行聚类找数字所在行
from collections import Counter
rowc = Counter((ys // 10) * 10)
top = sorted(rowc.items(), key=lambda kv: -kv[1])[:12]
print('  含金最多的行区间:')
for y, n in top:
    sel = xs[(ys // 10) * 10 == y]
    print(f'    y {y}~{y+9}: {n:5d} 个  x范围 {sel.min()}~{sel.max()}')

print()
print('=== 白色文字块后紧跟的内容：x 250~560 细看 ===')
print(amap(250, 414, 560, 470, cols=124, rows=18))
