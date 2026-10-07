"""写入 8 个（实际 7 个去重后）秘境名模板 + 修正区域常量。"""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

JS = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
tpls = json.load(open(r'C:\Users\chenyu\dsh\火影忍者\tools\name_templates.json', encoding='utf-8'))

# gangti/gangti2 是同一秘境（罡体）的两次录制，模板极像 → 合并成一个键
if 'gangti' in tpls:
    tpls.pop('gangti2', None)
print('最终模板键:', sorted(tpls.keys()))

src = open(JS, encoding='utf-8').read()

# 1) 替换模板常量
m = re.search(r'const SECRET_REALM_NAME_TEMPLATES = \{.*?\};', src, re.S)
if not m:
    print('ERR: 未找到 NAME_TEMPLATES'); sys.exit(1)
new = 'const SECRET_REALM_NAME_TEMPLATES = ' + json.dumps(tpls, ensure_ascii=False, separators=(',', ':')) + ';'
src = src[:m.start()] + new + src[m.end():]
print('✅ 模板已替换（%d 个键）' % len(tpls))

# 2) 修正区域：从 [0.25,0.01,0.5,0.18] 改为实测像素区域。
#    实测「落岩秘境」文字 (575,20)-(705,55)，留边距取 (560,12)-(720,62)。
#    ⚠ identifyRealmName 里是按 [0.25,0.01,0.5,0.18] 当 [x,y,w,h] 换算再传 findTemplate，
#      而 findTemplate 按 [x1,y1,x2,y2] 解析 → 传进去实际成了 [320,7,640,130]，
#      被当成 x1=320,y1=7,x2=640,y2=130 → 区域 320x123。而模板是 160x50，能放下但不精准。
#      这里改为直接存像素区域，并把 identifyRealmName 改成直接透传。
old_region = 'const SECRET_REALM_NAME_REGION = [0.25, 0.01, 0.5, 0.18];'
new_region = '''// 秘境名区域（战斗界面顶部中央的金色「XX秘境」）。
//  实测（vision_describe 对战斗帧测量）：文字本体 (575,20)-(705,55)，四周留边距 → (560,12)-(720,62)。
//  ⚠ 格式为 [x1, y1, x2, y2]（与 vision.findTemplate / findTextRows 的取法一致），
//    不再是旧版的 [比例x, 比例y, 比例w, 比例h] —— 旧版换算后几何含义不一致（见下方 identifyRealmName）。
const SECRET_REALM_NAME_REGION = [560, 12, 720, 62];'''
if old_region in src:
    src = src.replace(old_region, new_region, 1)
    print('✅ 区域常量已改为像素 [x1,y1,x2,y2]')
else:
    print('⚠ 未找到旧区域常量')

# 3) identifyRealmName 改为直接透传区域
old_code = """      const tmpls = await loadRealmNameTemplates();
      const rx = Math.round(BASE_W * SECRET_REALM_NAME_REGION[0]);
      const ry = Math.round(BASE_H * SECRET_REALM_NAME_REGION[1]);
      const rw = Math.round(BASE_W * SECRET_REALM_NAME_REGION[2]);
      const rh = Math.round(BASE_H * SECRET_REALM_NAME_REGION[3]);"""
new_code = """      const tmpls = await loadRealmNameTemplates();
      // SECRET_REALM_NAME_REGION 已是像素 [x1,y1,x2,y2]，直接透传（旧版按比例换算且几何含义不符）
      const RG = SECRET_REALM_NAME_REGION;"""
if old_code in src:
    src = src.replace(old_code, new_code, 1)
    # 同时把后续用 rx/ry/rw/rh 的地方换掉
    old_use = "this.vision.findTemplate(tmpls[realm], [rx, ry, rw, rh], { step: 2, thresh: 25 });"
    new_use = "this.vision.findTemplate(tmpls[realm], RG, { step: 2, thresh: 25 });"
    if old_use in src:
        src = src.replace(old_use, new_use, 1)
        print('✅ identifyRealmName 已改为直接透传区域')
    else:
        print('⚠ 未找到 findTemplate 调用行')
else:
    print('⚠ 未找到 identifyRealmName 换算代码')

open(JS, 'w', encoding='utf-8').write(src)
print('写入完成')
