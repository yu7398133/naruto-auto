import io, sys, json, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n and '落岩秘境战斗.json' in n:
        files.append(p)
p = files[0]
d = json.load(open(p, encoding='utf-8'))
print('=== 落岩秘境战斗.json 全 9 步 ===')
for s in d:
    fr = s.get('frame')
    frs = ('frame=%s' % (str(fr)[:46] + '...' if fr and len(str(fr)) > 46 else fr)) if fr else 'frame=None'
    print('seq%-3s t=%-8s %-6s name=%-12s x=%-6s y=%-6s scene=%-7s' % (
        s.get('seq'), s.get('t'), s.get('kind'), s.get('name'), s.get('x'), s.get('y'), s.get('scene')))
    print('     %s' % frs)
    if s.get('area'): print('     area=%s' % (s.get('area'),))
