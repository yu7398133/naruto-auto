import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
b64 = open(R + r'\tools\settle_tmpl_b64.txt', encoding='utf-8').read().strip()

anchor = 'let _ticketTemplates = null;'
assert js.count(anchor) == 1, js.count(anchor)

COMMENT = """// ── 结算判据：「左下角返回按钮」模板（v0.5.88）──────────────────────────
//  用户口径：「结算明确左下角会出现返回，如果不点会持续十几秒，感觉比较适合作为判断依据」。
//  从 10 份「XX秘境战斗.json」录制里实测提取 —— 这是**秘境自己的结算特征**，
//  不是照抄忍术对战的方案：
//    · 9/10 份录制的最后阶段都有一次 click 落在 x∈[112,146] y∈[666,677]（中位 122,670）
//      —— 就是左下角这个「返回」；唯一没有的缸体2 是直接点了确定类按钮。
//    · 该 click 距上一个按键 4.8~22.3s（中位 8.1s），印证「不点会持续十几秒」。
//  模板 = 落岩录制该帧的 (105,653)-(141,685)，36x32。
//  ⚠ 阈值 55 由实测分离度决定（不是拍脑袋）：
//      正样本（9 份结算帧）最佳匹配差 0.00~33.72
//      负样本（落岩宏 6 个战斗按键帧）最佳匹配差 76.67~82.87
//      → 分离区宽 42.9，取中点 55，两侧各留约 21.5 余量。
//  用法：只在**连点期间每 2s** 探一次（用户口径），不参与常态轮询。
"""

block = (COMMENT
         + "const SECRET_REALM_SETTLE_BACK_TMPL = '" + b64 + "';\n"
         + "// 「返回」按钮搜索区域（覆盖 9 份录制全部落点 x=107~146, y=665~690）\n"
         + "const SECRET_REALM_SETTLE_BACK_REGION = [85, 640, 190, 705];\n"
         + "// 匹配阈值：低于此值即认为「结算返回按钮在」\n"
         + "const SECRET_REALM_SETTLE_BACK_THRESH = 55;\n"
         + "// 连点期间探测结算的间隔（用户口径：每 2s 一次）\n"
         + "const SECRET_REALM_SETTLE_PROBE_MS = 2000;\n"
         + "\n"
         + "let _settleBackTmpl = null;\n"
         + "/** 懒加载「结算返回按钮」模板画布 */\n"
         + "function loadSettleBackTemplate() {\n"
         + "  if (_settleBackTmpl) return Promise.resolve(_settleBackTmpl);\n"
         + "  return new Promise((resolve, reject) => {\n"
         + "    const img = new Image();\n"
         + "    img.onload = () => {\n"
         + "      const c = document.createElement('canvas');\n"
         + "      c.width = img.width; c.height = img.height;\n"
         + "      c.getContext('2d').drawImage(img, 0, 0);\n"
         + "      _settleBackTmpl = c;\n"
         + "      resolve(c);\n"
         + "    };\n"
         + "    img.onerror = () => reject(new Error('结算返回按钮模板加载失败'));\n"
         + "    img.src = SECRET_REALM_SETTLE_BACK_TMPL;\n"
         + "  });\n"
         + "}\n"
         + "\n"
         + anchor)

js = js.replace(anchor, block, 1)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)
print('已插入结算模板常量 + 加载函数')
print('模板 base64 长度:', len(b64))
