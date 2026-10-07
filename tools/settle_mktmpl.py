import io, sys, os, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
src = Image.open(os.path.join(OUT, 'settleback-落岩.jpg')).convert('L')
# 模板 = 落岩帧 (105,653)-(141,685)，即已验证 36x32 的紧致按钮块
t = src.crop((105, 653, 141, 685))
t = t.convert('RGB')

tmp = os.path.join(OUT, '_settle_tmpl.jpg')
t.save(tmp, 'JPEG', quality=92)
b = base64.b64encode(open(tmp, 'rb').read()).decode()
os.remove(tmp)
print('模板尺寸:', t.size)
print('base64 长度:', len(b))
with open(r'C:\Users\chenyu\dsh\火影忍者\tools\settle_tmpl_b64.txt', 'w') as f:
    f.write('data:image/jpeg;base64,' + b)
print('已写入 tools/settle_tmpl_b64.txt')
print()
print('前 120 字符:', ('data:image/jpeg;base64,' + b)[:120])
