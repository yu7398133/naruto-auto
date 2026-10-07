import json, os, base64, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
os.makedirs(OUT, exist_ok=True)

files = {
 '罡体秘境': r'18\1857b610beb650ae6a577cc22a8fc4ac1d87c10696f7a90d29f54a64f0dbb1ba\罡体秘境.json',
 '水牢秘境': r'2e\2e9b113e66ab678b086f93bda98412aeb7458c1921a559478dacf50e924fdf4\水牢秘境.json',
 '雷霆秘境': r'76\76f0646563347b8ba98e74e4051b47db8264e4999d15d0ef47302b0303ab4f64\雷霆秘境.json',
 '烈焰秘境': r'87\871fe649a83c76b848da7a5a4575a7b9c5e811166ff0de3527d0add62edc02bc\烈焰秘境.json',
 '落岩秘境': r'a4\a4940720a16f9163209b6b6835c2f6022d9fc2f07b527e3dd3a8fb78e7b1388e\落岩秘境.json',
 '阴阳秘境': r'a7\a7cb67f7d71806363a6a9dc83edccf73eb5c9965980ab317fbc22f60ead03773\阴阳秘境.json',
}

for name, rel in files.items():
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        print(f'❌ {name}: 不存在'); continue
    arr = json.load(open(p, encoding='utf-8'))
    print(f'\n=== {name}  ({len(arr)} 步) ===')
    if not arr: continue
    s0 = arr[0]
    keys = list(s0.keys())
    print('  第0步键:', keys)
    img_keys = [k for k in keys if isinstance(s0.get(k), str) and len(s0.get(k)) > 5000]
    print('  图像字段:', [k for k in img_keys] or '无')
    for k in img_keys:
        raw = s0[k]
        try:
            b = raw.split(',', 1)[1] if raw.startswith('data:') else raw
            data = base64.b64decode(b)
            ext = 'jpg' if data[:2] == b'\xff\xd8' else 'png'
            fp = os.path.join(OUT, f'{name}-first.{ext}')
            open(fp, 'wb').write(data)
            print(f'  ✅ {k} → {fp} ({len(data):,} bytes, {ext})')
        except Exception as e:
            print(f'  ⚠ {k} 解码失败: {e}')
