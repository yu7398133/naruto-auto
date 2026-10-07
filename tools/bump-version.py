import io, re
p = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(p, encoding='utf-8').read()
s2, n1 = re.subn(r"@version\s+0\.6\.\d+", "@version      0.6.19", s)
s2, n2 = re.subn(r"const VERSION = '0\.6\.\d+'", "const VERSION = '0.6.19'", s2)
io.open(p, 'w', encoding='utf-8', newline='').write(s2)
print(f'@version 改 {n1} 处，VERSION 改 {n2} 处')
for l in s2.split('\n')[:30]:
    if '@version' in l:
        print('  ', l.strip())
for l in s2.split('\n')[:40]:
    if 'const VERSION' in l:
        print('  ', l.strip())
