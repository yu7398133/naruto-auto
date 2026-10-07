import io, re
p = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
lines = io.open(p, encoding='utf-8').read().split('\n')
print('=== .swipe( 调用点 ===')
for i, l in enumerate(lines, 1):
    if '.swipe(' in l:
        print(f'{i:6}: {l.strip()[:130]}')
print()
print("=== drag 相关判断 ===")
for i, l in enumerate(lines, 1):
    if re.search(r"'drag'|\"drag\"", l):
        print(f'{i:6}: {l.strip()[:130]}')
print()
print('=== replayKeyTimeline 定义 ===')
for i, l in enumerate(lines, 1):
    if 'replayKeyTimeline' in l:
        print(f'{i:6}: {l.strip()[:130]}')
