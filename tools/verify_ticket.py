"""离线验证券数识别：用脚本里真实的 11 个模板，对 11 张准备界面图做匹配，
复现脚本 readTicketCount 的逻辑（SAD step=1, 取最小分），看是否全部命中正确数字。"""
import io, sys, json, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
src = open(JS, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_TICKET_TEMPLATES = (\{.*?\});', src, re.S)
tpls = json.loads(m.group(1))

# 区域常量（应从脚本读，避免手抄错）
m2 = re.search(r'const SECRET_REALM_TICKET_REGION = \[(.*?)\];', src)
RX, RY, RW, RH = [int(x.strip()) for x in m2.group(1).split(',')]
print('区域常量: [%d, %d, %d, %d]' % (RX, RY, RW, RH))
print('模板数: %d  键: %s\n' % (len(tpls), sorted(tpls.keys(), key=int)))

import base64, tempfile
def to_arr(dataurl):
    b = dataurl.split(',', 1)[1]
    buf = io.BytesIO(base64.b64decode(b))
    return np.asarray(Image.open(buf).convert('L')).astype(np.int16)

tpl_arr = {k: to_arr(v) for k, v in tpls.items()}
for k, a in tpl_arr.items():
    print('  模板 %-3s 尺寸 %dx%d' % (k, a.shape[1], a.shape[0]))

REALM = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
cases = [
    ('雷霆-prepare.jpg', '10'), ('阴阳-prepare.jpg', '9'), ('烈焰-prepare.jpg', '8'),
    ('落岩-prepare.jpg', '7'), ('阴阳2-prepare.jpg', '6'), ('毒风-prepare.jpg', '5'),
    ('落岩2-prepare.jpg', '4'), ('水牢-prepare.jpg', '3'), ('罡体战斗-prepare.jpg', '2'),
    ('缸体战斗2-prepare.jpg', '1'), ('挑战券0-prepare.jpg', '0'),
]

def sad_match(frame, tpl, rx, ry):
    """复现脚本 findTemplate：在区域内以 step=1 滑窗（模板小于区域），模板内部按 step 2 采样。"""
    th, tw = tpl.shape
    fh, fw = frame.shape
    best = 1e9
    for oy in range(ry, ry + RH - th + 1):
        for ox in range(rx, rx + RW - tw + 1):
            win = frame[oy:oy + th, ox:ox + tw:2]
            t = tpl[:, ::2]
            best = min(best, np.abs(win - t).mean())
    return best

print('\n=== 识别结果 ===')
ok_n = 0
for fn, expect in cases:
    p = os.path.join(REALM, fn)
    if not os.path.exists(p):
        print('  ❌ 缺文件 %s' % fn); continue
    frame = np.asarray(Image.open(p).convert('L')).astype(np.int16)
    scores = {}
    for k, t in tpl_arr.items():
        if t.shape[0] > RH or t.shape[1] > RW: continue
        scores[k] = sad_match(frame, t, RX, RY)
    best = min(scores, key=scores.get)
    second = sorted(scores.values())[1]
    gap = second - scores[best]
    hit = '✅' if best == expect else '❌'
    if best == expect: ok_n += 1
    print('  %s %-24s 期望 %-3s → 识别 %-3s (score=%5.2f, 次优差 %5.2f)'
          % (hit, fn, expect, best, scores[best], gap))

print('\n命中 %d/%d' % (ok_n, len(cases)))
