"""用录制真实时间戳，量化「旧串行实现」把并存拉平了多少。

对比：录制真实的「按下时刻序列」 vs 旧实现「按下+等hold+抬起」的累积时刻。
"""
import io, sys, json, glob, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:\Users\chenyu\dsh\火影忍者'
BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
js = open(os.path.join(ROOT, 'naruto-auto.user.js'), encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))

NAME2KEY = {'落岩': 'luoyan', '毒风': 'dufeng', '雷霆': 'leiting', '烈焰': 'lieyan',
            '水牢': 'shuilao', '阴阳': 'yinyang', '罡体': 'gangti'}

print('%-9s %-22s %9s %9s %9s' % ('宏', '录制', '录制末键', '串行末键', '延后'))
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
    macro = [s for s in M[key] if s.get('kind') == 'key']

    # 录制真实：末键按下时刻（相对首键）
    rec_last = keys_[-1]['t'] - keys_[0]['t']
    # 旧串行：每键 max(hold,60) 累加
    serial_last = sum(max(60, s.get('hold') or 0) for s in macro)
    print('%-9s %-22s %8dms %8dms %+8dms' % (key, n[:20], rec_last, serial_last, serial_last - rec_last))

print()
print('「延后」= 宏最后一个按键比录制晚多少毫秒才按到。')
print('这就是旧串行实现造成的整体漂移 —— 越往后越偏，中段技能全部错位。')
