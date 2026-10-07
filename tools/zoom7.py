from PIL import Image
import numpy as np, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\tickets'
fs = sorted(glob.glob(D + r'\naruto-shot-*.png'))
imgs = []
for f in fs:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    imgs.append((os.path.basename(f)[-13:-4], a))   # 16-31-37

# 先找：7张两两差分，用高分位数而不是均值，排除动画
print('=== 严格差分：取每对差异的 99.5 分位，看是否有稳定小块 ===')
acc = np.zeros((1080, 1920), np.float32)
for i in range(len(imgs)-1):
    n1, a1 = imgs[i]; n2, a2 = imgs[i+1]
    d = np.abs(a1 - a2).max(axis=2)
    acc = np.maximum(acc, d)

# 找高差异的连通小块：粗网格统计
BS = 30
gh, gw = 1080 // BS, 1920 // BS
grid = np.zeros((gh, gw), np.float32)
for gy in range(gh):
    for gx in range(gw):
        grid[gy, gx] = acc[gy*BS:(gy+1)*BS, gx*BS:(gx+1)*BS].mean()

print('\n差异热图（每格 30px, 行=y/30, 列=x/30）:')
print('     ' + ''.join(str((x//10)%10) for x in range(gw)))
for gy in range(gh):
    row = ''
    for gx in range(gw):
        v = grid[gy, gx]
        row += '#' if v > 60 else ('+' if v > 30 else ('-' if v > 12 else ('.' if v > 3 else ' ')))
    print(f'  {gy:2d} |{row}|')

# 找出所有差异显著的格子
print('\n显著差异格（均值>30）:')
ys, xs = np.where(grid > 30)
if len(ys) == 0:
    print('  无 —— 说明这7张图差异极小')
else:
    for gy, gx in zip(ys, xs):
        print(f'  格({gy},{gx}) → x {gx*BS}~{gx*BS+BS} y {gy*BS}~{gy*BS+BS}  均值{grid[gy,gx]:.1f}')
