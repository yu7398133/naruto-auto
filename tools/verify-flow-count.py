import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')

# 静态推算：每个任务 steps 长度 vs run 里 _advance 触发次数
def run_body(key_line_idx):
    """抓该任务 run(ctx){...} 的方法体"""
    for j in range(key_line_idx, min(key_line_idx + 500, len(lines))):
        if re.search(r'async run\(ctx\)\s*\{', lines[j]):
            depth = 0
            buf = []
            for k in range(j, min(j + 400, len(lines))):
                buf.append(lines[k])
                depth += lines[k].count('{') - lines[k].count('}')
                if k > j and depth <= 0:
                    return '\n'.join(buf)
            return '\n'.join(buf)
    return None

def count_adv(body):
    """统计会触发 _advance 的调用（不含 ctx.flow，它只重置）"""
    n = 0
    n += len(re.findall(r'ctx\.tap\(', body))
    n += len(re.findall(r'ctx\.go\(', body))
    n += len(re.findall(r'ctx\.drag\(', body))
    n += len(re.findall(r'ctx\.longPress\(', body))
    n += len(re.findall(r'ctx\.home\(', body))
    n += len(re.findall(r'ctx\.fight\(', body))
    n += len(re.findall(r'ctx\.waitScene\(', body))
    n += len(re.findall(r'ctx\.step\(', body))
    n += len(re.findall(r'ctx\._advance\(', body))
    # dragScene 现在推进 2 次
    n += 2 * len(re.findall(r'dragScene\(ctx', body))
    return n

print(f"{'任务':<16}{'声明steps':>10}{'静态_advance':>14}   状态")
print('-' * 60)
bad = []
for i, l in enumerate(lines):
    m = re.search(r"key:\s*'([a-zA-Z0-9_]+)'", l)
    if not (m and 'name:' in l):
        continue
    key = m.group(1)
    body = run_body(i)
    if body is None:
        continue
    seg = '\n'.join(lines[i:i + 80])
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
    status = ''
    if isinstance(steps_n, int):
        status = '✓ 一致' if steps_n == a else f'✗ 差 {a - steps_n:+d}'
        if steps_n != a:
            bad.append((key, steps_n, a))
    print(f'{key:<16}{str(steps_n):>10}{a:>14}   {status}')

print()
if bad:
    print('仍不一致的任务:')
    for k, sn, a in bad:
        print(f'  {k}: 声明 {sn} / 实际 {a}')
else:
    print('全部一致 ✓')
