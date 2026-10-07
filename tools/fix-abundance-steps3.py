import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① 删掉过期的旧 doc 注释（与新的重复）
old_doc = """      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准 JSON 实测坐标：先两次拖动把主场景拉到最右，再进丰饶之间挑战；
       *  校准里的战斗录制部分（点击+键盘 a/d）改用脚本原 fight() 自动战斗逻辑 */
      /** v0.6.25：按用户口径重写"""
assert s.count(old_doc) == 1, f'doc 锚点={s.count(old_doc)}'
s = s.replace(old_doc, """      /** v0.6.25：按用户口径重写""", 1)

# ② fight() 内部也会 _advance 一次 → 会多推一步。丰饶这里改用
#    ctx.battle.run()（不推进）由我们自己 step，避免多算。
old_run = """        ctx.step('战斗');
        ctx.step('探测结算');
        await ctx.fight({ abundanceRedX: true });
        ctx.step('回到主界面');"""
assert s.count(old_run) == 1, f'run 锚点={s.count(old_run)}'
s = s.replace(old_run, """        // ⚠ 这里用 ctx.battle.run() 而不是 ctx.fight()：fight() 内部会 _advance 一次，
        //   那样步数会变成 7（多一格）。改由我们按用户口径显式 step，正好 6 步。
        ctx.step('战斗');
        ctx.step('探测结算');
        await ctx.battle.run({ abundanceRedX: true });
        ctx.stepResult(true);
        ctx.step('回到主界面');""", 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK')
