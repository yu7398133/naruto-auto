import io, re, json

P = r'C:\Users\chenyu\dsh\火影忍者\trace-abundance.html'
s = io.open(P, encoding='utf-8', errors='replace').read()
i = s.find('var STEPS=')
j = s.find('</script>', i)
raw = s[i + len('var STEPS='):j].strip().rstrip(';')
data = json.loads(raw)
print('总步数:', len(data))

# 丰饶之间从 seq 22 起
idx = next(k for k, x in enumerate(data) if x.get('label') == '打开丰饶之间')
seg = data[idx:idx + 40]
print(f'\n从 seq {data[idx]["seq"]} 「打开丰饶之间」起，列出前后 26 步：\n')
print('seq   t(s)    kind  label                  coord        scene     bright  probeHits')
t0 = data[idx]['t']
for x in seg[:26]:
    c = x.get('coord')
    ph = ','.join(p['name'] for p in (x.get('probeHits') or [])[:4])
    print(f"{x['seq']:>4} {(x['t']-t0)/1000:>7.2f} {x.get('kind',''):>6} {str(x.get('label'))[:22]:<22} "
          f"{str(c):<12} {str(x.get('scene')):<9} {x.get('brightness',0):>6.1f}  {ph}")

print('\n=== 该段所有出现过的 scene ===')
from collections import Counter
print(Counter(x.get('scene') for x in seg[:30]))
print('\n=== 探针命中统计（该段）===')
cc = Counter()
for x in seg[:30]:
    for p in (x.get('probeHits') or []):
        cc[p['name']] += 1
for k, v in cc.most_common(20):
    print(f'  {k:<24} {v}')
