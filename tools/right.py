from PIL import Image
import numpy as np
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
for name in ['e0.jpg','e1-pause.jpg','now.jpg']:
    try:
        im = Image.open(name).convert('RGB')
    except Exception as ex:
        print(name, '缺失'); continue
    a = np.asarray(im).astype(np.float32)
    print(f'\n########## {name} ##########')
    CH=' .:-=+*#%@'
    L=a.mean(axis=2)
    # 右上角
    print('--- 右上角 x1080~1280 y0~140 ---')
    sub=L[0:140,1080:1280]; ys=np.linspace(0,140,14).astype(int); xs=np.linspace(0,200,50).astype(int)
    for i in range(13):
        print('  '+''.join(CH[min(9,int(sub[ys[i]:ys[i+1],xs[j]:xs[j+1]].mean()/25.6))] for j in range(49)))
    # 全图缩小
    print('--- 全图 ---')
    ys=np.linspace(0,720,30).astype(int); xs=np.linspace(0,1280,110).astype(int)
    for i in range(29):
        print('  '+''.join(CH[min(9,int(L[ys[i]:ys[i+1],xs[j]:xs[j+1]].mean()/25.6))] for j in range(109)))
