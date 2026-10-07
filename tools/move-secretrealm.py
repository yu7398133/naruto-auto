import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

# 1-based → 0-based
# secretRealm 块 = 6555..7095（含末尾 '},'）
# 注意前一行 6554 是空行，一起搬走保持格式
blk_start = 6555 - 1        # '{'  行 6555
blk_end   = 7095 - 1        # '},' 行 7095
assert lines[blk_start].strip().startswith('{'), lines[blk_start]
assert "key: 'secretRealm'" in lines[blk_start + 1], lines[blk_start + 1]
assert lines[blk_end].rstrip() == '    },', repr(lines[blk_end])

block = lines[blk_start:blk_end + 1]
print(f'搬运块: 行 {blk_start+1}..{blk_end+1}  共 {len(block)} 行')

# 删掉块 + 其前面的空行
del lines[blk_start - 1:blk_end + 1]      # 含 6554 空行

# 2) 插入到 survivalTrial 之后
# survivalTrial 原 6285..6330，删块后行号不变（块在它之后）
# 重新定位 survivalTrial 的结束 '},'
st = None
for i, l in enumerate(lines):
    if "key: 'survivalTrial'" in l:
        st = i
        break
assert st is not None, 'survivalTrial 未找到'
end = None
for i in range(st + 1, st + 400):
    if lines[i].rstrip() == '    },':
        end = i
        break
assert end is not None, 'survivalTrial 结束未找到'
print(f'survivalTrial 结束 = 行 {end+1}')

# 3) 改 category
for i, l in enumerate(block):
    if "key: 'secretRealm'" in l:
        old = l
        block[i] = l.replace("category: 'battle'", "category: 'daily'")
        assert block[i] != old, '未替换 category'
        print('category: battle → daily')
        print('  ', block[i].strip())
        break

lines[end + 1:end + 1] = [''] + block

io.open(P, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('已移动：秘境挑战 → 生存试炼之后，category=daily')
