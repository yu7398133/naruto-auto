#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""加「秘境退出确认弹窗」探针（金色确定按钮）+ 接进 goHome()。

用户口径（2026-09-21）：
  「那回桌面需要把这种界面纳入考虑，因为秘境的回桌面有一个点x之后的中间的
    金色的确定需要点，直接给回桌面的流程，是回卡住的」

根因：goHome() 只认 SCENE.POPUP（探针是右上角 closeX/closeGray/closeRed）。
  秘境退出确认框是**画面正中的金色确定**，探针完全不同 → 场景判成 other/UNKNOWN
  → 走盲按返回 → 点不到确定 → 卡死。

标定数据（用户截图 naruto-shot-2026-09-21T05-26-42，1920x1080 → ÷1.5）：
  金色按钮主体 x 814~1097, y 632~716 (原图) → 1280 坐标 x 542~731, y 421~477
  中心 (637, 449)  ← 与既有 SECRET_REALM_TICKET_DONE_EXIT 的 (636,455) 吻合
  按钮均值 (214,183,111)，gold% 0.94~0.97
  ⚠ 对照：准备界面同位置 gold%=0.001, distToBtn=156 → 分离极清晰
"""
import io, os, shutil, datetime

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
src = io.open(SCRIPT, encoding='utf-8').read()
assert 'SECRET_REALM_EXIT_CONFIRM' not in src, '已改过，先回滚'

# ── ① 常量：放在 SECRET_REALM_TICKET_DONE_EXIT 附近 ────────────────────
anchor = 'const SECRET_REALM_TICKET_DONE_EXIT = '
i = src.index(anchor)
const_block = '''// ── 「秘境退出确认弹窗」探针：画面正中的金色确定按钮（v0.6.04）────────────
//  用户口径（2026-09-21）：「回桌面需要把这种界面纳入考虑，因为秘境的回桌面有
//  一个点 x 之后的中间的金色的确定需要点，直接给回桌面的流程，是回卡住的」。
//
//  根因：goHome() 只处理 SCENE.POPUP，而 POPUP 的探针是右上角 closeX/closeGray/
//  closeRed。秘境这个确认框的按钮在**画面正中且是金色**，三个关闭探针全打不到
//  → 场景落进 other/UNKNOWN → 走「盲按返回」→ 确定没人点 → 流程卡死。
//
//  标定（用户截图 1920x1080，÷1.5 换算到 1280）：
//    金色按钮主体 x 814~1097 / y 632~716 → 1280 坐标 x 542~731 / y 421~477
//    中心 (637, 449)，均值 (214,183,111)，金色占比 0.94~0.97
//    对照（准备界面同位置）：金色占比 0.001，色距 156 → 分离极清晰
const SECRET_REALM_EXIT_CONFIRM_REGION = [542, 421, 731, 477];
const SECRET_REALM_EXIT_CONFIRM_COLOR = { r: 214, g: 183, b: 111 };
// 金色占比阈值：命中时 0.94+，未命中 ≤0.05 → 取 0.5
const SECRET_REALM_EXIT_CONFIRM_GOLD_MIN = 0.5;
// 色距上限：命中色距≈0（同一按钮），未命中 ≥156 → 取 60
const SECRET_REALM_EXIT_CONFIRM_DIST_MAX = 60;
// 点击点 = 按钮中心
const SECRET_REALM_EXIT_CONFIRM_CLICK = [637, 449];

'''
src = src[:i] + const_block + src[i:]

# ── ② 方法 detectExitConfirm() / tapExitConfirm()：加在 realmTicketDoneExit 后 ──
m = '    async realmTicketDoneExit() {'
assert m in src
new_m = '''    /**
     * 探测「秘境退出确认弹窗」—— 画面正中的金色【确定】按钮。
     *
     * 用户口径（2026-09-21）：「秘境的回桌面有一个点 x 之后的中间的金色的确定
     * 需要点，直接给回桌面的流程，是回卡住的」。
     *
     * ⚠ 不能用 SCENE.POPUP 代替：POPUP 的探针是右上角 closeX/closeGray/closeRed，
     *   而本弹窗按钮在画面正中且为金色，三个探针全打不到 → 会退化成盲按返回。
     *
     * 实测分离度（2026-09-21）：
     *   弹窗上：金色占比 0.94~0.97，色距≈0
     *   准备界面同位置：金色占比 0.001，色距 156
     * 判据 = 金色占比 ≥ 0.5 且 色距 ≤ 60（两个条件同时满足，双保险防误点）
     */
    detectExitConfirm() {
      try {
        const [x1, y1, x2, y2] = SECRET_REALM_EXIT_CONFIRM_REGION;
        const d = this.vision.ctx.getImageData(x1, y1, x2 - x1, y2 - y1).data;
        const ref = SECRET_REALM_EXIT_CONFIRM_COLOR;
        let r = 0, g = 0, b = 0, n = 0, gold = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          r += R; g += G; b += B; n++;
          if (R > 150 && G > 120 && B < 110) gold++;
        }
        const mean = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        const goldPct = gold / n;
        const dist = Math.sqrt((mean[0] - ref.r) ** 2 + (mean[1] - ref.g) ** 2 + (mean[2] - ref.b) ** 2);
        const ok = goldPct >= SECRET_REALM_EXIT_CONFIRM_GOLD_MIN &&
                   dist <= SECRET_REALM_EXIT_CONFIRM_DIST_MAX;
        return { ok, goldPct: +goldPct.toFixed(3), dist: Math.round(dist), mean };
      } catch (e) {
        return { ok: false, reason: e.message, goldPct: 0, dist: 999 };
      }
    }

    /** 点掉秘境退出确认弹窗。返回是否真的点了。 */
    async tapExitConfirm(label) {
      const d = this.detectExitConfirm();
      if (!d.ok) return false;
      const [cx, cy] = SECRET_REALM_EXIT_CONFIRM_CLICK;
      Utils.log('info', `   ⚠ 探测到「秘境退出确认」金色【确定】(金色占比=${d.goldPct} 色距=${d.dist})` +
        `${label ? ' ← ' + label : ''} → 点击 (${cx},${cy})`);
      try { Marks.circle(cx, cy, { label: '退出确认-确定', color: '241,196,15', duration: 800 }); } catch (e) {}
      await this.op.tap(cx, cy, 'delay.short');
      return true;
    }

'''
src = src.replace(m, new_m + m, 1)

# ── ③ 接进 goHome()：在每轮场景判定后、盲按之前优先处理 ────────────────
#  插入点：goHome 里第一次 detectScene 之后、SCENE.POPUP 判断之前
g = '''        if (scene === SCENE.HOME) { this.stats.homeRecoveries++; return true; }

        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }'''
assert g in src, 'goHome 第一处 POPUP 判断未找到'
new_g = '''        if (scene === SCENE.HOME) { this.stats.homeRecoveries++; return true; }

        // ⚠ v0.6.04：秘境退出确认弹窗（画面正中的金色确定）优先处理。
        //   它的按钮不在右上角，SCENE.POPUP 的三个关闭探针全打不到，
        //   不先点掉就会退化成「盲按返回」→ 卡死（用户 2026-09-21 报）。
        if (await this.tapExitConfirm('goHome 第' + (i + 1) + '轮')) {
          await Utils.sleep(settleMs);
          continue;
        }

        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }'''
src = src.replace(g, new_g, 1)

# 第二处（复检后）也补上
g2 = '''        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }
        if (scene === SCENE.LOADING) { await Utils.sleep(settleMs); continue; }'''
assert g2 in src, 'goHome 第二处 POPUP 判断未找到'
new_g2 = '''        if (await this.tapExitConfirm('goHome 复检后')) {
          await Utils.sleep(settleMs);
          continue;
        }
        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }
        if (scene === SCENE.LOADING) { await Utils.sleep(settleMs); continue; }'''
src = src.replace(g2, new_g2, 1)

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-exit-confirm.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(src)

print('✓ 退出确认弹窗探针已加入')
print('  区域 [542,421,731,477]  参考色 (214,183,111)  点击 (637,449)')
print('✓ detectExitConfirm() / tapExitConfirm() 已加入')
print('✓ goHome() 两处已接线（首判 + 复检后）')
print(f'备份: {os.path.basename(bak)}')
