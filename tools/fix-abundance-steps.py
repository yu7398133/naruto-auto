import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

old_steps = """      steps: [
        { kind: 'drag', title: '主场景拖到最右（第一次）', detail: '统一动作：拖到最右 ×2', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最右（第二次）', detail: '统一动作：拖到最右 ×2', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开丰饶之间', detail: '点「丰饶之间」入口 (361,427)', coord: [361, 427], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮 (543,648)', coord: [543, 648], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 300s（含战斗））', coord: null, color: '248,81,73' },
      ],"""
assert s.count(old_steps) == 1, f'steps 锚点={s.count(old_steps)}'

new_steps = """      /** v0.6.25：按用户口径重写，与 run() 动作一一对应（用户 2026-09-23）：
       *  「主场景拖到最右 → 打开丰饶之间 → 点挑战 → 战斗 → 探测结算 → 回到主界面」
       *  ⚠ 拖动是**一个步骤**（dragScene 内部拖 2 次算一次统一动作）——
       *    旧版拆成「第一次/第二次」两条，加上 dragScene 当时不推进流程图，
       *    导致高亮永远对不上（用户反馈「卡在打开丰饶之间」）。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最右', detail: '统一动作：拖到最右 ×2', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开丰饶之间', detail: '点「丰饶之间」入口 (361,427)', coord: [361, 427], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮 (543,648)', coord: [543, 648], color: '126,231,135' },
        { kind: 'check', title: '战斗', detail: 'fight() 连点器打到结束', coord: null, color: '248,81,73' },
        { kind: 'check', title: '探测结算', detail: '右上角红叉（PROBES.closeX）出现即判本场结束', coord: null, color: '248,81,73' },
        { kind: 'check', title: '回到主界面', detail: '清结算 → 回主界面', coord: null, color: '248,81,73' },
      ],"""
s = s.replace(old_steps, new_steps, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('丰饶之间 steps 已重写为 6 步：拖动 / 打开 / 挑战 / 战斗 / 探测结算 / 回主界面')
