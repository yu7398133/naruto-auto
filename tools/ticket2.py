from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\nav-05.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)
CH = ' .:-=+*#%@'

def amap(x0, y0, x1, y1, cols=110, rows=16):
    sub = a[y0:y1, x0:x1]
    L = sub.mean(axis=2)
    hh, ww = L.shape
    ys = np.linspace(0, hh, rows+1).astype(int)
    xs = np.linspace(0, ww, cols+1).astype(int)
    return '\n'.join(''.join(CH[min(9, int(L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)) for i in range(rows))

# 分离上下两行
print('=== 上行 y 418~440 / x 30~300 ===')
print(amap(30, 418, 300, 440, cols=108, rows=11))
print()
print('=== 下行 y 440~464 / x 30~300 ===')
print(amap(30, 440, 300, 464, cols=108, rows=12))
print()
print('=== 候选数字区1  x 490~545 / y 415~470 ===')
print(amap(490, 415, 545, 470, cols=55, rows=14))
print()
print('=== 候选数字区2  x 705~755 / y 415~470 ===')
print(amap(705, 415, 755, 470, cols=50, rows=14))

# 颜色分析：数字往往不是纯白（金色/橙色）
print()
print('=== 各候选块的平均颜色 ===')
def avgcol(x0, x1, y0, y1, tag):
    sub = a[y0:y1, x0:x1].reshape(-1, 3)
    r, g, b = sub[:,0].mean(), sub[:,1].mean(), sub[:,2].mean()
    # 只看亮像素
    L = sub.mean(axis=1)
    br = sub[L > 150]
    if len(br):
        print(f'  {tag:16s} 整体=({r:.0f},{g:.0f},{b:.0f})  亮部=({br[:,0].mean():.0f},{br[:,1].mean():.0f},{br[:,2].mean():.0f}) n={len(br)}')
    else:
        print(f'  {tag:16s} 整体=({r:.0f},{g:.0f},{b:.0f})  无亮像素')

avgcol(37, 258, 418, 440, 'x37~258 上行')
avgcol(37, 258, 440, 464, 'x37~258 下行')
avgcol(504, 531, 415, 470, 'x504~531')
avgcol(719, 741, 415, 470, 'x719~741')
