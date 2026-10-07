#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对：录制 JSON 的 (t, hold) → 脚本宏的 (dt, hold) 转换是否保真。"""
import json, glob, os, re

REC = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
SCRIPT = r"C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js"

src = open(SCRIPT, encoding='utf-8').read()
m = re.search(r'const SECRET_REALM_MACROS = (\{.*?\});\n', src, re.S)
macros = json.loads(m.group(1))

CANON = {
    '烈焰': 'lieyan', '毒风': 'dufeng', '雷霆': 'leiting', '水牢': 'shuilao',
    '落岩': 'luoyan', '阴阳': 'yinyang', '罡体': 'gangti', '缸体': 'gangti2',
}

print("=" * 84)
print("录制 (t) → 宏 (dt) 转换核对：dt 应等于「相对上一步 t 的差值」")
print("=" * 84)
for f in sorted(glob.glob(os.path.join(REC, '**', '*秘境战斗*.json'), recursive=True)):
    name = os.path.basename(f)
    if '秘境' not in name: continue
    d = json.load(open(f, encoding='utf-8'))
    if not isinstance(d, list) or not any(isinstance(e, dict) and e.get('kind') == 'key' for e in d):
        continue
    base = name.replace('秘境战斗', '').replace('.json', '')
    base = re.sub(r'[（(].*', '', base)
    realm = CANON.get(base)
    if not realm or realm not in macros:
        print(f"  {name[:28]:30s} → 宏 {realm} 不存在，跳过"); continue

    ks = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
    mk = [s for s in macros[realm] if s.get('kind') == 'key']
    lead = next((s for s in macros[realm] if s.get('kind') == 'lead'), {})

    # 录制：t 是第一键为 0 的相对时序（脚本已 -base 过），dt = t[i] - t[i-1]
    t0 = ks[0].get('t0') or ks[0].get('t')
    rec = [{'t': (e.get('t0') or e.get('t')) - t0, 'key': e.get('key'), 'hold': e.get('hold') or 0} for e in ks]

    n = min(len(rec), len(mk))
    dt_bad = hold_bad = key_bad = 0
    first_bad = []
    for i in range(n):
        exp_dt = 0 if i == 0 else rec[i]['t'] - rec[i-1]['t']
        got_dt = mk[i].get('dt') or 0
        if exp_dt != got_dt:
            dt_bad += 1
            if len(first_bad) < 3: first_bad.append(f"#{i+1} {rec[i]['key']}: 期望dt={exp_dt} 实得={got_dt}")
        if rec[i]['hold'] != (mk[i].get('hold') or 0):
            hold_bad += 1
            if len(first_bad) < 3: first_bad.append(f"#{i+1} hold: 期望={rec[i]['hold']} 实得={mk[i].get('hold')}")
        if rec[i]['key'] != mk[i].get('key'):
            key_bad += 1
    verdict = '✅ 完全一致' if (dt_bad == 0 and hold_bad == 0 and key_bad == 0) else f'❌ dt差{dt_bad} hold差{hold_bad} key差{key_bad}'
    print(f"  {name[:26]:28s} → {realm:8s} 键 {len(rec):2d}/{len(mk):2d}  lead={lead.get('ms')}  {verdict}")
    for b in first_bad: print(f"        {b}")

print()
print("=" * 84)
print("关键疑问：宏的 dt 到底从哪来？（录制没有 dt 字段）")
print("=" * 84)
print("  录制字段: t, t0, hold, key, code, keyCode, mods, scene, name, seq, kind, x, y, color, area")
print("  宏字段:   kind, key, hold, dt   ← dt 是**转换时算出来的**，不是录制直接给的")
print()
print("  推算规则（脚本无转换代码，应为当时手工/一次性脚本生成）:")
print("    lead = 第一键的 t（相对录制开始）")
print("    dt[i] = t[i] - t[i-1]   （i>0），dt[0] = 0")
