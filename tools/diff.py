from PIL import Image
import numpy as np
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

files = ['t0-prepare.jpg','t1.jpg','t2.jpg','t3.jpg','t4.jpg','t5.jpg','t6.jpg']
files = [f for f in files if os.path.exists(f)]

arrs = {}
for f in files:
    arrs[f] = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)

print('=== 帧间差异（相对 t0）===')
base = arrs['t0-prepare.jpg']
for f in files[1:]:
    d = np.abs(arrs[f] - base).mean(axis=2)
    print(f'  {f:14s} 平均差={d.mean():6.2f}  最大差={d.max():5.0f}  变化像素占比={(d>25).mean()*100:5.1f}%')

print()
print('=== t6 当前画面概览 x0~1280 y0~720 ===')
CH = ' .:-=+*#%@'
a = arrs['t6.jpg']
L = a.mean(axis=2)
rows, cols = 30, 110
ys = np.linspace(0, L.shape[0], rows+1).astype(int)
xs = np.linspace(0, L.shape[1], cols+1).astype(int)
for i in range(rows):
    print('  ' + ''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)))
