import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

def run_body(i0):
    for j in range(i0, min(i0 + 500, len(lines))):
        if re.search(r'async run\(ctx\)\s*\{', lines[j]):
            depth = 0
            for k in range(j, min(j + 400, len(lines))):
                depth += lines[k].count('{') - lines[k].count('}')
                if k > j and depth <= 0:
                    return '\n'.join(lines[j:k + 1])
    return None

def count_adv(body):
    """只统计真正调 _advance 的东西。
       ⚠ stepResult 不算；ctx.step( 单独算；ctx.battle.run( 不算（内部不推进）。
       ⚠ 先剥掉注释行，否则注释里出现的 ctx.tap( 会被误计。"""
    body = '\n'.join(l for l in body.split('\n') if not l.strip().startswith('//'))
    n = 0
    n += len(re.findall(r'\bctx\.tap\(', body))
    n += len(re.findall(r'\bctx\.go\(', body))
    n += len(re.findall(r'\bctx\.drag\(', body))
    n += len(re.findall(r'\bctx\.longPress\(', body))
    n += len(re.findall(r'\bctx\.home\(', body))
    n += len(re.findall(r'\bctx\.fight\(', body))
    n += len(re.findall(r'\bctx\.waitScene\(', body))
    n += len(re.findall(r'\bctx\.step\(', body))       # 手动推进
    n += len(re.findall(r'\bctx\._advance\(', body))   # 显式推进
    n += 1 * len(re.findall(r'\bdragScene\(ctx', body))  # 统一动作 = 1 步
    return n

print(f"{'任务':<18}{'声明':>6}{'实际':>6}   状态")
print('-' * 46)
bad = []
for i, l in enumerate(lines):
    m = re.search(r"key:\s*'([a-zA-Z0-9_]+)'", l)
    if not (m and 'name:' in l):
        continue
    key = m.group(1)
    body = run_body(i)
    if body is None:
        continue
    seg = '\n'.join(lines[i:i + 90])
    sm = re.search(r'steps:\s*', seg)
    steps_n = None
    if sm:
        j2 = sm.end()
        if seg[j2:j2 + 1] == '[':
            depth = 0
            for k in range(j2, len(seg)):
                if seg[k] == '[': depth += 1
                elif seg[k] == ']':
                    depth -= 1
                    if depth == 0:
                        steps_n = seg[j2:k + 1].count('kind:')
                        break
        else:
            steps_n = 'concat'
    a = count_adv(body)
    st = ''
    if isinstance(steps_n, int):
        st = '✓' if steps_n == a else f'✗ 差{a - steps_n:+d}'
        if steps_n != a:
            bad.append((key, steps_n, a))
    print(f'{key:<18}{str(steps_n):>6}{a:>6}   {st}')

print()
print('不一致:', bad if bad else '无 ✓')
