from PIL import Image
import numpy as np, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\tickets'
fs = sorted(glob.glob(D + r'\naruto-shot-*.png'))

# 券区 1920x1080: x 20~400, y 595~760
X0, Y0, X1, Y1 = 20, 595, 400, 760
CH = ' .:-=+*#%@'

print(f'券区裁剪 x{X0}~{X1} y{Y0}~{Y1}  ({X1-X0}x{Y1-Y0})')
print()
for f in fs:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    sub = a[Y0:Y1, X0:X1]
    L = sub.mean(axis=2)
    name = os.path.basename(f)[-13:-4]
    print(f'--- {name} ---')
    # 放大显示：2px 一格
    ys = np.arange(0, sub.shape[0], 3)
    xs = np.arange(0, sub.shape[1], 2)
    for i in range(len(ys)-1):
        row = ''
        for j in range(len(xs)-1):
            v = L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()
            row += CH[min(9, int(v / 25.6))]
        print('  ' + row)
    print()
