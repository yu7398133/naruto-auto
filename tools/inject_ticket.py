import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
tpl = open(r'C:\Users\chenyu\dsh\火影忍者\tools\ticket_templates.js', encoding='utf-8').read().strip()

src = open(JS, encoding='utf-8').read()

# ---- 1) 在 SECRET_REALM_NAME_REGION 之后插入券数常量 ----
anchor = 'const SECRET_REALM_NAME_REGION = [0.25, 0.01, 0.5, 0.18];'
if anchor not in src:
    print('ERR: 找不到 NAME_REGION 锚点'); sys.exit(1)

if 'SECRET_REALM_TICKET_REGION' in src:
    print('  券数常量已存在，跳过插入')
else:
    block = anchor + '''

  // ── 挑战券数量识别 ────────────────────────────────────────────
  // 用户口径：「把零作为结束战斗的标志」→ 只需二值判据：非0 继续 / 0 停手。
  // 区域（1280x720）：由 vision_describe 对 6 张真实准备界面实测定位，
  //   「剩余挑战券：」文字 (345,630)~(466,660)，红色票券图标 (468,622)~(500,668)，
  //   数字本体 (503,628)~(527,664)。此处取 x496~536 y620~672 留边距，
  //   保证两位数（如 10）完整落入。
  // 交叉验证：6 份录制按时间戳排序，识别出的券数 10→9→8→7→5→3 严格递减
  //   （雷霆10 / 阴阳9 / 烈焰8 / 落岩7 / 毒风5 / 水牢3；毒风打完剩4），序列自洽。
  const SECRET_REALM_TICKET_REGION = [496, 620, 40, 52];
  // 匹配分数阈值：低于此值才算「匹配上了」。findTemplate 是 SAD，越小越像。
  const SECRET_REALM_TICKET_THRESH = 22;
  // ⚠ 负样本缺失：至今未采到「券=0」的画面，故 0 无模板。
  //    判据因此是「单向」的：匹配到已知非0数字 → 判非0；
  //    全部失配 → 记一次「疑似0」，连续 TICKET_ZERO_CONFIRM 次才停手。
  //    宁可多打一场，不可误停（误停=白跑一趟，多打=只花几十秒）。
  const SECRET_REALM_TICKET_ZERO_CONFIRM = 2;'''

    src = src.replace(anchor, block, 1)
    print('  ✅ 已插入券数常量')

# ---- 2) 在 loadRealmNameTemplates 之前插入券数模板 + 识别函数 ----
anchor2 = 'let _realmNameTemplates = null;'
if anchor2 not in src:
    print('ERR: 找不到锚点2'); sys.exit(1)

if 'SECRET_REALM_TICKET_TEMPLATES' in src:
    print('  券数模板已存在，跳过')
else:
    block2 = tpl + '''

let _ticketTemplates = null;
/** 懒加载挑战券数字模板画布 */
function loadTicketTemplates() {
  if (_ticketTemplates) return Promise.resolve(_ticketTemplates);
  return new Promise((resolve, reject) => {
    const out = {};
    const keys = Object.keys(SECRET_REALM_TICKET_TEMPLATES);
    let done = 0;
    if (!keys.length) { _ticketTemplates = out; resolve(out); return; }
    for (const k of keys) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        out[k] = c;
        done++;
        if (done === keys.length) { _ticketTemplates = out; resolve(out); }
      };
      img.onerror = () => reject(new Error('挑战券模板加载失败: ' + k));
      img.src = SECRET_REALM_TICKET_TEMPLATES[k];
    }
  });
}

'''
    src = src.replace(anchor2, block2 + anchor2, 1)
    print('  ✅ 已插入券数模板与加载函数')

open(JS, 'w', encoding='utf-8').write(src)
print('  写入完成')
