from PIL import Image
import numpy as np, os, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
DIG = r'C:\Users\chenyu\dsh\火影忍者\tools\digits'
os.makedirs(DIG, exist_ok=True)

# 券数数字区域（1280x720 逻辑坐标），留边距
X0, Y0, X1, Y1 = 496, 622, 534, 670

# 已知券数
val = {'雷霆': 10, '烈焰': 8, '落岩': 7, '阴阳': 9, '水牢': 3, '毒风': 5}

tmpls = {}
for n, v in val.items():
    p = os.path.join(OUT, n + '-prepare.jpg')
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    sub = a[Y0:Y1, X0:X1]
    tmpls[str(v)] = sub
    Image.fromarray(sub.astype(np.uint8)).save(os.path.join(DIG, f'num{v}.png'))
    print(f'  {n}: 券={v} → num{v}.png  ({X1-X0}x{Y1-Y0})')

# 两两差异：验证不同数字确实可分
print('\n=== 模板两两差异（越大越可分）===')
ks = sorted(tmpls.keys(), key=int)
for i in range(len(ks)):
    for j in range(i+1, len(ks)):
        d = np.abs(tmpls[ks[i]] - tmpls[ks[j]]).mean()
        print(f'  {ks[i]:>2s} vs {ks[j]:>2s}: {d:6.2f}')

# 二值化后的形状（数字骨架）
print('\n=== 各数字二值化形状（亮像素=笔画）===')
CH = ' .:-=+*#%@'
for k in ks:
    L = tmpls[k].mean(axis=2)
    print(f'\n--- 数字 {k} ---')
    ys = np.arange(0, L.shape[0], 2)
    xs = np.arange(0, L.shape[1], 1)
    for i in range(len(ys)-1):
        row = ''
        for j in range(len(xs)-1):
            v = L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()
            row += CH[min(9, int(v/25.6))]
        print('  |' + row + '|')
