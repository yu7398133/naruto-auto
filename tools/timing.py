"""看每份录制：点匹配(或弹窗关闭) → 第一个按键 的间隔，判断是否直接进战斗。"""
import io, sys, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
paths = {}
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.json') and '秘境' in f and '战斗' in f:
            paths[f] = os.path.join(root, f)

print('%-34s %8s %8s %10s %10s' % ('录制', '点匹配+', '最后click+', '首键+', '键数'))
for fn, p in sorted(paths.items()):
    arr = json.load(open(p, encoding='utf-8'))
    t0 = arr[0]['t']
    c1 = arr[0]  # seq1 点匹配
    clicks_after = [s for s in arr[1:] if s.get('kind') == 'click']
    keys = [s for s in arr if s.get('kind') == 'key']
    k0 = keys[0]['t'] if keys else None
    last_click_before_key = None
    for s in arr:
        if s.get('kind') == 'click' and k0 and s['t'] < k0:
            last_click_before_key = s
    t_match = (c1['t'] - t0) / 1000.0
    t_lc = ((last_click_before_key['t'] - t0) / 1000.0) if last_click_before_key else float('nan')
    t_k0 = ((k0 - t0) / 1000.0) if k0 else float('nan')
    nclicks_before = sum(1 for s in arr if s.get('kind') == 'click' and k0 and s['t'] < k0)
    print('%-34s %8.1f %8.1f %10.1f %10d   (首键前click数=%d)' % (
        fn, t_match, t_lc, t_k0, len(keys), nclicks_before))
