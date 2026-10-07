import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OLD, NEW = '0.5.84', '0.5.85'
root = r'C:\Users\chenyu\dsh\火影忍者'

for f, old, new, must in [
    (r'\naruto-auto.user.js', '// @version      ' + OLD, '// @version      ' + NEW, True),
    (r'\naruto-auto.user.js', "const VERSION = '" + OLD + "'", "const VERSION = '" + NEW + "'", True),
    (r'\CHANGELOG.md', '## v' + OLD + ' (', '## v' + NEW + ' (', True),
    (r'\README.md', 'badge/version-' + OLD + '-blue', 'badge/version-' + NEW + '-blue', True),
]:
    p = root + f
    s = open(p, encoding='utf-8').read()
    if old not in s:
        print('⚠ %s 未找到 %s' % (f, old)); continue
    s = s.replace(old, new, 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('✅ %s → %s' % (f, NEW))
