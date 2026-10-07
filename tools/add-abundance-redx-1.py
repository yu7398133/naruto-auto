import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
orig = s

# ── ① 在 SECRET_REALM 常量区附近加「丰饶红叉」常量 ──
# 锚点：SECRET_REALM_SETTLE_BACK_THRESH 那一行
anchor1 = "const SECRET_REALM_SETTLE_BACK_THRESH = 55;"
assert s.count(anchor1) == 1, f'anchor1 count={s.count(anchor1)}'
add1 = anchor1 + """

// ── v0.6.24：丰饶之间「战斗结束」判据 = 右上角红叉 ─────────────────────────
// 用户口径（2026-09-23）：「就用红x就行了，这个的判定不需要那么及时」，
//   且「结束针在开始战斗后 10s 以后开始轮询」。
// 形状依据（vision 实测用户截图）：红叉是「橙红色 ×」，暂停按钮是两条竖线 ‖ —— 二者**不同**，
//   所以战斗中不会误命中红叉。（我先前把 trace 里 11 次 backBtnX 命中当成暂停按钮，是错的：
//   那些是各页面自己的关闭按钮。）
// 区域依据：必须收窄到红叉本身 [1185,2,1272,70]。
//   用 backBtnX 的大区 [1040,0,1280,120] 时被背景稀释，redPct 只有 0.05，分不开。
// 颜色依据（实测用户截图 1920x1080→归一 1280x720）：
//   红叉像素均值 [190,57,19]，最饱和 5% = [202,43,12]，通道中位 R198/G56/B19。
//   ⚠ 旧 closeX 写的是 {102,56,34}（暗红），实测距离 104 → 是错的，故本探针**不用固定色值**，
//     改用「亮红占比」，更抗光照/画质差异。
// 阈值依据（方法学 §2：正负样本各自实测 + 两侧留余量）：
//   正样本（丰饶入口页红叉）：redPct = 0.2431
//   负样本（战斗画面/入口页背景）：redPct ≤ 0.05（trace 374 帧实测 p50=0.0986 的
//     那个是 backBtnX 大区，收窄到本区后负样本 ≤0.05）
//   → 判据取「亮红占比 ≥ 0.15」：距正样本 0.24 有 38% 余量，距负样本 0.05 有 200% 余量。
const ABUNDANCE_REDX_REGION = [1185, 2, 1272, 70];   // 右上角红叉（归一化 1280x720）
const ABUNDANCE_REDX_MIN_PCT = 0.15;                 // 亮红像素占比下限（实测正 0.2431 / 负 ≤0.05）
const ABUNDANCE_REDX_POLL_MS = 1000;                 // 轮询间隔（用户：判定不需要那么及时）
const ABUNDANCE_REDX_START_MS = 10000;               // 开战后静默 10s 才开始轮询（用户明确要求）"""
s = s.replace(anchor1, add1, 1)

# ── ② 在 TaskContext 里加探针方法（紧邻 detectSettleBack 之后，同类内）──
anchor2 = "    async detectSettleBack() {"
assert s.count(anchor2) == 1, f'anchor2 count={s.count(anchor2)}'
# 找到 detectSettleBack 方法体结束（下一个同级 "    async " 或 "    }" 顶层方法）
i = s.index(anchor2)
# 往后找下一个 4 空格缩进的 async 方法
m = re.search(r'\n    async [a-zA-Z_]+\(', s[i + len(anchor2):])
assert m, '未找到 detectSettleBack 之后的同级方法'
end = i + len(anchor2) + m.start() + 1
new_method = '''    /** v0.6.24：丰饶之间「战斗结束」探针 = 右上角红叉（亮红占比）。
     *  ⚠ 必须在 BattleFlow 之外可调用 —— 由 TaskContext 调，waitForEnd 只管收手。
     *  返回 { ok, pct }；pct = 红叉区域内「亮红像素」占比。 */
    async detectAbundanceRedX() {
      const RG = ABUNDANCE_REDX_REGION;
      this.vision.capture(false);
      const g = this.vision.ctx;
      const d = g.getImageData(RG[0], RG[1], RG[2] - RG[0], RG[3] - RG[1]).data;
      let red = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        n++;
        // 亮橙红：R 高且明显压过 G/B（实测红叉 [190,57,19]）
        if (R > 120 && R > G + 45 && R > B + 45) red++;
      }
      const pct = n ? red / n : 0;
      return { ok: pct >= ABUNDANCE_REDX_MIN_PCT, pct: +pct.toFixed(4) };
    }

'''
s = s[:end] + new_method + s[end:]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('已插入 ABUNDANCE_REDX 常量 + detectAbundanceRedX 方法')
assert s != orig
