import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

old = """        { kind: 'drag', title: '主场景拖到最右（第一次）', detail: '统一动作：拖到最左 ×2（仅第一局前走一次）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最右（第二次）', detail: '统一动作：拖到最左 ×2', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开角斗场', detail: '点「忍术对战」入口 (974,357)', coord: [974, 357], color: '88,166,255' },
        { kind: 'tap', title: '选对手/挑战', detail: '点 (315,637)；未自动续局时才重复这一步', coord: [315, 637], color: '126,231,135' },
        { kind: 'tap', title: '开始对战', detail: '点 (1165,629)', coord: [1165, 629], color: '210,153,34' },
        { kind: 'check', title: '打完一小局（识别「胜负已分」）', detail: '按住普攻 + 5s 轮询技能；金色横幅单拍强命中 或 连续 2 拍 = 落判（横幅只显示 0.3~1s）', coord: null, color: '248,81,73' },
        { kind: 'check', title: '6s 观察窗：自动续局 or 真打完', detail: '0.5.78：横幅后黑屏过场走完画面重新动起来 = 自动续局 → 立刻接着连招（不再固定空等 10s）', coord: null, color: '188,140,255' },
        { kind: 'check', title: '续下一局（不回主界面）', detail: '0.5.78：观察窗内画面一直不动才判本局结束 → 点「选对手→开始对战」；已自动续局时这两下落在战斗画面，无害', coord: null, color: '188,140,255' },
        { kind: 'check', title: '点得动自检 + 解卡', detail: '0.5.79：点「选对手/挑战」后画面必须变化，没反应 = 不在这界面上 → 试点候选「确定(1136,306)/(645,660) / 关闭 / 返回」解卡；仍不行 → 回主界面重进角斗场；连续 5 次失败即停手报错', coord: null, color: '248,81,73' },
        { kind: 'check', title: '打满后清结算回主界面', detail: '走完 rounds 局后 clearSettlement + goHome', coord: null, color: '188,140,255' },
      ],"""

new = """        // ── 流程图（v0.6.20 重写：与 run() 实际代码逐条对应）───────────────────
        //   进场（只走一次）→ 循环 { 确认准备界面 → 开战 → 打 → 结算图标 → 点 k 跳过 → 回准备界面 }
        //   ⚠ 旧的 steps 还写着「胜负已分横幅 / 6s 观察窗 / 开始对战(1165,629)」等已被删除的东西，
        //     与代码对不上 → 本版全部重写，每条都指向 run() 里真实存在的那一行。
        { kind: 'drag', title: '进场①主场景拖到最左', detail: '统一动作：手左→右 ×2 拖到最左（仅首次进场走一次）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '进场②主场景拖到最左', detail: '第二次拖拽，间隔 1600ms', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '进场③打开角斗场', detail: '点「忍术对战」入口 (974,357)，等 2000ms 加载', coord: [974, 357], color: '88,166,255' },
        { kind: 'check', title: '循环①确认在战斗准备界面', detail: '探针 = 「规则说明」左侧蓝色感叹号模板匹配(阈 11.5，正 0/负 ≥22.98) AND 右上角红X 红色占比(阈 0.27，正 0.30/负 ≤0.24)，连续 2 拍命中', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '循环①b 未在准备界面 → 点选对手/挑战', detail: '只在探针未命中时才点 (315,637)（首次进场落在房间页需要它）；不再每轮盲点', coord: [315, 637], color: '126,231,135' },
        { kind: 'tap', title: '循环②点「开战」', detail: '点 (1168,609) —— 用户确认过的第一次坐标；点完用 diff≥0.05 自检', coord: [1168, 609], color: '210,153,34' },
        { kind: 'check', title: '循环③连点器打（中间零判据）', detail: '按住普攻 k + 轮询技能；不判静止、不判黑屏 —— 小局切换的黑屏不再打断连招', coord: null, color: '248,81,73' },
        { kind: 'check', title: '循环④结算图标命中即落判', detail: '右上角「战斗详情」卷轴图标模板匹配，阈 30（正 2.5 / 负 ≥41.7）；命中直接 return settlement，不再开 6s 观察窗', coord: null, color: '248,81,73' },
        { kind: 'tap', title: '循环⑤跳过结算：点 k 位', detail: '松手 → 隔 500ms → 点 (1137,589) 一下', coord: [1137, 589], color: '210,153,34' },
        { kind: 'check', title: '循环⑥等准备界面回来', detail: 'waitArenaReady(20s) 命中 → 回到循环①开下一局；20s 未命中 → 回主界面重进角斗场（不盲点）', coord: null, color: '188,140,255' },
        { kind: 'check', title: '异常兜底：解卡', detail: '探针确认失败或点不动 → 逐个试点 确定(1136,306)/(645,660)/关闭/返回；全无反应 → 回主界面重进角斗场', coord: null, color: '248,81,73' },
        { kind: 'check', title: '打满后清结算回主界面', detail: '走完 rounds 局后 clearSettlement + goHome', coord: null, color: '188,140,255' },
      ],"""

assert s.count(old) == 1, f'count={s.count(old)}'
s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('steps[] 已重写为 v0.6.20 实际流程')
