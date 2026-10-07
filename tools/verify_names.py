"""验证 8 个秘境名模板的可分性：每个模板在自己的源图上匹配应得最低分，
在其他 7 张图上应得明显更高的分。复现 identifyRealmName 的逻辑。"""
import io, sys, json, os, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
X0, Y0, X1, Y1 = 560, 12, 720, 62

tpls = json.load(open(r'C:\Users\chenyu\dsh\火影忍者\tools\name_templates.json', encoding='utf-8'))

def arr(d):
    b = d.split(',', 1)[1] if d.startswith('data:') else d
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b))).convert('L')).astype(np.int16)

# 各秘境的战斗帧（第3步），裁剪同一区域作为测试帧
paths = {}
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.json') and '秘境' in f and '战斗' in f:
            paths[f] = os.path.join(root, f)
MAP = {
 'luoyan':'落岩秘境战斗.json','dufeng':'毒风秘境战斗.json','leiting':'雷霆秘境战斗.json',
 'lieyan':'烈焰秘境战斗.json','yinyang':'阴阳秘境战斗.json','shuilao':'水牢秘境战斗.json',
 'gangti':'罡体秘境战斗.json','gangti2':'缸体秘境战斗2.json',
}
frames = {}
for k, fn in MAP.items():
    arr_ = json.load(open(paths[fn], encoding='utf-8'))
    raw = arr_[3].get('frame','')
    b = raw.split(',',1)[1] if raw.startswith('data:') else raw
    img = Image.open(io.BytesIO(base64.b64decode(b))).convert('L').crop((X0,Y0,X1,Y1))
    frames[k] = np.asarray(img).astype(np.int16)

tpl_arr = {k: arr(v) for k, v in tpls.items()}
print('模板尺寸: %s' % {k: a.shape for k, a in tpl_arr.items()})

def sad_at(fr, tp):
    return float(np.abs(fr - tp).mean())

keys = sorted(tpl_arr)
print('\n=== 8x8 混淆矩阵（行=测试帧秘境, 列=模板, 值=SAD）===')
hdr = '        ' + ''.join('%9s' % k for k in keys)
print(hdr)
ok = 0
for fk in keys:
    row = []
    for tk in keys:
        row.append(sad_at(frames[fk], tpl_arr[tk]))
    best = keys[int(np.argmin(row))]
    srt = sorted(row)
    gap = srt[1] - srt[0]
    mark = '✅' if best == fk else '❌'
    if best == fk: ok += 1
    print('%-7s ' % fk + ''.join('%9.1f' % v for v in row) + '  → %-8s %s 次优差%.1f' % (best, mark, gap))

print('\n命中 %d/%d' % (ok, len(keys)))
