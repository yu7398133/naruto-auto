import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')

# _advance 的调用点：源码里真正推进流程图的地方
print('=== _advance 的定义与调用点 ===')
for i, l in enumerate(lines, 1):
    if '_advance' in l:
        print(f'{i:>6}: {l.strip()[:120]}')

print('\n=== ctx 里封装了 _advance 的方法 ===')
for i, l in enumerate(lines, 1):
    if re.search(r'^\s*(async\s+)?(go|tap|drag|check|step)\s*\(', l) and 3595 <= i <= 4100:
        print(f'{i:>6}: {l.strip()[:120]}')
