import io, sys, json, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image
import numpy as np, base64

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
DIG = r'C:\Users\chenyu\dsh\火影忍者\tools\digits'
X0, Y0, X1, Y1 = 496, 620, 536, 672

# 用法: python addtpl.py <图片基名> <数字>
# 例: python addtpl.py 落岩2-prepare 4
name = sys.argv[1]
val = sys.argv[2]

p = os.path.join(OUT, name + '.jpg')
a = np.asarray(Image.open(p).convert('RGB')).astype(np.uint8)
sub = a[Y0:Y1, X0:X1]
im = Image.fromarray(sub)
im.save(os.path.join(DIG, 'num%s.jpg' % val), 'JPEG', quality=95)
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=95)
d = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
src = open(JS, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_TICKET_TEMPLATES = (\{.*?\});', src, re.S)
if not m:
    print('ERR: 未找到模板'); sys.exit(1)
obj = json.loads(m.group(1))
if val in obj:
    print('  %s 已存在，现有: %s' % (val, sorted(obj.keys(), key=int))); sys.exit(0)
obj[val] = d
new = 'const SECRET_REALM_TICKET_TEMPLATES = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';'
src = src[:m.start()] + new + src[m.end():]
open(JS, 'w', encoding='utf-8').write(src)
print('  ✅ 已加入 %s；模板现在: %s' % (val, sorted(obj.keys(), key=int)))
