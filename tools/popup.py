from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
im = Image.open(r'C:\Users\chenyu\dsh\火影忍者\tools\now.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32)
CH = ' .:-=+*#%@'
L = a.mean(axis=2)
def show(x0,y0,x1,y1,cols=110,rows=30):
    sub=L[y0:y1,x0:x1]; hh,ww=sub.shape
    ys=np.linspace(0,hh,rows+1).astype(int); xs=np.linspace(0,ww,cols+1).astype(int)
    for i in range(rows):
        print('  '+''.join(CH[min(9,int(sub[ys[i]:ys[i+1],xs[j]:xs[j+1]].mean()/25.6))] for j in range(cols)))
print('=== 全图 ===')
show(0,0,1280,720)
# 找弹窗边框：中间区域的高对比矩形
print()
print('=== 中心区 x200~1080 y100~620 ===')
show(200,100,1080,620,cols=110,rows=26)
