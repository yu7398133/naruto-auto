import io, json, re
p = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
lines = io.open(p, encoding='utf-8').read().split('\n')
target = None
for l in lines:
    if l.startswith('const SECRET_REALM_MACROS = '):
        target = l[len('const SECRET_REALM_MACROS = '):].rstrip()
        if target.endswith(';'):
            target = target[:-1]
        break
assert target, 'not found'
d = json.loads(target)
print('宏里的秘境:', list(d.keys()))
print()
for r in ['dufeng', 'lieyan', 'leiting', 'shuilao', 'luoyan']:
    if r not in d:
        print(f'--- {r}: 不存在 ---')
        continue
    steps = d[r]
    keys = [x for x in steps if x.get('kind') == 'key']
    lead = next((x['ms'] for x in steps if x.get('kind') == 'lead'), None)
    print(f'--- {r} ---  lead={lead}  按键数={len(keys)}')
    print('   键序: ' + ''.join(x['key'] for x in keys))
    print('   明细: ' + json.dumps(keys, ensure_ascii=False))
    print()
