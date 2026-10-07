import io, sys, json, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n:
        files.append(p)
files.sort(key=lambda p: os.path.basename(p))

for p in files:
    d = json.load(open(p, encoding='utf-8'))
    n = os.path.basename(p)
    if not isinstance(d, list) or not d:
        print('%-40s 非数组' % n)
        continue
    kinds = {}
    for s in d:
        kinds[s.get('kind')] = kinds.get(s.get('kind'), 0) + 1
    scenes = {}
    for s in d:
        scenes[s.get('scene')] = scenes.get(s.get('scene'), 0) + 1
    print('%-40s 步数=%-4d %s' % (n, len(d), kinds))
    print('%-40s scene: %s' % ('', scenes))
