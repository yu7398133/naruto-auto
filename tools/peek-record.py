import json, io, os, base64

SRC = (r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\e0'
       r'\e047d67f98f7dcf6a20399d0637c68afd656a5cb010c91b58039fe02a971f38a'
       r'\秘境探险3.json')

d = json.load(io.open(SRC, encoding='utf-8'))
arr = d if isinstance(d, list) else d.get('items', [])
print('总帧数:', len(arr))
print('第一条字段:', list(arr[0].keys())[:14])
t0 = arr[0]['t']
# 统计 kind 分布 + 是否有 frame
from collections import Counter
print('kind 分布:', Counter(x.get('kind') for x in arr))
withframe = [x for x in arr if x.get('frame')]
print('带 frame 的帧数:', len(withframe))
print('时长: %.1fs' % ((arr[-1]['t'] - t0) / 1000))
print()
print('前 8 帧:')
for it in arr[:8]:
    dt = (it['t'] - t0) / 1000
    k = it.get('key') or (f"{it.get('x')},{it.get('y')}" if it.get('kind') == 'click' else '')
    print(f"  seq={it.get('seq'):>4} t={dt:>8.2f}s {it.get('kind',''):>6} {str(k):>12} scene={it.get('scene','')}")
