// 第二阶段补丁：加 SAD 常量 + 重写特权商店任务体
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '..', '..', 'naruto-auto.user.js');
let src = fs.readFileSync(JS, 'utf8');

// ── 1) SAD 常量 ─────────────────────────────────────────────
const A1 = `  const PRIV_TAB_SEARCH = [400, 100, 1500, 210];`;
const A2 = `  const PRIV_TAB_SEARCH = [400, 100, 1500, 210];
  /** SAD 阈值（越小越像）。三条都是「真机自匹配≈0 / 异画面≥40」量级，
   *  取 25 与签到/招募同口径；页签文字更大更醒目，放宽到 30。 */
  const PRIV_MENU_SAD = 25;
  const PRIV_TAB_SAD = 30;`;
if (!src.includes(A1)) { console.error('A1 not found'); process.exit(1); }
if (src.includes('PRIV_MENU_SAD')) { console.log('SAD consts already present, skip'); }
else { src = src.replace(A1, A2); console.log('OK: SAD consts added'); }

// ── 2) 重写任务体 ───────────────────────────────────────────
const OLD_STEPS = `      steps: [
        { kind: 'tap', title: '打开商城', detail: '点主界面右侧「商城」入口 (1226,257)', coord: [1226, 257], color: '88,166,255' },
        { kind: 'tap', title: '选商店', detail: '点左侧「商店」标签 (123,288)', coord: [123, 288], color: '88,166,255' },
        { kind: 'tap', title: '选特权商店', detail: '点「特权商店」子标签 (99,347)', coord: [99, 347], color: '88,166,255' },
        { kind: 'tap', title: '切特权积分页', detail: '点顶部「特权积分」标签 (648,111)', coord: [648, 111], color: '88,166,255' },
        { kind: 'tap', title: '领取积分', detail: '点右下「领取」按钮 (1171,682)', coord: [1171, 682], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: '关领奖弹窗 → goHome', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1226, 257], null, '打开商城');
        await Utils.sleep(2500);   // 校准间隔 2.75s：商城页加载
        await ctx.tap([123, 288], null, '点「商店」标签');
        await Utils.sleep(1500);   // 校准间隔 2.3s
        await ctx.tap([99, 347], null, '点「特权商店」子标签');
        await Utils.sleep(1500);   // 校准间隔 2.4s
        await ctx.tap([648, 111], null, '切「特权积分」页');
        await Utils.sleep(1200);   // 校准间隔 1.7s
        await ctx.tap([1171, 682], null, '领取消费积分');
        await Utils.sleep(2000);   // 领奖弹窗
        await ctx.popups();        // 关弹窗（如有）
        await ctx.home();

      }
    },`;

