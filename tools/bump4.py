import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.86', '0.5.87'

js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

rm = open(R + r'\README.md', encoding='utf-8').read()
rm = rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue')
open(R + r'\README.md', 'w', encoding='utf-8').write(rm)

cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
block = '''## v0.5.87 (2026-09-21)

- **阴阳秘境改为「暂停跳过」，不打**（用户口径：「阴阳秘境改为采用暂停跳过的方式，不打这个」）。
  - `SECRET_REALM_SKIP_REALMS` 追加 `'yinyang'`；`TARGETS` 移除 `'yinyang'`。
  - 识别到阴阳 → 走 `realmForceExit()`（暂停 → 退出游戏 → 确定）退出重匹配，**一招不发**。
  - 阴阳的录制宏（11 步 / 15.8s）**保留**在 `SECRET_REALM_MACROS` 里，只是不再被 TARGETS 触发
    —— 将来想恢复刷它，从 SKIP 列表里删掉即可，不用重新录制。
  - ⚠ 语义区分：「主动跳过」≠「战斗超时被迫退出」。跳过的场**不计入 round、不扣券**，直接重匹配。
  - 目前会打的秘境：落岩 / 毒风 / 雷霆 / 烈焰 / 水牢（5 个）；罡体、缸体、阴阳一律跳过。

---

'''
cg = cg.replace('## v0.5.86 (', block + '## v0.5.86 (', 1)
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(cg)
print('已升版 %s → %s' % (OLD, NEW))
