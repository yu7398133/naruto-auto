import json, os, base64, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'

for n, rel in {
 '罡体战斗': r'8a\8a465a9d2743629777e580eb8cec1de413239e206e49cfea628f99f902bfd8b9\罡体秘境战斗.json',
 '缸体战斗2': r'7a\7a38e9e89a7058af982e750d0a6b31a62b4229df79e50a3434bdf9bf7a90b695\缸体秘境战斗2.json',
}.items():
    p = os.path.join(SRC, rel)
    arr = json.load(open(p, encoding='utf-8'))
    t0 = arr[0]['t']
    print('\n=== %s  %d 步 ===' % (n, len(arr)))
    for s in arr:
        dt = (s['t'] - t0) / 1000.0
        if s.get('kind') == 'click':
            print('  seq%-2d +%5.1fs  CLICK (%s,%s)  scene=%s' % (s['seq'], dt, s['x'], s['y'], s.get('scene')))
        elif s.get('kind') == 'key':
            print('  seq%-2d +%5.1fs  key=%s hold=%s' % (s['seq'], dt, s['key'], s.get('hold')))
    # 保存前 3 帧（看弹窗）
    for i in ([1, 2] if len(arr) > 2 else [0]):
        raw = arr[i].get('frame', '')
        if not raw: continue
        b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
        data = base64.b64decode(b)
        fp = os.path.join(OUT, '%s-frame%d.jpg' % (n, i))
        open(fp, 'wb').write(data)
        print('  → 存 %s (%s B)' % (fp, format(len(data), ',')))
