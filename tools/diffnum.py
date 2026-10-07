from PIL import Image
import numpy as np
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

A = 's1.jpg'   # 券=10
B = 's9.jpg'   # 券=9（打完一场）
if not os.path.exists(B):
    print('缺 s9.jpg'); sys.exit()

a = np.asarray(Image.open(A).convert('RGB')).astype(np.float32)
b = np.asarray(Image.open(B).convert('RGB')).astype(np.float32)
d = np.abs(a - b).mean(axis=2)

print(f'整幅平均差={d.mean():.2f}  变化>30的像素占比={(d>30).mean()*100:.1f}%')

# 只看左下角文字行
reg = d[415:490, 0:400]
print(f'\n左下区 x0~400 y415~490: 平均差={reg.mean():.2f} 最大={reg.max():.0f}')

# 找差异集中的列
colmax = reg.max(axis=0)
top = np.argsort(-colmax)[:40]
xs = sorted(set(int(t) for t in top))
print('\n差异最大的列 x:', xs[:40])

# 逐列打印，定位数字块
print('\n=== 左下区差异列分布 (每列最大差) ===')
s = ''
for x in range(400):
    v = colmax[x]
    s += '#' if v > 90 else ('+' if v > 55 else ('-' if v > 30 else '.'))
print(s)

# 按列切块
runs = []; cur = None
for x in range(400):
    if colmax[x] > 55:
        if cur is None: cur = x
    else:
        if cur is not None: runs.append((cur, x)); cur = None
if cur is not None: runs.append((cur, 400))
print('\n显著差异块:')
for x0, x1 in runs:
    if x1 - x0 < 3: continue
    ys = np.where(reg[:, x0:x1] > 55)[0]
    if len(ys) == 0: continue
    print(f'  x {x0:4d}~{x1:4d} 宽{x1-x0:3d}  y {ys.min()+415}~{ys.max()+415} 高{ys.max()-ys.min()+1}')
