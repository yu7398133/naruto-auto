#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对比烈焰录制里 k 键的上下文，检查脚本宏是否忠实还原。"""
import json, glob, os

REC_DIR = r"C:\Users\chenyu\.dsh-beta\attachments\v1\files"
allf = glob.glob(os.path.join(REC_DIR, '**', '*.json'), recursive=True)

# 烈焰战斗录制
for name in ['烈焰秘境战斗.json', '烈焰秘境.json']:
    for f in allf:
        if os.path.basename(f) == name:
            d = json.load(open(f, encoding='utf-8'))
            if not isinstance(d, list): continue
            keys = [e for e in d if isinstance(e, dict) and e.get('kind') == 'key']
            print(f"\n{'='*66}\n{name}  共 {len(keys)} 个 key 事件\n{'='*66}")
            base = keys[0].get('t0') or keys[0].get('t')
            prev = None
            for i, e in enumerate(keys, 1):
                t = e.get('t0') or e.get('t')
                dt = 0 if prev is None else t - prev
                hold = e.get('hold') or 0
                mark = '  ★ k 普攻' if e.get('key') == 'k' else ''
                print(f"  {i:3d}. t={t-base:6d}ms dt={dt:5d}ms hold={hold:5d}ms  key={e.get('key')!r:6s} code={e.get('code'):8s}{mark}")
                prev = t
            break
