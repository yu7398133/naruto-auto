from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)

y0, y1 = 405, 480
sub = a[y0:y1, :, :]
L = sub.mean(axis=2)
bright = L > 150
colcnt = bright.sum(axis=0)

# 连通块（允许 3px 间隙）
runs = []
cur = None
gap = 0
for x in range(1280):
    if colcnt[x] >= 2:
        if cur is None: cur = x
        gap = 0
    else:
        if cur is not None:
            gap += 1
            if gap >= 4:
                runs.append((cur, x - gap))
                cur = None
if cur is not None: runs.append((cur, 1279))

print(f'=== y {y0}~{y1} 内所有亮块（不分颜色，亮度>150）===')
for x0, x1 in runs:
    w = x1 - x0 + 1
    if w < 4: continue
    block = sub[:, x0:x1+1]
    bl = block.reshape(-1, 3)
    m = bl.mean(axis=1) > 150
    br = bl[m]
    if len(br) == 0: continue
    r, g, b = br[:,0].mean(), br[:,1].mean(), br[:,2].mean()
    sat = np.maximum(np.maximum(r,g),b) - np.minimum(np.minimum(r,g),b)
    # 竖直范围
    rows = np.where(sub[:, x0:x1+1].mean(axis=2) > 150)[0]
    ry0, ry1 = (rows.min()+y0, rows.max()+y0) if len(rows) else (0,0)
    print(f'  x {x0:4d}~{x1:4d} 宽{w:3d}  y {ry0}~{ry1} 高{ry1-ry0+1:2d}  亮部RGB=({r:3.0f},{g:3.0f},{b:3.0f})  饱和{sat:5.1f}  像素{len(br):4d}')
