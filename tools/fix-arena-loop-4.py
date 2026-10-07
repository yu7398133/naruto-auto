import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# 循环开头：先确保到了准备界面（首次在房间页 → 需点「选对手/挑战」）
a = """          // ① 点「开战」（v0.6.20）
          //   用户口径：「开战直接用第一次进来的坐标就可以了，第一次是对的，重复用第一次的就行」
          //   → (1168,609)，来自录制「末尾快速点击快速过了结算画面.json」seq 1（已由 vision 确认该帧是准备界面）。
          //
          //   ⚠ 循环里**不再点「选对手/挑战」(315,637)**：
          //     旧实现每轮都点它，但第 2 轮开始时人还在结算/奖励页，(315,637) 落到
          //     「调整阵容 (1042,666)」那一片 → 用户反馈「点到调整阵容去了」。
          //     现在结构是：结算跳过 → 等准备界面回来 → 直接点开战。
          if (!(await tapAndDiff(1168, 609, '开战', 2500, true))) {
            await unstuck('点「开战」画面没反应');
            continue;
          }
"""
b = """          // ① 先确认人在「战斗准备界面」（v0.6.20）
          //   首次进场 enterArena() 落在**房间页**，需要点「选对手/挑战」才进准备界面；
          //   第 2 轮起，上一轮末尾已用 waitArenaReady 确认过在准备界面，这里直接命中。
          //   ⚠ 旧实现每轮都盲点 (315,637)：第 2 轮时人还在结算/奖励页，那坐标落到
          //     「调整阵容 (1042,666)」那一片 → 用户反馈「点到调整阵容去了」。
          //     现在改成**先用探针确认，不在才点**，不再盲点。
          let atReady = (await ctx.waitArenaReady(2500)).ok;
          if (!atReady) {
            Utils.log('info', '    · 不在准备界面 → 点「选对手/挑战」进准备界面');
            await tapAndDiff(315, 637, '选对手/挑战', 2000, round === 1);
            atReady = (await ctx.waitArenaReady(8000)).ok;
          }
          if (!atReady) {
            await unstuck('没到战斗准备界面（图标+红X 都未命中）');
            continue;
          }
          Utils.log('info', '    ✓ 已在战斗准备界面');

          // ② 点「开战」（v0.6.20）
          //   用户口径：「开战直接用第一次进来的坐标就可以了，第一次是对的，重复用第一次的就行」
          //   → (1168,609)，来自录制「末尾快速点击快速过了结算画面.json」seq 1（已由 vision 确认该帧是准备界面）。
          if (!(await tapAndDiff(1168, 609, '开战', 2500, true))) {
            await unstuck('点「开战」画面没反应');
            continue;
          }
"""
assert s.count(a) == 1, f'count={s.count(a)}'
s = s.replace(a, b, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('循环开头加了「确认在准备界面」')
