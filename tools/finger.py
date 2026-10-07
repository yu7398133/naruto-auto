from PIL import Image
import numpy as np
import sys, io, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

REG = (30, 415, 270, 490)   # x0,y0,x1,y1  白字区

def fp(path):
    a = np.asarray(Image.open(path).convert('L')).astype(np.float32) / 255.0
    x0, y0, x1, y1 = REG
    return a[y0:y1, x0:x1]

def onepx(path, thr=0.72):
    s = fp(path)
    out = []
    H, W = s.shape
    for i in range(H):
        out.append(''.join('#' if s[i, j] >= thr else ('+' if s[i, j] >= 0.55 else '.') for j in range(W)))
    return out

files = [f for f in ['nav-05.jpg', 'nav-06.jpg', 'nav-07.jpg', 'after1.jpg', 'after2.jpg'] if os.path.exists(f)]
print('可用帧:', files)
for f in files:
    print(f'\n===== {f}  (x{REG[0]}~{REG[2]}, y{REG[1]}~{REG[3]}) =====')
    for line in onepx(f)[::2]:
        print('  ' + line)
