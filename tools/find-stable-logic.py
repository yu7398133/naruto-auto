import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

pats = ['staticBailMs', 'staticEndAfterMs', 'stableEndFrames', 'endStableNeed',
        '_stable', 'battleStarted', '_stillSince', 'bannerRecencyMs',
        'frozen', '静止确认', '静止即停手', '画面静止', 'stable >=', 'stable++',
        "'stable'", 'bannerGraceMs', 'bannerRecencyMs', '_bannerAt']
for i, ln in enumerate(lines, 1):
    for p in pats:
        if p in ln:
            s = ln.strip()
            print(f'{i:>6}: {s[:110]}')
            break
