import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ── 1) 摘出当前（错位的）detectArenaEnd 方法块 ──
start_marker = """    /**
     * 忍术对战（角斗场）**结算画面**专用判据"""
i = s.find(start_marker)
assert i > 0, 'start not found'
end_marker = """      } catch (e) {
        return { ok: false, score: null, x: null, y: null, err: e.message };
      }
    }
"""
j = s.find(end_marker, i)
assert j > 0, 'end not found'
j += len(end_marker)
block = s[i:j]
s = s[:i] + s[j:]
print(f'摘出 {len(block)} 字节')

# ── 2) 插入到 BattleFlow 内：waitForEnd 之前的 clearSettlement 之后 ──
#    找一个只存在于 BattleFlow 的锚点（clearSettlement 定义）
anchor = "    async clearSettlement(opts) {"
assert s.count(anchor) == 1, f'anchor count={s.count(anchor)}'
s = s.replace(anchor, block + '\n' + anchor, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)

# ── 3) 复核归属 ──
s2 = io.open(P, encoding='utf-8').read()
bf = s2.find('class BattleFlow {')
tc = s2.find('class TaskContext {')
de = s2.find('async detectArenaEnd')
wf = s2.find('async waitForEnd')
cs = s2.find('async clearSettlement')
print(f'BattleFlow@{bf}  waitForEnd@{wf}  detectArenaEnd@{de}  clearSettlement@{cs}  TaskContext@{tc}')
ok = bf < de < tc
print('✅ detectArenaEnd 在 BattleFlow 内' if ok else '❌ 归属错误')
print(f'   detectArenaEnd({de}) < TaskContext({tc}) ? {de < tc}')
