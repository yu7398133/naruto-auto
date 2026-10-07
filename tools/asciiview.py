from PIL import Image
import numpy as np, glob, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

D = r'C:\Users\chenyu\dsh\火影忍者\tools\tickets'
CH = ' .:-=+*#%@'
for f in sorted(glob.glob(D + r'\*.png'))[:3]:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    L = a.mean(axis=2)
    print(f'\n=== {f.split(chr(92))[-1]} ===')
    ys = np.linspace(0, 1080, 46).astype(int)
    xs = np.linspace(0, 1920, 118).astype(int)
    for i in range(45):
        row = ''
        for j in range(117):
            v = L[ys[i]:ys[i+1], xs[j]:xs[j+1]].mean()
            row += CH[min(9, int(v / 25.6))]
        print('  ' + row)
