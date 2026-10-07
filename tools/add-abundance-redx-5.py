import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

a = "const SECRET_REALM_SETTLE_BACK_THRESH = 55;"
assert s.count(a) == 1
s = s.replace(a, a + """

// ── v0.6.24：丰饶之间「战斗结束」轮询参数 ────────────────────────────────
// 判据本身直接复用既有 PROBES.closeX（右上角红叉，label '关闭(X)'，verified:true），
// 不再新建探针 —— 用户口径：「直接用回到主界面的那个红x的探针就可以」。
// 这里只放两个节奏参数：
const ABUNDANCE_REDX_POLL_MS = 1000;    // 轮询间隔（用户：「这个的判定不需要那么及时」）
const ABUNDANCE_REDX_START_MS = 10000;  // 开战后静默 10s 才开始轮询（用户明确要求）""", 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK')
