import json, io, base64, os, sys

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files\5a\5a312521c0e6992bbd97c94e5e9e645fc95f6bf01c6968d14b5a099bd750d330\末尾快速点击快速过了结算画面.json'
OUT = r'C:\Users\chenyu\dsh\火影忍者\arena-tail-frames'

d = json.load(io.open(SRC, encoding='utf-8'))
arr = d if isinstance(d, list) else d.get('items', [])
os.makedirs(OUT, exist_ok=True)

t0 = arr[0].get('t', 0)
print(f'共 {len(arr)} 项，总时长 {(arr[-1].get("t",0)-t0)/1000:.1f}s\n')
print(f'{"seq":>4} {"Δt(s)":>8} {"kind":>6} {"name":>9} {"x,y":>12} {"scene":>9}  frame')
for it in arr:
    dt = (it.get('t', 0) - t0) / 1000
    xy = f"{it.get('x','-')},{it.get('y','-')}" if it.get('kind') == 'click' else (it.get('key') or '')
    f = it.get('frame')
    name = f"a{it['seq']:03d}.jpg"
    if f:
        with open(os.path.join(OUT, name), 'wb') as fh:
            fh.write(base64.b64decode(f.split(',', 1)[1]))
    print(f"{it.get('seq'):>4} {dt:>8.2f} {it.get('kind',''):>6} {it.get('name',''):>9} {xy:>12} {it.get('scene',''):>9}  {name if f else '-'}")
