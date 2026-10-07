import json, io, sys
p = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files\b0\b0c7cb471b9b6843537f142e9e341dd09c663b34eb81f0922a0c7a7e67494170\naruto-calib-2026-09-21T06-35-52-351Z.json"
d = json.load(io.open(p, encoding='utf-8'))
print('顶层键:', list(d.keys()) if isinstance(d, dict) else f'list len={len(d)}')
if isinstance(d, dict):
    for k, v in d.items():
        if isinstance(v, list):
            print(f'  {k}: list[{len(v)}]')
            if v:
                print(f'     首项键: {list(v[0].keys()) if isinstance(v[0], dict) else type(v[0])}')
                print(f'     首项: {json.dumps(v[0], ensure_ascii=False)[:400]}')
        elif isinstance(v, dict):
            print(f'  {k}: dict{list(v.keys())[:20]}')
        else:
            print(f'  {k}: {repr(v)[:200]}')
elif isinstance(d, list):
    print('首项:', json.dumps(d[0], ensure_ascii=False)[:500])
