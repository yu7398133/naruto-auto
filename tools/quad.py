from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)

CH = ' .:-=+*#%@'
def amap(x0, y0, x1, y1, cols=120, rows=30):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

print('=== 左下象限 x 0~640 / y 360~720 ===')
print(amap(0, 360, 640, 720, cols=120, rows=32))

print()
print('=== 左下象限内所有亮块 (亮度>145) ===')
sub = a[360:720, 0:640]
L = sub.mean(axis=2)
bright = L > 145
# 连通域（简易：按列投影+行投影找）
cols = bright.sum(axis=0)
runs = []
cur = None; gap = 0
for x in range(640):
    if cols[x] >= 2:
        if cur is None: cur = x
        gap = 0
    else:
        if cur is not None:
            gap += 1
            if gap >= 5:
                runs.append((cur, x-gap)); cur = None
if cur is not None: runs.append((cur, 639))
for x0, x1 in runs:
    w = x1-x0+1
    if w < 4: continue
    band = sub[:, x0:x1+1]
    rows = np.where(band.mean(axis=1) > 145)[0]
    if len(rows)==0: continue
    ry0, ry1 = rows.min()+360, rows.max()+360
    px = band.reshape(-1,3); m = px.mean(axis=1)>145; br=px[m]
    r,g,b = br[:,0].mean(), br[:,1].mean(), br[:,2].mean()
    sat = max(r,g,b)-min(r,g,b)
    print(f'  x {x0:4d}~{x1:4d} 宽{w:3d}  y {ry0:3d}~{ry1:3d} 高{ry1-ry0+1:3d}  RGB=({r:3.0f},{g:3.0f},{b:3.0f}) 饱和{sat:5.1f} n={len(br):4d}')
