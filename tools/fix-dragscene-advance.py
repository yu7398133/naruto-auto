import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

old = """async function dragScene(ctx, dir) {
  const d = dir === 'left' ? SCENE_DRAG_TO_LEFT : SCENE_DRAG_TO_RIGHT;
  for (let i = 0; i < 2; i++) {
    await ctx.op.swipe(d.x1, d.y1, d.x2, d.y2, d.duration);
    if (i === 0) await Utils.sleep(1600);   // 让滑动惯性动画走完再拖第二次
  }
}"""
assert s.count(old) == 1, f'锚点={s.count(old)}'

new = """async function dragScene(ctx, dir) {
  const d = dir === 'left' ? SCENE_DRAG_TO_LEFT : SCENE_DRAG_TO_RIGHT;
  const what = dir === 'left' ? '最左' : '最右';
  for (let i = 0; i < 2; i++) {
    // v0.6.25 关键修复：原先直接调 ctx.op.swipe —— **绕过了 TaskContext.drag()，
    //   因此从不调 _advance，流程图一步都不推进**。
    //   各任务 steps[] 里为拖动声明了 2 个 drag 条目（「拖到最右（第一次）/（第二次）」），
    //   实际却 0 次推进 → 计数器整体少 2，末尾两步永远高亮不到，
    //   面板看起来就"卡在『打开 XXX』那一步"（用户 2026-09-23 反馈丰饶之间）。
    //   实测：丰饶 5 步声明 / 只推进 3 次（go + tap + fight）。
    //   ⚠ 必须在**真实 swipe 之前**推进（_advance 的语义是"即将执行第 i 步"），
    //     否则面板会提前亮下一步、与画面圈不同步。
    ctx._advance(`主场景拖到${what}（第 ${i + 1} 次）`);
    await ctx.op.swipe(d.x1, d.y1, d.x2, d.y2, d.duration);
    ctx.stepResult(true);
    if (i === 0) await Utils.sleep(1600);   // 让滑动惯性动画走完再拖第二次
  }
}"""
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('dragScene 已修：现在推进 2 次流程图')
