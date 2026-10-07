import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
add = json.load(open(r'C:\Users\chenyu\dsh\火影忍者\tools\macros_gangti.json', encoding='utf-8'))

src = open(JS, encoding='utf-8').read()

# 1) 合并宏
m = re.search(r'const SECRET_REALM_MACROS = (\{.*?\});', src, re.S)
if not m:
    print('ERR: 未找到 SECRET_REALM_MACROS'); sys.exit(1)
obj = json.loads(m.group(1))
print('原有秘境宏:', sorted(obj.keys()))
for k, v in add.items():
    obj[k] = v
new = 'const SECRET_REALM_MACROS = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';'
src = src[:m.start()] + new + src[m.end():]
print('合并后:', sorted(obj.keys()))

# 2) 加弹窗常量
anchor = '  const SECRET_REALM_TICKET_ZERO_CONFIRM = 2;'
if anchor in src and 'SECRET_REALM_NOTICE_POPUP' not in src:
    block = anchor + '''

  // ── 「继续挑战无法获得饰品」提示弹窗（罡体/缸体秘境专属）───────────────
  //  用户口径（2026-03-19）：「缸体秘境那个在点进入的时候还有个弹窗要点，这个需要探测确定后才能点」。
  //  实测（罡体秘境战斗.json seq2/seq3）：点匹配后 +1.4s 出现弹窗，用户两步处理：
  //    ① (645,406) 勾选「本周不再提示」复选框（复选框本体 (527,384)~(557,414)，文字标签到 x731）
  //    ② (653,460) 点【确定】（按钮 (540,434)~(730,496)，中心 (635,465)）
  //  弹窗正文：「继续挑战无法获得饰品，但仍可获得忍具，是否继续挑战？」
  //  ⚠ 不是每次都有：只在饰品掉落次数用完时出现。缸体秘境战斗2 那份录制就没有弹窗（点匹配后直接开打）。
  //    → 必须先探测再点，不能盲点。勾选「本周不再提示」后本局内不再复弹。
  const SECRET_REALM_NOTICE_POPUP = [[645, 406], [653, 460]];
  // 探测该弹窗的区域：取弹窗标题条一带（避开底部底层按钮）
  const SECRET_REALM_NOTICE_REGION = [500, 180, 460, 340];'''
    src = src.replace(anchor, block, 1)
    print('✅ 已加弹窗常量')

open(JS, 'w', encoding='utf-8').write(src)
print('  写入完成')
