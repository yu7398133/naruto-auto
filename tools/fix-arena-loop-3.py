import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① 循环内：删掉「选对手/挑战」这一步（它是首次进场才有的），开战坐标改用第一次的 (1168,609)
a1 = """          // ①「选对手/挑战」必须真的点得动：没反应 = 画面根本不在角斗场房间页 → 解卡后重试
          let opened = false;
          for (let a = 0; a < 5 && !opened; a++) {
            if (await tapAndDiff(315, 637, '选对手/挑战', 2000, a === 0)) { opened = true; break; }
            await unstuck(`第 ${a + 1} 次点「选对手/挑战」画面没反应（多半不在角斗场房间页）`);
          }
          if (!opened) {
            Utils.log('warn', '    ✗ 连续 5 次都点不动「选对手/挑战」，结束本任务（不再盲点乱点）');
            break;
          }

          // ②「开始对战」同样自检
          if (!(await tapAndDiff(1165, 629, '开始对战', 2500, true))) {
            await unstuck('点「开始对战」画面没反应');
            continue;
          }
"""
b1 = """          // ① 点「开战」（v0.6.20）
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
assert s.count(a1) == 1, f'① count={s.count(a1)}'
s = s.replace(a1, b1, 1)

# ② 结算后点 k：用户确认「结算识别后 0.5s 点 k」→ 延迟改 500ms，单击即可
a2 = """          ctx.op.releaseHold();
          await Utils.sleep(300);
          for (let t = 0; t < 3; t++) {
            await ctx.op.clickNatural(1137, 589, null, `跳过结算 ${t + 1}/3`);
            await Utils.sleep(700);
          }
          ctx.op.releaseHold();
          await Utils.sleep(1000);            // 让结算动画/奖励浮层走完
"""
b2 = """          // 用户口径（2026-09-21）：「结算识别后 0.5s 点 k 那个位置」。
          //   即结算图标命中 → 松手 → 隔 0.5s → 在普攻位 k(1137,589) 点一下跳过结算。
          //   实测第一局 complete OK；点一次足够，不重复点（避免连点到下一界面的东西）。
          ctx.op.releaseHold();
          await Utils.sleep(500);
          await ctx.op.clickNatural(1137, 589, null, '跳过结算（点 k 位）');
          ctx.op.releaseHold();
          await Utils.sleep(1200);            // 让结算动画/奖励浮层走完
"""
assert s.count(a2) == 1, f'② count={s.count(a2)}'
s = s.replace(a2, b2, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('循环体已按用户口径重排')
