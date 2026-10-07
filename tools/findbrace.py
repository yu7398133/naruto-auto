import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
src = open(r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js', encoding='utf-8').read()
lines = src.split('\n')
depth = 0
for i in range(0, 3962):
    d = lines[i].count('{') - lines[i].count('}')
    depth += d
    if d != 0 and (i + 1) > 3890:
        print('%4d [depth=%3d] delta=%+d  %s' % (i + 1, depth, d, lines[i].rstrip()[:90]))
print('--- 到 3962 行时 depth =', depth, '(应为 0 才是顶层) ---')
