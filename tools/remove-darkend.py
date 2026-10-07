import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

lines = s.split('\n')
# 定位：从「0.5.81 快通道」注释行，到 `return 'darkend';` 后的闭合花括号
i = next(k for k, l in enumerate(lines) if '0.5.81 快通道：极暗过场 = 整场结束' in l)
j = next(k for k, l in enumerate(lines) if k > i and "return 'darkend';" in l)
# j 之后那行应是 `          }`
k_close = j + 1
assert lines[k_close].strip() == '}', f'预期闭合花括号，实际: {lines[k_close]!r}'
print(f'删除 {i+1}..{k_close+1} 行（{k_close-i+1} 行）')

new_block = """            // ── v0.6.19：原「黑屏 = 整场结束」快通道已删除 ──────────────────────
            //   用户 2026-09-21 反馈：**小局切换也是黑屏**（「胜负已分 → 黑屏 → 下一小局」），
            //   而该闸用的是**_整场**开始时间 _fightStart —— 打到 25s 后，任何一次小局切换的
            //   黑屏都会被误判成「整场结束」，把连点器提前停掉（用户看到「小局被停」）。
            //   0.5.81 当初加它是为了救「整场结束的黑屏后停在不认识的面板页」那个场景；
            //   现在结算图标（arenaEndIcon）在那之前就能命中、来得及停手，这条不再需要。
            //   保留 _blackAt：仍作为金色横幅的「序列确认」一环（见下方 recentBlack）。"""

lines[i:k_close+1] = new_block.split('\n')
s2 = '\n'.join(lines)

# darkEndAfterMs 的声明也一并删（已无读取方）
head = """      // 0.5.81：**整场结束的「极暗过场」快通道**（角斗场专属）。实测数据（trace 2026-09-19T13-35-52，2000 拍）：
      //   · 战斗中全屏最暗也有 BR 100+（7:13~7:32 整段 100~130）；
      //   · 「小局切换」的暗帧 BR 14.0~22.3（6:47.30 / 7:06.23，不是全屏黑）；
      //   · 「整场结束」的暗帧 BR **1.3~5.3**（7:33.33 / 7:34.75）= detect() 判 SCENE.LOADING（阈值 <12）。
      //   → 本场已进行 ≥ darkEndAfterMs 之后出现 SCENE.LOADING，就是整场打完的过场黑幕。
      //   ⚠ 时间闸用于排除「开局进战斗」的加载黑屏（那也在 SCENE.LOADING）。
      const darkEndAfterMs = opts.darkEndAfterMs != null ? opts.darkEndAfterMs : 0;
"""
if s2.count(head) == 1:
    s2 = s2.replace(head, "", 1)
    print('darkEndAfterMs 声明已删除')
else:
    print(f'!! 声明块 count={s2.count(head)}，保留（无害死变量）')

io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('写入完成')
