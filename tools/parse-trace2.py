import io, json
from collections import Counter

P = r'C:\Users\chenyu\dsh\火影忍者\trace-abundance.html'
s = io.open(P, encoding='utf-8', errors='replace').read()
i = s.find('var STEPS=')
k = s.index('[', i)
# 括号配平（字符串内的括号要跳过）
depth = 0
instr = False
esc = False
for j in range(k, len(s)):
    ch = s[j]
    if instr:
        if esc: esc = False
        elif ch == '\\': esc = True
        elif ch == '"': instr = False
        continue
    if ch == '"': instr = True
    elif ch == '[': depth += 1
    elif ch == ']':
        depth -= 1
        if depth == 0:
            end = j + 1
            break
data = json.loads(s[k:end])
print('总步数:', len(data))

idx = next(i2 for i2, x in enumerate(data) if x.get('label') == '打开丰饶之间')
print(f'「打开丰饶之间」= seq {data[idx]["seq"]} @ {data[idx]["wall"]}')
t0 = data[idx]['t']
seg = data[idx:idx + 24]

print('\nseq   t(s)   kind   label                 coord       scene    bright  probes')
for x in seg:
    c = x.get('coord')
    ph = ','.join(p['name'] for p in (x.get('probeHits') or [])[:4])
    print(f"{x['seq']:>4} {(x['t']-t0)/1000:>6.2f} {str(x.get('kind'))[:5]:>6} {str(x.get('label'))[:20]:<20} "
          f"{str(c):<11} {str(x.get('scene')):<8} {x.get('brightness',0):>6.1f}  {ph}")

print('\n=== 该段 scene 分布 ===')
print(Counter(x.get('scene') for x in seg))
print('\n=== 该段探针命中 ===')
cc = Counter()
for x in seg:
    for p in (x.get('probeHits') or []):
        cc[p['name']] += 1
print(cc.most_common(24))

# 整段战斗期间（从「点挑战」到结束）scene 分布
bidx = next((i2 for i2, x in enumerate(data) if x.get('label') == '点挑战'), None)
if bidx:
    print(f'\n「点挑战」= seq {data[bidx]["seq"]} @ {data[bidx]["wall"]}')
    tail = data[bidx:bidx + 400]
    print('战斗期间 scene 分布:', Counter(x.get('scene') for x in tail))
    # 最后 6 步
    print('\n最后 6 步:')
    for x in data[-6:]:
        print(f"  seq={x['seq']} {x.get('wall')} {x.get('kind')} {x.get('label')} scene={x.get('scene')} bright={x.get('brightness')}")
