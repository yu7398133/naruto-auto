import io, base64

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
orig = len(s)

png = io.open(r'C:\Users\chenyu\dsh\火影忍者\arena-ready-icon-tmpl.png', 'rb').read()
tmpl_url = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')

# ── 1) 常量块：把颜色探针换成「感叹号模板 + 右上红X」 ──
old_consts = """// ── 忍术对战「战斗准备界面」探针（v0.6.20）────────────────────────────────
//   循环回到起点的判据 = 「开始对战」按钮 (1165,629) 的蓝色高亮。
//   区域取按钮本体 + 少量余量（1280x720 逻辑空间，[x,y,w,h]）。
//   ⚠ 阈值待真机两态复测（正=准备界面 / 负=战斗中·结算页），当前值为保守初值。
const ARENA_READY_REGION = [1120, 600, 92, 52];
const ARENA_READY_BLUE_MIN = 0.35;   // 区域内「亮蓝」像素占比下限
const ARENA_READY_POLL_MS = 500;     // 轮询间隔（> 帧缓存 90ms）"""
new_consts = """// ── 忍术对战「战斗准备界面」探针（v0.6.20）────────────────────────────────
//   循环回到起点的判据（用户 2026-09-21：「感叹号模板 + 右上角红X 这两个应该就可以」）。
//
//   组件① 「规则说明」左侧的**蓝色感叹号**图标，26x32 @ 1280x720 (1090,112)。
//      ⚠ 踩过的坑：一开始想用**颜色统计**（区域 B-R / 蓝色像素占比）判这个图标，
//        实测完全不可分 —— 负样本 70 帧里 31 帧误命中（战斗中该区域本来就偏青蓝，
//        mean=[103,121,134] 与准备界面的 [81,102,113] 几乎重合，B-R 只差 1）。
//        改用**模板匹配**后立刻分开（正 0 / 负 ≥22.98）。
//      实测（tools/calibrate-ready-tmpl.cjs，正负样本各 1 / 70 帧）：
//        正样本（准备界面 a001）            score = 0.00
//        负样本（战斗中/结算/黑屏/蓝过场）  score = 22.98 ~ 27.10
//      → 阈值 11.5（两侧余量各 11.5）。
//
//   组件② 右上角**红色 X**（1190,10)-(1261,71)，红色像素占比。
//      实测：正样本 0.3018 / 负样本 0 ~ 0.2397 → 阈值 0.27。
//
//   两者取 **AND**：实测 0 误报、正样本命中。任一条单独都够，双条件是为了
//   防 UI 改版导致单条失配（方法论：关键判据要有互不相关的双证据）。
const ARENA_READY_ICON_TMPL = '""" + tmpl_url + """';
const ARENA_READY_ICON_REGION = [1075, 100, 1135, 160];   // [x1,y1,x2,y2]
const ARENA_READY_ICON_THRESH = 11.5;                     // 实测：正 0 / 负 ≥22.98
const ARENA_READY_X_REGION = [1190, 10, 1261, 71];        // [x1,y1,x2,y2] 右上角红X
const ARENA_READY_X_RED_MIN = 0.27;                       // 实测：正 0.3018 / 负 ≤0.2397
const ARENA_READY_POLL_MS = 500;      // 轮询间隔（> 帧缓存 90ms）
let _arenaReadyIconTmpl = null;
function loadArenaReadyIconTemplate() {
  if (_arenaReadyIconTmpl) return Promise.resolve(_arenaReadyIconTmpl);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      _arenaReadyIconTmpl = c;
      res(c);
    };
    img.onerror = () => rej(new Error('忍术对战准备界面图标模板加载失败'));
    img.src = ARENA_READY_ICON_TMPL;
  });
}"""
assert s.count(old_consts) == 1, f'常量块 count={s.count(old_consts)}'
s = s.replace(old_consts, new_consts, 1)

# ── 2) waitArenaReady 方法体：改成 AND 双判据 ──
old_body_start = """    async waitArenaReady(budgetMs) {
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
    }"""
i = s.find(old_body_start)
assert i > 0, 'waitArenaReady 未找到'
j = s.find("\n    }\n", s.find("return { ok: false, ms: Date.now() - t0, why:", i))
assert j > 0, 'waitArenaReady 结束未找到'
j += len("\n    }\n")

new_method = """    async waitArenaReady(budgetMs) {
      const t0 = Date.now();
      const budget = budgetMs || 20000;
      const need = 2;                                  // 连续 2 拍命中才算稳定
      let hit = 0;
      try { await loadArenaReadyIconTemplate(); } catch (e) {
        return { ok: false, ms: 0, why: e.message };
      }
      while (Date.now() - t0 < budget) {
        Runtime.check();
        let icon = Infinity, red = 0;
        try {
          this.vision.capture();
          const tm = await loadArenaReadyIconTemplate();
          const r1 = this.vision.findTemplate(tm, ARENA_READY_ICON_REGION,
            { step: 1, thresh: ARENA_READY_ICON_THRESH });
          icon = (r1 && r1.score !== undefined) ? r1.score : Infinity;
        } catch (e) { icon = Infinity; }
        try {
          const [a1, b1, a2, b2] = ARENA_READY_X_REGION;
          const d = this.vision.ctx.getImageData(a1, b1, a2 - a1, b2 - b1).data;
          let n = 0, rr = 0;
          for (let i = 0; i < d.length; i += 4) {
            n++;
            const R = d[i], G = d[i + 1], B = d[i + 2];
            if (R > 130 && R > G + 60 && R > B + 60) rr++;
          }
          red = n > 0 ? rr / n : 0;
        } catch (e) { red = 0; }
        const ok = icon < ARENA_READY_ICON_THRESH && red >= ARENA_READY_X_RED_MIN;
        hit = ok ? hit + 1 : 0;
        if (hit >= need) {
          return { ok: true, ms: Date.now() - t0,
            why: `感叹号 score=${icon.toFixed(1)} + 红X ${(red * 100).toFixed(0)}%` };
        }
        await Utils.sleep(ARENA_READY_POLL_MS);
      }
      return { ok: false, ms: Date.now() - t0, why: `等 ${Math.round(budget / 1000)}s 未出现准备界面` };
    }"""
s = s[:i] + new_method + s[j:]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print(f'准备界面探针已换成「感叹号模板 + 红X」（{orig} → {len(s)} 字节）')
