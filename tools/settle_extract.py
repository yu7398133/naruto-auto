import io, sys, json, glob, os, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n:
        files.append(p)
files.sort(key=lambda p: os.path.basename(p))

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
os.makedirs(OUT, exist_ok=True)

# 1) 提取「返回」按钮模板：取有返回的那份录制里、点返回那一步的 frame
print('=== 提取「返回」按钮模板 ===')
saved = 0
for p in files:
    d = json.load(open(p, encoding='utf-8'))
    n = os.path.basename(p)
    if not isinstance(d, list):
        continue
    for s in d:
        if s.get('kind') == 'click' and s.get('x') is not None and s['x'] < 200 and s['y'] > 640:
            fr = s.get('frame')
            if not fr:
                continue
            key = n.replace('秘境战斗', '').replace('（以前一个为准）', '2').replace('（以另一个为准）', '2').replace('.json', '')
            fn = os.path.join(OUT, 'settleback-%s.jpg' % key)
            b64 = fr.split(',', 1)[1] if ',' in fr else fr
            open(fn, 'wb').write(base64.b64decode(b64))
            print('  保存 %-34s (%d,%d) → %s' % (n[:32], s['x'], s['y'], os.path.basename(fn)))
            saved += 1
            break
print('  共 %d 张' % saved)

# 2) 图片实际尺寸 & 缩放关系
print()
print('=== 图片尺寸核对 ===')
try:
    from PIL import Image
    for fn in sorted(os.listdir(OUT)):
        if fn.startswith('settleback-'):
            im = Image.open(os.path.join(OUT, fn))
            print('  %-28s %s' % (fn, im.size))
except ImportError:
    print('  (无 PIL，跳过)')
