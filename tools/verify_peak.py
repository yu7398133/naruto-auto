"""为什么峰值并存只有 2？—— 对照录制真实的按键时间戳，验证时间轴是否忠实。

用录制 JSON 的绝对时间戳 t 直接算「每一刻有几个键按着」，
与脚本累加 dt 得到的时间轴对比。
"""
import io, sys, json, glob, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:\Users\chenyu\dsh\火影忍者'
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
js = open(os.path.join(ROOT, 'naruto-auto.user.js'), encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))
HOLD_MAX = int(re.search(r'const SECRET_REALM_KEY_HOLD_MAX = (\d+);', js).group(1))
TAP = 60

def peak_of(intervals):
    ev = []
    for a, b in intervals:
        ev.append((a, 1)); ev.append((b, -1))
    ev.sort(key=lambda e: (e[0], e[1]))   # 同一时刻先 up
    cur = pk = 0
    for _, d in ev:
        cur += d; pk = max(pk, cur)
    return pk

NAME2KEY = {'落岩': 'luoyan', '毒风': 'dufeng', '雷霆': 'leiting', '烈焰': 'lieyan',
            '水牢': 'shuilao', '阴阳': 'yinyang', '罡体': 'gangti', '缸体': 'gangti'}

print('%-9s %-30s %10s %10s' % ('宏', '录制', '录制峰值', '脚本峰值'))
print('-' * 66)
for p in sorted(glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True),
                key=lambda q: os.path.basename(q)):
    n = os.path.basename(p)
    if '秘境战斗' not in n or '为准' in n:
        continue
    d = json.load(open(p, encoding='utf-8'))
    if not isinstance(d, list): continue
    keys_ = [s for s in d if s.get('kind') == 'key']
    if not keys_: continue
    key = None
    for k, v in NAME2KEY.items():
        if n.startswith(k): key = v; break
    if not key or key not in M: continue

    # 录制真实：每个 key 步 (t, t+hold)
    t0 = keys_[0]['t']
    rec_iv = [(s['t'] - t0, s['t'] - t0 + max(TAP, s.get('hold') or 0)) for s in keys_]
    rp = peak_of(rec_iv)

    # 脚本：累加 dt
    macro = [s for s in M[key] if s.get('kind') == 'key']
    acc = 0; sc_iv = []
    for s in macro:
        acc += (s.get('dt') or 0)
        sc_iv.append((acc, acc + (min(HOLD_MAX, s['hold']) if (s.get('hold') or 0) > 0 else TAP)))
    sp = peak_of(sc_iv)
    flag = 'OK' if rp == sp else '差异!'
    print('%-9s %-30s %9d %9d  %s' % (key, n[:28], rp, sp, flag))

print()
print('若两者一致 → 证明「峰值=2」是录制的真实情况，不是时间轴算错。')
print('（即用户按键时确实很少超过 2 键并存；806 处是「某键按住窗口内出现了别的键」，')
print('  但那些别的键自己的按住时间很短且相互错开，所以瞬时点数仍不超过 2。）')
