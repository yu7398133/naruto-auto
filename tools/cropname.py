from PIL import Image
import numpy as np, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
names = ['罡体秘境','雷霆秘境','烈焰秘境','落岩秘境','阴阳秘境']

# 秘境名区域（1280x720 逻辑坐标）：vision_ground 实测 x611~757 y15~62，放宽一点
X0, Y0, X1, Y1 = 600, 8, 770, 70

imgs = {}
for n in names:
    p = os.path.join(OUT, n + '-first.jpg')
    if not os.path.exists(p): print('缺', p); continue
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    imgs[n] = a
    print(f'{n}: 尺寸 {a.shape[1]}x{a.shape[0]}')

print()
print('=== 各图顶部中央区 ASCII ===')
CH = ' .:-=+*#%@'
for n, a in imgs.items():
    H, W = a.shape[:2]
    sx = a.shape[1] / 1280.0
    sy = a.shape[0] / 720.0
    sub = a[int(Y0*sy):int(Y1*sy), int(X0*sx):int(X1*sx)]
    L = sub.mean(axis=2)
    print(f'\n--- {n} ---')
    ys = np.linspace(0, L.shape[0], 12).astype(int)
    xs = np.linspace(0, L.shape[1], 85).astype(int)
    for i in range(11):
        print('  ' + ''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(84)))

# 两两差异
print()
print('=== 两两差异（该区域）===')
ks = list(imgs.keys())
for i in range(len(ks)):
    for j in range(i+1, len(ks)):
        a1, a2 = imgs[ks[i]], imgs[ks[j]]
        s1 = a1[int(Y0*sy):int(Y1*sy), int(X0*sx):int(X1*sx)]
        s2 = a2[int(Y0*sy):int(Y1*sy), int(X0*sx):int(X1*sx)]
        d = np.abs(s1 - s2).mean()
        print(f'  {ks[i]} vs {ks[j]}: 平均差 {d:.2f}')
