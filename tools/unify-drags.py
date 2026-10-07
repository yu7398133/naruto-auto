# -*- coding: utf-8 -*-
"""把所有任务的「主界面横向拖动」统一为 dragScene(ctx,'left'|'right')。

方向以**用户 2026-09-21 明确口径**为准（不采用原来注释里的标注，多处标错了）：
    排行榜点赞        → 最左
    组织祈福          → 最左   （注释原写「最右」，用户更正）
    丰饶之间          → 最右
    小队突袭          → 最右   （注释原写「最左」，用户更正）
    组织助战          → 最右   （与小队突袭同入口，用户确认）
    生存试炼          → 最右   （注释原写「最左」，用户更正）
    角斗场            → 最左   （注释原写「最右」，用户更正）
    积分赛领取        → 最左
    修行之路          → 最右   （注释原写「最左」，用户更正）
    任务集会所        → 最左（已单独改好）

匹配方式：逐行扫描，识别连续的 `await ctx.drag([...], ..., '主场景...')`（中间最多夹
一行 sleep），按下表替换。表里没有的 label 一律报错退出，绝不猜方向。
"""
import io, re, sys

P = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
lines = io.open(P, encoding='utf-8').read().split('\n')

# label → 方向。key 用 label 里的稳定片段；同 label 可能出现在多个任务，
# 所以用「行号锚定」不可靠 —— 改成按出现顺序消费 DIRECTION_QUEUE。
# 这里显式列出每个任务的两句 drag 所处的大致行号段，避免同 label 误配。
DIRECTION_QUEUE = [
    # (行号区间, 方向, 任务名)
    ((5600, 5610), 'left',  '排行榜点赞'),
    ((5960, 5970), 'left',  '组织祈福'),
    ((6020, 6030), 'right', '丰饶之间'),
    ((6050, 6060), 'right', '小队突袭'),
    ((6185, 6195), 'right', '组织助战'),
    ((6230, 6240), 'right', '生存试炼'),
    ((6330, 6340), 'left',  '角斗场'),
    ((7020, 7030), 'left',  '积分赛领取'),
    ((7055, 7062), 'right', '修行之路'),
]

DRAG_RE = re.compile(r"^(\s*)await ctx\.drag\(\[[^\]]*\][^)]*'(主场景[^']*)'\);\s*$")
SLEEP_RE = re.compile(r"^\s*await (?:Utils\.sleep|ctx\.sleep)\([^)]*\);\s*(?://.*)?$")

def dir_for(lineno):
    for (lo, hi), d, name in DIRECTION_QUEUE:
        if lo <= lineno <= hi:
            return d, name
    return None, None

# ── 先找所有「成对 drag」的位置 ─────────────────────────────────
i = 0
out = []
report = []
unknown = []
while i < len(lines):
    m = DRAG_RE.match(lines[i])
    if not m:
        out.append(lines[i]); i += 1; continue
    indent, label = m.group(1), m.group(2)
    j = i + 1
    if j < len(lines) and SLEEP_RE.match(lines[j]):
        j += 1
    m2 = DRAG_RE.match(lines[j]) if j < len(lines) else None
    if not m2:
        out.append(lines[i]); i += 1; continue

    d, name = dir_for(i + 1)
    if d is None:
        unknown.append((i + 1, label))
        out.append(lines[i]); i += 1; continue

    out.append(f"{indent}await dragScene(ctx, '{d}');   // 拖到最{'右' if d == 'right' else '左'} ×2（统一动作）")
    report.append((i + 1, name, label, d))
    i = j + 1

if unknown:
    print("❌ 有未在方向表中登记的拖动，已中止（未写文件）：")
    for ln, lb in unknown:
        print(f"   行 {ln}: {lb}")
    sys.exit(1)

io.open(P, 'w', encoding='utf-8', newline='').write('\n'.join(out))

print(f"✓ 替换 {len(report)} 处：")
for ln, name, label, d in report:
    print(f"  行 {ln:>5}  {name:<12} (原标注「{label}」) → {d}")
