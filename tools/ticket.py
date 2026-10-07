from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)

CH = ' .:-=+*#%@'
def amap(x0, y0, x1, y1, cols=110, rows=20):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

print('=== 那一行放大：x 20~320, y 420~465 ===')
print(amap(20, 420, 320, 465, cols=120, rows=18))

# 逐列统计白色像素（找文字的水平边界）
print()
print('=== 白色像素水平分布（y 420~465）===')
sub = a[420:465, :]
L = sub.mean(axis=2)
# "白"=亮且低饱和
r, g, b = sub[:,:,0], sub[:,:,1], sub[:,:,2]
white = (L > 175) & ((np.maximum(np.maximum(r,g),b) - np.minimum(np.minimum(r,g),b)) < 60)
colcnt = white.sum(axis=0)
runs = []
cur = None
for x in range(1280):
    if colcnt[x] >= 2:
        if cur is None: cur = x
    else:
        if cur is not None:
            if x - cur >= 3: runs.append((cur, x-1, int(colcnt[cur:x].sum())))
            cur = None
if cur is not None: runs.append((cur, 1279, int(colcnt[cur:].sum())))
print('  连续白字块（x0, x1, 像素数）:')
for r0, r1, n in runs:
    print(f'    x {r0:4d} ~ {r1:4d}   宽{r1-r0+1:3d}  像素{n}')
