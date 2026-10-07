#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""加「秘境准备界面」探针（挑战券图标模板）+ atSecretRealmPrep() + 接进读券流程。

用户口径（2026-09-21）：
  「这个秘境战斗准备界面又没识别对，要不增加一个这个界面识别的探针，
    识别到了再识别调整卷数量？」
  「你直接把挑战卷数量左边的那个小图标做成探针」
  → 先探图标，再读券。

实测数据（2026-09-21 13:2x 准备界面实时画面）：
  模板 34x38 @(458,630)，搜索区 [440,615,510,680]
  目标 score=2.1（5/5 稳定，坐标 @475,649）
  反例 屏幕中央 52.2 / 左上角 56.6 / 右下角 58.5
  → 阈值 20（gap 50，余量充足）
"""
import io, os, re, shutil, datetime

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
TMPL = open(r"C:\Users\chenyu\dsh\火影忍者\trace-frames\icon-tmpl.txt", encoding='utf-8').read().strip()

src = io.open(SCRIPT, encoding='utf-8').read()
assert 'SECRET_REALM_PREP_ICON_TMPL' not in src, '已改过，先回滚'

# ── ① 常量：插在券数模板声明之后 ─────────────────────────────────────
anchor = 'const SECRET_REALM_TICKET_TEMPLATES = '
i = src.index(anchor)
j = src.index('\n', i)                     # 该行结束
const_block = f'''
// ── 「秘境准备界面」探针：挑战券左侧小图标（v0.6.04）───────────────────
//  用户口径（2026-09-21）：「秘境战斗准备界面又没识别对，要不增加一个这个界面
//  识别的探针，识别到了再识别挑战券数量？」「直接把挑战券数量左边的那个小图标
//  做成探针」。
//
//  为什么要它：读券失败（best=Infinity）时无法区分「券=0」和「画面根本不在准备
//  界面」。旧代码把后者当成「疑似券刷光」，掩盖真正的故障（2026-09-21 12:23 实跑
//  就是「没从结算退出来」被误判成券的问题）。有了本探针，就能明确区分：
//    图标在  → 确实是准备界面 → 读不到数字 = 真·疑似券0
//    图标不在 → 画面不对 → 回主界面重导航，绝不当成券0
//
//  标定数据（2026-09-21 准备界面实时画面，34x38 模板 @458,630）：
//    目标区 [440,615,510,680] → score=2.1，连采 5 次全中且坐标一致 (@475,649)
//    同图反例：屏幕中央 52.2 / 左上角 56.6 / 右下角 58.5
//    → 分离度 50，阈值取 20（宽裕）
const SECRET_REALM_PREP_ICON_TMPL = "{TMPL}";
// 搜索区（图标应落在此；留了 ~15px 余量，容忍轻微位移）
const SECRET_REALM_PREP_ICON_REGION = [440, 615, 510, 680];
// 匹配阈值（SAD，越小越像）。实测 目标2.1 / 反例52+，取 20
const SECRET_REALM_PREP_ICON_THRESH = 20;
'''
src = src[:j] + const_block + src[j:]

# ── ② 方法：加在 readTicketCount 之前，并加 prepIcon 加载器 ──────────
meth_anchor = '    async readTicketCount() {'
assert meth_anchor in src
new_meth = '''    /** 加载「挑战券图标」模板（只解析一次，之后缓存）。 */
    async loadPrepIconTemplate() {
      if (this._prepIcon) return this._prepIcon;
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('挑战券图标模板解码失败'));
        i.src = SECRET_REALM_PREP_ICON_TMPL;
      });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      this._prepIcon = cv;
      return cv;
    }

    /**
     * 探测「当前画面是秘境准备界面吗」—— 用挑战券左侧的小图标做模板匹配。
     *
     * 为什么需要：`readTicketCount()` 失配（best=Infinity）时无法区分
     *   「券=0」和「画面根本不在准备界面」。前者要停手，后者要重导航。
     *   实测这一步**不能靠颜色探针**：画面亮区很多（屏幕中央 bright%=0.91、
     *   左上角 0.88，都比图标区还高），颜色判据毫无特异性；模板匹配则
     *   目标 2.1 / 反例 52+，分离度 50。
     *
     * @returns {Promise<{ok:boolean, score:number, reason?:string}>}
     */
    async atSecretRealmPrep() {
      let tmpl = null;
      try { tmpl = await this.loadPrepIconTemplate(); }
      catch (e) { return { ok: false, score: 999, reason: 'tmpl-load-failed' }; }
      try {
        const r = this.vision.findTemplate(tmpl, SECRET_REALM_PREP_ICON_REGION,
          { step: 1, thresh: SECRET_REALM_PREP_ICON_THRESH });
        return { ok: !!r.ok, score: r.score, reason: r.reason };
      } catch (e) {
        return { ok: false, score: 999, reason: 'detect-error' };
      }
    }

'''
src = src.replace(meth_anchor, new_meth + meth_anchor, 1)

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-prep-probe.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(src)

print('✓ 常量已插入（券数模板之后）')
print(f'  模板 dataURL {len(TMPL)} 字符')
print('✓ atSecretRealmPrep() + loadPrepIconTemplate() 已插入')
print(f'备份: {os.path.basename(bak)}')