const NEW_STEPS = `      steps: [
        { kind: 'tap', title: '打开商城', detail: '点主界面右侧「商城」入口 (1226,257)', coord: [1226, 257], color: '88,166,255' },
        { kind: 'check', title: '定位「商店」菜单项', detail: '模板匹配左侧菜单「商店」，识别不到就跳过本任务（不做兜底盲点）', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '点「商店」菜单项', detail: '点识别到的位置', coord: null, color: '126,231,135' },
        { kind: 'check', title: '定位「特权商店」子标签', detail: '模板匹配左侧菜单「特权商店」，识别不到就跳过本任务', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '点「特权商店」子标签', detail: '点识别到的位置', coord: null, color: '126,231,135' },
        { kind: 'check', title: '定位「特权积分」页签', detail: '模板匹配顶部页签「特权积分」，识别不到就用旧坐标兜底', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '切特权积分页', detail: '点识别到的「特权积分」页签', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '领取积分', detail: '点右下「领取」按钮 (1171,682)', coord: [1171, 682], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: '关领奖弹窗 → goHome', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1226, 257], null, '打开商城');
        await Utils.sleep(2500);   // 校准间隔 2.75s：商城页加载

        /** 模板匹配定位（step:1 逐像素 —— 与签到/招募同处置，小字隔点采样会虚高）。
         *  返回 [x,y] 或 null（未命中/异常）。 */
        const locate = async (loader, search, thresh, tag) => {
          let tmpl = null;
          try { tmpl = await loader(); } catch (e) { tmpl = null; }
          if (!tmpl) { Utils.log('warn', \`    ⚠ \${tag} 模板未加载 → 视为未命中\`); return null; }
          try {
            const r = ctx.vision.findTemplate(tmpl, search, { step: 1, thresh });
            const hit = r.ok ? [Math.round(r.cx), Math.round(r.cy)] : null;
            Utils.log('info', \`    🔎 \${tag} 定位 score=\${r.score} \` +
              (hit ? \`✓ 命中 (\${hit[0]},\${hit[1]})\` : \`✗ 未命中（阈值 \${thresh}）\`));
            return hit;
          } catch (e) {
            Utils.log('warn', \`    ⚠ \${tag} 定位异常：\${(e && e.message) || e}\`);
            return null;
          }
        };

        // ── 第 2 步：「商店」菜单项（原硬编码 (123,288)，改版后会漂）──
        ctx.step('定位「商店」菜单项');
        let pos = await locate(loadPrivShopTmpl, PRIV_MENU_SEARCH, PRIV_MENU_SAD, '商店');
        if (!pos) { await Utils.sleep(1000); pos = await locate(loadPrivShopTmpl, PRIV_MENU_SEARCH, PRIV_MENU_SAD, '商店(复检)'); }
        if (!pos) {
          Utils.log('warn', '    ⚠ 未能定位「商店」菜单项 → 跳过本任务（不做兜底盲点，避免点错菜单）');
          ctx.step('点「商店」菜单项(已跳过)'); ctx.stepResult(false);
          await ctx.home();
          return;
        }
        ctx.stepResult(true);
        await ctx.tap(pos, null, '点「商店」菜单项');
        await Utils.sleep(1500);   // 校准间隔 2.3s

        // ── 第 3 步：「特权商店」子标签（原硬编码 (99,347)）──
        ctx.step('定位「特权商店」子标签');
        let pos2 = await locate(loadPrivTabTmpl, PRIV_MENU_SEARCH, PRIV_MENU_SAD, '特权商店');
        if (!pos2) { await Utils.sleep(1000); pos2 = await locate(loadPrivTabTmpl, PRIV_MENU_SEARCH, PRIV_MENU_SAD, '特权商店(复检)'); }
        if (!pos2) {
          Utils.log('warn', '    ⚠ 未能定位「特权商店」子标签 → 跳过本任务（不做兜底盲点）');
          ctx.step('点「特权商店」子标签(已跳过)'); ctx.stepResult(false);
          await ctx.home();
          return;
        }
        ctx.stepResult(true);
        await ctx.tap(pos2, null, '点「特权商店」子标签');
        await Utils.sleep(1500);   // 校准间隔 2.4s

        // ── 第 4 步：「特权积分」页签（顶部一行，位置稳定；识别失败用旧坐标兜底）──
        ctx.step('定位「特权积分」页签');
        const pos3 = await locate(loadPrivJifenTmpl, PRIV_TAB_SEARCH, PRIV_TAB_SAD, '特权积分');
        if (!pos3) Utils.log('info', '    特权积分页签未识别到 → 用旧坐标 (648,111) 兜底（该页签位置稳定）');
        ctx.stepResult(true);
        await ctx.tap(pos3 || [648, 111], null, '切「特权积分」页');
        await Utils.sleep(1200);   // 校准间隔 1.7s

        await ctx.tap([1171, 682], null, '领取消费积分');
        await Utils.sleep(2000);   // 领奖弹窗
        await ctx.popups();        // 关弹窗（如有）
        await ctx.home();

      }
    },`;

if (!src.includes(OLD_STEPS)) { console.error('OLD_STEPS not found'); process.exit(1); }
src = src.replace(OLD_STEPS, NEW_STEPS);
console.log('OK: task body rewritten');

fs.writeFileSync(JS, src, 'utf8');
