import json, io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
macros = json.load(open(r'C:\Users\chenyu\dsh\火影忍者\tools\macros.json', encoding='utf-8'))
new_line = 'const SECRET_REALM_MACROS = ' + json.dumps(macros, ensure_ascii=False, separators=(',', ':')) + ';'

src = open(JS, encoding='utf-8').read()
lines = src.split('\n')

idx = None
for i, ln in enumerate(lines):
    if ln.startswith('const SECRET_REALM_MACROS ='):
        idx = i
        break

if idx is None:
    print('❌ 没找到 SECRET_REALM_MACROS 行')
    sys.exit(1)

old_len = len(lines[idx])
print(f'找到第 {idx+1} 行，原长度 {old_len} 字符')
lines[idx] = new_line
print(f'新长度 {len(new_line)} 字符')

open(JS, 'w', encoding='utf-8').write('\n'.join(lines))
print('✅ 已替换')
print('新宏 keys:', list(macros.keys()))
for k, v in macros.items():
    print(f'  {k}: {len(v)} 步')
