import json, io
p = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\b0\b0c7cb471b9b6843537f142e9e341dd09c663b34eb81f0922a0c7a7e67494170\naruto-calib-2026-09-21T06-35-52-351Z.json"
d = json.load(io.open(p, encoding='utf-8'))
print(f'共 {len(d)} 步\n')
t0 = d[0]['t']
for s in d:
    e = {k: v for k, v in s.items() if k != 'frame'}
    print(f"#{e.get('seq'):>3} dt={e['t']-t0:>6}ms kind={e.get('kind'):<6} name={e.get('name')}")
    keys = ['key', 'code', 'keyCode', 'hold', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'duration', 'scene', 'area', 'color']
    kv = ' '.join(f'{k}={e[k]}' for k in keys if k in e and e[k] is not None)
    print(f'      {kv}')
# 汇总按键序列
print('\n=== 按键序列（key 步）===')
ks = [s for s in d if s.get('kind') == 'key']
for i, s in enumerate(ks, 1):
    print(f"  {i:>2}. key={s.get('key'):<6} hold={s.get('hold')} dt={s['t']-t0}")
print(f'\n共 {len(ks)} 个按键')
