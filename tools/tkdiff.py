from PIL import Image
import numpy as np, glob, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\tickets'
fs = sorted(glob.glob(D + r'\*.png'))
imgs = []
for f in fs:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    imgs.append((f.split('\\')[-1], a))

print(f'{len(imgs)} 张图，尺寸 {imgs[0][1].shape[1]}x{imgs[0][1].shape[0]}')
print('\n=== 两两差分（找券数变化区）===')
acc = None
for i in range(len(imgs) - 1):
    n1, a1 = imgs[i]; n2, a2 = imgs[i+1]
    d = np.abs(a1 - a2).mean(axis=2)
    if acc is None: acc = np.zeros_like(d)
    acc = np.maximum(acc, d)
    # 变化最集中的位置
    ys, xs = np.where(d > 60)
    if len(xs) == 0:
        print(f'  {n1[-13:-4]} → {n2[-13:-4]}: 无显著变化'); continue
    print(f'  {n1[-13:-4]} → {n2[-13:-4]}: 变化像素 {len(xs):5d}  x {xs.min()}~{xs.max()}  y {ys.min()}~{ys.max()}')

print('\n=== 累积差分（任意两张间最大变化）===')
ys, xs = np.where(acc > 60)
print(f'  变化像素 {len(xs)}')
if len(xs):
    print(f'  x {xs.min()}~{xs.max()}   y {ys.min()}~{ys.max()}')

# 累积差分的行/列投影，找数字块
if len(xs):
    colc = (acc > 60).sum(axis=0)
    rowc = (acc > 60).sum(axis=1)
    print('\n  列投影（>60 的像素数，每 8px 一档，x 0~1920）:')
    s = ''
    for x in range(0, 1920, 8):
        v = colc[x:x+8].sum()
        s += '#' if v > 200 else ('+' if v > 80 else ('-' if v > 20 else ('.' if v > 0 else ' ')))
    print('  ' + s)

    print('\n  行投影（y 0~1080，每 8px 一档）:')
    s = ''
    for y in range(0, 1080, 8):
        v = rowc[y:y+8].sum()
        s += '#' if v > 200 else ('+' if v > 80 else ('-' if v > 20 else ('.' if v > 0 else ' ')))
    print('  ' + s)

    # 精确块
    runs = []; cur = None
    for x in range(1920):
        if colc[x] > 5:
            if cur is None: cur = x
        else:
            if cur is not None:
                if x - cur >= 3: runs.append((cur, x))
                cur = None
    if cur is not None: runs.append((cur, 1920))
    print('\n  显著差异列块:')
    for x0, x1 in runs:
        if x1 - x0 < 3: continue
        yy = np.where(acc[:, x0:x1] > 60)[0]
        if len(yy) == 0: continue
        print(f'    x {x0:4d}~{x1:4d} 宽{x1-x0:3d}  y {yy.min()}~{yy.max()} 高{yy.max()-yy.min()+1}'
              f'   → 1280x720: x {int(x0/1.5)}~{int(x1/1.5)} y {int(yy.min()/1.5)}~{int(yy.max()/1.5)}')
