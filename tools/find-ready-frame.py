import json, io

SRC = (r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\5a'
       r'\5a312521c0e6992bbd97c94e5e9e645fc95f6bf01c6968d14b5a099bd750d330'
       r'\末尾快速点击快速过了结算画面.json')
d = json.load(io.open(SRC, encoding='utf-8'))
arr = d if isinstance(d, list) else d.get('items', [])
t0 = arr[0]['t']
print('seq   Δt(s)   kind   key    scene       ← 关注点')
for it in arr:
    dt = (it['t'] - t0) / 1000
    k = it.get('key') or (f"{it.get('x')},{it.get('y')}" if it.get('kind') == 'click' else '')
    mark = ''
    # 找准备界面：点开始对战前、场景为 other/daily 且不在战斗中
    if it.get('scene') in ('daily', 'other'):
        mark = '  ★'
    print(f"{it['seq']:>4} {dt:>8.2f}  {it.get('kind',''):>5}  {str(k):>10}  {it.get('scene',''):>10}{mark}")
