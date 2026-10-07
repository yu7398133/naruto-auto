"""核对：SECRET_REALM_MACROS 里有没有真的会触发「摇杆同按合成」的步。

判定条件完全复刻 replaySeq 3366-3374 的逻辑：
  对方向键步 s（key ∈ wasd），往后看 key 步 n，
    若 (n.dt - s.dt) >= s.hold  → 本步已松开，break
    若 n.key 也是方向键       → 算同按，combo.push
"""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

js = open(r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js', encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))
DIRS = 'wasd'

total_combo = 0
for key in sorted(M):
    seq = M[key]
    hits = []
    for i, s in enumerate(seq):
        if s.get('kind') != 'key' or s.get('key') not in DIRS:
            continue
        targetMs = s.get('dt') or 0
        hold = s.get('hold') or 0
        combo = [s['key']]
        for j in range(i + 1, len(seq)):
            n = seq[j]
            if n.get('kind') != 'key':
                break
            if (n.get('dt') or 0) - targetMs >= hold:
                break
            if n.get('key') in DIRS:
                combo.append(n['key'])
        if len(combo) > 1:
            hits.append((i, '+'.join(combo), hold, s.get('dt'), seq[i + 1].get('dt')))
    if hits:
        print('■ %s  触发 %d 次' % (key, len(hits)))
        for h in hits:
            print('   步%-3d %-6s hold=%-5s dt=%-6s 下一步dt=%s' % h)
        total_combo += len(hits)
    else:
        print('■ %-9s 无同按' % key)

print()
print('合计会触发合成的步数: %d' % total_combo)
print()
print('注：hold=0 的步永远不会触发（条件 (n.dt - s.dt) >= 0 恒真 → 立刻 break）')
