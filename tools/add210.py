import json, os, base64, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'

files = {
 '挑战券0': r'd0\d00ca0dc507f6d832149ed0b4251d2203561936c453541274f085e28cdf7459a\挑战卷0.json',
 '罡体战斗': r'8a\8a465a9d2743629777e580eb8cec1de413239e206e49cfea628f99f902bfd8b9\罡体秘境战斗.json',
 '缸体战斗2': r'7a\7a38e9e89a7058af982e750d0a6b31a62b4229df79e50a3434bdf9bf7a90b695\缸体秘境战斗2.json',
}
for n, rel in files.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        print('❌ %s 不存在' % n); continue
    arr = json.load(open(p, encoding='utf-8'))
    print('\n=== %s  %d 步 ===' % (n, len(arr)))
    # 打印所有步骤最后几步，看有没有券数/弹窗线索
    for s in arr:
        if s.get('kind') == 'click':
            print('  seq%-2d CLICK (%s,%s) scene=%s' % (s.get('seq'), s.get('x'), s.get('y'), s.get('scene')))
    # 保存首帧
    s0 = arr[0]
    raw = s0.get('frame', '')
    if raw:
        b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
        data = base64.b64decode(b)
        fp = os.path.join(OUT, n + '-prepare.jpg')
        open(fp, 'wb').write(data)
        print('  → %s (%s B)' % (fp, format(len(data), ',')))
