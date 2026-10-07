import io, base64, re, sys

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ── 1) 读取切好的图标模板，转 data URL ──
png = io.open(r'C:\Users\chenyu\dsh\火影忍者\arena-end-icon-tmpl.png', 'rb').read()
b64 = base64.b64encode(png).decode('ascii')
tmpl_url = 'data:image/png;base64,' + b64
print(f'template bytes={len(png)}  b64={len(b64)}')

# ── 2) 在 SECRET_REALM_SETTLE_BACK 常量块之后插入探针定义 ──
anchor = """let _settleBackTmpl = null;
/** 懒加载「结算返回按钮」模板画布 */"""
assert s.count(anchor) == 1, f'anchor count={s.count(anchor)}'

block = '''// ── 忍术对战（角斗场）「结算画面」探针 —— 蓝色卷轴图标（v0.6.16）───────
//  用户口径（2026-09-21）：「战斗结束的判断不对，我建议参考秘境的结束判定，
//  找个图标，右上角战斗详情几个字的左边有个图标，只在战斗结束的时候出现，
//  用这个作为判断依据」。
//
//  为什么换掉旧判据（横幅 / 黑屏 / 静止）：
//    · victoryBanner（「胜」字金色）只在部分结算出现，战败局打不到 → 靠超时兜底；
//    · defeatBanner 在「双方登场」暗背景必误报（d=16~24 vs tol=25）；
//    · darkEndAfterMs 黑屏快通道要等 ≥25s 才启用，且小局切换也有暗帧；
//    · staticBailMs 静止兜底要等 20s。
//    实测 trace 2026-09-21T14-40-06：第 1 局靠「观察窗未恢复动态」多等 6s，
//    第 2 局靠「全屏黑过场」兜底 —— 两条路都不稳。
//
//  ✅ 本探针：右上角「战斗详情」左侧的蓝色卷轴图标，**只在该结算画面出现**。
//     模板 = 用户 2026-09-21 提供的 1920x1080 结算截图，图标本体
//       (1669,18)-(1725,70) → 1280x720 逻辑坐标 (1113,12)-(1150,47)，56x52。
//  ⚠ 阈值 30 待真机两态复测确认（正样本=该截图 score 应显著低于战斗帧）。
//     方法论：阈值必须由「正负样本实测值」取中，不能拍脑袋 —— 见
//     docs/视觉驱动自动化脚本-开发方法论.md §2。
const ARENA_END_ICON_TMPL = \'''' + tmpl_url + '''\';
// 搜索区域（在模板四周各留约 12px 余量；findTemplate 的 region 是 [x1,y1,x2,y2]）
const ARENA_END_ICON_REGION = [1100, 4, 1163, 58];
// 匹配阈值：低于此值即认为「结算画面到了」。SAD，越小越像。
const ARENA_END_ICON_THRESH = 30;

let _arenaEndIconTmpl = null;
/** 懒加载「忍术对战结算图标」模板画布 */
function loadArenaEndIconTemplate() {
  if (_arenaEndIconTmpl) return Promise.resolve(_arenaEndIconTmpl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      _arenaEndIconTmpl = c;
      resolve(c);
    };
    img.onerror = () => reject(new Error('忍术对战结算图标模板加载失败'));
    img.src = ARENA_END_ICON_TMPL;
  });
}

''' + anchor

s = s.replace(anchor, block, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK inserted probe block')
