import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'

files = {
 'gangti':  ('罡体', r'8a\8a465a9d2743629777e580eb8cec1de413239e206e49cfea628f99f902bfd8b9\罡体秘境战斗.json'),
 'gangti2': ('缸体2', r'7a\7a38e9e89a7058af982e750d0a6b31a62b4229df79e50a3434bdf9bf7a90b695\缸体秘境战斗2.json'),
}
out = {}
for key, (cn, rel) in files.items():
    p = os.path.join(SRC, rel)
    arr = json.load(open(p, encoding='utf-8'))
    clicks = [s for s in arr if s.get('kind') == 'click']
    keys_ = [s for s in arr if s.get('kind') == 'key']
    if not keys_:
        print('⚠ %s 无按键' % cn); continue
    t0 = keys_[0]['t']
    prev = t0
    macro = []
    for s in keys_:
        dt = s['t'] - prev
        prev = s['t']
        macro.append({'kind': 'key', 'key': s['key'], 'hold': s.get('hold', 0), 'dt': int(round(dt))})
    macro[0]['dt'] = 0
    out[key] = macro
    dur = (keys_[-1]['t'] + keys_[-1].get('hold', 0) - t0) / 1000.0
    gap = (clicks[-2]['t'] - keys_[-1]['t']) / 1000.0 if len(clicks) > 1 else -1
    print('=== %s (%s) ===' % (cn, key))
    print('  步数=%d  宏时长=%.1fs  末键→返回=%.1fs  总=%.1fs' % (
        len(macro), dur, gap, (arr[-1]['t'] - arr[0]['t']) / 1000.0))
    print('  序列: ' + ''.join('%s(%d)+%d ' % (m['key'], m['hold'], m['dt']) for m in macro))

open(r'C:\Users\chenyu\dsh\火影忍者\tools\macros_gangti.json', 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('\n=== JS ===')
print('const SECRET_REALM_MACROS_2 = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';')
