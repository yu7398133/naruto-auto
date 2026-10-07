import io, sys, json, glob, os, statistics as st
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
files = []
for p in glob.glob(os.path.join(BASE, '**', '*.json'), recursive=True):
    n = os.path.basename(p)
    if '秘境战斗' in n:
        files.append(p)
files.sort(key=lambda p: os.path.basename(p))

print('=== 「返回」按钮(左下角)的统计 ===')
xs, ys, gaps, lastkey = [], [], [], []
for p in files:
    d = json.load(open(p, encoding='utf-8'))
    n = os.path.basename(p)
    # 找第一个 x<200 且 y>640 的 click = 返回
    back = None
    last_key_t = None
    for s in d:
        if s.get('kind') == 'key':
            last_key_t = s['t']
        if s.get('kind') == 'click' and s.get('x') is not None and s['x'] < 200 and s['y'] > 640:
            back = s
            break
    if back:
        xs.append(back['x']); ys.append(back['y'])
        gap = (back['t'] - last_key_t) if last_key_t else None
        if gap: gaps.append(gap)
        lastkey.append((n, gap))
        print('  %-34s 返回(%3d,%3d) area=%-22s 末键后 %sms' % (
            n[:32], back['x'], back['y'], str(back.get('area')), gap))
    else:
        print('  %-34s ⚠ 未找到左下角返回' % n[:32])

print()
print('  x: min=%d max=%d 中位=%.0f 均值=%.1f' % (min(xs), max(xs), st.median(xs), st.mean(xs)))
print('  y: min=%d max=%d 中位=%.0f 均值=%.1f' % (min(ys), max(ys), st.median(ys), st.mean(ys)))
print('  末键→点返回 等待: min=%d 中位=%d max=%d (n=%d)' % (
    min(gaps), st.median(gaps), max(gaps), len(gaps)))
print()
print('  ⚠ 但这是「用户手动点的时刻」，不等于「返回出现的时刻」')
print('     返回可能在末键后几秒就出现了，用户等了更久才点。')
