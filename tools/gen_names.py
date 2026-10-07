"""提取 8 个秘境名模板。从每份战斗录制的「中间帧」（战斗中，非首帧准备界面、非末帧弹窗）
截取顶部中央的秘境名区域 (560,12)-(720,62)。"""
import io, sys, json, os, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
X0, Y0, X1, Y1 = 560, 12, 720, 62   # 160x50

# 定位文件
paths = {}
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.json') and '秘境' in f and '战斗' in f:
            paths[f] = os.path.join(root, f)

# key → 文件名（落岩/阴阳 取不带「2」的，是用户指定的「为准」版本；
#          但落岩2 是券=4、阴阳2 是券=6，两者是不同场次，秘境名相同 → 都可用，取不带2的）
MAP = {
 'luoyan':  '落岩秘境战斗.json',
 'dufeng':  '毒风秘境战斗.json',
 'leiting': '雷霆秘境战斗.json',
 'lieyan':  '烈焰秘境战斗.json',
 'yinyang': '阴阳秘境战斗.json',
 'shuilao': '水牢秘境战斗.json',
 'gangti':  '罡体秘境战斗.json',
 'gangti2': '缸体秘境战斗2.json',
}

out = {}
for key, fn in MAP.items():
    p = paths.get(fn)
    if not p:
        print('❌ 缺 %s' % fn); continue
    arr = json.load(open(p, encoding='utf-8'))
    # 取中间帧：跳过首帧(准备界面)，取靠前的战斗帧
    idx = min(3, len(arr) - 2)
    s = arr[idx]
    raw = s.get('frame', '')
    if not raw:
        print('❌ %s 第%d步无帧' % (fn, idx)); continue
    b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
    data = base64.b64decode(b)
    full = Image.open(io.BytesIO(data)).convert('RGB')
    print('%s: 共%d步, 取第%d步帧 %s' % (fn, len(arr), idx, full.size))
    crop = full.crop((X0, Y0, X1, Y1))
    crop.save(os.path.join(OUT, 'name-%s.jpg' % key), 'JPEG', quality=95)
    buf = io.BytesIO(); crop.save(buf, 'JPEG', quality=95)
    out[key] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

json.dump(out, open(r'C:\Users\chenyu\dsh\火影忍者\tools\name_templates.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('\n=== 提取 %d 个模板 ===' % len(out))
for k in out: print('  %s  %d chars' % (k, len(out[k])))
