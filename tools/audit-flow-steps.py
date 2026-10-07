import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')

# 找 TASK_DEFS 里每个任务的 key / steps 长度 / run 里的动作数
# 用括号配平抓每个 { key: 'xxx', ... steps: [...], async run(ctx) { ... } }
starts = [(i, l) for i, l in enumerate(lines) if re.search(r"key:\s*'[a-zA-Z0-9_]+'", l) and 'name:' in l]
print(f'找到任务定义 {len(starts)} 个\n')

def count_actions(body):
    """统计 run 里会推进流程图的动作调用"""
    n = 0
    for pat in [r'ctx\.go\(', r'ctx\.tap\(', r'ctx\.drag\(', r'dragScene\(', r'ctx\.flow\(',
                r'ctx\.fight\(', r'ctx\.check\(', r'ctx\.wait', r'tapAndDiff\(', r'ctx\.step\(']:
        n += len(re.findall(pat, body))
    return n

for idx, (i, l) in enumerate(starts):
    m = re.search(r"key:\s*'([a-zA-Z0-9_]+)'", l)
    name = re.search(r"name:\s*'([^']+)'", l)
    key = m.group(1)
    # 抓 steps 数组定义
    seg = '\n'.join(lines[i:i + 400])
    # steps: 后面
    sm = re.search(r'steps:\s*', seg)
    steps_n = None
    if sm:
        j = sm.end()
        if seg[j:j + 1] == '[':
            depth = 0
            for k2 in range(j, min(len(seg), j + 40000)):
                if seg[k2] == '[': depth += 1
                elif seg[k2] == ']':
                    depth -= 1
                    if depth == 0:
                        arr = seg[j:k2 + 1]
                        steps_n = arr.count('kind:')
                        break
        else:
            # steps: SQUAD_COMMON.concat(...) 之类
            em = re.match(r'([A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?)', seg[j:])
            steps_n = em.group(1) if em else '?'
    # 抓 run 体
    rm = re.search(r'async run\(ctx\)\s*\{', seg)
    run_acts = None
    if rm:
        j2 = rm.end(); depth = 1; k3 = j2
        while k3 < len(seg) and depth > 0:
            if seg[k3] == '{': depth += 1
            elif seg[k3] == '}': depth -= 1
            k3 += 1
        run_acts = count_actions(seg[j2:k3])
    print(f'{idx+1:>2}. {str(name.group(1) if name else key):<16} key={key:<22} steps={str(steps_n):<10} run动作={run_acts}')
