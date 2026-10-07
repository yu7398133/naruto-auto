import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# 撤回 ④：坐标改回原值（用户：坐标对不上不关键）
back = [
    ("title: '打开丰饶之间', detail: '点「丰饶之间」入口 (361,427)', coord: [361, 427]",
     "title: '打开丰饶之间', detail: '点「丰饶之间」入口 (364,423)', coord: [364, 423]"),
    ("title: '点挑战', detail: '点「挑战」按钮 (543,648)', coord: [543, 648]",
     "title: '点挑战', detail: '点「挑战」按钮 (546,645)', coord: [546, 645]"),
    ("await ctx.go([361, 427], null, '打开丰饶之间');",
     "await ctx.go([364, 423], null, '打开丰饶之间');"),
    ("await ctx.tap([543, 648], null, '点挑战');",
     "await ctx.tap([546, 645], null, '点挑战');"),
]
for a, b in back:
    assert s.count(a) == 1, f'锚点={s.count(a)}: {a[:48]}'
    s = s.replace(a, b, 1)

# 撤回 ⑤：ctx.battle.run 改回 ctx.fight（去掉为凑步数引入的复杂度）
old = """        // ⚠ 这里用 ctx.battle.run() 而不是 ctx.fight()：fight() 内部会 _advance 一次，
        //   那样步数会变成 7（多一格）。改由我们按用户口径显式 step，正好 6 步。
        ctx.step('战斗');
        ctx.step('探测结算');
        await ctx.battle.run({ abundanceRedX: true });
        ctx.stepResult(true);
        ctx.step('回到主界面');"""
assert s.count(old) == 1, f'锚点={s.count(old)}'
s = s.replace(old, """        // 流程图按用户口径显示三个阶段（用户：流程图是给人对照画面看的，步名要能对上画面）：
        //   战斗 → 探测结算 → 回到主界面。三者在画面上确实依次可见。
        //   ⚠ fight() 内部会自己 _advance 一次，所以这里只补「战斗」「探测结算」两格，
        //     第三格由 fight() 自身推进占位（它执行完就等于"回到主界面"）。
        ctx.step('战斗');
        ctx.step('探测结算');
        await ctx.fight({ abundanceRedX: true });""", 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('已撤回坐标改动 + ctx.battle.run 复杂度')
