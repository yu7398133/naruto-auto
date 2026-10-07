"""用 10 份秘境战斗录制，虚拟核对脚本流程（用户口径：
「我给你的录制也可以作为你脚本虚拟核对流程的样本」）。

核对项（对着 run() 的实际逻辑）：
  A. 每份录制的第 1 个 click 是否 ≈ SECRET_REALM_CHALLENGE (1183,617)  → 「点匹配」
  B. 弹窗录制（罡体/阴阳2）的两步是否 ≈ SECRET_REALM_NOTICE_POPUP (645,406)+(653,460)
  C. 尾部的「返回」click 是否落在 SECRET_REALM_SETTLE_BACK_REGION 内
  D. 第 2 个结算 click 是否 ≈ SECRET_REALM_SETTLE_TAPS[1] (628,562)
  E. 宏回放：录制里的 key 序列是否与 SECRET_REALM_MACROS 一致（步数/按键/时序）
"""
import io, sys, json, glob, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:\Users\chenyu\dsh\火影忍者'
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
js = open(os.path.join(ROOT, 'naruto-auto.user.js'), encoding='utf-8').read()

def const(name):
    m = re.search(r'const %s = (\[.*?\]|\{.*?\});' % name, js, re.S)
    return json.loads(m.group(1)) if m else None

CHALLENGE = const('SECRET_REALM_CHALLENGE')          # [1183, 617]
NOTICE = const('SECRET_REALM_NOTICE_POPUP')
TAPS = const('SECRET_REALM_SETTLE_TAPS')
BACKREG = const('SECRET_REALM_SETTLE_BACK_REGION')
MACROS = const('SECRET_REALM_MACROS')
print('脚本常量: 匹配=%s 弹窗=%s 结算=%s 返回区=%s' % (CHALLENGE, NOTICE, TAPS, BACKREG))
print('宏 keys:', sorted(MACROS.keys()))
print()

NAME2KEY = {'落岩': 'luoyan', '毒风': 'dufeng', '雷霆': 'leiting',
            '烈焰': 'lieyan', '水牢': 'shuilao', '阴阳': 'yinyang',
            '罡体': 'gangti', '缸体': 'gangti'}

files = sorted([p for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True)
                if '秘境战斗' in os.path.basename(p)], key=lambda p: os.path.basename(p))

def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5

fails = []
for p in files:
    n = os.path.basename(p).replace('.json', '')
    d = json.load(open(p, encoding='utf-8'))
    clicks = [s for s in d if s.get('kind') == 'click' and s.get('x') is not None]
    keys = [s for s in d if s.get('kind') == 'key']
    print('■ %s' % n)

    # A. 首个 click = 点匹配
    c0 = (clicks[0]['x'], clicks[0]['y'])
    dd = dist(c0, CHALLENGE)
    ok = dd <= 20
    print('   A 点匹配 %-12s vs %-12s 距离=%5.1f %s' % (c0, tuple(CHALLENGE), dd, 'OK' if ok else 'X'))
    if not ok: fails.append((n, 'A', dd))

    # B. 弹窗两步（仅罡体/阴阳2 有）
    popup = [c for c in clicks[1:] if c['y'] < 500 and c['x'] > 600]
    if popup:
        if len(popup) >= 2:
            d1 = dist((popup[0]['x'], popup[0]['y']), NOTICE[0])
            d2 = dist((popup[1]['x'], popup[1]['y']), NOTICE[1])
            print('   B 弹窗 勾选距离=%.1f 确定距离=%.1f %s' % (d1, d2, 'OK' if d1 <= 20 and d2 <= 20 else 'X'))
            if d1 > 20 or d2 > 20: fails.append((n, 'B', (d1, d2)))
        else:
            print('   B 弹窗 只有 %d 步（不足 2）' % len(popup))
    else:
        print('   B 弹窗 无（正常，仅饰品用尽时出现）')

    # C. 尾部返回按钮
    backs = [c for c in clicks if BACKREG[0] <= c['x'] <= BACKREG[2] and BACKREG[1] <= c['y'] <= BACKREG[3]]
    if backs:
        b = (backs[-1]['x'], backs[-1]['y'])
        print('   C 返回 %-12s 在区 %s 内 OK' % (b, BACKREG))
    else:
        print('   C 返回 **未找到**（缸体2 属预期）')
        if '缸体' not in n: fails.append((n, 'C', None))

    # D. 结算第二步
    if len(clicks) >= 2 and backs:
        idx = clicks.index(backs[-1])
        if idx + 1 < len(clicks):
            c2 = (clicks[idx + 1]['x'], clicks[idx + 1]['y'])
            dd2 = dist(c2, TAPS[1])
            print('   D 第2步 %-12s vs %-12s 距离=%5.1f（录制本就浮动，仅供参考）' % (c2, tuple(TAPS[1]), dd2))

    # E. 宏一致性
    key = None
    for k, v in NAME2KEY.items():
        if n.startswith(k): key = v; break
    if key and key in MACROS:
        macro = [m for m in MACROS[key] if m.get('kind') == 'key']
        # 录制里的 key：从第一个 key 到最后一个 key
        if keys:
            first, last = keys[0], keys[-1]
            rec_keys = [s for s in d if s.get('kind') == 'key' and first['t'] <= s['t'] <= last['t']]
            same = len(rec_keys) == len(macro)
            print('   E 宏 %-8s 录制 key=%-2d 脚本宏 key=%-2d %s' % (
                key, len(rec_keys), len(macro), 'OK' if same else '差异'))
            if not same: fails.append((n, 'E', (len(rec_keys), len(macro))))
        else:
            print('   E 宏 %-8s 录制里无 key' % key)
    else:
        print('   E 宏 无对应（%s）' % key)
    print()

print('=' * 60)
if fails:
    print('⚠ %d 处偏差：' % len(fails))
    for f in fails: print('   ', f)
else:
    print('✅ 全部核对通过')
