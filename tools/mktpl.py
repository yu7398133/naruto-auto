from PIL import Image
import numpy as np, os, sys, io, json, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
DIG = r'C:\Users\chenyu\dsh\火影忍者\tools\digits'
os.makedirs(DIG, exist_ok=True)

# 券数数字区域（1280x720）。vision_describe 实测数字本体 (503,628)~(527,664)
# 放宽边距，保证两位数(10)完整落入
X0, Y0, X1, Y1 = 496, 620, 536, 672

val = {'雷霆': 10, '烈焰': 8, '落岩': 7, '阴阳': 9, '水牢': 3, '毒风': 5}

tmpls = {}
for n, v in val.items():
    p = os.path.join(OUT, n + '-prepare.jpg')
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.uint8)
    sub = a[Y0:Y1, X0:X1]
    im = Image.fromarray(sub)
    fp = os.path.join(DIG, 'num%d.jpg' % v)
    im.save(fp, 'JPEG', quality=95)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=95)
    tmpls[str(v)] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    print('  %s: 券=%d  %dx%d  %s B' % (n, v, sub.shape[1], sub.shape[0], format(os.path.getsize(fp), ',')))

js = 'const SECRET_REALM_TICKET_TEMPLATES = ' + json.dumps(tmpls, ensure_ascii=False, separators=(',', ':')) + ';'
open(r'C:\Users\chenyu\dsh\火影忍者\tools\ticket_templates.js', 'w', encoding='utf-8').write(js)
print('\n已存 tools/ticket_templates.js (%s 字符)' % format(len(js), ','))
print('keys:', sorted(tmpls.keys(), key=int))
