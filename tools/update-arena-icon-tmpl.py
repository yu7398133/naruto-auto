import io, base64, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# 1) 替换模板数据（换成 1280 空间切的 39x37）
png = io.open(r'C:\Users\chenyu\dsh\火影忍者\arena-end-icon-tmpl.png', 'rb').read()
new_url = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')
s2, n = re.subn(r"const ARENA_END_ICON_TMPL = 'data:image/png;base64,[^']*';",
                "const ARENA_END_ICON_TMPL = '" + new_url + "';", s)
assert n == 1, f'tmpl replace n={n}'
s = s2

# 2) 用实测定下的阈值与区域更新注释
old_note = """//  ✅ 本探针：右上角「战斗详情」左侧的蓝色卷轴图标，**只在该结算画面出现**。
//     模板 = 用户 2026-09-21 提供的 1920x1080 结算截图，图标本体
//       (1669,18)-(1725,70) → 1280x720 逻辑坐标 (1113,12)-(1150,47)，56x52。
//  ⚠ 阈值 30 待真机两态复测确认（正样本=该截图 score 应显著低于战斗帧）。
//     方法论：阈值必须由「正负样本实测值」取中，不能拍脑袋 —— 见
//     docs/视觉驱动自动化脚本-开发方法论.md §2。"""
new_note = """//  ✅ 本探针：右上角「战斗详情」左侧的蓝色卷轴图标，**只在该结算画面出现**。
//     模板 = 用户 2026-09-21 提供的 1920x1080 结算截图，图标本体
//       1920 坐标 (1669,18)-(1725,70) → **1280x720 逻辑坐标 (1112,11)-(1151,48)，39x37**。
//     ⚠ 必须从**归一化到 1280x720 的画布**上切模板，与运行时搜索同空间 ——
//       早先直接切 1920 原图再让 findTemplate 缩放搜索，正样本自匹配只有 42.9
//       （阈值 30 会把正样本判成"没有"），根因就是缩放插值把模板糊了。
//  ✅ 阈值由「正负样本实测」定（工具 tools/verify-arena-icon-2sided.cjs）：
//       正样本（该结算截图）            score = 0.00
//       负样本（11 张其它画面，含秘境/面板/战斗）
//                                      score = 44.92 ~ 52.57（最近 44.92）
//     → 分离区宽 44.9，取 30：距正样本 30、距负样本最近 14.9，两侧余量充足。
//     方法论：阈值必须由正负样本实测值取中，不能拍脑袋 —— 见
//     docs/视觉驱动自动化脚本-开发方法论.md §2。"""
assert s.count(old_note) == 1, f'note count={s.count(old_note)}'
s = s.replace(old_note, new_note, 1)

s = s.replace("const ARENA_END_ICON_REGION = [1100, 4, 1163, 58];",
              "const ARENA_END_ICON_REGION = [1095, 2, 1168, 62];")
s = s.replace("const ARENA_END_ICON_THRESH = 30;",
              "const ARENA_END_ICON_THRESH = 30;   // 实测：正 0.00 / 负 ≥44.92")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK updated template + region + notes')
