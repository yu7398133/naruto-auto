"""统计：宏里有多少步是「方向键按住期间，别的键也要按」——即真正需要多指并存的时刻。

判定：对每一步 s（kind=key），看它 hold 未结束的窗口内，还有哪些后续按键步。
若存在 → 那一刻同时需要 2 个或以上按压点 → 现有串行实现必然断掉其中一个。
"""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

js = open(r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js', encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))
DIRS = 'wasd'

grand_total = 0
for key in sorted(M):
    seq = M[key]
    events = []
    for i, s in enumerate(seq):
        if s.get('kind') != 'key':
            continue
        dt = s.get('dt') or 0
        hold = s.get('hold') or 0
        events.append((dt, dt + hold, i, s['key']))
    overlaps = []
    for a in range(len(events)):
        for b in range(a + 1, len(events)):
            s0, e0, i0, k0 = events[a]
            s1, e1, i1, k1 = events[b]
            if s1 < e0:                      # b 的按下时刻落在 a 的按住窗口内
                overlaps.append((i0, k0, e0 - s0, i1, k1))
    if overlaps:
        print('■ %s  需同时按住的时刻 %d 处' % (key, len(overlaps)))
        for o in overlaps[:8]:
            i0, k0, h0, i1, k1 = o
            tag = '方向×方向' if k0 in DIRS and k1 in DIRS else ('方向×技能' if (k0 in DIRS) != (k1 in DIRS) else '技能×技能')
            print('   步%-3s %-5s(hold=%-5s) 期间 步%-3s %-5s   [%s]' % (i0, k0, h0, i1, k1, tag))
        if len(overlaps) > 8:
            print('   ... 还有 %d 处' % (len(overlaps) - 8))
        grand_total += len(overlaps)

print()
print('合计需要真多指并存的时刻: %d 处' % grand_total)
