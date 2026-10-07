import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')

print('=== 1) 变量是否已无声明却有引用 ===')
for name in ['staticBailMs', 'endStableNeed', 'staticEndAfterMs', 'battleStarted', 'stableNeed']:
    decl = [i+1 for i, l in enumerate(lines) if re.search(r'(const|let|var)\s+' + name + r'\b', l)]
    use = [i+1 for i, l in enumerate(lines) if re.search(r'\b' + name + r'\b', l) and i+1 not in decl]
    # 过滤纯注释行
    real_use = [n for n in use if not lines[n-1].strip().startswith(('//', '*', '/*'))]
    print(f'{name:<20} 声明@{decl}  真实引用@{real_use}')

print('\n=== 2) this._stable 残留 ===')
for i, l in enumerate(lines, 1):
    if '_stable' in l:
        print(f'{i:>6}: {l.strip()[:100]}')

print('\n=== 3) waitForEnd 里 stable 局部变量 ===')
i0 = next(i for i, l in enumerate(lines) if 'async waitForEnd' in l)
j0 = next(i2 for i2, l in enumerate(lines) if i2 > i0 and re.match(r'^    (async )?[a-zA-Z_]+\(', l))
hits = [(k+1, lines[k].strip()) for k in range(i0, j0)
        if re.search(r'\bstable\b', lines[k]) and 'endStableNeed' not in lines[k] and '_stable' not in lines[k]]
for n, t in hits:
    print(f'{n:>6}: {t[:100]}')
if not hits:
    print('  （无）')

print('\n=== 4) 任务层 staticEndAfterMs/stableEndFrames/staticBailMs 传参（已失效，应清）===')
for i, l in enumerate(lines, 1):
    if re.search(r'staticEndAfterMs:|stableEndFrames:|staticBailMs:', l):
        print(f'{i:>6}: {l.strip()[:100]}')
