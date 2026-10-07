import io, sys, json, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n:
        files.append(p)
files.sort(key=lambda p: os.path.basename(p))

print('=== 每份录制的 click 序列（含坐标 / area / 与前一步间隔）===')
for p in files:
    d = json.load(open(p, encoding='utf-8'))
    n = os.path.basename(p)
    if not isinstance(d, list):
        continue
    print()
    print('■ %s  (%d 步, 总 %.1fs)' % (n, len(d), d[-1]['t'] / 1000))
    prev = None
    for s in d:
        if s.get('kind') != 'click':
            prev = s
            continue
        gap = (s['t'] - prev['t']) if prev else 0
        print('   seq%-3s t=%-8s click (%4s,%4s) area=%-24s +%dms' % (
            s.get('seq'), s.get('t'), s.get('x'), s.get('y'),
            str(s.get('area')), gap))
        prev = s
