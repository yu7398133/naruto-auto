import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
p = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
L = open(p, encoding='utf-8').read().split('\n')

s = None
for i, l in enumerate(L):
    if 'async turboUntilSettled()' in l:
        s = i
        break
if s is None:
    print('未找到，跳过')
    sys.exit(0)
end = None
for i in range(s + 1, len(L)):
    if re.match(r'    (async |static |/\*\*)', L[i]) or re.match(r'    [A-Za-z_]\w*\s*\(', L[i]):
        end = i
        break

# 再往前吞掉该方法上方的注释块（如果有）
head = s
while head > 0 and (L[head - 1].strip().startswith('//') or L[head - 1].strip().startswith('*')
                    or L[head - 1].strip().startswith('/*') or L[head - 1].strip() == ''):
    head -= 1
    if L[head].strip().startswith('/*'):
        break

print('删除行 %d ~ %d (含注释)' % (head + 1, end))
del L[head:end]
open(p, 'w', encoding='utf-8').write('\n'.join(L))
print('已删除 %d 行' % (end - head))
