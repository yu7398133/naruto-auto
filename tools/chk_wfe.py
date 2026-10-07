import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
L = open(r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js', encoding='utf-8').read().split('\n')
start = None
for i, l in enumerate(L):
    if 'async waitForEnd(' in l:
        start = i
        break
if start is None:
    print('未找到 waitForEnd')
    sys.exit(0)
print('waitForEnd 起始行:', start + 1)
hits = []
for i in range(start, min(start + 300, len(L))):
    m = re.search(r"return\s+'([A-Za-z_]\w*)'", L[i])
    if m:
        hits.append((i + 1, m.group(1)))
    if i > start + 20 and re.match(r'\s{4}\}', L[i]):
        break
for ln, v in hits:
    print('   行%d: return %s' % (ln, v))
print()
print('返回值集合:', sorted(set(v for _, v in hits)))
