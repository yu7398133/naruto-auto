import io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
names = ['落岩', '雷霆', '阴阳', '毒风', '水牢', '烈焰', '罡体', '落岩22', '阴阳22']

# 裁一块包含「返回」按钮的固定区域（以 122,670 为中心，取 80x80）
BOX = (122 - 45, 670 - 30, 122 + 45, 670 + 30)   # (77,640,167,700)

tiles = []
for n in names:
    fn = os.path.join(OUT, 'settleback-%s.jpg' % n)
    if os.path.exists(fn):
        tiles.append((n, Image.open(fn).convert('RGB').crop(BOX)))

# 拼成网格便于一次查看
W, H = BOX[2] - BOX[0], BOX[3] - BOX[1]
cols = 3
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), (30, 30, 30))
for i, (n, im) in enumerate(tiles):
    sheet.paste(im, ((i % cols) * W, (i // cols) * H))
sheet = sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST)
p = os.path.join(OUT, '_settleback_sheet.png')
sheet.save(p)
print('拼图: %s  %s' % (p, sheet.size))
print('裁切区域: %s   (每格 = 一份录制的同一位置)' % (BOX,))
print('顺序: %s' % ' | '.join(n for n, _ in tiles))
