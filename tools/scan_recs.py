"""从 8 份战斗录制的最后帧提取秘境名模板（战斗中顶部中央的金色「XX秘境」）。
实测位置：(575,20)-(705,55)（vision_describe 对 落岩-last.jpg 测量），留边距取 (560,12)-(720,62)。"""
import io, sys, json, os, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from PIL import Image

SRC = r'C:\Users\chenyu\.dsh-beta\attachments\v1\files'
OUT = r'C:\Users\chenyu\dsh\火影忍者\tools\realms'
X0, Y0, X1, Y1 = 560, 12, 720, 62   # 160x50

# 8 个秘境 → 对应录制 json（相对 SRC）
RECS = {
 'luoyan':  (r'1f\1fc4d1a9ea07ed6b0e06cad5bbbbd2e5a0e8bd3b6bbf6d2a1b0e3a7f0a4e5c9d\落岩秘境战斗.json', '落岩'),
 'dufeng':  (r'2a\2a3f8e1c5b7d9a0e4f6c8b2d1e3a5f7c9b0d2e4f6a8c1b3d5e7f9a0c2b4d6e8f\毒风秘境战斗.json', '毒风'),
 'leiting': (r'3b\3b4e9f2d6c8e0b1f5a7d9c3e2f4a6b8d1c3e5a7b9d2c4e6f8a0b3d5e7f9a1c\雷霆秘境战斗.json', '雷霆'),
}
# 哈希不靠谱，改为扫描目录找「XX秘境战斗.json」
def find_rec(keyword):
    """按中文关键词在 SRC 下递归找 json。"""
    for root, _, files in os.walk(SRC):
        for f in files:
            if f.endswith('.json') and keyword in f and '战斗' in f and '2' not in f.split('秘境')[0][-1:]:
                yield os.path.join(root, f)

WANT = [('luoyan','落岩'), ('dufeng','毒风'), ('leiting','雷霆'), ('lieyan','烈焰'),
        ('yinyang','阴阳'), ('shuilao','水牢'), ('gangti','罡体'), ('gangti2','缸体')]
# 排除带「2」的（除了缸体2 本身）
print('=== 扫描候选文件 ===')
alljson = []
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.json') and '秘境' in f and '战斗' in f:
            alljson.append((f, os.path.join(root, f)))
for f, p in sorted(alljson):
    print('  %s' % f)
