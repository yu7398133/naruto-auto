from PIL import Image
import numpy as np
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape
print(f'尺寸 {w}x{h}')

CH = ' .:-=+*#%@'
def amap(x0, y0, x1, y1, cols=100, rows=28):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

print()
print('=== 全图概览 ===')
print(amap(0, 0, 1280, 720, cols=110, rows=30))
print()
print('=== 左下角 1/3：x 0~460, y 400~720 ===')
print(amap(0, 400, 460, 720, cols=92, rows=30))
