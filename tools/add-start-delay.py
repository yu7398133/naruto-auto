import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① 在 opts 解析区加 startDelayMs
a1 = """      this._assistMaxMs = opts.assistMaxMs != null ? opts.assistMaxMs : null;
"""
b1 = """      this._assistMaxMs = opts.assistMaxMs != null ? opts.assistMaxMs : null;
      // v0.6.22：点「开战」后的**开场静默期**（忍术对战 10s）。
      //   用户 2026-09-22 口径：「点开战之后等 10s 才开始战斗模块」。
      //   依据：用户录制「末尾快速点击快速过了结算画面.json」实测 —— 点开战（seq1, t=0.00s）
      //     到第一个按键（seq2, t=22.68s）**空档 22.68s**，中间走完
      //     开战 → 加载过场 → 双方登场 → 战斗画面（对比两帧全屏均值：
      //     准备界面 [110,84,54] 暖色 → 首键时刻 [84,87,86] 灰暗中性=已在战斗画面）。
      //   取 10s 而非 22.68s：22.68s 是用户**眼睛看到战斗画面才动手**的反应时间，
      //     每局加载时长会抖，写死会「加载慢→键打在过场上 / 加载快→开场几秒不出手」。
      //     10s 是保守预热：把最伤的开场过场盖住，剩下的交给 SCENE.LOADING 闸。
      //   ⚠ 这段是**静默**的（不发任何键），且**不计入本场时长** —— _fightStart 与
      //     start 都在它之后才起算，否则 10s 会白吃掉 minWait/maxWait 的预算。
      const startDelayMs = opts.startDelayMs != null ? opts.startDelayMs : 0;
"""
assert s.count(a1) == 1, f'① count={s.count(a1)}'
s = s.replace(a1, b1, 1)

# ② 在 preMs 之前插入静默期
a2 = """      const preMs = Math.max(0, minWait - 2000);
      if (this.config.get('battle.keyAssist')) {
        await this.combatFor(preMs);   // 边打边等：连招辅助从一开始就输出
      } else {
        await Utils.sleep(preMs);
      }

      const start = Date.now();"""
b2 = """      // v0.6.22：开场静默期 —— 点开战后先什么都别按，等过场/登场走完
      if (startDelayMs > 0) {
        Utils.log('info', `    ⏳ 开场静默 ${Math.round(startDelayMs / 1000)}s（等过场/登场走完再开始连招）`);
        this.op && this.op.releaseHold && this.op.releaseHold();
        await Utils.sleep(startDelayMs);
        Runtime.check();
        // 静默期结束后**重设本场起点**：否则这 10s 会被算进本场时长，
        // 白吃掉 minWait（最短等待）与 maxWait（6 分钟上限）的预算。
        this._fightStart = Date.now();
      }

      const preMs = Math.max(0, minWait - 2000);
      if (this.config.get('battle.keyAssist')) {
        await this.combatFor(preMs);   // 边打边等：连招辅助从一开始就输出
      } else {
        await Utils.sleep(preMs);
      }

      const start = Date.now();"""
assert s.count(a2) == 1, f'② count={s.count(a2)}'
s = s.replace(a2, b2, 1)

# ③ 角斗场 FIGHT_OPTS 加上 10s
a3 = """          // 结算图标模板匹配（右上角「战斗详情」卷轴图标）
          //   实测：正样本 2.5 / 负样本 ≥41.7 → 阈值 30，命中即落判（不再开观察窗）
          arenaEndIcon: true,
        };"""
b3 = """          // 结算图标模板匹配（右上角「战斗详情」卷轴图标）
          //   实测：正样本 2.5 / 负样本 ≥41.7 → 阈值 30，命中即落判（不再开观察窗）
          arenaEndIcon: true,
          // 点「开战」后静默 10s 再开始连招（用户 2026-09-22 口径；录制实测空档 22.68s）
          startDelayMs: 10000,
        };"""
assert s.count(a3) == 1, f'③ count={s.count(a3)}'
s = s.replace(a3, b3, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('开场静默期已加入（角斗场 10s）')
