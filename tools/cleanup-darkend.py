import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
edits = []

# ① 删除 darkEndAfterMs 的注释块 + 声明（用行范围，避免模板字符串匹配问题）
lines = s.split('\n')
cand = [k for k, l in enumerate(lines) if 'const darkEndAfterMs = opts.darkEndAfterMs' in l]
assert len(cand) == 1, f'声明行数={len(cand)}'
d = cand[0]
# 向上吃掉整段注释
top = d
while top > 0 and lines[top-1].strip().startswith('//'):
    top -= 1
print(f'删除声明块 {top+1}..{d+1}')
lines[top:d+1] = []
s = '\n'.join(lines)

# ② 任务层传参
a = "          darkEndAfterMs: 25000,\n"
assert s.count(a) == 1, f'传参 count={s.count(a)}'
s = s.replace(a, "", 1)

# ③ waitForEnd 里那句「保留：…黑屏过场（darkEndAfterMs）」注释
lines = s.split('\n')
for k, l in enumerate(lines):
    if '保留：结算图标 / 金色横幅 / 黑屏过场（darkEndAfterMs）' in l:
        lines[k] = l.replace(
            '// 保留：结算图标 / 金色横幅 / 黑屏过场（darkEndAfterMs）—— 都是**离散 UI 事件**，',
            '// 保留：结算图标 / 金色横幅 —— 都是**离散 UI 事件**，')
    if "//   · 'darkend'（整场黑屏过场）/ 'frozen'（静止兜底）/ 'timeout' 这三种都表示" in l:
        lines[k] = l.replace(
            "//   · 'darkend'（整场黑屏过场）/ 'frozen'（静止兜底）/ 'timeout' 这三种都表示",
            "//   · 'timeout' 表示")
s = '\n'.join(lines)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('清理完成')
