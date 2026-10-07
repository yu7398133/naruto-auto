import json, os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

for name in ('秘境.json', '秘境探险.json', '秘境探险3.json'):
    p = os.path.join(os.path.expanduser('~'), 'Desktop', name)
    j = json.load(open(p, encoding='utf-8'))
    L = [len(s['frame']) for s in j if s.get('frame')]
    total = os.path.getsize(p)
    frames = sum(L)
    print(f"{name}")
    print(f"  帧数={len(L)}  单帧 base64 平均={frames//max(1,len(L)):,} 字符")
    print(f"  文件总大小 = {total:,} bytes ({total/1024/1024:.2f} MB)")
    print(f"  帧 base64 合计 = {frames:,} bytes ({frames/1024/1024:.2f} MB)  占比 {frames/total*100:.1f}%")
    # 估算：240x240 JPEG q0.72 大约多少
    print(f"  按 240x240 JPEG(~12KB base64) 加一帧裁剪，增量 = {len(L)*12*1024/1024:.2f} MB")
    print()
