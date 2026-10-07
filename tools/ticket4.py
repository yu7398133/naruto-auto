from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)
CH = ' .:-=+*#%@'

def amap(x0, y0, x1, y1, cols=140, rows=20):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

# 放大单个疑似字/数字：thr-hold 高对比
def big(x0, y0, x1, y1, cols=100, rows=28, thr=140):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    out = []
    for i in range(rows):
        row = ''
        for j in range(cols):
            v = L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()
            row += '#' if v >= thr else ('.' if v >= thr*0.55 else ' ')
        out.append(row)
    return '\n'.join(out)

print('=== 白字每个字块单独放大（二层 Colony, thr=140）===')
blocks = [(37,55),(60,77),(83,100),(105,123),(127,146),(149,168),(172,190),(196,213),(217,236),(241,258)]
for i,(x0,x1) in enumerate(blocks):
    print(f'--- 第{i+1}块 x{x0}~{x1} ---')
    print(big(x0, 414, x1, 470, cols=24, rows=22, thr=150))
    print()
