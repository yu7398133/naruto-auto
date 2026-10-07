from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

a = np.asarray(Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\now.jpg').convert('RGB')).astype(np.float32)
r, g, b = a[:,:,0], a[:,:,1], a[:,:,2]

# 橙色按钮：R高、G中、B低
orange = (r > 150) & (g > 90) & (g < 200) & (b < 110) & ((r - b) > 80)
print('橙色像素总数:', int(orange.sum()))

ys, xs = np.where(orange)
# 只看 y 400~650 的按钮带
sel = (ys > 400) & (ys < 660)
ys2, xs2 = ys[sel], xs[sel]
print(f'y400~660 内橙色像素: {len(xs2)}')

# 水平分簇
order = np.argsort(xs2)
xs_s, ys_s = xs2[order], ys2[order]
clusters = []
cur = [xs_s[0], xs_s[0]]
for i in range(1, len(xs_s)):
    if xs_s[i] - cur[1] <= 12:
        cur[1] = xs_s[i]
    else:
        clusters.append(tuple(cur)); cur = [xs_s[i], xs_s[i]]
clusters.append(tuple(cur))

print('\n=== 橙色按钮簇 ===')
for x0, x1 in clusters:
    if x1 - x0 < 20: continue
    m = (xs2 >= x0) & (xs2 <= x1)
    yy = ys2[m]
    print(f'  x {x0:4d}~{x1:4d} 宽{x1-x0+1:3d}   y {yy.min():3d}~{yy.max():3d} 高{yy.max()-yy.min()+1:3d}  像素{int(m.sum()):5d}'
          f'  中心=({(x0+x1)//2},{(yy.min()+yy.max())//2})')
