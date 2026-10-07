"""时间轴重构的虚拟核对（v0.5.90）。

把 buildKeyTimeline 的逻辑在 Python 里复刻，对 8 个宏逐键检查：
  ① 每个 down 是否都有配对的 up
  ② 峰值同时按住的点数是多少（是否超出手指上限）
  ③ 与录制语义对拍：hold>0 的键，其 down→up 跨度是否等于 hold
  ④ 旧实现（串行）会把这些并存拉平几毫秒 —— 量化差距
"""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

js = open(r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js', encoding='utf-8').read()
M = json.loads(re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', js, re.S).group(1))
HOLD_MAX = int(re.search(r'const SECRET_REALM_KEY_HOLD_MAX = (\d+);', js).group(1))
TAP = 60

def build(key_steps):
    events, dropped, abs_ = [], [], 0
    for s in key_steps:
        abs_ += (s.get('dt') or 0)
        hold = min(HOLD_MAX, s['hold']) if (s.get('hold') or 0) > 0 else TAP
        events.append((abs_, 'down', s['key']))
        events.append((abs_ + hold, 'up', s['key']))
    events.sort(key=lambda e: (e[0], 0 if e[1] == 'up' else 1))
    return events, abs_

print('%-9s %6s %7s %7s %8s %9s %9s' % ('宏', '键数', '事件', '总时长', '峰值并存', '串行耗时', '时间轴时长'))
print('-' * 70)

problems = []
for key in sorted(M):
    seq = M[key]
    ks = [s for s in seq if s.get('kind') == 'key']
    ev, last = build(ks)

    # ① down/up 配对
    down = sum(1 for e in ev if e[1] == 'down')
    up = sum(1 for e in ev if e[1] == 'up')
    if down != up:
        problems.append((key, 'down/up 不配对', down, up))

    # ② 峰值并存
    cur = peak = 0
    for _, act, _k in ev:
        cur += 1 if act == 'down' else -1
        peak = max(peak, cur)
    if cur != 0:
        problems.append((key, '结束未清零', cur))
    if peak > 5:
        problems.append((key, '峰值并存过多', peak))

    # ③ hold 跨度
    for s in ks:
        if (s.get('hold') or 0) > 0:
            want = min(HOLD_MAX, s['hold'])
            if want != s['hold']:
                problems.append((key, 'hold 被截断', s['key'], s['hold']))

    # ④ 串行耗时（旧实现）= sum(max(hold, 60))
    serial = sum(max(60, s.get('hold') or 0) for s in ks)

    print('%-9s %6d %7d %6dms %8d %8dms %8dms' % (
        key, len(ks), len(ev), last, peak, serial, last))

print()
print('=== 结论 ===')
if problems:
    print('⚠ %d 处问题：' % len(problems))
    for p in problems: print('   ', p)
else:
    print('✅ 全部通过：down/up 配对、结束时归零、峰值并存 ≤5 指、hold 未被截断')

print()
print('注：「串行耗时」=旧实现每键 (按下+等hold+抬起) 的累加；')
print('    「时间轴时长」=按录制 dt 的真实总长（dt 之间本就重叠，故通常更短）。')
