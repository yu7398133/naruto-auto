// 把三张模板 base64 注入 userscript：
//  1) 新增三个 const *_TMPL_SRC + 加载函数
//  2) 特权商店任务改用模板匹配定位「商店」「特权商店」，以及「特权积分」页签
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS = path.join(ROOT, 'naruto-auto.user.js');
const CROP = __dirname;

const b64 = {};
for (const [f, key] of [['F_shop.png', 'SHOP'], ['segB.png', 'PRIV'], ['T2_jifen.png', 'JIFEN']]) {
  b64[key] = fs.readFileSync(path.join(CROP, f)).toString('base64');
}

let src = fs.readFileSync(JS, 'utf8');

// ── 1) 追加三个模板常量 + 加载函数（插在 RECRUIT 模板加载函数之后）──────
const ANCHOR = `  function loadRecruitTabTmpl() {`;
const idx = src.indexOf(ANCHOR);
if (idx < 0) { console.error('ANCHOR not found'); process.exit(1); }
// 找到该函数结束（下一个 "\n  }\n" 之后）
const endIdx = src.indexOf('\n  }\n', idx);
if (endIdx < 0) { console.error('func end not found'); process.exit(1); }
const insertAt = endIdx + 4;

const block = `
  // ============================================================
  //  特权商店「入口定位」模板（2026-10-11 从用户真机截图重抠）
  //  用户反馈：「特权商店的入口发生变化，首先是第2步的选商店，位置发生了变化，
  //   特权商店的位置也相应地变化了」+「这个我感觉需要图像匹配来确定点击位置」。
  //  旧版是硬编码坐标（商店 (123,288) / 特权商店 (99,347)），商城改版即失效。
  //  与「每日签到」「免费招募」同一套口径：**以识别为准，识别不到就跳过任务**，
  //  不做兜底盲点 —— 盲点在改版后只会点到别的菜单项上。
  //
  //  「商店」还有第二张同文字样张（改版后的商城第一屏），一并作为备用模板：
  //  同一文字在不同底图上 SAD 会漂移，双模板取最优可提高命中率。
  // ============================================================
  const PRIV_SHOP_TMPL_SRC = 'data:image/png;base64,${b64.SHOP}';
  const PRIV_TAB_TMPL_SRC = 'data:image/png;base64,${b64.PRIV}';
  const PRIV_JIFEN_TMPL_SRC = 'data:image/png;base64,${b64.JIFEN}';

  function _mkTmplLoader(srcStr, errMsg) {
    let cache = null;
    return function () {
      return new Promise((resolve, reject) => {
        if (cache) return resolve(cache);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          cache = c; resolve(c);
        };
        img.onerror = () => reject(new Error(errMsg));
        img.src = srcStr;
      });
    };
  }
  const loadPrivShopTmpl = _mkTmplLoader(PRIV_SHOP_TMPL_SRC, '特权商店「商店」模板加载失败');
  const loadPrivTabTmpl = _mkTmplLoader(PRIV_TAB_TMPL_SRC, '特权商店「特权商店」模板加载失败');
  const loadPrivJifenTmpl = _mkTmplLoader(PRIV_JIFEN_TMPL_SRC, '特权商店「特权积分」模板加载失败');

  /** 左侧菜单列（与签到/招募同一列）。搜索窗右边界沿用 MENU_TMPL_SEARCH_X2。 */
  const PRIV_MENU_SEARCH = [MENU_TMPL_SEARCH_X1, 90, MENU_TMPL_SEARCH_X2, 700];
  /** 顶部页签栏搜索区（商城顶部一行，跨整屏宽度） */
  const PRIV_TAB_SEARCH = [400, 100, 1500, 210];
`;

src = src.slice(0, insertAt) + block + src.slice(insertAt);
fs.writeFileSync(JS, src, 'utf8');
console.log('OK: templates + loaders inserted (' + block.length + ' chars)');
