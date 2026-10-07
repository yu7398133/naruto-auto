import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

a = """     *   ② 「胜负已分」金横幅 victoryBanner（d=9~26 极稳，持续约 1.5s）→ waitForEnd 在此返回
     *      = **这一把打完了**（f1-4 / f84-91）"""
b = """     *   ② v0.6.20 起忍术对战**不再看**「胜负已分」金横幅 victoryBanner ——
     *      用户 2026-09-21 口径「删掉横幅判据，只用结算图标」（两者打架：
     *      横幅先命中→判自动续局→图标才命中，白绕一圈）。
     *      改认右上角「战斗详情」卷轴图标 arenaEndIcon，命中即落判。
     *      ⚠ victoryBanner 仍留在 SCENE_RULES 里给**其他玩法**用，不要删。
     *      = **这一把打完了**（f1-4 / f84-91）"""
assert s.count(a) == 1, f'count={s.count(a)}'
s = s.replace(a, b, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('3532 过时注释已修正')
