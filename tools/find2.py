import json, os, sys, io, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'

cands = {
 '落岩战斗2': r'b1\b1b064f8cec72996fc14d1aef1f39074b17d9c17088ea825d3e3cc96e846f8f6c\落岩秘境战斗2（以前一个为准）.json',
 '罡体': r'18\1857b610beb650ae6a577cc22a8fc4ac1d87c10696f7a90d29f54a64f0dbb1ba\罡体秘境.json',
 '水牢战斗': r'c9\c9da9c945895e39c3a31eee52eb5ff9dc2a4a7860073fdd01481a3c3839c4349\水牢秘境战斗.json',
 '阴阳战斗2': r'83\838a5035ec85fb0fd2192287f713c4621213af5b3b3f2f1ef399f105b7d5eb11\阴阳秘境战斗2（以另一个为准）.json',
}
rows = []
for n, rel in cands.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        print('❌', n); continue
    arr = json.load(open(p, encoding='utf-8'))
    t0 = arr[0]['t']
    rows.append((t0, n, len(arr)))
    print('%-10s 步数=%2d  起始时间戳=%d' % (n, len(arr), t0))

print('\n=== 按时间排序 ===')
for t, n, c in sorted(rows):
    print('  %d  %-10s (%d步)' % (t, n, c))
