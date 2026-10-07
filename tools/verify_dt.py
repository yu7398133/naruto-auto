"""验证 dt 累加语义：录制里 dt 到底是「自上一步」还是「自首步」？

对比两种解释下，时间轴与录制真实总时长的吻合度。
用录制 JSON 里 key 步的真实时间戳（t 字段）做基准 —— 那是绝对毫秒时间戳。
"""
import io, sys, json, glob, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:\Users\chenyu\dsh\火影忍者'
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
js = open(os.path.join(ROOT, 'naruto-auto.user.js'), encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))

NAME2KEY = {'落岩': 'luoyan', '毒风': 'dufeng', '雷霆': 'leiting', '烈焰': 'lieyan',
            '水牢': 'shuilao', '阴阳': 'yinyang', '罡体': 'gangti', '缸体': 'gangti'}

print('%-9s %-34s %8s %8s %8s' % ('宏', '录制', '录制跨度', 'dt累加', '差值'))
print('-' * 76)
for p in sorted(glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True),
                key=lambda q: os.path.basename(q)):
    n = os.path.basename(p)
    if '秘境战斗' not in n:
        continue
    if '以另一个为准' in n or '以前一个为准' in n:
        continue   # 只用主录制
    d = json.load(open(p, encoding='utf-8'))
    if not isinstance(d, list):
        continue
    keys_ = [s for s in d if s.get('kind') == 'key']
    if not keys_:
        continue
    span = keys_[-1]['t'] - keys_[0]['t']
    key = None
    for k, v in NAME2KEY.items():
        if n.startswith(k): key = v; break
    if not key or key not in M:
        print('%-9s %-34s (无对应宏)' % (key, n[:32]))
        continue
    macro = [s for s in M[key] if s.get('kind') == 'key']
    # 假设 A：dt 累加 = 绝对偏移
    acc = sum((s.get('dt') or 0) for s in macro)
    # 假设 B：最长的 hold 是最后一个键的，最后 down→up
    print('%-9s %-34s %7dms %7dms %+7dms' % (key, n[:32], span, acc, acc - span))
    print('%-9s   宏键数=%d 录制键数=%d  末键hold=%s' % ('', len(macro), len(keys_), macro[-1].get('hold')))
