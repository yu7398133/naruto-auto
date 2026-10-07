"""给每个宏加 leadMs = 录制里「点匹配 → 首键」的真实间隔（前置等待）。
宏的 dt 是相对首键的，丢掉了这段开场准备时间 → 脚本会比录制提前按键。
"""
import io, sys, json, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'

# 找录制文件
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

# 每个宏：点匹配(t0) → 首键 的毫秒间隔
lead = {}
print('=== 点匹配 → 首键 间隔 ===')
for k, fn in MAP.items():
    if fn not in paths: print('  缺 %s' % fn); continue
    arr = json.load(open(paths[fn], encoding='utf-8'))
    t0 = arr[0]['t']
    keys = [s for s in arr if s.get('kind') == 'key']
    if not keys: continue
    t = int(keys[0]['t'] - t0)
    lead[k] = t
    print('  %-8s %5d ms  (%s)' % (k, t, fn))

src = open(JS, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_MACROS = (\{.*?\});', src, re.S)
mac = json.loads(m.group(1))

# 在每个宏数组开头插入 leadMs 标记（作为第 0 个元素 {kind:'lead', ms:N}）
changed = 0
for k, arr in mac.items():
    if not arr or arr[0].get('kind') == 'lead':
        continue
    ms = lead.get(k, 0)
    arr.insert(0, {'kind': 'lead', 'ms': ms})
    changed += 1

new = 'const SECRET_REALM_MACROS = ' + json.dumps(mac, ensure_ascii=False, separators=(',', ':')) + ';'
src = src[:m.start()] + new + src[m.end():]
open(JS, 'w', encoding='utf-8').write(src)
print('\n✅ 已给 %d 个宏插入 leadMs' % changed)
print('  lead 值:', {k: lead.get(k) for k in sorted(mac)})
