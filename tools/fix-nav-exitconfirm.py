#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修 v0.6.06 实跑暴露的两个 bug：
  ① `this.tapExitConfirm is not a function` —— 方法错放在 TaskContext，调用在 Navigator
  ② `Cannot read properties of undefined (reading 'get')` —— 用了 ctx.config，实际是 ctx.cfg
"""
import io, os, re, shutil, datetime

SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"
src = io.open(SCRIPT, encoding='utf-8').read()

# ── ① 修 ctx.config → ctx.cfg ─────────────────────────────────────────
n1 = src.count("ctx.config.get('secretRealm.ignoreZeroTicket')")
src = src.replace("ctx.config.get('secretRealm.ignoreZeroTicket')",
                  "ctx.cfg.get('secretRealm.ignoreZeroTicket')")
print(f'① ctx.config → ctx.cfg : {n1} 处')

# ── ② 把 detectExitConfirm / tapExitConfirm 从 TaskContext 搬到 Navigator ──
# 先切出这两个方法（含前导注释）
m = re.search(r'\n(    /\*\*\n     \* 探测「秘境退出确认弹窗」[\s\S]*?\n    \}\n)\n(    /\*\* 点掉秘境退出确认弹窗。返回是否真的点了。 \*/\n    async tapExitConfirm\(label\) \{[\s\S]*?\n    \}\n)', src)
if not m:
    # 退一步：只按方法体切
    m = re.search(r'\n(    /\*\*\n     \* 探测「秘境退出确认弹窗」[\s\S]*?async tapExitConfirm\(label\) \{[\s\S]*?\n    \}\n)', src)
assert m, '未找到 detectExitConfirm/tapExitConfirm 块'
block = m.group(0)
src = src.replace(block, '\n')          # 从 TaskContext 摘掉
print('② 已从 TaskContext 摘除退出确认方法')

# 插入 Navigator：放在 dismissOnce 之后
anchor = '''    /** 关掉当前弹窗；返回是否点过 */
    async dismissOnce() {'''
assert anchor in src
# 找 dismissOnce 方法结束（下一个方法注释 '    /**' 或 '    async '）
i = src.index(anchor)
j = src.index('\n    async goHome(', i)
insert_at = j
src = src[:insert_at] + '\n' + block.strip('\n') + '\n' + src[insert_at:]
print('② 已插入 Navigator（goHome 之前）')

# ── ③ 给 Navigator 传 vision ──────────────────────────────────────────
old_ctor = 'this.nav = new Navigator(this.op, this.scenes, this.config);'
new_ctor = 'this.nav = new Navigator(this.op, this.scenes, this.config, this.vision);'
assert old_ctor in src
src = src.replace(old_ctor, new_ctor, 1)
print('③ 实例化已传 vision')

old_cls = '''  class Navigator {
    constructor(op, scenes, config) {
      this.op = op;
      this.scenes = scenes;
      this.config = config;'''
new_cls = '''  class Navigator {
    constructor(op, scenes, config, vision) {
      this.op = op;
      this.scenes = scenes;
      this.config = config;
      this.vision = vision;   // v0.6.07：退出确认弹窗探针需要读像素'''
assert old_cls in src
src = src.replace(old_cls, new_cls, 1)
print('③ 构造函数已收 vision')

bak = os.path.join(r"C:\Users\chenyu\dsh\火影忍者\backups",
                   f"naruto-auto.pre-nav-exitconfirm.{datetime.datetime.now():%Y%m%d-%H%M%S}.user.js")
shutil.copy(SCRIPT, bak)
io.open(SCRIPT, 'w', encoding='utf-8', newline='').write(src)
print(f'备份: {os.path.basename(bak)}')
