import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image
import numpy as np, os, base64

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
DIG = r'C:\Users\chenyu\dsh\火影忍者\tools\digits'
X0, Y0, X1, Y1 = 496, 620, 536, 672

p = os.path.join(OUT, '阴阳2-prepare.jpg')
a = np.asarray(Image.open(p).convert('RGB')).astype(np.uint8)
sub = a[Y0:Y1, X0:X1]
im = Image.fromarray(sub)
im.save(os.path.join(DIG, 'num6.jpg'), 'JPEG', quality=95)
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=95)
d = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
src = open(JS, encoding='utf-8').read()

m = re.search(r'const SECRET_REALM_TICKET_TEMPLATES = (\{.*?\});', src, re.S)
if not m:
    print('ERR: 未找到 SECRET_REALM_TICKET_TEMPLATES'); sys.exit(1)
obj = json.loads(m.group(1))
print('现有模板:', sorted(obj.keys(), key=int))
if '6' in obj:
    print('  6 已存在')
else:
    obj['6'] = d
    new = 'const SECRET_REALM_TICKET_TEMPLATES = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';'
    src = src[:m.start()] + new + src[m.end():]
    open(JS, 'w', encoding='utf-8').write(src)
    print('  ✅ 已加入 6；现在:', sorted(obj.keys(), key=int))
