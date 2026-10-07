import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
p = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\43\432a790e650fe05d614bdd6e9c6a79638a42020d005ae1cdae1036820e7fa14e\naruto-trace-2026-09-20T19-31-50-440Z.html'
h = open(p, encoding='utf-8', errors='replace').read()
i = h.find('STEPS=')
start = h.index('[', i)
# 从 start 起做括号配对扫描（数组里可能有嵌套对象/数组和字符串）
depth = 0; end = None; inStr = False; esc = False
for j in range(start, len(h)):
    ch = h[j]
    if inStr:
        if esc: esc = False
        elif ch == '\\': esc = True
        elif ch == '"': inStr = False
        continue
    if ch == '"': inStr = True
    elif ch in '[{': depth += 1
    elif ch in ']}':
        depth -= 1
        if depth == 0: end = j + 1; break
steps = json.loads(h[start:end])
print('步骤数:', len(steps))
print('字段:', sorted(steps[0].keys()))
print()
t0 = steps[0]['t']
print('%-4s %-9s %-7s %-26s %-14s %s' % ('seq', 't(ms)', '间隔', 'label', 'coord', 'scene'))
prev = None
for s in steps[:45]:
    t = s['t']
    gap = (t - prev) if prev is not None else 0
    prev = t
    coord = s.get('coord')
    coord = '(%s,%s)' % (coord[0], coord[1]) if coord else ''
    print('%-4s %-9s %-7s %-26s %-14s %s' % (
        s.get('seq'), t, ('+' + str(gap)) if gap else '-',
        (s.get('label') or '')[:26], coord, s.get('scene')))
