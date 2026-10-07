import io, sys, json, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n and 'dsh-profile' not in n:
        files.append(p)
files.sort(key=lambda p: os.path.basename(p))
print('战斗录制份数:', len(files))
for p in files:
    print('  ', os.path.basename(p))

# 先详细看第一份的尾部
p0 = files[0]
d = json.load(open(p0, encoding='utf-8'))
print()
print('=== %s ===' % os.path.basename(p0))
print('顶层类型:', type(d).__name__, '长度:', len(d))
if isinstance(d, list) and d:
    print('字段:', sorted(d[0].keys()))
    print('总时长: %.1fs' % (d[-1].get('t', 0) / 1000))
