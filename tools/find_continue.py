"""从各秘境战斗录制中找出「继续战斗」按钮的真实坐标。
录制结构：seq1 点匹配 → seq2 通常就是点「继续战斗」（进战斗）→ 之后是按键。"""
import io, sys, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'

paths = {}
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.json') and '秘境' in f and '战斗' in f:
            paths[f] = os.path.join(root, f)

print('=== 各录制的「点匹配后第一个 click」===')
rows = []
for fn, p in sorted(paths.items()):
    arr = json.load(open(p, encoding='utf-8'))
    t0 = arr[0]['t']
    clicks = [s for s in arr if s.get('kind') == 'click']
    for i, s in enumerate(arr):
        if s.get('kind') == 'click' and i > 0:
            # 找第一个出现在任何 key 之前的 click
            has_key_before = any(x.get('kind') == 'key' for x in arr[:i])
            if not has_key_before:
                rows.append((fn, s['seq'], s['x'], s['y'], (s['t'] - t0) / 1000.0))
                print('  %-34s seq%-2d (%4d,%4d) +%.1fs' % (fn, s['seq'], s['x'], s['y'], (s['t'] - t0) / 1000.0))
            break

if rows:
    xs = [r[2] for r in rows]; ys = [r[3] for r in rows]
    import statistics as st
    print('\n=== 统计（「继续战斗」候选）===')
    print('  x: %d~%d  均值%.0f 中位%.0f' % (min(xs), max(xs), st.mean(xs), st.median(xs)))
    print('  y: %d~%d  均值%.0f 中位%.0f' % (min(ys), max(ys), st.mean(ys), st.median(ys)))
    print('  样本数 %d' % len(rows))
    print('\n  当前脚本值 CONTINUE_BATTLE = [850, 500]')
