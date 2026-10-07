import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OLD, NEW = '0.5.83', '0.5.84'
root = r'C:\Users\chenyu\dsh\火影忍者'

# 1) js @version
p = root + r'\naruto-auto.user.js'
s = open(p, encoding='utf-8').read()
assert '// @version      ' + OLD in s, 'js @version 未找到'
s = s.replace('// @version      ' + OLD, '// @version      ' + NEW, 1)
assert "const VERSION = '" + OLD + "'" in s, 'VERSION 未找到'
s = s.replace("const VERSION = '" + OLD + "'", "const VERSION = '" + NEW + "'", 1)
open(p, 'w', encoding='utf-8').write(s)
print('✅ js @version + VERSION →', NEW)

# 2) CHANGELOG 最新条目
p = root + r'\CHANGELOG.md'
s = open(p, encoding='utf-8').read()
old_hdr = '## v' + OLD + ' ('
if old_hdr in s:
    s = s.replace(old_hdr, '## v' + NEW + ' (', 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('✅ CHANGELOG 标题 →', NEW)
else:
    print('⚠ CHANGELOG 未找到', old_hdr)

# 3) README badge
p = root + r'\README.md'
s = open(p, encoding='utf-8').read()
old_badge = 'badge/version-' + OLD + '-blue'
if old_badge in s:
    s = s.replace(old_badge, 'badge/version-' + NEW + '-blue', 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('✅ README badge →', NEW)
else:
    print('⚠ README 未找到', old_badge)

# 校验
print('\n=== 校验 ===')
for f, pat in [('naruto-auto.user.js', OLD), ('CHANGELOG.md', OLD), ('README.md', OLD)]:
    s = open(root + '\\' + f, encoding='utf-8').read()
    n = s.count(pat)
    print('  %-22s 残留 %s: %d 处' % (f, OLD, n))
