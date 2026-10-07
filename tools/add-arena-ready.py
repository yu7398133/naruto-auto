import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

anchor = """    async waitQuiet(interval, times) {"""
assert s.count(anchor) == 1, f'anchor count={s.count(anchor)}'

method = '''    /**
     * 等「忍术对战·战斗准备界面」（v0.6.20）。
     *
     * 用于把角斗场改成**真循环**：结算跳过之后不离开角斗场，就地等这个界面回来。
     * 用户口径（2026-09-21）：
     *   「循环的内容是 识别战斗准备界面 - 点开战 - 连点器 - 识别结算图标 - 点一下跳过结算」。
     *
     * 判据：「开始对战」按钮（1165,629）的**蓝色高亮**。该按钮是准备界面独有的，
     *   战斗中有 HUD 遮挡、结算页没有它。
     *   实测特征：按钮主体偏亮蓝（R<G<B 且 B 明显高），与周围暗色背景分离度高。
     *
     * 返回 {ok, ms, why}。ok=true 表示准备界面已就绪、可以点「开始对战」。
     */
    async waitArenaReady(budgetMs) {
      const t0 = Date.now();
      const budget = budgetMs || 20000;
      const [rx, ry, rw, rh] = ARENA_READY_REGION;   // [x,y,w,h]
      const need = 2;                                 // 连续 2 拍命中才算稳定
      let hit = 0;
      while (Date.now() - t0 < budget) {
        Runtime.check();
        let ok = false;
        try {
          this.vision.capture();
          const d = this.vision.ctx.getImageData(rx, ry, rw, rh).data;
          let blue = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            const R = d[i], G = d[i + 1], B = d[i + 2];
            n++;
            // 亮蓝：蓝通道显著高于红，且整体够亮（按钮是高饱和蓝底 + 白字）
            if (B > 120 && B > R + 40 && G > R) blue++;
          }
          ok = n > 0 && (blue / n) >= ARENA_READY_BLUE_MIN;
        } catch (e) {
          ok = false;
        }
        hit = ok ? hit + 1 : 0;
        if (hit >= need) return { ok: true, ms: Date.now() - t0, why: '开始对战按钮蓝色命中' };
        await Utils.sleep(ARENA_READY_POLL_MS);
      }
      return { ok: false, ms: Date.now() - t0, why: `等 ${Math.round(budget / 1000)}s 未出现准备界面` };
    }

'''
s = s.replace(anchor, method + anchor, 1)

# 常量放到类外的模块常量区（紧跟 ARENA_END_ICON_* 之后）
c_anchor = "let _arenaEndIconTmpl = null;"
assert s.count(c_anchor) == 1
consts = """// ── 忍术对战「战斗准备界面」探针（v0.6.20）────────────────────────────────
//   循环回到起点的判据 = 「开始对战」按钮 (1165,629) 的蓝色高亮。
//   区域取按钮本体 + 少量余量（1280x720 逻辑空间，[x,y,w,h]）。
//   ⚠ 阈值待真机两态复测（正=准备界面 / 负=战斗中·结算页），当前值为保守初值。
const ARENA_READY_REGION = [1120, 600, 92, 52];
const ARENA_READY_BLUE_MIN = 0.35;   // 区域内「亮蓝」像素占比下限
const ARENA_READY_POLL_MS = 500;     // 轮询间隔（> 帧缓存 90ms）
let _arenaEndIconTmpl = null;"""
s = s.replace(c_anchor, consts, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('waitArenaReady + 常量 已插入')
