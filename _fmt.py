import json, os, io, sys, base64, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

p = os.path.join(os.path.expanduser('~'), 'Desktop', '秘境.json')
s = open(p, encoding='utf-8').read()

# 找 frame 字段的头部，看是 PNG 还是 JPEG
m = re.search(r'"frame"\s*:\s*"data:image/(\w+);base64,([A-Za-z0-9+/=]{40})', s[:4000000])
if m:
    fmt, head = m.group(1), m.group(2)
    raw = base64.b64decode(head + '=' * ((4 - len(head) % 4) % 4))
    print(f"帧格式 = {fmt}")
    print(f"  头部字节 = {raw[:12].hex(' ')}")
    print(f"  判定: {'JPEG (FF D8 FF)' if raw[:3] == b'\\xff\\xd8\\xff' else 'PNG (89 50 4E 47)' if raw[:4] == b'\\x89PNG' else '???'}")

j = json.load(open(p, encoding='utf-8'))
s0 = j[0]
print()
print("第一条 step 的字段：")
for k, v in s0.items():
    if k == 'frame':
        print(f"  frame: <data URI, {len(v):,} 字符>")
    else:
        print(f"  {k}: {v!r}")

# 解一帧看真实尺寸
from io import BytesIO
from PIL import Image
b64 = s0['frame'].split(',', 1)[1]
im = Image.open(BytesIO(base64.b64decode(b64)))
print()
print(f"解码后尺寸 = {im.size}  模式={im.mode}")
print(f"base64 长度 = {len(b64):,}  解码后 = {len(base64.b64decode(b64)):,} bytes ({len(base64.b64decode(b64))/1024:.1f} KB)")
