import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# 丰饶之间：steps[] 声明坐标对齐 run() 实际值（trace 实测 361,427 / 543,648）
pairs = [
    ("title: '打开丰饶之间', detail: '点「丰饶之间」入口 (364,423)', coord: [364, 423]",
     "title: '打开丰饶之间', detail: '点「丰饶之间」入口 (361,427)', coord: [361, 427]"),
    ("title: '点挑战', detail: '点「挑战」按钮 (546,645)', coord: [546, 645]",
     "title: '点挑战', detail: '点「挑战」按钮 (543,648)', coord: [543, 648]"),
]
for a, b in pairs:
    assert s.count(a) == 1, f'锚点数量={s.count(a)}: {a[:50]}'
    s = s.replace(a, b, 1)

# run() 里的坐标同步
pairs2 = [
    ("await ctx.go([364, 423], null, '打开丰饶之间');",
     "await ctx.go([361, 427], null, '打开丰饶之间');"),
    ("await ctx.tap([546, 645], null, '点挑战');",
     "await ctx.tap([543, 648], null, '点挑战');"),
]
for a, b in pairs2:
    assert s.count(a) == 1, f'锚点数量={s.count(a)}: {a[:50]}'
    s = s.replace(a, b, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('丰饶之间坐标已对齐（steps 与 run 一致 = trace 实测值）')
