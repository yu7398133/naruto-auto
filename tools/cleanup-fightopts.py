import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① FIGHT_OPTS：清理已删除的横幅/黑屏参数，注释改成 v0.6.20 实况
a = """        // 0.5.78：忍术对战专用结算识别参数 —— 详见 waitForEnd 顶部注释（每个都对应一条实测证据）
        const FIGHT_OPTS = {
          noHome: true,             // 不回主界面，续局由本任务决定
          noDefeat: true,           // 不认「失败」探针（在「双方登场」画面必然误报，trace 21 帧全中）
          vsConfirm: 2,             // 横幅只显示 0.3~1s：连续 2 拍即落判（默认 3 拍会漏）
          strongBanner: true,       // 金色横幅单拍强命中（d≤20）直接落判 —— 本次 trace 1020 帧零误报
          blackWindowMs: 4000,      // 黑屏序列确认窗口 12s → 4s（12s 会把开场加载黑屏算进来）
          bannerGraceMs: 6000,      // 横幅后观察窗：画面恢复动态=自动续局 → 继续连招
          assistMaxMs: 300000,      // 单场连招上限 5min（默认 150s 会把长局截断 → "不按键"）
          maxWaitMs: 360000,        // 单场等待上限 6min
          // 0.5.81：整场结束快通道 —— 本场 ≥25s 后出现全屏黑（BR<12）即判整场打完。
          //   实测：战斗中 BR≥100 /「小局切换」暗帧 14.0~22.3 /「整场结束」暗帧 1.3~5.3。
          //   用户反馈的「7m32s~7m33s 战斗结束没识别到」= 那两拍 BR 5.3 / 1.3，本次直接落判（不再等 20s 兜底）。
          // 0.6.16：主判据改为**结算图标模板匹配**（右上角「战斗详情」卷轴图标）。
          //   旧的三条（横幅 / 黑屏 / 静止）全部保留作兜底 —— 万一 UI 改版导致
          //   模板失配，仍能靠它们收尾，不会整场卡死。
          arenaEndIcon: true,
        };"""
b = """        // v0.6.20：忍术对战战斗参数 —— 详见 waitForEnd 顶部注释（每个都对应一条实测证据）
        //   结算判据**只保留**「右上角战斗详情卷轴图标」（arenaEndIcon）。
        //   已删除（用户 2026-09-21 逐条否掉，理由都在 waitForEnd 注释里）：
        //     · 金色横幅「胜负已分」+ 6s 观察窗 —— 与图标打架（横幅先命中→判续局→图标才命中，白绕一圈）
        //     · 全屏黑屏快通道      —— 小局切换也黑屏，用的是整场起始时间 → 25s 后小局被误判成整场结束
        //     · 画面静止即停手/判结束 —— 战斗中静止是常态
        const FIGHT_OPTS = {
          noHome: true,             // 不回主界面，续局由本任务决定
          noDefeat: true,           // 不认「失败」探针（在「双方登场」画面必然误报，trace 21 帧全中）
          assistMaxMs: 300000,      // 单场连招上限 5min（默认 150s 会把长局截断 → "不按键"）
          maxWaitMs: 360000,        // 单场等待上限 6min
          // 结算图标模板匹配（右上角「战斗详情」卷轴图标）
          //   实测：正样本 2.5 / 负样本 ≥41.7 → 阈值 30，命中即落判（不再开观察窗）
          arenaEndIcon: true,
        };"""
assert s.count(a) == 1, f'① count={s.count(a)}'
s = s.replace(a, b, 1)

# ② 版本号
s, n1 = re.subn(r"@version\s+0\.6\.\d+", "@version      0.6.20", s)
s, n2 = re.subn(r"const VERSION = '0\.6\.\d+'", "const VERSION = '0.6.20'", s)
assert n1 == 1 and n2 == 1, f'version {n1}/{n2}'

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print(f'FIGHT_OPTS 已清理；版本 → 0.6.20 ({n1}/{n2})')
