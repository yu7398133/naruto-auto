from PIL import Image
import numpy as np, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
fs = sorted(glob.glob(D + r'\*-prepare.jpg'))
imgs = {}
for f in fs:
    n = os.path.basename(f).replace('-prepare.jpg', '')
    imgs[n] = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)

print(f'{len(imgs)} 张准备界面帧')
ks = list(imgs.keys())

# 两两差分，累积最大变化
acc = None
print('\n=== 两两差分 ===')
for i in range(len(ks)):
    for j in range(i+1, len(ks)):
        a1, a2 = imgs[ks[i]], imgs[ks[j]]
        d = np.abs(a1 - a2).mean(axis=2)
        if acc is None: acc = np.zeros_like(d)
        acc = np.maximum(acc, d)
        ys, xs = np.where(d > 50)
        if len(xs) == 0:
            continue
        # 主导区域
        print(f'  {ks[i]} vs {ks[j]}: {len(xs):5d} px  x {xs.min()}~{xs.max()}  y {ys.min()}~{ys.max()}')

print('\n=== 累积差分 >50 的分布 ===')
ys, xs = np.where(acc > 50)
print(f'  变化像素 {len(xs)}, x {xs.min()}~{xs.max()}, y {ys.min()}~{ys.max()}' if len(xs) else '  无')

if len(xs):
    # 分块
    TH = 12  # 阈值取得低些，券数字较小
    mask_bin = (acc > TH)
    rowsum = mask_bin.sum(axis=1)
    colsum = mask_bin.sum(axis=0)
    print('\n  行投影（y 0~720, 每 6px）:')
    s = ''
    for y in range(0, 720, 6):
        v = rowsum[y:y+6].sum()
        s += '#' if v > 300 else ('+' if v > 120 else ('-' if v > 30 else ('.' if v > 0 else ' ')))
    print('  |' + s + '|')
    print('   ' + ''.join(str((y//6)%10) if y % 60 == 0 else ' ' for y in range(0,720,6)))

    print('\n  列投影（x 0~1280, 每 6px）:')
    s = ''
    for x in range(0, 1280, 6):
        v = colsum[x:x+6].sum()
        s += '#' if v > 300 else ('+' if v > 120 else ('-' if v > 30 else ('.' if v > 0 else ' ')))
    print('  |' + s + '|')

    # 找出稳定的小差异块（可能是数字）
    print('\n  候选块（列方向密集区）:')
    runs = []; cur = None
    for x in range(1280):
        if colsum[x] > 2:
            if cur is None: cur = x
        else:
            if cur is not None:
                if x - cur >= 4: runs.append((cur, x))
                cur = None
    if cur is not None: runs.append((cur, 1280))
    for x0, x1 in runs:
        sub = mask_bin[:, x0:x1]
        yy = np.where(sub.any(axis=1))[0]
        if len(yy) == 0: continue
        cnt = sub.sum()
        print(f'    x {x0:4d}~{x1:4d} (宽{x1-x0:3d})  y {yy.min():3d}~{yy.max():3d} (高{yy.max()-yy.min()+1:3d})  变化像素 {cnt}')
