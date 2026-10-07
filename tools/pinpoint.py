from PIL import Image
import numpy as np, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\tickets'
fs = sorted(glob.glob(D + r'\naruto-shot-*.png'))
imgs = [np.asarray(Image.open(f).convert('RGB')).astype(np.float32) for f in fs]

# 只看已确认的差异区 y600~750, x20~400
Y0, Y1, X0, X1 = 600, 750, 20, 400
subs = [a[Y0:Y1, X0:X1] for a in imgs]

# 累积最大差异（任意两张间）
acc = np.zeros((Y1-Y0, X1-X0), np.float32)
for i in range(len(subs)):
    for j in range(i+1, len(subs)):
        acc = np.maximum(acc, np.abs(subs[i] - subs[j]).max(axis=2))

print(f'区 {X1-X0}x{Y1-Y0}，累积最大差异')
print(f'max={acc.max():.0f} mean={acc.mean():.1f}')

# 逐行看差异强度（细到 2px）
print('\n=== 逐行差异（每 2px，找数字所在行）===')
for y in range(0, Y1-Y0, 2):
    v = acc[y:y+2].mean()
    bar = '#' * int(min(v, 150) / 3)
    mark = ' <<<' if v > 70 else ''
    print(f'  y{Y0+y:4d} {v:6.1f} |{bar}{mark}')

# 逐列
print('\n=== 逐列差异（每 4px，找数字所在列）===')
for x in range(0, X1-X0, 4):
    v = acc[:, x:x+4].mean()
    bar = '#' * int(min(v, 150) / 3)
    mark = ' <<<' if v > 70 else ''
    print(f'  x{X0+x:4d} {v:6.1f} |{bar}{mark}')
