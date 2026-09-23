// ==UserScript==
// @name         火影忍者云游戏自动化
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      0.6.28
// @description  火影忍者手游云游戏自动化脚本，多 SDK 适配（Oprate / _START_ARM_CG_ / TCGSDK / gamematrix）+ 视觉场景检测 + 任务调度；面板默认收起为悬浮球，运行时自动隐藏防遮挡
// @author       naruto-auto
// @match        https://start.qq.com/*
// @match        https://*.start.qq.com/*
// @match        https://gamer.qq.com/*
// @match        https://*.gamer.qq.com/*
// @match        https://cloudgame.qq.com/*
// @match        https://*.cloudgame.qq.com/*
// @match        https://cg.qq.com/*
// @match        https://*.cg.qq.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    http://127.0.0.1:8899/naruto-auto.user.js
// @downloadURL  http://127.0.0.1:8899/naruto-auto.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  //  常量
  // ============================================================
  const VERSION = '0.6.28'; // ⚠ 改版必须与头部 @version 同步（面板标题 v${VERSION} 用这个）
  const BASE_W = 1280;
  const BASE_H = 720;
  const STORAGE_PREFIX = 'naruto_auto_';

  // ============================================================
  //  Runtime — 全局中止信号（停止按钮要能立刻生效，不等 sleep 走完）
  // ============================================================
  class AbortError extends Error {
    constructor(msg) { super(msg || '已中止'); this.name = 'AbortError'; }
  }

  const Runtime = {
    aborted: false,
    _listeners: new Set(),
    onAbort(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
    abort() {
      if (this.aborted) return;
      this.aborted = true;
      this._listeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    },
    reset() { this.aborted = false; },
    check() { if (this.aborted) throw new AbortError(); }
  };

  // ============================================================
  //  Utils
  // ============================================================
  const Utils = {
    /** 可中止的 sleep */
    sleep(ms) {
      return new Promise((resolve, reject) => {
        let off;
        const timer = setTimeout(() => { off && off(); resolve(); }, ms);
        off = Runtime.onAbort(() => { clearTimeout(timer); reject(new AbortError()); });
      });
    },

    random(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    randomDelay(min, max) { return this.sleep(this.random(min, max)); },

    log(level, ...args) {
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const text = args.map(a => (typeof a === 'string' ? a : safeStr(a))).join(' ');
      const fn = level === 'error' ? console.error :
                 level === 'warn' ? console.warn : console.log;
      fn(`[NarutoAuto][${ts}]`, ...args);
      if (window.__narutoAuto && window.__narutoAuto.panel) {
        window.__narutoAuto.panel.addLog(level, text);
      }
    },

    formatDuration(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      if (s < 60) return `${s}秒`;
      return `${Math.floor(s / 60)}分${s % 60}秒`;
    },

    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

    /** 常用键的 keyCode 映射（云游戏 SDK 多用 keyCode 而非 key） */
    keyCode(key) {
      const m = {
        Escape: 27, Enter: 13, Tab: 9, Backspace: 8, Space: 32,
        ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
        F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
        Shift: 16, Control: 17, Alt: 18, Meta: 91,
      };
      if (typeof key === 'number') return key;
      if (/^F\d{1,2}$/.test(key)) return 111 + parseInt(key.slice(1), 10);
      // 单字母按标准 keyCode：'f' → 70（大写字母的 ASCII），不是 charCodeAt 的 102
      if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase().charCodeAt(0);
      if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
      return m[key] != null ? m[key] : (key.charCodeAt ? key.charCodeAt(0) : 0);
    },

    /** 标准 KeyboardEvent.code（云游戏 SDK 多数按 code 而不是 key 派发）：'k' → 'KeyK'，' ' → 'Space' */
    codeOf(key) {
      if (typeof key !== 'string') return String(key);
      const m = {
        Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', ' ': 'Space', Space: 'Space',
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft',
      };
      if (m[key] != null) return m[key];
      if (/^[a-zA-Z]$/.test(key)) return 'Key' + key.toUpperCase();
      if (/^[0-9]$/.test(key)) return 'Digit' + key;
      return key;
    },

    /** 游戏“日”的 key，以 dailyResetHour 为界（默认凌晨 5 点切日） */
    dayKey(resetHour) {
      const d = new Date(Date.now() - (resetHour || 5) * 3600 * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    /** ISO 周 key */
    weekKey(resetHour) {
      const d = new Date(Date.now() - (resetHour || 5) * 3600 * 1000);
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const wk = Math.ceil((((t - y0) / 86400000) + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
    },

    /** 带超时保护 */
    withTimeout(promise, ms, label) {
      let timer;
      return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label || '操作'}超时(${ms}ms)`)), ms); })
      ]);
    }
  };

  function safeStr(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  // ============================================================
  //  Store — GM_* 不可用时回退 localStorage（便于无油猴环境调试）
  // ============================================================
  const Store = {
    hasGM: typeof GM_getValue === 'function' && typeof GM_setValue === 'function',
    get(key, def) {
      try {
        if (this.hasGM) {
          const v = GM_getValue(key, undefined);
          if (v !== undefined && v !== null) return typeof v === 'string' ? JSON.parse(v) : v;
          return def;
        }
      } catch (e) { /* 解析失败则回退 */ }
      try {
        const v = localStorage.getItem(key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      const s = JSON.stringify(val);
      try { if (this.hasGM) { GM_setValue(key, s); return; } } catch (e) { /* ignore */ }
      try { localStorage.setItem(key, s); } catch (e) { /* ignore */ }
    },
    del(key) {
      try { if (this.hasGM && typeof GM_deleteValue === 'function') { GM_deleteValue(key); return; } } catch (e) { /* ignore */ }
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  // ============================================================
  //  Config
  // ============================================================
  // 2026-09-13 用户口径：任务里「每步延时至少 1s」。作为 delay.click 的硬下限，
  // 任何来源（默认值 / 已存配置 / 面板输入）低于它都会被抬到它。
  const MIN_STEP_DELAY = 1000;
  // 2026-09-13 用户口径（补充）：除战斗环节外，**任何操作之间**的延时不低于 0.5s。
  // 2026-09-19 用户口径（收紧）：**少于 1s 的间隔一律抬到 1s**（"加载有延迟时太快会点错位置"）。
  // 作为所有 delay.* 配置项的通用硬下限；战斗模块不走 cfg.wait（用 A.kGap 等自己的节奏），天然豁免。
  const MIN_OP_DELAY = 1000;

  const DEFAULT_CONFIG = {
    version: VERSION,
    baseResolution: { width: BASE_W, height: BASE_H },

    delay: {
      // 2026-09-13 用户要求「每步延时至少 1s」：点击后等待区间由 350~700ms 提为 1000~1500ms。
      // 这一处是**所有任务**步间延时的总闸门——TaskContext 的 tap/go/drag/longPress/domTap
      // 全部收尾于 cfg.wait('delay.click')，所以改这里等于给每个任务步骤兜底 ≥1s。
      // ⚠ 老配置里存的是 350/700，光改默认值不生效（_merge 以已存值为准）→ 见 _load 里的迁移。
      click:    { min: 1000, max: 1500 },
      pageLoad: { min: 1800, max: 3200 },
      short:    { min: 1000, max: 1100 },
      popup:    { min: 1000, max: 1400 },
    },

    retry: { maxAttempts: 2, interval: 2500 },

    // 视觉检测
    vision: {
      enabled: true,
      cacheTTL: 120,        // 同一帧缓存时长(ms)，避免一次循环里反复截图
      diffThreshold: 0.012, // 帧差异阈值，小于它视为画面静止
      stableFrames: 3,      // 连续静止帧数
      poll: 1200,           // 轮询间隔
      preview: true,        // 面板实时预览
    },

    // 战斗
    battle: {
      minWait: 15000,       // 最少等待（防止刚进场就误判结束）
      maxWait: 180000,      // 最长等待
      autoBattle: true,     // 进入战斗后尝试开自动
      speedUp: true,        // 尝试开倍速
      postRounds: 8,        // 结算画面点击轮数
      keyAssist: true,      // 战斗辅助：战斗中循环点「招按钮」（普攻/技能/大招/密卷/通灵/替身/左右走位）
                            // 2026-09-13 起由「发键盘」改为「点位置」——部分云游戏实例键盘通道不可靠
      assistMaxMs: 150000,  // 单场连招点击上限（ms）。战斗再久也不无限连点：
                            // 战斗一旦结束而辅助还在点，很容易把所在界面的按钮（如小队突袭房间的
                            // 大「匹配」）点开、白打一场。超过此值辅助自动停手。
      holdAttack: true,     // 0.5.59：普攻**一直按住不放**（而不是每 0.2s 点一下抬一下）。
                            // 忍术对战3.json 实测：真人是按住打的（31 次普攻键平均 1721ms、最长 11.07s），
                            // 连点会不停打断连击。按住期间照常轮询技能/大招/密卷/通灵；用户实测按住普攻
                            // 不会跳过结算画面。安全：静止/超时/结算/stop 都会 releaseHold()。
    },

    // 导航
    nav: {
      homeTimeout: 30000,   // 回主界面超时（0.5.52：20000→30000，配合下面两道延时不至于按不够次数）
      maxBack: 6,           // 最多按几次返回
      popupRounds: 4,       // 单次清弹窗轮数
      requireHome: true,    // 每个任务开始前先确保在主界面
      blindBack: false,     // 场景识别不出时，改用「盲按返回」序列（ESC + 多个候选返回位）
      useEsc: true,         // 盲按时先发 ESC
      // ——— 0.5.52 用户报「回主界面来回跳」，加两道延时 ———
      // ⚠ v0.5.87：1000 → 2500。依据 naruto-trace-2026-09-20T19-31-50-440Z.html 实测：
      //   首次进入时 home() 在 (1234,42) 反复点返回 **12 次、卡了 42 秒**才回到主界面。
      //   根因不是没延迟，而是**主界面图标只渲染了一部分**：SCENE.HOME 要求
      //   avatar/storeIcon/mailIcon/dailyIcon 四个探针至少中 2 个（min:2），
      //   而卡住那 12 帧只有 storeIcon 中（dist 18~20），dailyIcon/avatar/mailIcon 都还没渲染出来
      //   → 只中 1 个 → 判成「非主界面」→ 触发返回 → 把界面又点开 → 来回跳。
      //   （对比：真正判成 HOME 的那一帧 storeIcon:18 + dailyIcon:28，中 2 个。）
      //   → 复检间隔从 1s 拉到 2.5s，给图标渲染留出时间，多数情况第一轮就能翻案。
      //   ⚠ 按用户选择：不改判据本身（min:2 保持），只加长复检间隔 —— 改判据会影响所有任务。
      homeConfirmGap: 0,    // 判「不是主界面」前的二次确认间隔(ms)
                            //   0.5.87 起曾为 2500（防过渡帧误判），但实测这让
                            //   goHome 的相邻两次点击间隔达 5s —— 用户口径
                            //   （2026-09-21）：「2s 足够了」。改 0 = 立即复检一次
                            //   （仍保留「复检」这道检测，只是不再白等）。
                            //   过渡帧保护主要由 homeSettleMs=2000 承担。
      homeSettleMs: 2000,   // 每按一次「返回」后等动画走完(ms)：防叠加多按
      backSpots: [          // 盲按返回候选位，按序轮转
        [1146, 69], [66, 677], [1229, 36], [40, 40], [66, 40], [640, 690],
      ],
    },

    // 秘境挑战（面板可调）
    secretRealm: {
      // 🧪 测券=0 时**不退出**，继续跑（默认关）。
      //  用户口径（2026-09-21）：「今天已经没有卷了，帮我弄一个把秘境卷为 0 就结束的
      //  命令先注释掉，我先测试其他流程，比如战斗部分，然后最后再加回来」。
      //  ⚠ 用途仅限测试：开着它时券刷光也不会停手，会反复点匹配空转
      //  （受 SECRET_REALM_MATCH_TRIES_MAX 兜底），测试完请关掉。
      ignoreZeroTicket: false,
    },

    // 运行时
    runtime: {
      taskTimeout: 240000,  // 单任务超时
      stopHotkey: true,     // Ctrl+Shift+Q 紧急停止
      skipDoneToday: true,  // 跳过当日/当周已成功的任务
      dailyResetHour: 5,    // 每日重置小时
    },

    // 输入
    input: {
      mode: 'dom',          // dom=按页面元素CSS尺寸+contain黑边修正（实测有效） / stream=按串流分辨率 / raw=原样发1280x720
      protocol: 'obj',      // obj=发对象 / args=发位置参数 (type,x,y)
      jitter: 4,            // 点击随机偏移半径
      eventTypes: {},       // 需要时可覆盖，如 {down:'down', up:'up', move:'move'}
    },

    // 界面（面板默认收起成悬浮球，避免遮挡游戏右上角）
    ui: {
      collapsed: true,      // 启动时是否收起（默认收起）
      autoHideOnRun: true,  // 开始运行任务时自动收起
      fabLeft: 16,          // 悬浮球左边距
      fabTop: -96,          // 负数表示「距底部 px」
      fabOpacity: 0.5,      // 空闲时透明度
      toggleHotkey: true,   // Ctrl+Shift+A 切换面板
      clickMarks: true,     // 点击/按键可视化（半透明圆圈）
      markDuration: 500,    // 圆圈停留时长(ms)
      markLabel: true,      // 圆圈下方显示坐标
    },

    debug: false,

    taskSwitches: {
      // 每日收获
      collectGold: true, collectMail: true, collectSign: true,
      shareDaily: true,
      collectRank: true, collectActive: true,
      privilegeShop: true,
      recruit: true,
      // 日常任务
      sendStamina: true,   // 2026-09-13 从「每日收获」移入日常任务，且排日常首位
      squadRaid: true, squadAssist: true, abundanceRoom: true, orgBlessing: true,
      survivalTrial: true, equipSweep: true, missionHall: true,
      ichiraku: true,          // 2026-09-12 补齐：这两个任务之前漏了开关，无法单独启用
      scoreMatchClaim: true,   // 2026-09-13 新增「积分赛段位领取」（进入即自动领取）
      // 战斗（0.5.56 从「日常任务」拆出的独立分类；面板多一个「🥊 战斗」按钮，可单独一键开跑）
      secretRealm: true, arenaBattle: true,
      // 周常任务
      roadOfPractice: false, chaseAkatsuki: false, rebelNinja: false, collectNinjutsu: true,
      orgFortress: false, heavenEarth: false,
    },

    // 任务次数：小队突袭每天有 2 次机会，默认打满 2 次（改 1 即只打一次）
    squadRaidRounds: 2,
    // 角斗场忍术对战：15 次为一组（默认打满一组，约 20~40 分钟，视单场时长）
    arenaBattleRounds: 15,
  };

  class Config {
    constructor() { this.data = this._load(); }

    _load() {
      const saved = Store.get(STORAGE_PREFIX + 'config', null);
      if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_CONFIG);
      const merged = this._merge(structuredClone(DEFAULT_CONFIG), saved);
      merged.version = VERSION;

      // v0.5.8/0.5.9 迁移：把二级页返回键 (1146,69) 补进已存的 backSpots 首位
      // （组织/忍法帖等页的返回键在此，原先不在盲按序列里，导致旧配置用户回不去）
      try {
        const spots = merged.nav && merged.nav.backSpots;
        if (Array.isArray(spots)) {
          const has = spots.some(s => Array.isArray(s) && s[0] === 1146 && s[1] === 69);
          if (!has) merged.nav.backSpots = [[1146, 69], ...spots];
        }
      } catch (e) { /* 迁移失败不影响加载 */ }

      // 2026-09-13 迁移：步间延时下限抬到 MIN_STEP_DELAY(1s)。
      // 老配置里 delay.click 存的是 {min:350,max:700}，_merge 以已存值为准 → 必须显式抬。
      try {
        const dc = merged.delay && merged.delay.click;
        if (dc) {
          if (!(dc.min >= MIN_STEP_DELAY)) dc.min = MIN_STEP_DELAY;
          if (!(dc.max >= dc.min + 300)) dc.max = dc.min + 300;
        }
      } catch (e) { /* 迁移失败不影响加载 */ }

      // 0.5.76 迁移（用户口径「少于 1s 的都增加到 1s」）：delay.short / delay.popup 的下限也抬到 1s。
      // 同样因为 _merge 以已存值为准，光改 DEFAULT_CONFIG 对老配置不生效。
      try {
        for (const key of ['short', 'popup']) {
          const r = merged.delay && merged.delay[key];
          if (!r) continue;
          if (!(r.min >= MIN_OP_DELAY)) r.min = MIN_OP_DELAY;
          if (!(r.max >= r.min)) r.max = r.min;
        }
      } catch (e) { /* 迁移失败不影响加载 */ }

      // 0.5.52 迁移：回主界面加了两道延时（homeConfirmGap/homeSettleMs），单次 goHome 变慢，
      // 老配置的 homeTimeout=20000 会不够按满 maxBack 次 → 统一抬到 30000。
      try {
        const nv = merged.nav || (merged.nav = {});
        if (!(nv.homeTimeout >= 30000)) nv.homeTimeout = 30000;
        // 0.5.87：下限 1000 → 2500（同上，给主界面图标渲染留时间，治首次 home() 来回跳 42s）
        // v0.6.04：用户口径「两次点击之间 2s 足够了」→ 复检间隔回归 0，
        //   靠 homeSettleMs=2000 承担过渡帧保护（实测点击间隔 5s → 2s）。
        //   ⚠ 这里必须一并改：旧下限 2500 会把用户配置里的小值强行抬回去。
        if (!(nv.homeConfirmGap >= 0) || nv.homeConfirmGap > 200) nv.homeConfirmGap = 0;
        if (!(nv.homeSettleMs >= 1500)) nv.homeSettleMs = 2000;
      } catch (e) { /* 迁移失败不影响加载 */ }

      // 开关自动补齐：TASK_DEFS 里有、但已存配置缺的任务键，按分类给默认值。
      // （新增任务后老配置不会再漏开关——之前 ichiraku / arenaBattle 就是这样查不到的）
      try {
        const sw = merged.taskSwitches || (merged.taskSwitches = {});
        for (const d of TASK_DEFS) {
          if (!(d.key in sw)) sw[d.key] = (d.category === 'weekly') ? false : true;
        }
      } catch (e) { /* TASK_DEFS 尚未初始化时跳过 */ }

      return merged;
    }

    save() { Store.set(STORAGE_PREFIX + 'config', this.data); }

    _merge(base, over) {
      for (const k of Object.keys(over || {})) {
        const v = over[k];
        if (v === undefined || v === null) continue;
        if (typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
          this._merge(base[k], v);
        } else {
          base[k] = v;
        }
      }
      return base;
    }

    get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), this.data); }
    num(path) { const v = this.get(path); return typeof v === 'number' ? v : 0; }

    set(path, value) {
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((o, k) => (o[k] = o[k] || {}), this.data);
      target[last] = value;
      this.save();
    }

    reset() { this.data = structuredClone(DEFAULT_CONFIG); this.save(); }

    /** 按配置区间随机等待，如 cfg.wait('delay.pageLoad') */
    wait(rangePath) {
      const r = this.get(rangePath) || { min: 500, max: 1000 };
      let lo = r.min, hi = r.max;
      // 步间点击延时（任务步骤）：下限 1s
      if (rangePath === 'delay.click' && !(lo >= MIN_STEP_DELAY)) lo = MIN_STEP_DELAY;
      // 通用下限：除战斗外，任何操作之间的延时不低于 0.5s
      if (!(lo >= MIN_OP_DELAY)) lo = MIN_OP_DELAY;
      if (!(hi >= lo)) hi = lo;
      return Utils.sleep(Utils.random(lo, hi));
    }
  }

  // ============================================================
  //  Progress — 每日/每周完成记录（避免重复刷）
  // ============================================================
  class Progress {
    constructor(config) {
      this.config = config;
      this.data = Store.get(STORAGE_PREFIX + 'progress', {}) || {};
    }

    _period(category) {
      const h = this.config.num('runtime.dailyResetHour') || 5;
      return category === 'weekly' ? Utils.weekKey(h) : Utils.dayKey(h);
    }

    /** 该任务是否纳入「当天/当周已做过」记录。
     *  0.5.74 用户口径：**战斗组（battle）一律不记录** —— 角斗场忍术对战、
     *  任务集会所都是长期挂机任务，用户点了就是要执行，不该因为「今天做过了」被跳过。
     *  （代价：这几项不再去重，重复点「开始/战斗」就会重复跑 —— 用户明确接受）
     *  ⚠ v0.6.22：秘境挑战已从 battle 移入 daily，因此**会被记录/跳过** ——
     *  用户 2026-09-22 明确确认「就按日常的规则（做过了就跳过）」。 */
    tracked(task) { return !!task && task.category !== 'battle'; }

    isDone(task) {
      if (!this.tracked(task)) return false;   // 战斗组：永不判「已完成」
      const rec = this.data[task.key];
      return !!rec && rec.status === 'success' && rec.period === this._period(task.category);
    }

    mark(task, status, extra) {
      if (!this.tracked(task)) return;         // 战斗组不写周期记录（运行 history 照旧）
      this.data[task.key] = Object.assign(
        { period: this._period(task.category), status, at: Date.now() },
        extra || {}
      );
      Store.set(STORAGE_PREFIX + 'progress', this.data);
    }

    clearAll() { this.data = {}; Store.set(STORAGE_PREFIX + 'progress', this.data); }
  }

  // ============================================================
  //  SdkAdapter — 云游戏 SDK 统一适配层
  //  腾讯云游戏常见挂载点：window.TCGSDK / window.GMSDK / window.sdk
  //  各家方法名不同，这里统一成 mouseDown/mouseUp/key/raw
  // ============================================================
  // ============================================================
  //  SDK_SOURCES — 云游戏 SDK 候选（按实际启用的优先级排序）
  //
  //  真实环境（start.qq.com / cg.qq.com 的"腾讯云游戏"）用的是
  //    window._START_ARM_CG_  →  云端通讯 + touchControl
  //    window.Oprate           →  在容器元素上 dispatchEvent 标准 DOM 事件
  //  这两个与最早的 TCGSDK 是完全不同的两套 API，下面都会认。
  // ============================================================
  const SDK_SOURCES = [
    // —— 腾讯云游戏 新版（start.qq.com / cg.qq.com / cloudgame.qq.com）——
    ['Oprate',          () => window.Oprate],
    ['_START_ARM_CG_',  () => window._START_ARM_CG_],
    ['top.Oprate',      () => { try { return window.top && window.top.Oprate; } catch (e) { return null; } }],
    ['top._START_ARM_CG_', () => { try { return window.top && window.top._START_ARM_CG_; } catch (e) { return null; } }],

    // —— 老版 TCG / GM / gamematrix ——
    ['TCGSDK',    () => window.TCGSDK],
    ['tcgSdk',    () => window.tcgSdk],
    ['GMSDK',     () => window.GMSDK],
    ['gmSdk',     () => window.gmSdk],
    ['__GMSDK__', () => window.__GMSDK__],
    ['gamematrix',() => window.gamematrix],
    ['sdk',       () => window.sdk],
    ['top.TCGSDK',() => { try { return window.top && window.top.TCGSDK; } catch (e) { return null; } }],
    ['top.sdk',   () => { try { return window.top && window.top.sdk; } catch (e) { return null; } }],
  ];

  class SdkAdapter {
    constructor(config) {
      this.config = config;
      this.name = null;
      this.obj = null;
      this.caps = {};
      this.ready = false;
    }

    /** 在 window 与同源 iframe 中找 SDK，等待 timeout 毫秒 */
    async detect(timeout = 30000, interval = 1000) {
      const deadline = Date.now() + timeout;
      let lastReport = '';
      while (Date.now() < deadline) {
        Runtime.check();
        const found = this._scan();
        if (found) {
          this.name = found.name;
          this.obj = found.obj;
          this.caps = this._probeCaps(found.obj);
          this.ready = true;
          const lines = [
            'Oprate[' + Object.entries(this.caps.oprate).filter(([, v]) => v).map(([k]) => k).join(',') + ']',
            'arm[' + Object.entries(this.caps.arm).filter(([, v]) => v).map(([k]) => k).join(',') + ']',
            'legacy[' + Object.entries(this.caps.legacy).filter(([, v]) => v).map(([k]) => k).join(',') + ']',
          ];
          Utils.log('info', `✓ SDK 就绪: ${this.name} — ${lines.filter(l => !l.endsWith('[]')).join(' / ') || '无可用方法'}`);
          return true;
        }
        const tip = this._scanHint();
        if (tip && tip !== lastReport) { lastReport = tip; Utils.log('debug', tip); }
        await Utils.sleep(interval);
      }
      Utils.log('error', `✗ 未找到云游戏 SDK（等待 ${timeout / 1000}s）。请确认已进入云游戏画面。`);
      Utils.log('error', `  排查：F12 控制台执行 \`window.Oprate\` / \`window._START_ARM_CG_\` 看是否存在。`);
      return false;
    }

    /**
     * 列出当前页面有哪些"疑似 SDK"的对象，方便诊断。
     * 真实环境（start.qq.com / cg.qq.com）的 _START_ARM_CG_ 在云游戏 SDK
     * 初始化完毕前可能尚未挂载，要等 SDK 就绪日志出现再开始操作。
     */
    _scanHint() {
      if (window.Oprate || window._START_ARM_CG_) return null;
      return 'SDK 候选未就绪：等 Oprate / _START_ARM_CG_ 出现在 window 上';
    }

    /** 探测一个对象的能力，分三组：oprate(新) / arm(腾讯云游戏)/ legacy(老 SDK) */
    _probeCaps(obj) {
      const has = (k) => typeof obj[k] === 'function';
      return {
        // 腾讯云游戏新版：在容器元素上派发标准 DOM 事件（最稳）
        oprate: {
          clickElement: has('clickElement'), mouseDownElement: has('mouseDownElement'),
          mouseUpElement: has('mouseUpElement'), mouseMoveElement: has('mouseMoveElement'),
          keyDownElement: has('keyDownElement'), keyUpElement: has('keyUpElement'), keyPressElement: has('keyPressElement'),
          clickWindow: has('clickWindow'), mouseDownWindow: has('mouseDownWindow'),
          mouseUpWindow: has('mouseUpWindow'), mouseMoveWindow: has('mouseMoveWindow'),
          keyDownWindow: has('keyDownWindow'), keyUpWindow: has('keyUpWindow'), keyPressWindow: has('keyPressWindow'),
        },
        // 腾讯云游戏 SDK：底层传输 + 触摸控制
        arm: {
          touchControl: has('touchControl'),
          sendTouchEventV2: has('sendTouchEventV2'),
          sendSocketChannelData: has('sendSocketChannelData'),
          sendRTC: has('sendRTC'),
          setNeedSendTouch: has('setNeedSendTouch'),
        },
        // 老 TCGSDK / GMSDK
        legacy: {
          sendMouseEvent: has('sendMouseEvent'),
          sendRawEvent: has('sendRawEvent'),
          sendTouchEvent: has('sendTouchEvent'),
          sendKeyboardEvent: has('sendKeyboardEvent'),
        },
      };
    }

    /**
     * 轻量重探：启动时 detect() 超时后 SDK 才挂载的场景自愈。
     * 状态循环每秒调用，成功即补齐 detect 的全部初始化。
     */
    rescan() {
      if (this.ready) return true;
      const found = this._scan();
      if (!found) return false;
      this.name = found.name;
      this.obj = found.obj;
      this.caps = this._probeCaps(found.obj);
      this.ready = true;
      Utils.log('info', `✓ SDK 延迟挂载，重探成功: ${this.name}`);
      return true;
    }

    _scan() {
      const wins = [window];
      document.querySelectorAll('iframe').forEach(f => {
        try { if (f.contentWindow) wins.push(f.contentWindow); } catch (e) { /* 跨域 */ }
      });
      try { if (window.parent && window.parent !== window) wins.push(window.parent); } catch (e) { /* ignore */ }

      const order = [];   // 优先级顺序：Oprate > _START_ARM_CG_ > legacy
      for (const w of wins) {
        for (const [name, getter] of SDK_SOURCES) {
          let obj = null;
          if (name.startsWith('top.')) obj = getter();
          else { try { obj = w[name.replace(/[^A-Za-z_]/g, '')]; } catch (e) { obj = null; } }
          if (!obj || typeof obj !== 'object') continue;
          if (this._probeCaps(obj).oprate.clickWindow) order.push({ prio: 0, name, obj });
          else if (this._probeCaps(obj).arm.touchControl || this._probeCaps(obj).arm.sendTouchEventV2) order.push({ prio: 1, name, obj });
          else if (this._probeCaps(obj).legacy.sendMouseEvent || this._probeCaps(obj).legacy.sendRawEvent || this._probeCaps(obj).legacy.sendTouchEvent) order.push({ prio: 2, name, obj });
        }
      }
      order.sort((a, b) => a.prio - b.prio);
      return order.length ? { name: order[0].name, obj: order[0].obj } : null;
    }

    /** 串流分辨率（点击坐标换算基准） */
    inputScale() {
      const v = Vision.video;
      if (v && v.videoWidth) return { w: v.videoWidth, h: v.videoHeight };
      const c = document.querySelector('canvas');
      if (c && c.width) return { w: c.width, h: c.height };
      return { w: BASE_W, h: BASE_H };
    }

    /** 1280x720 逻辑坐标 → 实际发送坐标 */
    _map(x, y) {
      const mode = this.config.get('input.mode');
      // raw：原样发（SDK 自己按 1280x720 逻辑坐标收）
      if (mode === 'raw') return { x: Math.round(x), y: Math.round(y) };
      if (mode === 'dom') {
        const el = Vision.video || document.querySelector('canvas');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width && r.height) {
            // object-fit: contain 信箱映射（2026-09-09 真机验证）：
            // 流按 min(rw/sw, rh/sh) 缩放居中装进显示盒，两侧/上下多余为黑边。
            // SDK 收到 client 坐标后按同一 contain 规则反算流坐标，
            // 因此这里必须补上黑边偏移，否则系统性偏移（1920x911 盒左黑边 150px）。
            const s = this.inputScale();
            const scale = Math.min(r.width / s.w, r.height / s.h);
            const offX = (r.width - s.w * scale) / 2;
            const offY = (r.height - s.h * scale) / 2;
            return {
              x: Math.round(r.left + offX + (x * s.w / BASE_W) * scale),
              y: Math.round(r.top + offY + (y * s.h / BASE_H) * scale),
            };
          }
        }
      }
      const s = this.inputScale();
      return { x: Math.round(x * s.w / BASE_W), y: Math.round(y * s.h / BASE_H) };
    }

    /** 事件类型名可配（不同 SDK 用 mousedown / down / press 不一） */
    _etype(kind) {
      const custom = this.config.get('input.eventTypes') || {};
      if (custom[kind]) return custom[kind];
      if (this.caps.sendTouchEvent && !this.caps.sendMouseEvent && !this.caps.sendRawEvent) {
        return { down: 'touchstart', up: 'touchend', move: 'touchmove' }[kind];
      }
      return { down: 'mousedown', up: 'mouseup', move: 'mousemove' }[kind];
    }

    /**
     * 发送一次事件。优先级（2026-09-09 真机实测修正）：
     *   1) 原生 dispatchEvent 到 video 元素（pointer+mouse+click，实测唯一真正送达游戏的通道；
     *      SDK 在 video 上监听且不校验 isTrusted，会组 0x50/0x51 包走 WebRTC datachannel）
     *   2) Oprate.mouseDownWindow/...（注意：实测会"成功返回"但为 no-op，仅作无 video 时兜底）
     *   3) _START_ARM_CG_.touchControl（云端触摸）
     *   4) 老 SDK 的 sendMouseEvent / sendRawEvent / sendTouchEvent（多格式）
     */
    _emit(kind, p) {
      // —— 1) 原生 DOM 派发（主通道，真机验证有效）——
      if (Vision.video) return this._domDispatch(kind, p);

      // —— 2) Oprate.window ——
      if (this.name === 'Oprate' || (this.obj && this.caps.oprate.mouseDownWindow)) {
        const m = kind === 'down' ? 'mouseDownWindow' : kind === 'up' ? 'mouseUpWindow' : 'mouseMoveWindow';
        if (this.caps.oprate[m]) {
          const formats = [
            { clientX: p.x, clientY: p.y },
            { clientX: p.x, clientY: p.y, button: 0 },
            { x: p.x, y: p.y },
            { x: p.x, y: p.y, type: kind === 'down' ? 'mousedown' : kind === 'up' ? 'mouseup' : 'mousemove' },
          ];
          for (const f of formats) {
            try { this.obj[m](f); this.lastSend = { sdk: 'Oprate', method: m, payload: f, at: Date.now() }; return p; } catch (e) { /* next */ }
          }
        }
        // Oprate.element 版：找最上层覆盖层
        if (this.caps.oprate.mouseDownElement) {
          const el = (Vision.video && Vision.video.parentElement) || document.body;
          const m = kind === 'down' ? 'mouseDownElement' : kind === 'up' ? 'mouseUpElement' : 'mouseMoveElement';
          const formats = [
            { target: el, clientX: p.x, clientY: p.y },
            { clientX: p.x, clientY: p.y, target: el },
            el,
          ];
          for (const f of formats) {
            try { this.obj[m](f); this.lastSend = { sdk: 'Oprate', method: m + '(el)', payload: f, at: Date.now() }; return p; } catch (e) { /* next */ }
          }
        }
      }

      // —— 3) _START_ARM_CG_.touchControl ——
      if (this.caps.arm && (this.caps.arm.touchControl || this.caps.arm.sendTouchEventV2)) {
        try { this.caps.arm.setNeedSendTouch && this.obj.setNeedSendTouch(true); } catch (e) {}
        const m = this.caps.arm.touchControl ? 'touchControl' : 'sendTouchEventV2';
        const payload = { type: kind === 'down' ? 'touchstart' : kind === 'up' ? 'touchend' : 'touchmove', x: p.x, y: p.y };
        try { this.obj[m](payload); this.lastSend = { sdk: '_START_ARM_CG_', method: m, payload, at: Date.now() }; return p; } catch (e) {}
      }

      // —— 4) 老 SDK ——
      if (this.caps.legacy.sendMouseEvent || this.caps.legacy.sendRawEvent || this.caps.legacy.sendTouchEvent) {
        const method = this.caps.legacy.sendMouseEvent ? 'sendMouseEvent'
          : this.caps.legacy.sendRawEvent ? 'sendRawEvent' : 'sendTouchEvent';
        const type = this._etype(kind);
        const touch = /^touch/.test(type);
        const proto = this.config.get('input.protocol') || 'obj';
        const variants = [];
        if (proto === 'args') {
          variants.push(['args', type, p.x, p.y]);
          variants.push(['args', p.x, p.y, type]);
        } else {
          variants.push(['obj', { type, x: p.x, y: p.y, button: 0 }]);
          variants.push(['obj', { type, x: p.x, y: p.y }]);
          variants.push(['obj', { x: p.x, y: p.y, type }]);
          if (touch) variants.push(['obj', { type, touches: [{ identifier: 0, x: p.x, y: p.y }] }]);
        }
        let lastErr = null;
        for (const [fmt, ...rest] of variants) {
          try {
            if (fmt === 'args') this.obj[method](...rest);
            else this.obj[method](rest[0]);
            this.lastSend = { sdk: this.name, method, fmt, payload: fmt === 'args' ? rest : rest[0], at: Date.now() };
            return p;
          } catch (e) { lastErr = e; }
        }
        if (lastErr) Utils.log('debug', `老 SDK ${method} 失败: ${lastErr.message}`);
      }

      // —— 4) 兜底：原生 DOM dispatchEvent ——
      return this._domDispatch(kind, p);
    }

    /**
     * 主通道：在 video 元素上派发 PointerEvent + MouseEvent（+ click）。
     * 真机验证（2026-09-09）：SDK 在 video 上监听 pointer/mouse 事件且不校验 isTrusted，
     * 收到后组 0x50/0x51 输入包经 WebRTC datachannel 发往云端，游戏正常响应。
     * 注意目标必须是 video 本身——派发到 parentElement 不会向下传播到 video 的监听器。
     */
    _domDispatch(kind, p) {
      const target = Vision.video || (Vision.video && Vision.video.parentElement) || document.body;
      const down = kind === 'down', up = kind === 'up';
      const pType = down ? 'pointerdown' : up ? 'pointerup' : 'pointermove';
      const mType = down ? 'mousedown' : up ? 'mouseup' : 'mousemove';
      const base = {
        bubbles: true, cancelable: true, view: window,
        clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
        button: 0, buttons: down ? 1 : 0,
        pointerId: 1, isPrimary: true, pointerType: 'mouse',
      };
      let ok = true;
      try { target.dispatchEvent(new PointerEvent(pType, base)); } catch (e) { /* PointerEvent 不可用时忽略 */ }
      try { ok = target.dispatchEvent(new MouseEvent(mType, base)) && ok; } catch (e) {}
      if (up) { try { target.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { buttons: 0 }))); } catch (e) {} }
      this.lastSend = { sdk: 'dom', method: 'dispatchEvent(video)', eventType: mType, at: p, dispatched: ok, at2: Date.now() };
      return p;
    }

    _down(x, y, button) {
      Runtime.check();
      const p = this._map(x, y);
      p.logical = { x, y };   // 供标记/追踪使用
      return this._emit('down', p);
    }

    _up(x, y, button) {
      const p = this._map(x, y);
      p.logical = { x, y };
      return this._emit('up', p);
    }

    _move(x, y) {
      const p = this._map(x, y);
      p.logical = { x, y };
      return this._emit('move', p);
    }

    /**
     * 发送按键（支持修饰键与长按）
     * @param {string}  key     键名，如 'Escape' / 'f' / 'ArrowLeft'
     * @param {object}  mods    { ctrl, shift, alt }
     * @param {number}  hold    按住毫秒数，缺省 60
     * @param {boolean} fanout  战斗专用：对所有可用通道各发一次（默认 false = 首个成功即停）
     *
     * 2026-09-12 重写（旧版仅 Oprate.keyDownWindow 单通道，实测战斗中按键无反应）：
     *  · payload 标准化：补 code('KeyK') / which / windowKeyCode / nativeKeyCode / repeat，
     *    很多云游戏 SDK 只读 code 或 windowKeyCode，旧 payload 只有 key/keyCode 会被忽略。
     *  · 通道穷举：keyPressWindow → keyDown/UpWindow → keyPress/DownElement
     *    → legacy sendKeyboardEvent → DOM dispatchEvent（兜底）。
     *  · fanout=true 时全部可用通道各发一次（宁可重复触发也不要静默无效）。
     *  · lastSend.tried 记录每个通道的成败，供面板「⌨ 键盘自检」诊断。
     */
    key(key, mods, hold, fanout) {
      const m = mods || {};
      const ms = hold == null ? 60 : hold;
      const kc = Utils.keyCode(key);
      const code = Utils.codeOf(key);
      const base = {
        key, code, keyCode: kc, which: kc, charCode: 0,
        windowKeyCode: kc, nativeKeyCode: kc,
        ctrlKey: !!m.ctrl, shiftKey: !!m.shift, altKey: !!m.alt,
        metaKey: false, repeat: false,
      };
      const obj = this.obj;
      const caps = this.caps || {};
      const op = caps.oprate || {};
      const lg = caps.legacy || {};
      const tried = [];

      // 通道表（按优先级；每个都是完整 keydown+keyup 对，不会卡键）
      const chans = [];
      if (op.keyPressWindow)   chans.push(['keyPressWindow', () => obj.keyPressWindow(base)]);
      if (op.keyDownWindow) {
        chans.push(['keyDownWindow', () => {
          obj.keyDownWindow(base);
          if (op.keyUpWindow) setTimeout(() => { try { obj.keyUpWindow(base); } catch (e) {} }, ms);
          else setTimeout(() => { try { obj.keyDownWindow(Object.assign({}, base, { type: 'keyup' })); } catch (e) {} }, ms);
        }]);
      }
      if (op.keyPressElement)  chans.push(['keyPressElement', () => obj.keyPressElement(base)]);
      if (op.keyDownElement) {
        chans.push(['keyDownElement', () => {
          obj.keyDownElement(base);
          if (op.keyUpElement) setTimeout(() => { try { obj.keyUpElement(base); } catch (e) {} }, ms);
        }]);
      }
      if (lg.sendKeyboardEvent) {
        chans.push(['sendKeyboardEvent', () => {
          obj.sendKeyboardEvent(Object.assign({ type: 'keydown' }, base));
          setTimeout(() => { try { obj.sendKeyboardEvent(Object.assign({ type: 'keyup' }, base)); } catch (e) {} }, ms);
        }]);
      }
      // 兜底：DOM 派发到 video（同鼠标主通道，监听器在 video 上；本地 canvas 游戏有效）
      chans.push(['dom', () => {
        const target = Vision.video || (Vision.video && Vision.video.parentElement) || document.body;
        const init = {
          key, code, bubbles: true, cancelable: true,
          ctrlKey: !!m.ctrl, shiftKey: !!m.shift, altKey: !!m.alt,
        };
        // keyCode/which 在标准构造里是只读的，很多游戏 SDK 只读这两个字段 → 覆盖 getter
        const mk = type => {
          const ev = new KeyboardEvent(type, init);
          try {
            Object.defineProperty(ev, 'keyCode', { get: () => kc, configurable: true });
            Object.defineProperty(ev, 'which', { get: () => kc, configurable: true });
          } catch (e) {}
          return ev;
        };
        target.dispatchEvent(mk('keydown'));
        setTimeout(() => target.dispatchEvent(mk('keyup')), ms);
      }]);

      let sent = false, n = 0;
      for (const [tag, fn] of chans) {
        // fanout 上限 3 个通道：普攻 0.2s 一拍，全通道齐发会变成 30 次 keydown/s，反而可能把游戏卡住
        if (fanout && n >= 3) break;
        try { fn(); tried.push(tag + '✓'); sent = true; n++; if (!fanout) break; }
        catch (e) { tried.push(tag + '✗:' + ((e && e.message) || e)); }
      }
      this.lastSend = {
        sdk: this.name || (sent ? 'dom' : 'none'), method: fanout ? 'fanout' : 'first-ok',
        key, code, keyCode: kc, mods: m, hold: ms, tried, at: Date.now(),
      };
      // 自动运行追踪：所有按键都从这里漏斗过，统一在此记录（避免经 GameOperator.key 与直连 sdk.key 重复/漏录）
      AutoTrace.record('key', { key: key, hold: ms });
      if (!sent) Utils.log('warn', `⌨ 发键失败（无任何通道可用）：${key}`);
      return sent;
    }

    /** 逻辑坐标(1280x720) → 页面 client 坐标（与 _map 的 dom 分支同一套 contain 映射） */
    _toClient(x, y) {
      const el = Vision.video || document.querySelector('canvas');
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) {
          const s = this.inputScale();
          const scale = Math.min(r.width / s.w, r.height / s.h);
          const offX = (r.width - s.w * scale) / 2;
          const offY = (r.height - s.h * scale) / 2;
          return {
            x: Math.round(r.left + offX + (x * s.w / BASE_W) * scale),
            y: Math.round(r.top + offY + (y * s.h / BASE_H) * scale),
          };
        }
      }
      const s = this.inputScale();
      return { x: Math.round(x * s.w / BASE_W), y: Math.round(y * s.h / BASE_H) };
    }

    /** 元素简短路径（日志用，最多 4 层） */
    static pathOf(el) {
      if (!el || !el.tagName) return 'null';
      const parts = [];
      let n = el, i = 0;
      while (n && n.nodeType === 1 && i < 4) {
        let s = n.tagName.toLowerCase();
        if (n.id) { parts.unshift(s + '#' + n.id); break; }
        const cls = (typeof n.className === 'string' && n.className.trim().split(/\s+/)[0]) || '';
        if (cls) s += '.' + cls;
        parts.unshift(s);
        n = n.parentElement; i++;
      }
      return parts.join('>');
    }

    /**
     * 宿主页面 DOM 层点击（2026-09-12 新增）
     * ——为什么需要：分享生成的图、部分活动弹窗是**云游戏网页自己的 DOM 覆盖层**
     *   （如 /html/body/div[9]/...），并不在 video 画面里。主通道 _domDispatch 把事件
     *   派发到 video 上，这类覆盖层永远收不到事件 → 表现为"点了没反应"（与键盘无反应
     *   同属"注入层级不对"这一类问题）。
     * ——做法：逻辑坐标 → 页面 client 坐标 → elementFromPoint 命中真实元素 →
     *   派发完整 pointer/mouse/click 序列（bubbles+composed，React/Vue 事件委托也能触发）。
     * @param {number} x @param {number} y 逻辑坐标
     * @param {object} [opts] { xpath } 可选：优先按 XPath 定位（索引类 XPath 不稳，仅作兜底）
     * @returns {{ok:boolean, reason?:string, path?:string, at?:{x,y}, xpath?:boolean}}
     */
    domClick(x, y, opts) {
      const o = opts || {};
      let el = null, cx = 0, cy = 0, viaXpath = false;

      if (o.xpath) {
        try {
          const r = document.evaluate(o.xpath, document, null, 9, null);
          const node = r && r.singleNodeValue;
          if (node && node.nodeType === 1) {
            const b = node.getBoundingClientRect();
            // 索引类 XPath 常在页面变化后指向别的元素 → 必须可见才认
            if (b.width > 0 && b.height > 0) { el = node; viaXpath = true; }
          }
        } catch (e) { /* XPath 解析失败 → 退回坐标定位 */ }
      }
      if (el) {
        const b = el.getBoundingClientRect();
        cx = Math.round(b.left + b.width / 2);
        cy = Math.round(b.top + b.height / 2);
      } else {
        const p = this._toClient(x, y);
        cx = p.x; cy = p.y;
        el = document.elementFromPoint(cx, cy);
      }
      if (!el) return { ok: false, reason: '该点未命中任何页面元素', at: { x: cx, y: cy } };

      // 命中游戏画面层 → 说明此处没有页面覆盖层，应走原点击通道
      const isGame = el === Vision.video || el.tagName === 'CANVAS'
        || (Vision.video && Vision.video.contains(el))
        || (Vision.video && el.contains && el.contains(Vision.video));
      if (isGame) {
        return {
          ok: false, reason: '该坐标处是游戏画面层(video/canvas)，非页面覆盖层',
          path: SdkAdapter.pathOf(el), at: { x: cx, y: cy },
        };
      }

      const init = {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: cx, clientY: cy, screenX: cx, screenY: cy,
        button: 0, buttons: 1, detail: 1,
        pointerId: 1, pointerType: 'mouse', isPrimary: true,
      };
      const fire = (type, Ctor) => {
        let ev;
        try { ev = new Ctor(type, init); } catch (e) { ev = new MouseEvent(type, init); }
        el.dispatchEvent(ev);
      };
      try {
        const P = window.PointerEvent || MouseEvent;
        fire('pointerover', P); fire('pointerenter', P);
        fire('pointerdown', P); fire('mousedown', MouseEvent);
        fire('pointerup', P); fire('mouseup', MouseEvent);
        fire('click', MouseEvent);
      } catch (e) {
        return {
          ok: false, reason: '派发异常: ' + ((e && e.message) || e),
          path: SdkAdapter.pathOf(el), at: { x: cx, y: cy },
        };
      }
      const b = el.getBoundingClientRect();
      this.lastSend = {
        sdk: 'dom-overlay', method: 'click', at: { x: cx, y: cy },
        path: SdkAdapter.pathOf(el), at2: Date.now(),
      };
      return {
        ok: true, path: SdkAdapter.pathOf(el), at: { x: cx, y: cy }, xpath: viaXpath,
        rect: { w: Math.round(b.width), h: Math.round(b.height) },
      };
    }

    /** 覆盖层诊断：列出 video 之上的宿主页面 DOM 层（分享图/活动弹窗通常在这一层），
     *  并报告画面中心点 elementFromPoint 命中谁 —— 用来判断"点了没反应"是不是层级问题 */
    overlayScan() {
      const v = Vision.video;
      const out = { video: null, overlays: [], centerHit: null };
      if (v) {
        const r = v.getBoundingClientRect();
        out.video = {
          path: SdkAdapter.pathOf(v),
          rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        };
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        let hit = null;
        try { hit = document.elementFromPoint(cx, cy); } catch (e) {}
        out.centerHit = {
          at: { x: cx, y: cy }, path: SdkAdapter.pathOf(hit),
          isGameLayer: !!hit && (hit === v || v.contains(hit) || hit.tagName === 'CANVAS'),
        };
      }
      const roots = document.body ? Array.from(document.body.children) : [];
      for (const el of roots) {
        if (el === v || (v && el.contains(v))) continue;
        let cs; try { cs = getComputedStyle(el); } catch (e) { continue; }
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        if (cs.pointerEvents === 'none') continue;
        out.overlays.push({
          path: SdkAdapter.pathOf(el), pos: cs.position, z: cs.zIndex,
          rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        });
      }
      return out;
    }
  }

  // ============================================================
  //  VisionCore — video → canvas 帧捕获
  //  坐标全部归一化到 1280x720 逻辑空间
  // ============================================================
  const SIG_W = 64, SIG_H = 36;

  // 「代码缺陷类」异常特征（v0.6.28）：这类错误重试无用，必须直接暴露。
  //   覆盖：调用了不存在的方法/属性（方法放错类、拼写错、重构漏改）、
  //         以及 undefined 取属性 —— 都是"代码写错了"，不是"环境没就绪"。
  //   ⚠ 只匹配**明确的代码缺陷**，不匹配超时/网络/视觉不可用等**可重试**故障。
  const CODE_BUG_RE = /is not a function|is not defined|Cannot read (property|properties) of (undefined|null)|Cannot access .* before initialization/;

  // ── 暂停键双竖条检测参数（v0.6.27，tools/calib-pause-bars.cjs 正负样本标定）────
  //  ⚠ 必须放在 VisionCore **之前**：类方法引用这些 const，而 const 有 TDZ
  //    （定义在类之后会在首次调用时抛 "Cannot access before initialization"）。
  //  搜索区取右上角 [1200,0,1280,80]（留余量）；实测白条只在 x≈1233/1249，
  //    判据里再用 inBand(1225~1265) 排除 x≈1200 处混入的假簇。
  const PAUSE_BAR_REGION = [1200, 0, 1280, 80];
  const PAUSE_BAR_LUMA = 150;        // 白条亮度下限（实测白条为纯白）
  const PAUSE_BAR_CHROMA = 60;       // 三通道最大差上限（近中性=白，排除彩色背景）
  const PAUSE_BAR_MIN_COL = 12;      // 单列白像素数 >= 此值才算竖条一份（实测 20~23）
  //  真白条 x 波段（实测稳定 1232~1234 与 1248~1249）；band 外一律视为假簇丢弃。
  const PAUSE_BAR_X_LO = 1225, PAUSE_BAR_X_HI = 1265;

  // ── 暂停键「战斗状态机」默认参数（v0.6.27，用户 2026-09-23 口径）──────────
  //  静默 3s 起判（等加载/登场，此时暂停键还没出现）→ 每 1s 采样 → 连续失败 3 次判退出。
  //  ⚠ 3 次是保守值：用户实测「大招不会糊住这个」，但保留 3 次以吸收其它意外遮挡。
  const BATTLE_WATCH_START_MS = 3000;
  const BATTLE_WATCH_POLL_MS = 1000;
  const BATTLE_WATCH_FAIL_NEED = 3;
  const BATTLE_WATCH_TIMEOUT_MS = 600000;   // waitBattleExit 的兜底上限（10min）

// ── 忍术对战「奖励领取」面板（v0.6.27，用户录制 + 截图实测）──────────────
//  ⚠ 必须放在 VisionCore **之前**：`VisionCore.sawArenaRewardClaimed` 引用这些 const，
//    而 const 有 TDZ（定义在类之后 → 首次调用抛 "Cannot access before initialization"）。
//  流程（用户口径）：
//    角斗场战斗结束 → 回战斗准备界面 → 点 (793,642) 打开奖励面板
//    → 点 4 次领取（前 3 个补位到同一行，第 4 个在第 2 行）
//    → 探测第 1、2 个礼包是否都变红（已领取）
//        · 都红  → 领完 → 点最右 (1245,320) 回准备界面 → 回桌面
//        · 否则  → 点最右 (1245,320) 回准备界面 → 再打一批（无上限，直到领满）
//  取色实测（tools/red-vs-gold.cjs）：已领取红像素占比 12.9~18.2%；可领取/空 ≤1.1%。
const ARENA_REWARD_ENTRY = [793, 642];       // 打开奖励面板
const ARENA_REWARD_CLAIMS = [                // 领取点击（前 3 个补位同一行，第 4 个第 2 行）
  [1128, 177], [1128, 177], [1128, 177], [1124, 290],
];
// 「已领取(红)」判定区：第 1 / 第 2 个礼包的状态标记处。
//   ⚠ 第 2 个位置与「第 4 个礼包的金按钮」重叠 —— 靠颜色判据区分（红 G≈B / 金 G≫B）。
const ARENA_REWARD_STATUS_AREAS = [
  [1081, 153, 1184, 233],   // 第 1 个礼包状态标记
  [1079, 287, 1179, 351],   // 第 2 个礼包状态标记
];
const ARENA_REWARD_RED_MIN_PCT = 8;          // 红像素占比阈值（实测红 12.9+ / 干扰 ≤1.1）
const ARENA_REWARD_EXIT = [1245, 320];       // 面板最右侧：返回忍术对战界面（两条路径都用它）
// ⚠ 无批次上限：用户口径「我就是需要无限打，直到领取奖励」→ 打到领满为止。

  class VisionCore {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = BASE_W;
      this.canvas.height = BASE_H;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      this.sigCanvas = document.createElement('canvas');
      this.sigCanvas.width = SIG_W;
      this.sigCanvas.height = SIG_H;
      this.sigCtx = this.sigCanvas.getContext('2d', { willReadFrequently: true });

      this.video = null;
      this.tainted = false;     // getImageData 被跨域限制
      this.lastError = null;
      this._frame = null;
      this._frameTs = 0;
      this._prevSig = null;
      this.stats = { captures: 0, errors: 0 };
    }

    /** 查找云游戏画面元素（优先 video，其次 canvas），跨同源 iframe */
    bind() {
      const roots = [document];
      document.querySelectorAll('iframe').forEach(f => {
        try { if (f.contentDocument) roots.push(f.contentDocument); } catch (e) { /* 跨域 */ }
      });

      const selectors = [
        'video#gmsdk-video-element',
        'video.gmsdk-video-player',
        'video[id*="gmsdk"]', 'video[class*="gmsdk"]',
        'video[id*="tcg"]', 'video[class*="tcg"]',
        'canvas#gmsdk-canvas', 'canvas[id*="gmsdk"]',
      ];

      let best = null, bestArea = 0;
      for (const root of roots) {
        for (const sel of selectors) {
          let el = null;
          try { el = root.querySelector(sel); } catch (e) { /* ignore */ }
          if (el) { this.video = el; return el; }
        }
        // 兜底：取画面最大的 video
        root.querySelectorAll('video').forEach(v => {
          const area = (v.videoWidth || v.clientWidth || 0) * (v.videoHeight || v.clientHeight || 0);
          if (area > bestArea) { bestArea = area; best = v; }
        });
      }
      if (best && bestArea > 0) { this.video = best; return best; }
      return null;
    }

    available() {
      const v = this.video;
      if (!v) return false;
      if (v.tagName === 'VIDEO') return v.readyState >= 2 && v.videoWidth > 0;
      return true;
    }

    status() {
      if (!this.video) return 'no-element';
      if (this.tainted) return 'tainted';
      if (!this.available()) return 'not-ready';
      return 'ok';
    }

    /**
     * 把当前视频帧画进分析画布（后续所有 avg/match/find* 都读这块画布）。
     *
     * ⚠ 0.5.42 关键修复：以前只有 scenes.detect() 会调 capture()，任务里直接
     * `vision.match(probe)` 时读到的还是「上一次截图时的旧画面」——例如招财任务
     * 打开招财页后没再截图，探针一直在比对「打开前的主界面」，必然判定失败 →
     * 直接 break 跳过（表现为「识别不到、点了没反应」）。签到 findTemplate、
     * 招募 findTextRows 同理。
     *
     * 现在统一由读取方法自己保证新鲜度：默认 90ms 内复用同一帧（一次场景判定要
     * 跑 20+ 探针，不能每个都重截），需要强制新帧时传 force=true。
     */
    capture(force) {
      const now = Date.now();
      if (!force && this._capTs && now - this._capTs < 90) return;
      const v = this.video;
      if (!v) throw new Error('未找到画面元素');
      this.ctx.drawImage(v, 0, 0, BASE_W, BASE_H);
      this._capTs = now;
      this.stats.captures++;
    }

    /** 读取前的静默刷新：无画面元素时不抛，沿用旧帧交给调用方判定 */
    _fresh() { try { this.capture(); } catch (e) { /* 无画面元素 */ } }

    /** 取一帧 ImageData，带短时缓存 */
    grab(ttl) {
      const now = Date.now();
      if (this._frame && now - this._frameTs < (ttl == null ? 120 : ttl)) return this._frame;
      this.capture();
      try {
        this._frame = this.ctx.getImageData(0, 0, BASE_W, BASE_H);
      } catch (e) {
        this.tainted = true;
        this.lastError = e.message;
        this.stats.errors++;
        throw e;
      }
      this._frameTs = now;
      this.tainted = false;
      return this._frame;
    }

    /**
     * 区域平均色 + 亮度标准差
     * std 用来区分「真按钮」和「碰巧颜色接近的纯色背景」：
     * 按钮有描边/图形，std 明显大于 0；纯色背景接近 0。
     */
    avg(x, y, w, h) {
      this._fresh();   // 保证读到的是最新画面（0.5.42）
      const d = this.ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
      const n = d.length / 4;
      let r = 0, g = 0, b = 0, s = 0, s2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; g += d[i + 1]; b += d[i + 2];
        const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
        s += l; s2 += l * l;
      }
      const mean = s / n;
      const varr = Math.max(0, s2 / n - mean * mean);
      return {
        r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n),
        std: Math.round(Math.sqrt(varr)),
      };
    }

    dist(a, c) { return Math.abs(a.r - c.r) + Math.abs(a.g - c.g) + Math.abs(a.b - c.b); }

    /** 匹配一个探针 {area, color, tol, minStd, maxStd} */
    match(probe) {
      this._fresh();   // 0.5.42：不再依赖调用方先截图，避免读到旧帧导致静默判定失败
      const a = probe.area;
      const s = this.avg(a[0], a[1], a[2] - a[0], a[3] - a[1]);
      const d = this.dist(s, probe.color);
      const tol = probe.tol || 35;
      const stdOk = s.std >= (probe.minStd || 0) && (probe.maxStd == null || s.std <= probe.maxStd);
      return { ok: d <= tol && stdOk, dist: d, avg: s, std: s.std, tol, stdOk };
    }

    /** 标准件①：右上角红叉（= 已回到准备界面 / 结算完成）。
     *
     *  用户口径（2026-09-23）：「右上角红x的判定也弄成标准件，方便引用」。
     *  语义：**红叉常驻出现 ⇒ 该场已经走完**（游戏自行结算并退回准备/入口界面）。
     *    ⚠ 判据不是"结算页"，而是"回到准备界面"（用户澄清）——故它稳定驻留、
     *      不怕连点器干扰，落判偏晚反而更可靠。
     *
     *  用法（**同步方法**，不要 await）：`if (ctx.vision.sawRedX().ok) { ... }`
     *  @returns {{ok:boolean, score:number|null, dist:number|null, avg:object|null}} ok=true = 红叉在
     *  探针本身单点维护在 PROBES.closeX，调用方无需再引用它。 */
    sawRedX() {
      try {
        const m = this.match(PROBES.closeX);
        return { ok: !!(m && m.ok), score: m ? m.dist : null, dist: m ? m.dist : null, avg: m ? m.avg : null };
      } catch (e) {
        return { ok: false, score: null, dist: null, avg: null, err: e.message };
      }
    }

    /**
     * 标准件①b：**等待"已回到准备界面"被确认**（红叉在场）—— 作为点下一把的**闸门**。
     *
     *  用户口径（2026-09-23）：「红叉还要有个作用，是确保界面已经回到了准备界面，
     *    这时候你点击就是下一把的开战，然后才能继续进行，否则的话**就是污点了**。」
     *
     *  为什么要这个闸：红叉落判（redXEnd）是**历史事件**（"刚才看到过红叉"），
     *  它不等于**当前**红叉还在。落判与下一次点击之间隔着关结算、等静止等若干秒，
     *  期间画面可能已经切走（弹窗/加载/被别处误点）。此时若盲目点「挑战」，
     *  就会点在一个未知界面上 —— 这就是"污点"：不仅这一下无效，
     *  还可能误触其它按钮（消费/退出/进入别的玩法），把后续流程带偏。
     *
     *  ⚠ 语义：本方法是**点击前的最后一道确认**，只有它 ok 才允许点下一把。
     *    它复用标准件①的探针（PROBES.closeX），不新建判据。
     *
     *  @param {number} [timeoutMs=5000] 轮询上限
     *  @param {number} [pollMs=400]     轮询间隔
     *  @returns {Promise<{ok:boolean, waitedMs:number, tries:number}>}
     *    ok=true ⇒ 当前画面确认有红叉（= 在准备界面），可以安全点下一把
     */
    async waitRedXReady(timeoutMs = 5000, pollMs = 400) {
      const t0 = Date.now();
      let tries = 0;
      while (Date.now() - t0 < timeoutMs) {
        Runtime.check();
        tries++;
        if (this.sawRedX().ok) return { ok: true, waitedMs: Date.now() - t0, tries };
        await Utils.sleep(pollMs);
      }
      return { ok: false, waitedMs: Date.now() - t0, tries };
    }

    /** 标准件②：战斗界面右上角「暂停」按钮（= 仍在战斗中）。
     *
     *  用户口径（2026-09-23）：「战斗界面的右上角暂停按钮…也可以弄成一个标准件，来做判定探针」。
     *  语义：**暂停键只在战斗进行中可见** ⇒ 命中即"还在打"；不命中即"已离开战斗画面"。
     *
     *  用法（**同步方法**，不要 await）：`if (ctx.vision.sawBattlePause().ok) { ... }`
     *  @returns {{ok:boolean, bars:number, x1:number, x2:number}} ok=true = 暂停键在（仍在战斗）
     *
     *  ── 为什么用「双竖条结构检测」而不是色块均值 ──────────────────────────
     *  暂停键 = 深色圆底 + **两条平行白色竖条**。最初想用"区域均值色"判，
     *  实测失败：小人图标只占区域约 20%，均值被背景色调拖走，同一场战斗距离在 47~156 间漂移，
     *  战斗段与非战斗段分布几乎完全重叠（阈值 2 也是 30/37 误报）→ 无判别力。
     *  改用**按列统计白像素**后分离彻底（见下），故定型为结构检测。
     *
     *  ── 阈值标定（tools/calib-pause-bars.cjs + verify-pausebars-final.cjs 实测）────
     *  正样本 13 帧（小队突袭战斗 8 + 秘境战斗 5）：**全部命中**
     *    · 两条竖条稳定在 x≈1233(宽6) 与 x≈1249(宽6)，列高 19~23px、间距 8~10px
     *  负样本 18 帧（准备页/结算页/主界面/秘境准备页）：**全部正确排除，0 误报**
     *  ⚠ 一个实测坑：部分帧在 x≈1200（搜索区左缘）会混入 1~2 个假簇 ——
     *    那是被裁进来的其它 UI 边缘，**不是暂停键**。
     *    若直接要求"恰好 2 簇"会漏报真暂停键（缸体战斗2 两帧就栽在这），
     *    故**先按 x 波段 [1225,1265] 过滤**，再要求恰好 2 簇。
     *
     *  ── 预定的消费姿势（用户 2026-09-23 口径，**待需要时再实现**，暂不接线）──────────
     *  用户原话：「暂停按键，可以作为正在战斗的依据，比如开始战斗后，延迟 3s 开始这个判定，
     *    第一次判定成功后，认为进入战斗了，其后每 1s 判定一次，成功就继续 1s 轮询，
     *    避免被某些技能动画影响，如果连续失败 3 次，就认为已经退出战斗了。」
     *  即作为一条**状态机**消费本探针（本方法只负责单次采样，状态机由调用方持有）：
     *    ① 开战后静默 3s，不采样（等加载/登场走完）
     *    ② 每 1s 采样一次；**第一次 ok** ⇒ 建立"已进入战斗"状态
     *    ③ 已进入后仍每 1s 采样；ok 就继续轮询（技能动画可能短暂遮挡 → 单次失败不算数）
     *    ④ **连续失败 3 次** ⇒ 判定"已退出战斗"
     *  ⚠ 为什么"第一次成功"才算进入：点开战到真正进战斗画面之间有一段过场，
     *    此期间暂停键还没出现，过早采样必然失败。
     */
    sawBattlePause() {
      try {
        const b = this.findPauseBars();
        return { ok: !!b.ok, bars: b.bars.length, x1: b.bars[0] ? b.bars[0].x : null, x2: b.bars[1] ? b.bars[1].x : null };
      } catch (e) {
        return { ok: false, bars: 0, x1: null, x2: null, err: e.message };
      }
    }

    /** 暂停键「双竖条」结构检测（见 sawBattlePause 的标定说明）。
     *  @returns {{ok:boolean, bars:Array<{x:number,w:number,peak:number}>}} */
    findPauseBars() {
      this._fresh();
      const R = PAUSE_BAR_REGION;
      const lw = R[2] - R[0], lh = R[3] - R[1];
      const d = this.ctx.getImageData(R[0], R[1], lw, lh).data;
      const colCnt = new Array(lw).fill(0);
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const i = (y * lw + x) * 4;
          const l = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (l >= PAUSE_BAR_LUMA && mx - mn <= PAUSE_BAR_CHROMA) colCnt[x]++;
        }
      }
      // 连通列簇（列高 >= MIN_COL 才算竖条的一份）
      const bars = [];
      let cur = null;
      for (let x = 0; x < lw; x++) {
        if (colCnt[x] >= PAUSE_BAR_MIN_COL) {
          if (!cur) cur = { a: x, b: x, peak: colCnt[x] };
          else { cur.b = x; cur.peak = Math.max(cur.peak, colCnt[x]); }
        } else if (cur) { bars.push(cur); cur = null; }
      }
      if (cur) bars.push(cur);
      const out = bars.map(c => ({ x: R[0] + c.a, w: c.b - c.a + 1, peak: c.peak }));
      // ⚠ 先按 x 波段过滤，再做「恰好 2 条」判定。
      //   原因（实测）：部分帧在 x≈1200（搜索区左缘）混入 1~2 个假簇
      //   （那是被裁进来的其它 UI 边缘），若直接要求 bars.length===2 会**漏报真暂停键**。
      //   真白条稳定在 x≈1233/1249，故先剔掉 band 外的簇。
      const inBand = b => b.x >= PAUSE_BAR_X_LO && b.x <= PAUSE_BAR_X_HI;
      const cand = out.filter(inBand);
      if (cand.length !== 2) return { ok: false, bars: out };
      const [b1, b2] = cand;
      const thin = b => b.w >= 2 && b.w <= 16;
      const tall = b => b.peak >= PAUSE_BAR_MIN_COL;
      const gap = b2.x - (b1.x + b1.w);
      const ok = thin(b1) && thin(b2) && tall(b1) && tall(b2) && gap >= 6 && gap <= 20;
      return { ok, bars: out, gap };
    }

    /**
     * 标准包：**用暂停键判定"是否仍在战斗中"**（v0.6.27 封装）。
     *
     *  用户口径（2026-09-23）：「把这个暂停识别战斗结束的方案封装成一个标准包」。
     *
     *  为什么需要它：`waitForEnd` 现有的落判判据（红叉/结算图标/横幅）都是
     *  **离散的"已结束"事件**，缺少一个**"还在打"的正向判据**。当所有结束判据都失灵时，
     *  脚本只能空转等超时，无法区分"还在战斗"（该继续连点）和"已离开战斗画面"（该停手）。
     *  暂停键只在战斗中可见 ⇒ 它是这个正向判据的天然来源。
     *
     *  ── 状态机（用户口径，逐条落实）──────────────────────────────────
     *    ① 开战后**静默 startDelayMs(默认 3s)**，不采样（等加载/登场走完，此时暂停键还没出现）
     *    ② 之后每 pollMs(默认 1s) 采样一次；**第一次 ok** ⇒ 置 inBattle=true（"已进入战斗"）
     *    ③ 已进入后继续每 pollMs 采样；**ok 就清零失败计数**（正常战斗）
     *    ④ **连续 failNeed(默认 3) 次失败** ⇒ 置 inBattle=false（"已退出战斗"）并返回该结论
     *  ⚠ 用户实测：「大招不会糊住这个」—— 但仍保守保留 3 次，用于吸收其它意外遮挡。
     *  ⚠ `poll()` 是**非阻塞轮询**（自己不 sleep），由调用方在战斗循环里每拍调一次；
     *     内部的 3s 静默与 1s 节流都用时间戳实现，不含 sleep —— 这样它可以直接嵌进
     *     `waitForEnd` 的 300ms 检测拍，不破坏连点节奏。
     *
     *  ── 用法 ────────────────────────────────────────────────────────
     *  ```js
     *  const guard = ctx.vision.battleWatch({ startDelayMs: 3000, pollMs: 1000, failNeed: 3 });
     *  // 战斗循环里每拍：
     *  const s = guard.poll();
     *  if (s.inBattle && s.exited) { ... }   // 连续失败 3 次 → 已退出战斗
     *  ```
     *  一次性用法：`await ctx.vision.waitBattleExit()`（内部自己轮询，带自己的 sleep）。
     *
     *  @param {object} [opts]
     *  @param {number} [opts.startDelayMs=3000] 开战后静默期
     *  @param {number} [opts.pollMs=1000]       采样间隔
     *  @param {number} [opts.failNeed=3]        连续失败多少次判定"已退出"
     *  @returns {{poll:function, state:function, reset:function}}
     */
    battleWatch(opts = {}) {
      const startDelayMs = opts.startDelayMs != null ? opts.startDelayMs : BATTLE_WATCH_START_MS;
      const pollMs = opts.pollMs != null ? opts.pollMs : BATTLE_WATCH_POLL_MS;
      const failNeed = opts.failNeed != null ? opts.failNeed : BATTLE_WATCH_FAIL_NEED;

      const t0 = Date.now();
      let lastAt = 0;          // 上次采样时刻（节流用）
      let inBattle = false;    // 是否已确认"进入战斗"
      let fails = 0;           // 连续失败计数
      let exited = false;      // 是否已判定"退出战斗"（置位后不再变化）
      let lastOk = null;       // 最近一次采样结果
      let samples = 0;

      const state = () => ({ inBattle, fails, exited, lastOk, samples, elapsedMs: Date.now() - t0 });

      const poll = () => {
        if (exited) return state();
        const now = Date.now();
        // ① 静默期
        if (now - t0 < startDelayMs) return state();
        // ② 节流
        if (now - lastAt < pollMs) return state();
        lastAt = now;
        samples++;
        let ok = false;
        try { ok = !!this.sawBattlePause().ok; } catch (e) { ok = false; }
        lastOk = ok;
        if (ok) {
          inBattle = true;
          fails = 0;                       // ③ 命中即清零
        } else if (inBattle) {
          fails++;                         // ④ 只在"已进入"之后才计数
          if (fails >= failNeed) exited = true;
        }
        // ⚠ 未 inBattle 时的失败**不计数** —— 那是开战过场期，暂停键本就还没出现。
        return state();
      };

      const reset = () => { lastAt = 0; inBattle = false; fails = 0; exited = false; lastOk = null; samples = 0; };

      return { poll, state, reset };
    }

    /**
     * 阻塞版：开战后等到「连续 failNeed 次没看到暂停键」为止（= 战斗已结束）。
     *
     *  适合不需要自己控制循环的调用方。内部自带 sleep，会一直轮询到判定退出，
     *  或到 timeoutMs 上限（返回 timeout，不无限等）。
     *
     *  @returns {Promise<{exited:boolean, timeout:boolean, inBattle:boolean, samples:number, elapsedMs:number}>}
     */
    async waitBattleExit(opts = {}) {
      const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : BATTLE_WATCH_TIMEOUT_MS;
      const guard = this.battleWatch(opts);
      const t0 = Date.now();
      const step = Math.max(120, Math.round((opts.pollMs != null ? opts.pollMs : BATTLE_WATCH_POLL_MS) / 2));
      while (Date.now() - t0 < timeoutMs) {
        Runtime.check();
        const s = guard.poll();
        if (s.exited) return { exited: true, timeout: false, inBattle: s.inBattle, samples: s.samples, elapsedMs: s.elapsedMs };
        await Utils.sleep(step);
      }
      const s = guard.state();
      return { exited: false, timeout: true, inBattle: s.inBattle, samples: s.samples, elapsedMs: s.elapsedMs };
    }

    /** 标准件③：忍术奖励面板「第 1 / 第 2 个礼包是否已领取」（v0.6.27）。
     *
     *  ⚠ 归属说明：本方法属于 **VisionCore**（即 `ctx.vision`），因为要读像素
     *    （`this.ctx.getImageData`）。v0.6.28 修正：上一版误放进 `Navigator`，
     *    导致运行时 `ctx.vision.arenaRewardsAllClaimed is not a function` 而整任务失败。
     *
     *  用户口径（2026-09-23）：「把第 1、2 个已领取一起作为判断条件」——
     *    两个都变红才算这一轮奖励领完；否则说明还有未完成的礼包，需要再打。
     *
     *  三个状态的颜色实测（同区域，tools/red-vs-gold.cjs）：
     *    · 已领取（红）  红像素占比 **12.9% ~ 18.2%**，样本 (159,112,98)/(157,78,66)
     *    · 可领取（金）  红像素 0~1.1%，金像素 20.8~36.4%，样本 (230,151,51)/(213,119,72)
     *    · 空/未完成     红像素 0%（纯背景 std=1）
     *  ⇒ 红 vs 金分离极干净（12.9% 对 0%）。
     *
     *  偏红判据的本质（用户口径「金色和红色明显不同，限定颜色范围就行」）：
     *    **红色里 G 与 B 同量级（都低但接近）；金色里 G 远高于 B。**
     *    故用 `(G-B) < 25` 作为主判别点 —— 它比"绝对色"稳，不受亮度影响：
     *      红 (159,112,98) G-B=14 ✅ · (157,78,66) G-B=12 ✅
     *      金 (230,151,51) G-B=100 ❌ · (213,119,72) G-B=47 ❌
     *
     *  @param {number} [areaIdx] 0=第1个礼包位置 1=第2个礼包位置
     *  @returns {{ok:boolean, redPct:number, area:number[]}} ok=true = 该位置是红色「已领取」
     */
    sawArenaRewardClaimed(areaIdx) {
      const area = ARENA_REWARD_STATUS_AREAS[areaIdx === 1 ? 1 : 0];
      try {
        const w = area[2] - area[0], h = area[3] - area[1];
        const d = this.ctx.getImageData(area[0], area[1], w, h).data;
        let n = 0, red = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          n++;
          if (R > 120 && (R - G) > 40 && (G - B) < 25) red++;
        }
        const redPct = red / n * 100;
        return { ok: redPct >= ARENA_REWARD_RED_MIN_PCT, redPct: +redPct.toFixed(1), area };
      } catch (e) {
        return { ok: false, redPct: 0, area, err: e.message };
      }
    }

    /** 忍术奖励是否**已全部领完**：第 1、2 个位置都是红色「已领取」。
     *  @returns {{done:boolean, first:object, second:object}} */
    arenaRewardsAllClaimed() {
      const first = this.sawArenaRewardClaimed(0);
      const second = this.sawArenaRewardClaimed(1);
      return { done: first.ok && second.ok, first, second };
    }

    /**
     * 动态检测右上角红✕返回键：区域内红像素做 8px 网格连通聚类，取最大簇。
     * 不同二级页的红✕位置不同（组织页 (1146,69)、活动页 (1217,47)…），固定采样区无法通吃，
     * 因此按"颜色特征 + 聚类质心"动态定位，命中后点质心。
     * @returns {ok, count, cluster, cx, cy, bbox} 逻辑坐标
     */
    findRedX(region) {
      this._fresh();   // 0.5.42：动态红✕定位同样要先刷新帧
      const R = region || [1040, 0, 1280, 120];
      const l = R[0], t = R[1], w = R[2] - R[0], h = R[3] - R[1];
      const d = this.ctx.getImageData(l, t, w, h).data;
      const isRed = i => d[i] > 130 && d[i + 1] < 75 && d[i + 2] < 75 && (d[i] - Math.max(d[i + 1], d[i + 2])) > 60;
      const MIN_CLUSTER = 300;      // 实测红✕本体约 800~1000 px，杂散噪点远小于此
      const cells = new Map();      // 8x8 网格桶 -> 像素数
      let total = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!isRed(i)) continue;
          total++;
          const k = (x >> 3) + ',' + (y >> 3);
          cells.set(k, (cells.get(k) || 0) + 1);
        }
      }
      if (!cells.size) return { ok: false, count: total, cluster: 0, cx: 0, cy: 0, bbox: null };
      // 连通聚类（cell 级 8 邻域 BFS），取最大簇
      const seen = new Set();
      let best = null;
      for (const start of cells.keys()) {
        if (seen.has(start)) continue;
        seen.add(start);
        const queue = [start];
        let n = 0, sx = 0, sy = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
        while (queue.length) {
          const [cx, cy] = queue.pop().split(',').map(Number);
          const c = cells.get(cx + ',' + cy);
          n += c;
          sx += (cx * 8 + 4) * c; sy += (cy * 8 + 4) * c;
          if (cx * 8 < minX) minX = cx * 8;
          if (cx * 8 + 8 > maxX) maxX = cx * 8 + 8;
          if (cy * 8 < minY) minY = cy * 8;
          if (cy * 8 + 8 > maxY) maxY = cy * 8 + 8;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const nk = (cx + dx) + ',' + (cy + dy);
            if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); queue.push(nk); }
          }
        }
        if (!best || n > best.n) best = { n, sx, sy, x0: minX, y0: minY, x1: maxX, y1: maxY };
      }
      const ok = !!best && best.n >= MIN_CLUSTER &&
        (() => {
          const w = best.x1 - best.x0, h = best.y1 - best.y0, ar = w / h;
          return w >= 40 && w <= 110 && h >= 30 && h <= 90 && ar >= 1.0 && ar <= 2.2;  // 实测红✕约 72×49、73×51
        })();
      return {
        ok,
        count: total,
        cluster: best ? best.n : 0,
        cx: best ? Math.round(best.sx / best.n) + l : 0,
        cy: best ? Math.round(best.sy / best.n) + t : 0,
        bbox: best && ok ? [best.x0 + l, best.y0 + t, best.x1 + l, best.y1 + t] : null,
      };
    }

    /**
     * 模板匹配：在当前帧的 region 内滑动查找与 tmplCanvas 最相似的位置。
     * 灰度 SAD（绝对差均值，步长 2 采样），score 越小越相似（0=完全一致）。
     * 用于固定色探针无法覆盖的场景——如活动页菜单项位置可变，靠文字模板定位。
     * @param {HTMLCanvasElement} tmplCanvas 模板画布（先用 loadTmplCanvas 生成）
     * @param {Array} region 搜索区 [x1,y1,x2,y2]（逻辑坐标）
     * @param {Object} opts { step: 2, thresh: 25 }
     * @returns {ok, score, x, y, cx, cy} 逻辑坐标，cx/cy 为模板中心（点击点）
     */
    findTemplate(tmplCanvas, region, opts) {
      this._fresh();   // 0.5.42：签到菜单等模板匹配必须先刷新帧
      opts = opts || {};
      const step = opts.step || 2;
      const thresh = opts.thresh != null ? opts.thresh : 25;
      const R = region || [0, 0, BASE_W, BASE_H];
      const rw = R[2] - R[0], rh = R[3] - R[1];
      const tw = tmplCanvas.width, th = tmplCanvas.height;
      if (tw <= 0 || th <= 0 || tw > rw || th > rh) return { ok: false, reason: 'bad-size', score: 999 };
      const td = tmplCanvas.getContext('2d').getImageData(0, 0, tw, th).data;
      const tg = new Uint8Array(tw * th);
      for (let i = 0, p = 0; i < td.length; i += 4, p++) tg[p] = (td[i] * 77 + td[i + 1] * 151 + td[i + 2] * 28) >> 8;
      let fd;
      try { fd = this.ctx.getImageData(R[0], R[1], rw, rh).data; }
      catch (e) { return { ok: false, reason: 'tainted', score: 999 }; }
      const fg = new Uint8Array(rw * rh);
      for (let i = 0, p = 0; i < fd.length; i += 4, p++) fg[p] = (fd[i] * 77 + fd[i + 1] * 151 + fd[i + 2] * 28) >> 8;
      let best = { score: 1e9, x: -1, y: -1 };
      for (let ry = 0; ry + th <= rh; ry += step) {
        for (let rx = 0; rx + tw <= rw; rx += step) {
          let sad = 0, n = 0;
          for (let ty = 0; ty < th; ty += 2) {
            const frow = (ry + ty) * rw + rx, trow = ty * tw;
            for (let tx = 0; tx < tw; tx += 2) { sad += Math.abs(fg[frow + tx] - tg[trow + tx]); n++; }
          }
          const score = sad / n;
          if (score < best.score) best = { score, x: R[0] + rx, y: R[1] + ry };
          if (best.score === 0) break;
        }
        if (best.score === 0) break;
      }
      return {
        ok: best.score <= thresh,
        score: Math.round(best.score * 10) / 10,
        x: best.x, y: best.y,
        cx: best.x + tw / 2, cy: best.y + th / 2,
      };
    }

    /**
     * 扫描区域内「白色文字行」聚类（灰度>grayMin 且低饱和 max-min<satMax）。
     * 用于菜单项位置可变的页签定位——菜单项顺序固定时，按「第 N 簇/最后一簇」点击。
     * 2026-09-12 招募页验证：「普通招募」固定为最后一个白色文字簇（未选中 415 / 选中 425，实录点击 421）。
     * @param {Array} region 扫描区 [x1,y1,x2,y2]（逻辑坐标）
     * @param {Object} opts { minCount: 3, gap: 8, grayMin: 170, satMax: 60 }
     * @returns {ok, clusters:[{y0,y1,cy,cx,pk}]} cy/cx 为簇中心（逻辑坐标），pk 为峰行像素数
     */
    findTextRows(region, opts) {
      this._fresh();   // 0.5.42：招募页签定位必须先刷新帧
      opts = opts || {};
      const minCount = opts.minCount || 3, gap = opts.gap || 8;
      const gMin = opts.grayMin || 170, satMax = opts.satMax || 60;
      const R = region || [0, 0, BASE_W, BASE_H];
      const w = R[2] - R[0], h = R[3] - R[1];
      let d;
      try { d = this.ctx.getImageData(R[0], R[1], w, h).data; }
      catch (e) { return { ok: false, reason: 'tainted', clusters: [] }; }
      const rows = new Uint32Array(h);
      for (let y = 0; y < h; y++) {
        let c = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          const l = (r * 77 + g * 151 + b * 28) >> 8;
          if (l > gMin && (Math.max(r, g, b) - Math.min(r, g, b)) < satMax) c++;
        }
        rows[y] = c;
      }
      const clusters = [];
      let cur = null;
      for (let y = 0; y < h; y++) {
        if (rows[y] >= minCount) { if (!cur) cur = { y0: y, y1: y, pk: 0 }; else cur.y1 = y; if (rows[y] > cur.pk) cur.pk = rows[y]; }
        else if (cur && y - cur.y1 > gap) { clusters.push(cur); cur = null; }
      }
      if (cur) clusters.push(cur);
      clusters.forEach(c => { c.cy = R[1] + Math.round((c.y0 + c.y1) / 2); c.cx = R[0] + Math.round(w / 2); });
      return { ok: clusters.length > 0, clusters };
    }

    /** 低分辨率灰度签名，用于帧差异 */
    signature(region) {
      const r = region || [0, 0, BASE_W, BASE_H];
      this.sigCtx.clearRect(0, 0, SIG_W, SIG_H);
      this.sigCtx.drawImage(this.canvas, r[0], r[1], r[2] - r[0], r[3] - r[1], 0, 0, SIG_W, SIG_H);
      const d = this.sigCtx.getImageData(0, 0, SIG_W, SIG_H).data;
      const out = new Uint8Array(SIG_W * SIG_H);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        out[j] = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
      }
      return out;
    }

    snapshot(region) { this.capture(true); this._prevSig = this.signature(region); return this._prevSig; }

    /** 与上一次 snapshot 的差异比例 0~1 */
    frameDiff(region) {
      if (!this._prevSig) { this.snapshot(region); return 1; }
      this.capture(true);
      const cur = this.signature(region);
      let sum = 0;
      for (let i = 0; i < cur.length; i++) sum += Math.abs(cur[i] - this._prevSig[i]);
      this._prevSig = cur;
      return sum / cur.length / 255;
    }

    /** 整体亮度，用于识别黑屏/加载 */
    brightness() {
      const a = this.avg(0, 0, BASE_W, BASE_H);
      return (a.r + a.g + a.b) / 3;
    }

    // ── 已移除：「奖励黑屏」像素判据（darkRatio / edgeDarkRatio）─────────────────
    // 0.5.52 曾尝试用「边缘变黑 + 中间弹奖励块」来判定「小队突袭已打完、进入获取奖励过场」，
    // 但 2026-09-13 实测 68 帧真实战斗画面后，用户明确否掉了这条路（"感觉都不太靠谱"）：
    //   · 暗场景战斗帧（秘境 s17 边缘极暗 92% / s25 98%、忍术 bt8 83%）比真正的奖励黑屏
    //     （小队突袭尾帧 f39/f40 仅 57%/66%）还黑 —— 单帧阈值无论怎么取都必然误判；
    //   · 真正稳的区分维度是**时间**（黑屏持续数秒且基本静止），不是颜色。
    // 因此改为交给 BattleFlow 的时间维度三件套处理（见 waitForEnd / combatStep）：
    //   ① 识别节流 300ms；② 画面一静止立刻停手；③ 单场连招上限 assistMaxMs。
    // 详见 CHANGELOG 0.5.52「放弃黑屏像素判据」一节。

    toDataURL() { try { return this.canvas.toDataURL('image/png'); } catch (e) { return null; } }

    saveSnapshot(name) {
      const url = this.toDataURL();
      if (!url) { Utils.log('warn', '快照失败：画面被跨域限制'); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = name || `naruto-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      Utils.log('info', `📷 已保存快照 ${a.download}`);
    }
  }

  const Vision = new VisionCore();

  // ============================================================
  //  PROBES — UI 颜色指纹
  //  数据来源: NarutoScript (Elmyran/NarutoScript, GPL-3.0) 的标定值
  //  verified=true 表示来自上游标定；false 为估算，需用面板「🔍探测」校准
  //  area = [left, top, right, bottom]，坐标为 1280x720 逻辑空间
  // ============================================================
  const PROBES = {
    // ——— 主界面元素（已标定）———
    // ── v0.6.27：主界面判定改用**左侧竖排的两个常驻图标**（用户口径 2026-09-23）──
    //  用户原话：「主界面的探针我建议用左边 62 207 和 62 282 的两个图标作为探针，
    //    其他的探针清除掉」。
    //  选它们的原因（本次事故驱动）：原 HOME 规则用 avatar/storeIcon/mailIcon/dailyIcon
    //    且要求 min:2。实测回主界面**过渡期**只有 storeIcon 一个渲染出来（dist=1），
    //    min:2 不满足 → 场景判成 other → goHome 以为"还有二级页要返回"
    //    → 又点右上角，而那里旧红叉的红像素还没退干净、被 backBtnX 聚成"红叉"
    //    → 反复误点在主界面横条上（trace 实证 scene=other 但主界面探针大面积命中）。
    //  左边这两枚是**主界面左边缘竖排菜单的固定成员**（上=好友、下=邮件），
    //    位置贴边、不随主界面平移而变，比四角图标稳定得多 → 过渡期更早可用。
    //  取色实测（用户截图，1280 空间，裁剪 [62,195,70,220] / [62,270,70,295]）：
    //    好友(蓝) 均值 (44,89,116) std41 ；邮件(黄) 均值 (205,170,52) std27
    //  两者色距极大（蓝↔黄），互斥性天然成立 → min:2 双命中，误判率低。
    //  取窄条 (62,±) 只覆盖图标本体，避开左右背景，故 std 较高(41/27) —— 这正是想要的
    //    （图标本体有明暗结构；纯色背景区反而 std 低）。故用 minStd 保证"确实有图案"。
    //  ⚠ 唯一风险＝「二级页会不会也有这两枚图标」。**用户 2026-09-23 明确确认：不会**
    //    （「我给你就是因为我确认只有主界面有」）→ HOME 误判风险已排除，无需再加反向约束。
    friendsIcon: { area: [58, 195, 74, 225],    color: { r: 44,  g: 89,  b: 116 }, tol: 60, minStd: 18, click: [62, 207], label: '主界面好友',  verified: true, note: 'v0.6.27 新增：主界面左侧竖排顶部图标' },
    mailNav:     { area: [58, 270, 74, 300],    color: { r: 205, g: 170, b: 52 },  tol: 60, minStd: 14, click: [62, 282], label: '主界面邮件',  verified: true, note: 'v0.6.27 新增：主界面左侧竖排第二图标' },
    // v0.6.27 清除（用户口径「其他的探针清除掉」）：
    //   avatar / storeIcon / mailIcon / dailyIcon —— 原先参与 HOME 判定的四角图标。
    //   它们已被 friendsIcon + mailNav 取代（原因见上方注释：过渡期常只渲染出 1 个，
    //   旧的 min:2 判不出主界面）。全代码库已无引用，故删除定义，避免"看着还在其实没用"的困惑。
    ninjutsuIcon:{ area: [1199, 423, 1250, 492],   color: { r: 152, g: 137, b: 119 }, tol: 35, click: [1225, 458], label: '忍法帖入口',   verified: true },
    rechargeIcon:{ area: [288, 52, 354, 81],       color: { r: 177, g: 133, b: 62 },  tol: 35, click: [321, 67],   label: '充值入口',     verified: true },
    characterNav:{ area: [26, 620, 106, 709],      color: { r: 87, g: 94, b: 99 },    tol: 35, click: [66, 665],   label: '忍者入口',     verified: true },
    summonNav:   { area: [363, 630, 415, 703],     color: { r: 175, g: 141, b: 78 },  tol: 35, click: [389, 667],  label: '通灵入口',     verified: true },
    guideNav:    { area: [993, 635, 1049, 682],    color: { r: 152, g: 108, b: 65 },  tol: 35, click: [1021, 659], label: '忍界指引',     verified: true },
    backToGame:  { area: [976, 683, 1073, 710],    color: { r: 106, g: 100, b: 34 },  tol: 35, click: [1025, 697], label: '返回游戏',     verified: true },

    // ——— 通用关闭/返回（已标定）———
    closeX:      { area: [1185, 2, 1272, 70],      color: { r: 102, g: 56, b: 34 },   tol: 35, minStd: 10, click: [1229, 36],  label: '关闭(X)',      verified: true },
    // ── 战斗界面右上角「暂停」按钮（v0.6.27）────────────────────────────
    //  ⚠ 失败过的方案：用"区域均值色 + tol"判（battlePause 色块探针）——
    //    小人图标只占区域约 20%，均值被背景拖走，实测同一场战斗距离漂移 47~156，
    //    战斗段/非战斗段分布完全重叠（无判别力）。已删除，改为**结构检测**。
    //  现行判据见 Vision.findPauseBars()：检测两条平行白色竖条（暂停图标本体）。
    closeGray:   { area: [1212, 21, 1263, 70],     color: { r: 49, g: 50, b: 53 },    tol: 35, minStd: 10, click: [1238, 46],  label: '关闭(灰)',     verified: true },
    closeRed:    { area: [1186, 0, 1280, 82],      color: { r: 62, g: 23, b: 8 },     tol: 35, minStd: 10, click: [1233, 41],  label: '关闭(红)',     verified: true },
    returnBtn:   { area: [37, 655, 94, 698],       color: { r: 72, g: 62, b: 22 },    tol: 35, minStd: 10, click: [66, 677],   label: '返回',         verified: true },
    // 二级页右上角红色 ✕ 返回键（组织/忍法帖等通用位）。
    // 2026-09-11 实测：组织页鲜红 ✕ bbox [1110,44,1182,93]，中心 (1146,69)，
    // 核心区 [1130,55,1165,85] 均值 (150,35,12)，宽区 (131,38,15)，连采 5 次零抖动。
    backBtnX:    { area: [1040, 0, 1280, 120],     color: { r: 170, g: 45, b: 14 },   tol: 45, minStd: 0,  click: [1146, 69],  label: '二级页返回键(红✕)', verified: true, dynamic: true, detRegion: [1040, 0, 1280, 120] },

    // ——— 页面标题栏（已标定，用于区分二级页面）———
    titleDaily:  { area: [1, 0, 267, 125],         color: { r: 146, g: 109, b: 43 },  tol: 40, minStd: 8, label: '每日页标题',  verified: true },
    titleStore:  { area: [40, 3, 256, 88],         color: { r: 156, g: 107, b: 28 },  tol: 40, minStd: 8, label: '商店页标题',  verified: true },
    titleRecharge:{area: [81, 44, 244, 143],       color: { r: 114, g: 82, b: 56 },   tol: 40, minStd: 8, label: '充值页标题',  verified: true },

    // ——— 战斗 / 结算（估算，需在实战画面校准）———
    battleStick: { area: [190, 520, 280, 610],     color: { r: 216, g: 212, b: 180 }, tol: 45, label: '战斗摇杆区',  verified: true, note: '2026-09-09 忍术对战实测：沙地色摇杆底座' },
    battleSkill: { area: [1080, 550, 1180, 640],   color: { r: 195, g: 165, b: 65 },  tol: 55, label: '战斗技能区',  verified: true, click: [1130, 592], note: '实测：普攻大拳钮金色' },
    // 0.5.59 重标定（2026-09-13 忍术对战3.json 107 帧离线实测）：
    //   旧区域 [420,230,720,340] 取到的是「负」字右半 + 紫色光柱，横幅帧均值 (234,212,184)，
    //   与目标金色 (241,212,88) 色距 96 ≫ tol 42 → **完全失效**（同时会在战斗技能特效帧上误报金色）。
    //   新区域取「胜」字主体 (170,180)-(400,420)：8 个横幅帧均值 (198~206, 201~204, 79~81)、
    //   金色像素占比 0.50~0.58；9 个战斗帧最高只有 (103,95,81) 占比 0.06 → 完全分离。
    //   注：横幅显示约 10s，其中 2 帧被白/紫闪光遮挡（占比掉到 0.01~0.03）→ 靠多拍窗口补偿，
    //   所以 waitForEnd 里要求「连续 2 拍命中 或 近 12s 内出现过黑屏」才落判。
    victoryBanner:{area: [170, 180, 400, 420],     color: { r: 200, g: 202, b: 81 },  tol: 45, label: '胜负已分横幅', verified: true, note: '0.5.59 重标：取「胜」字主体；旧区域取到紫光柱已失效' },
    // 0.5.59 新增（2026-09-13 用户战败局校准录制 naruto-calib-2026-09-13 实测）：
    //   战败结算画面是紫灰色「失败」大字 + 底部「与其再战(5)」倒计时按钮，金色横幅探针打不到
    //   → 战败局只能靠超时兜底。取「败」字主体 (520,330)-(660,440)：
    //   失败帧均值 (79,83,107) 色距 0；107 帧胜局录制最近战斗帧 d=33 → tol 25 分离
    //   （tol 40 时帧 21-25/81/84-87/95 共 9 个暗色战斗帧误命中，实测收紧）。
    defeatBanner:{area: [520, 330, 660, 440],      color: { r: 79,  g: 83,  b: 107 }, tol: 25, label: '失败结算字', verified: true, note: '0.5.59 新增：战败局「失败」紫灰大字；与胜利横幅互斥，同归 BATTLE_END 计局' },
    settleConfirm:{area: [560, 580, 720, 630],     color: { r: 180, g: 140, b: 50 },  tol: 45, maxStd: 45, click: [640, 605], label: '结算确认',   verified: false, note: '0.5.16 收紧：tol 60→45 + maxStd 45（忍法帖页金色经验条 dist=55/std=56 误命中 → 整页误判 battle_end，goHome 直接放弃回不了主界面）' },

    // ——— 任务专用特征探针（不参与场景判定）———
    // 招财页「免费一次」按钮（金色底 + 红字）vs 招完态「招财」按钮（金色图标 + 深字），同为金色系。
    // 免费态 2026-09-11 实测：中心区 [804,544,864,584] avg(198,153,30)/std56（两次采样一致，对 probe 色距 dist≈9）。
    // 招完态 2026-09-11 实测：同区域 avg(217,167,22)/std45（按钮文字变为图标+「招财」）。
    // 两态色距仅 ≈25 → tol 收到 18；再叠 minStd=52（免费 56 / 招完 45，双条件互为保险）。
    // 注意：招完态样本仅今日一次采样，若出现漏判/误判需用两态画面各多次采样重标定。
    // 注意：2026-09-13 起「招财」任务改为**不识别、直接连点 2 次**（用户口径），
    // 下面两个探针已不被任务引用，仅作标定值备查（要恢复识别判定可直接取回）。
    goldFreeText:{ area: [804, 544, 864, 584],     color: { r: 198, g: 153, b: 30 },  tol: 18, minStd: 52, click: [830, 555],  label: '免费一次(招财)', verified: true },
    // 招财页「已招完」态（免费次数用完后按钮变成「10 招财」）。2026-09-12 实测 avg(217,167,22)/std44。
    // 与免费态色距 41（>tol 20）、std 44（<maxStd 52）→ 两个探针互斥，用来区分
    // 「页面没打开」和「今日免费已用完」，避免后者被当成前者误报。
    goldDone:    { area: [804, 544, 864, 584],     color: { r: 217, g: 167, b: 22 },  tol: 20, maxStd: 52, click: [830, 555],  label: '招财·已招完', verified: true },

    // 小队突袭「金币多倍」弹窗（不参与场景判定，仅任务内识别用）
    // 2026-09-12 两次校准录制差分实测：有弹窗 [400,300,480,340] avg(240,238,213)/std≈2（米白弹窗面板）；
    // 无弹窗（第二次直接进）同区 avg(120,97,42)/std≈43（深棕队伍页），色距 ≈246 → tol 25 + maxStd 12 双条件极稳。
    squadGoldMulti:{ area: [400, 300, 480, 340],   color: { r: 240, g: 238, b: 213 }, tol: 25, maxStd: 12, label: '金币多倍弹窗', verified: true },
    // 0.5.63 新增（2026-09-16 用户录制「小队突袭.json」实测）：
    //   小队突袭结算页是全屏「胜利」金橙大字 + 奖励图标墙（背景水墨黑），与角斗场横幅完全不同，
    //   旧 victoryBanner [170,180,400,420] 打不到 → 小队突袭战斗结束只能靠「画面静止」或超时兜底。
    //   取「胜利」二字笔画密集区 48x48 @ (500,140)：结算帧 (218,137,15)/std32；
    //   战斗帧 (210,204,200) d=260、BOSS 页 (84,83,78) d=251 → 色距分离充足。
    //   同归 BATTLE_END 计局（见 SCENE_RULES），waitForEnd 的「连续 2 拍 / 黑屏序列」落判不变。
    // ⚠ 0.5.65 收紧 tol 55→25 + minStd 24（用户录制「忍术对战5.json」120 帧实测发现的误判）：
    //   忍术对战（角斗场）打完一局后的**房间页**是整屏均匀浅色界面，该区恰好也是金橙色
    //   → 旧 tol 55 下房间页 d=29.9/37.1/52.9 全部误命中，被判成 BATTLE_END。后果：
    //   ① waitForEnd 刚判完一局，房间页又命中一次 → 「这一把到底结束没有」分不清；
    //   ② clearSettlement 把房间页当结算页乱点（可能点掉「选对手/开始对战」）。
    //   实测分离度：小队突袭结算帧 d=0.9/3.6、std=31.7/31.8；忍术对战房间页 d=29.9~52.9、std≤21.9。
    //   → tol 25（小队突袭侧裕度 21，房间页侧裕度 4.9）+ minStd 24（房间页 std 21.9 再挡一道）。
    squadVictory:{ area: [500, 140, 548, 188],     color: { r: 218, g: 137, b: 15 },  tol: 25, minStd: 24, label: '小队突袭胜利大字', verified: true, note: '0.5.65 收紧：tol 55→25 + minStd 24，避免忍术对战房间页（金橙浅色整屏）误判为结算' },
    // 0.5.63 新增（2026-09-16 用户录制「组织祈福2.json」实测）：
    //   「今日次数已用完」提示弹窗，取弹窗左下纯底色区 [400,300,480,340]：
    //   有弹窗 (187,175,149)/std0.8；无弹窗（祈福页供桌暗区）(37,21,16) d=437、主界面 (154,202,150) d=61 → tol 20 稳。
    orgUsedUp:{    area: [400, 300, 480, 340],     color: { r: 187, g: 175, b: 149 }, tol: 20, maxStd: 12, label: '祈福次数用完弹窗', verified: true },
    // 「昨日祈福奖励」弹窗标题条（金色字+米黄底）：有弹窗 (211,205,169)；
    // 无弹窗（组织祈福页暗背景）(24,16,21) d=524、主界面 (133,212,202) d=141 → tol 40。
    // 领取后弹窗不关（按钮变灰），探针仍命中 → 可用于「弹窗还开着就继续点领取」的循环判定。
    orgYesterday:{ area: [600, 110, 860, 170],     color: { r: 211, g: 205, b: 169 }, tol: 40, label: '昨日祈福奖励弹窗', verified: true },
    // 招募结果界面双条件（2026-09-12 用户截图实测）：金色「确定」按钮 (360,555) + 中心暗背景 (400,300)
    // ⚠ 0.5.54 起**已停用**（用户口径：取消「免费招募」里的「识别结果界面」那一步）——
    //   真机录制（免费招募.json s4 帧）确认：结果界面的「确定」就在 (429,571)，
    //   与任务里的第 4 步是同一个按钮，探针属于重复识别。定义先留着备用，任务里不再调用。
    recruitResult:  { area: [340, 535, 380, 575],  color: { r: 229, g: 183, b: 15 },  tol: 40, minStd: 18, click: [400, 555], label: '招募结果·确定按钮', verified: true },
    recruitResultBg:{ area: [370, 270, 430, 330],  color: { r: 18,  g: 9,   b: 9  },  tol: 30, maxStd: 25, label: '招募结果·暗背景', verified: true },
  };

  // ============================================================
  //  SCENE_RULES — 场景判定规则（按顺序匹配，第一个满足的胜出）
  //  any 个探针命中即判定为对应场景
  // ============================================================
  const SCENE = {
    UNKNOWN: 'unknown', LOADING: 'loading', HOME: 'home',
    BATTLE: 'battle', BATTLE_END: 'battle_end', POPUP: 'popup',
    DAILY: 'daily', STORE: 'store', OTHER: 'other',
  };

  const SCENE_LABELS = {
    unknown: '未知', loading: '加载中', home: '主界面', battle: '战斗中',
    battle_end: '结算', popup: '弹窗', daily: '每日页', store: '商店页', other: '其它页',
  };

  const SCENE_RULES = [
    // 0.5.70：settleConfirm 从 BATTLE_END 移除。该探针对战斗地面/技能区误报率极高，
    // 会把正常战斗帧误判为结算 → waitForEnd 提前返回、arena 误点「开始对战」。
    // settleConfirm 仍作为独立命中在 clearSettlement 里使用，不影响实际结算按钮点击。
    { scene: SCENE.BATTLE_END, probes: ['victoryBanner', 'defeatBanner', 'squadVictory'], min: 1 },
    { scene: SCENE.BATTLE,     probes: ['battleStick', 'battleSkill'],     min: 2 },
    // HOME 必须先于 OTHER：主界面右上角的红色「活动」图标与二级页红✕位置几乎重合，
    // 动态红✕检测器在主界面也会命中 → 若 OTHER 先判，主界面会被当成"其它页"，
    // goHome 又去点 (1218,42) 反而把「活动」页重新打开，形成关了又开的死循环。
    // v0.6.27：探针集改为**左侧竖排两枚常驻图标**（friendsIcon + mailNav，用户口径），
    //   原先的 avatar/storeIcon/mailIcon/dailyIcon **不再参与 HOME 判定**。
    //   原因见 PROBES.friendsIcon 注释：过渡期四角图标常只渲染出 1 个，
    //   旧的 min:2 判不出主界面 → 被 backBtnX 抢先判成 other → 反复误点（实跑 trace 实证）。
    //   左侧两枚贴边常驻、过渡期更早可用；且蓝/黄互斥，双命中即确证。
    { scene: SCENE.HOME,       probes: ['friendsIcon', 'mailNav'],          min: 2 },
    // 二级页右上角「返回键」优先于弹窗判定：组织页等同时含红叉，若先判 popup 会去点关闭位而回不去
    { scene: SCENE.OTHER,      probes: ['backBtnX'],                       min: 1 },
    { scene: SCENE.POPUP,      probes: ['closeX', 'closeGray', 'closeRed'], min: 1 },
    { scene: SCENE.DAILY,      probes: ['titleDaily'],                     min: 1 },
    { scene: SCENE.STORE,      probes: ['titleStore'],                     min: 1 },
  ];

  class SceneDetector {
    constructor(vision, config) {
      this.vision = vision;
      this.config = config;
      this.current = SCENE.UNKNOWN;
      this.hits = {};
      this._votes = [];
    }

    /** 返回 {scene, hits, brightness}；hits 内含每个探针的 dist/ok/avg */
    detect(verbose) {
      const out = { scene: SCENE.UNKNOWN, byProbe: null, hits: {}, brightness: -1, error: null };

      if (!this.config.get('vision.enabled')) { out.scene = SCENE.UNKNOWN; return out; }
      if (!this.vision.video && !this.vision.bind()) { out.error = 'no-element'; return out; }
      if (!this.vision.available()) { out.error = 'not-ready'; return out; }

      try {
        this.vision.capture(true);   // 场景判定必须用强制新帧
        out.brightness = this.vision.brightness();

        if (out.brightness < 12) { out.scene = SCENE.LOADING; return out; }

        for (const [key, probe] of Object.entries(PROBES)) {
          if (probe.dynamic) continue;                       // 动态探针走专用检测器
          const m = this.vision.match(probe);
          out.hits[key] = m;
          if (verbose) {
            Utils.log('info', `  ${m.ok ? '✅' : '❌'} ${probe.label} ` +
              `期望(${probe.color.r},${probe.color.g},${probe.color.b}) ` +
              `实际(${m.avg.r},${m.avg.g},${m.avg.b}) d=${m.dist}/${m.tol}` +
              `${probe.minStd ? ` std=${m.std}/${probe.minStd}` : ''}`);
          }
        }

        // 动态探针：红✕返回键检测器（位置随页面变化，按聚类质心点击）
        {
          const p = PROBES.backBtnX;
          const det = this.vision.findRedX(p.detRegion);
          const m = {
            ok: det.ok, dist: det.ok ? 0 : 999,
            avg: { r: p.color.r, g: p.color.g, b: p.color.b },
            std: null, tol: p.tol, stdOk: true,
            clickPoint: det.ok ? [det.cx, det.cy] : null,
            cluster: det.cluster, bbox: det.bbox,
          };
          out.hits.backBtnX = m;
          if (verbose) {
            Utils.log('info', `  ${m.ok ? '✅' : '❌'} ${p.label} 聚类=${det.cluster}px ` +
              (det.ok ? `质心=(${det.cx},${det.cy}) bbox=[${det.bbox}]` : '未检出红✕'));
          }
        }

        for (const rule of SCENE_RULES) {
          const hitProbes = rule.probes.filter(p => out.hits[p] && out.hits[p].ok);
          if (hitProbes.length >= rule.min) { out.scene = rule.scene; out.byProbe = hitProbes[0]; break; }
        }
        if (out.scene === SCENE.UNKNOWN) out.scene = SCENE.OTHER;
      } catch (e) {
        out.error = e.message;
        this.vision.lastError = e.message;
        this.vision.stats.errors++;
      }

      this.hits = out.hits;
      this._vote(out.scene);
      return out;
    }

    /** 连续 2 次一致才更新 current，避免瞬时误判 */
    _vote(scene) {
      this._votes.push(scene);
      if (this._votes.length > 2) this._votes.shift();
      if (this._votes.length === 2 && this._votes[0] === this._votes[1]) this.current = scene;
      else if (this._votes.length === 1) this.current = scene;
    }

    is(scene) { return this.detect(false).scene === scene; }

    async waitFor(target, timeout, poll) {
      const deadline = Date.now() + (timeout || 15000);
      const iv = poll || this.config.num('vision.poll') || 1200;
      while (Date.now() < deadline) {
        Runtime.check();
        if (this.detect(false).scene === target) return true;
        await Utils.sleep(iv);
      }
      return false;
    }
  }

  // ============================================================
  //  COORDS — 坐标定义（1280x720 逻辑空间）
  //  nav 组来自 NarutoScript 标定值，可信度高
  //  其余为估算值，实际使用前用面板「🔍探测」或坐标录制校准
  // ============================================================


  const COORDS = {
    // 主界面导航（已标定）
    nav: {
      avatar:    { x: 93,   y: 49,  src: 'NarutoScript' },
      recharge:  { x: 321,  y: 67,  src: 'NarutoScript' },
      mail:      { x: 58,   y: 280, src: 'NarutoScript' },
      store:     { x: 1224, y: 259, src: 'NarutoScript' },
      daily:     { x: 1231, y: 356, src: 'NarutoScript' },
      ninjutsu:  { x: 1225, y: 458, src: 'NarutoScript' },
      character: { x: 66,   y: 665, src: 'NarutoScript' },
      summon:    { x: 389,  y: 667, src: 'NarutoScript' },
      guide:     { x: 1021, y: 659, src: 'NarutoScript' },
      backToGame:{ x: 1025, y: 697, src: 'NarutoScript' },
    },

    common: {
      back:       { x: 66,   y: 677 },
      close:      { x: 1229, y: 36  },
      closeAlt:   { x: 1238, y: 46  },
      confirm:    { x: 640,  y: 605 },
      confirmMid: { x: 640,  y: 500 },
      confirmTop: { x: 640,  y: 400 },
      cancel:     { x: 740,  y: 450 },
      challenge:  { x: 1100, y: 600 },
      sweep:      { x: 1000, y: 600 },
      startBattle:{ x: 1100, y: 650 },
      skip:       { x: 1200, y: 50  },
      tapAny:     { x: 640,  y: 360 },
    },

    battle: {
      autoFight: { x: 1200, y: 360 },
      speedUp:   { x: 1200, y: 300 },
      skill1:    { x: 1000, y: 560 },
      skill2:    { x: 1110, y: 520 },
      ult:       { x: 1200, y: 470 },
    },

    collect: {
      // 招财（上游 NarutoScript 标定值，2026-09-11 从 UPSTREAM 并入）
      goldEntry:     { x: 762,  y: 44,  src: 'upstream' },
      goldFree:      { x: 830,  y: 555, src: 'calib' },  // 2026-09-12 用户指定免费招财按钮点位
      goldBack:      { x: 1087, y: 118, src: 'upstream' },
      goldCoin:      { x: 150,  y: 300 },
      goldClaim:     { x: 640,  y: 450 },
      // 邮件领取（2026-09-11 面板校准实测，覆盖原估算值 mailAll）
      mailEntry:     { x: 60,   y: 276, src: 'calib' },
      mailAll:       { x: 448,  y: 628, src: 'calib' },
      mailDelete:    { x: 212,  y: 624, src: 'calib' },
      mailConfirm:   { x: 640,  y: 462, src: 'calib' },
      signBtn:       { x: 640,  y: 400 },
      shareBtn:      { x: 640,  y: 350 },
      shareConfirm:  { x: 640,  y: 500 },
      staminaSend:   { x: 640,  y: 400 },
      // 排行榜点赞（2026-09-10T18-32 面板校准实测：先两次横向拖动把主场景拉到最左，再开排行榜点赞）
      // 拖动只需 x 起止，y 固定取画面中间 360（BASE_H=720 中值）；swipe 本身匀速线性
        rankEntry:     { x: 800,  y: 188, src: 'calib' },
      rankLike:      { x: 1202, y: 195, src: 'calib' },
      activeBoxes:   [{ x: 506, y: 559 }, { x: 735, y: 576 }, { x: 1035, y: 553 }, { x: 1185, y: 563 }],  // 2026-09-12 校准：奖励页 10/40/80/100 宝箱
      ninjutsuClaim: { x: 640,  y: 500 },
      recruitFree:   { x: 640,  y: 450 },
      recruitConfirm:{ x: 640,  y: 500 },
    },

    daily: {
      orgBlessEntry:     { x: 900,  y: 300 },
      orgBlessBtn:       { x: 640,  y: 500 },
      abundanceEntry:    { x: 300,  y: 300 },
      squadEntry:        { x: 500,  y: 300 },
      survivalEntry:     { x: 700,  y: 300 },
      equipEntry:        { x: 300,  y: 450 },
      missionEntry:      { x: 500,  y: 450 },
      missionDispatch:   { x: 640,  y: 500 },
      secretEntry:       { x: 700,  y: 450 },
    },

    weekly: {
      practiceEntry: { x: 200,  y: 200 },
      akatsukiEntry: { x: 400,  y: 200 },
      rebelEntry:    { x: 600,  y: 200 },
      fortressEntry: { x: 800,  y: 200 },
      heavenEntry:   { x: 1000, y: 200 },
    },
  };

  // ============================================================
  //  GameOperator — 输入封装
  // ============================================================
  // ============================================================
  //  Marks — 输入可视化：点击画半透明圆圈、滑动画线、按键显示标签
  //  纯展示层，pointer-events:none，绝不拦截真人操作
  // ============================================================
  const Marks = {
    cfg: null,
    mapper: null,   // 逻辑坐标 → 客户端坐标（App 里注入 sdk._map）
    seq: 0,
    layer: null,
    forceOn: null,  // null=跟随配置

    on() {
      if (this.forceOn != null) return this.forceOn;
      return this.cfg ? this.cfg.get('ui.clickMarks') !== false : true;
    },
    dur() { const d = this.cfg ? this.cfg.num('ui.markDuration') : 0; return d > 0 ? d : 500; },
    labelOn() { return this.cfg ? this.cfg.get('ui.markLabel') !== false : true; },

    _layer() {
      // 注意：id 必须避开面板按钮 id，否则 getElementById 会拿到按钮而非图层
      // （v0.4.9 初版曾用 'na-marks'，与面板按钮撞名导致圆圈全部画进按钮里）
      if (this.layer && this.layer.isConnected && this.layer.id === 'na-marks-layer') return this.layer;
      const existing = document.getElementById('na-marks-layer');
      if (existing) { this.layer = existing; return existing; }
      const d = document.createElement('div');
      d.id = 'na-marks-layer';
      d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none';
      (document.body || document.documentElement).appendChild(d);
      this.layer = d;
      return d;
    },

    toClient(x, y) {
      if (this.mapper) { try { const p = this.mapper(x, y); if (p) return p; } catch (e) { /* ignore */ } }
      return { x, y };
    },

    /** 画一个圆圈（x,y 为 1280x720 逻辑坐标） */
    circle(x, y, opt) {
      if (!this.on()) return null;
      const o = opt || {};
      const p = this.toClient(x, y);
      const size = o.size || 46;
      const dur = o.duration == null ? this.dur() : o.duration;
      const rgb = o.color || '233,69,96';
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:' + (p.x - size / 2) + 'px;top:' + (p.y - size / 2) + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
        'background:rgba(' + rgb + ',.32);border:2px solid rgba(' + rgb + ',.95);' +
        'box-shadow:0 0 0 2px rgba(0,0,0,.35);' +
        'transition:opacity .16s linear,transform .16s ease-out;transform:scale(.55);opacity:1';
      // 中心点
      const dot = document.createElement('div');
      dot.style.cssText = 'position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(' + rgb + ',1)';
      el.appendChild(dot);
      // 坐标标签
      if (this.labelOn() && o.label !== false) {
        const t = document.createElement('div');
        t.textContent = o.label || (Math.round(x) + ',' + Math.round(y));
        t.style.cssText = 'position:absolute;left:50%;top:' + (size + 3) + 'px;transform:translateX(-50%);' +
          'font:11px/1.5 "Microsoft YaHei",sans-serif;color:#fff;background:rgba(0,0,0,.6);' +
          'padding:0 6px;border-radius:8px;white-space:nowrap';
        el.appendChild(t);
      }
      this._layer().appendChild(el);
      requestAnimationFrame(() => { el.style.transform = 'scale(1)'; });
      setTimeout(() => { el.style.opacity = '0'; }, Math.max(100, dur - 160));
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, dur + 200);
      this.seq++;
      return el;
    },

    /** 滑动：起点终点各画圈，中间画一条线 */
    line(x1, y1, x2, y2, opt) {
      if (!this.on()) return;
      const a = this.toClient(x1, y1), b = this.toClient(x2, y2);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 4) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:' + a.x + 'px;top:' + a.y + 'px;height:3px;width:' + len + 'px;' +
          'transform-origin:0 50%;transform:rotate(' + Math.atan2(dy, dx) + 'rad);' +
          'background:rgba(58,124,165,.75);transition:opacity .25s linear';
        this._layer().appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; }, Math.max(120, this.dur()));
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, this.dur() + 240);
      }
      this.circle(x1, y1, Object.assign({ color: '58,124,165', label: '起点' }, opt || {}));
      this.circle(x2, y2, Object.assign({ color: '58,124,165', label: '终点' }, opt || {}));
    },

    /** 按键：屏幕下方显示键名徽标 */
    key(k, mods) {
      if (!this.on()) return null;
      const el = document.createElement('div');
      const txt = (mods && mods.length ? mods.join('+') + '+' : '') + k;
      el.textContent = '⌨ ' + txt;
      el.style.cssText = 'position:fixed;left:50%;bottom:15%;transform:translateX(-50%);' +
        'font:bold 14px/1 "Microsoft YaHei",sans-serif;color:#fff;background:rgba(58,124,165,.88);' +
        'padding:8px 16px;border-radius:20px;transition:opacity .2s linear';
      this._layer().appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; }, Math.max(200, this.dur()));
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, this.dur() + 260);
      return el;
    },

    clear() { if (this.layer) this.layer.textContent = ''; },

    /**
     * 标注模式：把一组坐标常驻画在画面上（**不点击**），用于人工核对位置。
     * @param {Array<{x,y,label?,color?,size?}>} list
     * @param {number} holdMs 停留时长（默认 6000ms，0=常驻直到 clear）
     * @returns {number} 画出的标注数量
     */
    annotate(list, holdMs) {
      const hold = holdMs === 0 ? 0 : (holdMs || 6000);
      const self = this;
      const saved = this.forceOn;
      this.forceOn = true;              // 标注模式强制显示，不受开关影响
      const els = [];
      (list || []).forEach((pt, i) => {
        const el = self.circle(pt.x, pt.y, {
          label: pt.label || (Math.round(pt.x) + ',' + Math.round(pt.y)),
          color: pt.color || '233,69,96',
          size: pt.size || 54,
          duration: hold || 999999,
        });
        if (el) {
          el.style.opacity = '1';
          // 序号角标，便于对照清单
          if (hold) el.style.transition = 'none';
          els.push(el);
        }
      });
      this.forceOn = saved;
      if (hold > 0) {
        setTimeout(() => { els.forEach(e => { if (e.parentNode) { e.style.transition = 'opacity .3s'; e.style.opacity = '0'; } }); }, hold);
        setTimeout(() => { els.forEach(e => { if (e.parentNode) e.parentNode.removeChild(e); }); }, hold + 400);
      }
      return els.length;
    },
  };

  // ============================================================
  //  AutoTrace — 自动运行追踪器
  //  开启后：脚本每次真实点击 / 滑动 / 按键都会被记录，连同
  //  「当前场景 + 命中探针 + 点击时画面缩略帧」一起存档。
  //  用途：事后逐帧核对「自动运行到底卡在哪一步、脚本以为自己在哪个场景、
  //        点了哪、为什么没走到预期」。把导出的 HTML 发开发者即可精确定位。
  //  API: __narutoAuto.trace.on()/off()/toggle()/state()/download()/downloadViewer()/clear()
  // ============================================================
  const AutoTrace = {
    on: false,
    steps: [],
    max: 2000,                 // 环形缓冲上限：超出丢最旧（长录制也不爆内存、不丢关键帧）
    startedAt: 0,
    _seq: 0,
    _thW: 320, _thH: 180, _thQ: 0.5,
    _thCanvas: null, _thCtx: null,
    app: null,

    bind(app) { this.app = app; return this; },

    /** v0.5.96：墙钟时间 HH:MM:SS.mmm —— 报告里和面板日志逐条对齐用 */
    wallClock(d) {
      const x = d || new Date();
      const p = (n, w) => String(n).padStart(w || 2, '0');
      return `${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}.${p(x.getMilliseconds(), 3)}`;
    },

    start() {
      if (this.on) return 'already ON';
      this.on = true; this.steps = []; this._seq = 0; this.startedAt = Date.now();
      Utils.log('warn', '🔬 自动运行追踪已开启：每次真实点击/按键都会记录（含场景+探针+帧）');
      Marks.circle(640, 200, { label: '🔬 追踪中（真实点击全记录）', color: '46,204,113', size: 64, duration: 2600 });
      return 'trace ON';
    },
    stop() {
      if (!this.on) return 'already OFF';
      this.on = false;
      Utils.log('info', `🔬 追踪已关闭，共 ${this.steps.length} 步`);
      Marks.circle(640, 200, { label: '追踪已关闭', color: '58,124,165', size: 64, duration: 2000 });
      return 'trace OFF (' + this.steps.length + ' steps)';
    },
    toggle() { return this.on ? this.stop() : this.start(); },
    clear() { this.steps = []; this._seq = 0; this.startedAt = Date.now(); return 'cleared'; },
    state() { return this.on ? ('ON（' + this.steps.length + ' 步）') : 'OFF'; },

    /** 抓当前场景 + 探针命中，供核对「脚本当时以为在哪」 */
    _context() {
      const out = { scene: 'UNKNOWN', probeHits: [], brightness: -1 };
      try {
        const r = this.app.scenes.detect(false);
        out.scene = r.scene;
        out.brightness = r.brightness;
        if (r.hits) {
          for (const [name, h] of Object.entries(r.hits)) {
            if (h && h.ok) out.probeHits.push({ name, dist: Math.round(h.dist) });
          }
        }
      } catch (e) { out.scene = 'ERR:' + ((e && e.message) || e); }
      return out;
    },

    /** 抓当前帧缩略图（JPEG dataURL），失败返回 null */
    _thumb() {
      try {
        if (!this.app.vision || !this.app.vision.capture) return null;
        this.app.vision.capture(false);
        const src = this.app.vision.canvas;
        if (!src) return null;
        if (!this._thCanvas) {
          this._thCanvas = document.createElement('canvas');
          this._thCanvas.width = this._thW; this._thCanvas.height = this._thH;
          this._thCtx = this._thCanvas.getContext('2d');
        }
        this._thCtx.drawImage(src, 0, 0, this._thW, this._thH);
        return this._thCanvas.toDataURL('image/jpeg', this._thQ);
      } catch (e) { return null; }
    },

    /** 由 GameOperator 各操作入口调用（仅在 on 时，无副作用） */
    record(kind, info) {
      if (!this.on || !this.app) return;
      const ctx = this._context();
      const rec = {
        seq: ++this._seq,
        t: Date.now() - this.startedAt,
        // ⚠ v0.5.96：**绝对墙钟时间**（HH:MM:SS.mmm）。相对 t 只能看间隔，
        //   排查时必须拿它和面板日志逐条对齐 —— 用户口径「方便我和日志对比」。
        //   存字符串而非时间戳：报告是给人看的，且不占体积。
        wall: this.wallClock(),
        kind,                                  // 'tap' | 'swipe' | 'hold' | 'release' | 'key'
        label: info.label || '',
        coord: info.coord || null,             // [x,y] 或 [x1,y1,x2,y2]
        key: info.key || null,
        hold: info.hold || 0,
        scene: ctx.scene,
        brightness: ctx.brightness,
        probeHits: ctx.probeHits,
        frame: this._thumb(),
      };
      // ⚠ v0.5.95：把「这一步属于哪个阶段/轮次」挂上（自己设的，不靠调用方传）
      if (this.phase) rec.phase = this.phase;
      this.steps.push(rec);
      if (this.steps.length > this.max) this.steps.shift();
      return rec;
    },

    /**
     * 标记当前**阶段/轮次**（v0.5.95）。
     *
     * 目的：报告里 146 步平铺，看不出「哪几步属于同一场战斗」。
     * 挂上 phase 后就能按阶段折叠，一场战斗的脉络一目了然。
     *
     * @param {string} name  如 '秘境 第2场/导航' '秘境 第2场/识别' '秘境 第2场/结算'
     */
    setPhase(name) {
      if (!this.on) return;
      const prev = this.phase;
      this.phase = name || '';
      // 阶段切换本身也记一步（无帧图，纯文字），这样报告里能看见「什么时候进的哪一段」
      if (this.steps && this.phase !== prev) {
        const ctx = this._context();
        this.steps.push({
          seq: ++this._seq,
          t: Date.now() - this.startedAt,
          wall: this.wallClock(),
          kind: 'phase',
          label: this.phase,
          coord: null, key: null, hold: 0,
          scene: ctx.scene, brightness: ctx.brightness,
          probeHits: [], frame: null,
          phase: this.phase,          // 阶段行也带自己的名字，列表分组才连贯
        });
        if (this.steps.length > this.max) this.steps.shift();
      }
    },

    /**
     * 记录一次**判定**（v0.5.95）—— 这是本轮最重要的一处补强。
     *
     * 痛点：旧报告只有「点了哪」，没有「为什么点」。本次排查真实卡在这里 ——
     *   `clearSettlement` 盲点 `(655,408)` 明明不该点，但报告里只能看到一个孤零零的
     *   coord，看不出它属于哪套逻辑、当时的 score 是多少、阈值多少、命中没命中。
     *   最后只能靠聊天里粘贴的日志反推。
     *
     * 现在：判定直接进步骤流，报告里紧挨着那个点击，一眼可见。
     *
     * @param {string} probe  判定用的探针/规则名，如 'settleBack' 'realmName' 'ticket' 'clearSettlement'
     * @param {object} d      判定细节，常用键：
     *                        score（实测值）/ thresh（阈值）/ verdict（'hit'|'miss'|'skip'）
     *                        + 任意补充字段（如 realm、tries、blind 等）
     */
    decide(probe, d) {
      if (!this.on) return;
      const ctx = this._context();
      this.steps.push({
        seq: ++this._seq,
        t: Date.now() - this.startedAt,
        wall: this.wallClock(),
        kind: 'decide',
        label: probe + (d && d.verdict ? ` → ${d.verdict}` : ''),
        coord: (d && d.at) || null,            // 可选：判定作用的位置
        key: null, hold: 0,
        scene: ctx.scene,
        brightness: ctx.brightness,
        probeHits: [],
        decide: d || {},                       // ⭐ 分数/阈值/结论都在这里
        phase: this.phase || '',
        frame: this._thumb(),                  // 判定时刻的画面：判错时能回看
      });
      if (this.steps.length > this.max) this.steps.shift();
    },

    /**
     * 记录一条**说明**（v0.5.95）：把当时那条日志贴到步骤流上。
     * 用于「为什么走了这条分支」这类没有数值但很关键的信息。
     */
    note(text) {
      if (!this.on || !text) return;
      const ctx = this._context();
      this.steps.push({
        seq: ++this._seq,
        t: Date.now() - this.startedAt,
        wall: this.wallClock(),
        kind: 'note',
        label: String(text),
        coord: null, key: null, hold: 0,
        scene: ctx.scene, brightness: ctx.brightness,
        probeHits: [], phase: this.phase || '',
        frame: null,
      });
      if (this.steps.length > this.max) this.steps.shift();
    },

    dump() { return this.steps.slice(); },

    /** 导出原始 JSON（含每步帧图） */
    download() {
      if (!this.steps.length) { Utils.log('warn', '⚠ 没有追踪数据'); return false; }
      const meta = {
        tool: 'naruto-auto', version: VERSION, exportedAt: new Date().toISOString(),
        steps: this.steps.length, durationMs: this.startedAt ? (Date.now() - this.startedAt) : 0,
      };
      const blob = new Blob([JSON.stringify({ meta, steps: this.steps }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'naruto-trace-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      Utils.log('info', '💾 已导出 ' + this.steps.length + ' 步追踪到 JSON');
      return true;
    },

    /** 导出自包含 HTML 查看器（内嵌追踪数据，双击即可逐帧核对） */
    downloadViewer() {
      if (!this.steps.length) { Utils.log('warn', '⚠ 没有追踪数据'); return false; }
      const html = this._viewerHtml(this.steps, VERSION);
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'naruto-trace-' + new Date().toISOString().replace(/[:.]/g, '-') + '.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      Utils.log('info', '💾 已导出 ' + this.steps.length + ' 步追踪查看器(HTML)');
      return true;
    },

    /** 生成自包含查看器 HTML（data 已转义 <） */
    _viewerHtml(steps, ver) {
      const data = JSON.stringify(steps).replace(/</g, '\\u003c');
      const parts = [];
      parts.push('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">');
      parts.push('<title>火影自动运行追踪 · ' + steps.length + ' 步</title>');
      parts.push('<style>');
      parts.push('*{box-sizing:border-box}body{margin:0;background:#0f1420;color:#e6edf3;font:14px/1.5 -apple-system,"Microsoft YaHei",sans-serif}');
      parts.push('header{padding:12px 16px;background:#16213e;border-bottom:1px solid #2a3a5a;display:flex;align-items:center;gap:12px;flex-wrap:wrap}');
      parts.push('header h1{font-size:16px;margin:0}header small{color:#7f8c8d}#pos{margin-left:auto;color:#7f8c8d}');
      parts.push('#wrap{display:flex;gap:12px;padding:12px;height:calc(100vh - 56px)}');
      parts.push('#left{flex:0 0 480px;display:flex;flex-direction:column;gap:10px}');
      parts.push('#frame{background:#000;border:1px solid #2a3a5a;border-radius:8px;overflow:hidden}');
      parts.push('#frame img{width:100%;display:block}');
      parts.push('#ctrls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}');
      parts.push('button{background:#e94560;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}');
      parts.push('button.sec{background:#2a3a5a}');
      parts.push('input{background:#1a2336;color:#e6edf3;border:1px solid #2a3a5a;border-radius:5px;padding:5px;width:80px}');
      parts.push('#info{background:#16213e;border:1px solid #2a3a5a;border-radius:8px;padding:10px 12px;font-size:13px}');
      parts.push('#info .row{display:flex;gap:8px;margin:3px 0}.row b{flex:0 0 84px;color:#7f8c8d;font-weight:600}');
      parts.push('#hits{margin-top:6px}#hits span{display:inline-block;background:#10331f;color:#2ecc71;border:1px solid #1d5c39;border-radius:10px;padding:1px 8px;font-size:11px;margin:2px}');
      parts.push('#list{flex:1;overflow:auto;background:#11182a;border:1px solid #2a3a5a;border-radius:8px;padding:6px}');
      parts.push('#list .it{padding:5px 8px;border-bottom:1px solid #1c2740;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:center}');
      parts.push('#list .it:hover{background:#1a2742}#list .it.cur{background:#3a2a1a}');
      parts.push('#list .it .k{color:#e94560;flex:0 0 52px}#list .it .t{color:#7f8c8d;flex:0 0 56px}#list .it .lb{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
      // v0.5.96：墙钟时间列（等宽字体，和日志的 [12:23:14] 直接对得上）
      parts.push('#list .it .t2{color:#5a6b85;flex:0 0 50px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums}');
      parts.push('#list .it .t{color:#9aa7b8;flex:0 0 66px;font-variant-numeric:tabular-nums}');
      parts.push('.kind-key{color:#3498db}.kind-swipe{color:#9b59b6}.kind-hold{color:#e67e22}.kind-release{color:#95a5a6}.kind-tap{color:#e6edf3}');
      // v0.5.95：判定/说明/阶段三种新步骤的样式
      parts.push('.kind-decide{color:#f1c40f}.kind-note{color:#7f8c8d}.kind-phase{color:#2ecc71}');
      parts.push('#decide{margin-top:8px;background:#2a2410;border:1px solid #5c4a1d;border-radius:6px;padding:8px 10px;font-size:12px}');
      parts.push('#decide .d{display:flex;gap:8px;margin:2px 0}#decide .d b{flex:0 0 92px;color:#c9a227;font-weight:600}');
      parts.push('#decide .v-hit{color:#2ecc71;font-weight:700}#decide .v-miss{color:#e94560;font-weight:700}#decide .v-skip{color:#95a5a6}');
      parts.push('#decide h4{margin:0 0 6px;font-size:12px;color:#f1c40f}');
      parts.push('#list .it.ph{background:#12261a;border-top:1px solid #1d5c39;font-weight:700;color:#2ecc71}');
      parts.push('#list .it.dec{background:#231d0c}');
      parts.push('#list .it .ph-tag{flex:0 0 auto;color:#2ecc71;font-size:11px}');
      parts.push('</style></head><body>');
      parts.push('<header><h1>🔬 火影自动运行追踪 <small>v' + ver + ' · ' + steps.length + ' 步</small></h1>');
      parts.push('<span id="pos"></span></header>');
      parts.push('<div id="wrap"><div id="left">');
      parts.push('<div id="frame"><img id="img" alt="帧"></div>');
      parts.push('<div id="ctrls"><button id="prev">◀ 上一步</button><button id="next">下一步 ▶</button>');
      parts.push('<button id="play" class="sec">▶ 自动播放</button><span>跳到</span>');
      parts.push('<input id="jump" type="number" min="1" value="1"><button id="go" class="sec">前往</button></div>');
      parts.push('<div id="info"></div></div>');
      parts.push('<div id="list"></div></div>');
      parts.push('<script>');
      parts.push('var STEPS=' + data + ';');
      parts.push('var i=0,timer=null;');
      parts.push('var $=function(id){return document.getElementById(id)};');
      parts.push('function fmt(ms){var s=ms/1000;return (s<60?s.toFixed(1)+"s":Math.floor(s/60)+"m"+((s%60)|0)+"s")}');
      // v0.5.96：墙钟时间显示（截到秒，和面板日志的 [HH:MM:SS] 直接对得上）
      parts.push('function wc(s){return s.wall?("["+s.wall.slice(0,8)+"]"):""}');
      parts.push('function render(){var s=STEPS[i];if(!s)return;');
      parts.push('$("img").src=s.frame||"";$("img").alt=s.frame?"点击时画面":"（无帧图）";');
      parts.push('var c=s.coord?(s.coord.length===4?s.coord.slice(0,2).join(",")+" → "+s.coord.slice(2).join(","):s.coord.join(",")):"—";');
      parts.push('var extra=(s.kind==="key")?("键: "+s.key+(s.hold?(" 按"+s.hold+"ms"):"")):("坐标: "+c);');
      parts.push('var hits=(s.probeHits||[]).map(function(h){return "<span>"+h.name+" d="+h.dist+"</span>"}).join("");');
      // v0.5.95：判定详情面板 —— decide 里的 score/thresh/verdict/补充字段全摊开
      parts.push('var dv=s.decide;var dh="";');
      parts.push('if(dv){var rows="";for(var k in dv){var v=dv[k];');
      parts.push('var cls=(k==="verdict")?("v-"+String(v).replace(/[^a-z]/gi,"")):"";');
      parts.push('rows+="<div class=d><b>"+k+"</b><span class=\\""+cls+"\\">"+(typeof v==="object"?JSON.stringify(v):v)+"</span></div>"}');
      parts.push('dh="<div id=decide><h4>🎯 判定详情</h4>"+rows+"</div>"}');
      parts.push('$("info").innerHTML="<div class=row><b>步骤</b><span>#"+s.seq+" / "+STEPS.length+"</span></div>"+');
      parts.push('(s.phase?"<div class=row><b>阶段</b><span class=kind-phase>"+s.phase+"</span></div>":"")+');
      parts.push('"<div class=row><b>时间</b><span>"+wc(s)+" <span style=color:#7f8c8d>("+fmt(s.t)+")</span></span></div>"+');
      parts.push('"<div class=row><b>类型</b><span class=kind-"+s.kind+">"+s.kind+"</span></div>"+');
      parts.push('"<div class=row><b>说明</b><span>"+(s.label||"—")+"</span></div>"+');
      parts.push('"<div class=row><b>动作</b><span>"+extra+"</span></div>"+');
      parts.push('"<div class=row><b>场景</b><span>"+(s.scene||"—")+" / 亮度 "+(s.brightness>=0?s.brightness.toFixed(1):"-")+"</span></div>"+');
      parts.push('dh+');
      parts.push('"<div class=row><b>命中探针</b></div><div id=hits>"+(hits||"<span style=\\"background:#331;color:#a55\\">无</span>")+"</div>";');
      parts.push('$("pos").textContent="第 "+(i+1)+" / "+STEPS.length+" 步";');
      parts.push('var its=document.querySelectorAll("#list .it");for(var k=0;k<its.length;k++){its[k].className="it"+(k===i?" cur":"")}');
      parts.push('if(its[i])its[i].scrollIntoView({block:"nearest"})}');
      parts.push('function go(n){i=Math.max(0,Math.min(STEPS.length-1,n));render()}');
      parts.push('$("prev").onclick=function(){go(i-1)};$("next").onclick=function(){go(i+1)};');
      parts.push('$("go").onclick=function(){go((parseInt($("jump").value,10)||1)-1)};');
      parts.push('$("play").onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent="▶ 自动播放";return}this.textContent="⏸ 暂停";timer=setInterval(function(){if(i>=STEPS.length-1){clearInterval(timer);timer=null;$("play").textContent="▶ 自动播放";return}go(i+1)},900)};');
      parts.push('var listHtml="";for(var j=0;j<STEPS.length;j++){var s=STEPS[j];var lb=(s.label||s.kind);');
      // v0.5.95：阶段步单独着色；判定步高亮；其余在左侧显示阶段尾标（便于扫读）
      parts.push('var cls="it"+(s.kind==="phase"?" ph":(s.kind==="decide"?" dec":""));');
      parts.push('var tag=s.phase?"<span class=ph-tag>"+s.phase.split("/").pop()+"</span>":"";');
      parts.push('listHtml+="<div class=\\""+cls+"\\" data-i="+j+"><span class=k>"+s.kind+"</span><span class=t>"+wc(s)+"</span><span class=t2>"+fmt(s.t)+"</span><span class=lb>"+(lb||"")+"</span>"+tag+"</div>"}');
      parts.push('$("list").innerHTML=listHtml;');
      parts.push('$("list").onclick=function(e){var d=e.target.closest(".it");if(d)go(parseInt(d.getAttribute("data-i"),10))};');
      parts.push('render();');
      parts.push('<\/script></body></html>');
      return parts.join('');
    },
  };

  // ============================================================
  //  FlowChart — 把任务的执行步骤画成画面上的流程图
  //  每个步骤：{ kind, title, detail, coord, color }
  //  执行时 highlight(stepIdx) 高亮当前步，并在对应坐标画圈
  // ============================================================
  const FlowChart = {
    on: true,
    panel: null,
    steps: [],
    active: -1,
    taskName: '',
    taskKey: '',
    results: [],   // 每步结果：'ok' | 'fail' | 'skip' | null
    hint: '',
    previewing: false,

    on_() { return this.on; },

    _panel() {
      if (this.panel && document.body.contains(this.panel)) return this.panel;
      const d = document.createElement('div');
      d.id = 'na-flow-panel';
      d.style.cssText = [
        'position:fixed', 'right:10px', 'top:8px', 'width:300px', 'z-index:999998',
        'font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
        'background:rgba(20,24,34,.86)', 'color:#e6edf3',
        'border:1px solid rgba(255,255,255,.14)', 'border-radius:10px',
        'padding:8px 9px', 'pointer-events:auto', 'backdrop-filter:blur(3px)',
        // 拉长：尽量占满视口高度，内容超出再滚动（原来是 78vh，会留一大截空白）
        'display:flex', 'flex-direction:column',
        'max-height:none', 'height:calc(100vh - 16px)', 'overflow-y:auto',
        'user-select:none',
        'word-break:keep-all', 'overflow-wrap:anywhere',
      ].join(';');
      // 可拖动标题区，方便避开游戏 UI
      const bar = document.createElement('div');
      bar.id = 'na-flow-drag';
      bar.style.cssText = 'flex:0 0 auto;cursor:move;padding:2px 0 6px;margin:-2px 0 6px;' +
        'border-bottom:1px solid rgba(255,255,255,.1);font-size:11px;opacity:.55;' +
        'display:flex;justify-content:space-between;align-items:center';
      bar.innerHTML = '<span>📋 流程图（可拖动）</span><span id="na-flow-grip" style="cursor:ns-resize;opacity:.8">⤢</span>';
      d.appendChild(bar);
      this._body = document.createElement('div');
      this._body.id = 'na-flow-body';
      this._body.style.cssText = 'flex:1 1 auto;min-height:0';
      d.appendChild(this._body);

      // 拖动移动
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      bar.addEventListener('mousedown', e => {
        if (e.target && e.target.id === 'na-flow-grip') return;
        dragging = true; sx = e.clientX; sy = e.clientY;
        const r = d.getBoundingClientRect();
        // 切换为 left/top 定位后再拖
        d.style.right = 'auto'; d.style.left = r.left + 'px'; d.style.top = r.top + 'px';
        ox = r.left; oy = r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!dragging) return;
        d.style.left = Math.max(0, Math.min(innerWidth - 40, ox + e.clientX - sx)) + 'px';
        d.style.top = Math.max(0, Math.min(innerHeight - 30, oy + e.clientY - sy)) + 'px';
      });
      document.addEventListener('mouseup', () => { dragging = false; });

      // 右下角把手：拖拽改高度（放开 max-height 的另一种调法）
      const grip = bar.querySelector('#na-flow-grip');
      let rz = false, rzY = 0, rzH = 0;
      grip.addEventListener('mousedown', e => {
        rz = true; rzY = e.clientY; rzH = d.getBoundingClientRect().height;
        e.preventDefault(); e.stopPropagation();
      });
      document.addEventListener('mousemove', e => {
        if (!rz) return;
        const nh = Math.max(120, rzH + e.clientY - rzY);
        d.style.height = nh + 'px';
      });
      document.addEventListener('mouseup', () => { rz = false; });

      document.body.appendChild(d);
      this.panel = d;
      return d;
    },

    /** 定义一个任务的流程图（在执行前调用） */
    define(taskName, steps, taskKey) {
      this.taskName = taskName || '';
      this.taskKey = taskKey || '';
      this.steps = (steps || []).map(s => Object.assign({ kind: 'tap', detail: '', color: '88,166,255' }, s));
      this.results = this.steps.map(() => null);
      this.active = -1;
      this.hint = '';
      this.previewing = false;
      this.render();
      return this.steps.length;
    },

    /** 只预览某任务的流程图（不执行、不画圈） */
    preview(taskKey) {
      const def = (typeof TASK_DEFS !== 'undefined') ? TASK_DEFS.find(t => t.key === taskKey) : null;
      if (!def) { this.setHint('未找到任务: ' + taskKey); return 0; }
      if (!def.steps || !def.steps.length) {
        this.taskName = def.name;
        this.taskKey = def.key;
        this.steps = [];
        this.results = [];
        this.active = -1;
        this.previewing = true;
        this.hint = '该任务尚未声明流程步骤（仍是旧式 run 写法）';
        this.render();
        return 0;
      }
      this.define(def.name, def.steps, def.key);
      this.previewing = true;
      this.hint = '预览中 · 跑任务后转实时';
      this.render();
      return this.steps.length;
    },

    setHint(t) { this.hint = t || ''; this.render(); return t; },

    /** 高亮第 i 步，并在坐标处画圈（label 可覆盖） */
    entering(i, label) {
      this.active = i;
      const s = this.steps[i];
      if (s) {
        this.results[i] = 'run';
        if (s.coord && s.coord.length === 2 && Marks.on()) {
          Marks.circle(s.coord[0], s.coord[1], { label: label || s.title, color: s.color, duration: 900 });
        }
      }
      this.render();
    },

    /** 标记某步结果 */
    result(i, ok) {
      if (i >= 0 && i < this.results.length) this.results[i] = ok ? 'ok' : 'fail';
      this.render();
    },

    render() {
      if (!this.on) { if (this.panel) this.panel.style.display = 'none'; return; }
      const d = this._panel();
      d.style.display = 'flex';
      const C = this._body || d;      // 内容容器（面板已拆出可拖动标题栏）
      C.textContent = '';
      if (!this.steps.length) {
        const t = document.createElement('div');
        t.style.cssText = 'opacity:.6;padding:2px 0';
        t.textContent = this.hint || '流程图待命 · 面板「📋 预览」选任务，或直接开始执行';
        C.appendChild(t);
        return;
      }
      const head = document.createElement('div');
      head.style.cssText = 'font-weight:600;color:#7ee787;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center';
      const nm = document.createElement('span');
      nm.textContent = '流程图 · ' + this.taskName;
      const cnt = document.createElement('span');
      cnt.style.cssText = 'opacity:.55;font-weight:400;font-size:11px';
      const done = this.results.filter(r => r === 'ok' || r === 'fail').length;
      cnt.textContent = done + '/' + this.steps.length;
      head.appendChild(nm); head.appendChild(cnt);
      C.appendChild(head);

      if (this.hint) {
        const h = document.createElement('div');
        h.style.cssText = 'font-size:11px;color:#f0b849;margin:-3px 0 6px';
        h.textContent = this.hint;
        C.appendChild(h);
      }

      // 坐标图例：绿色 = 逻辑坐标（1280×720，与 COORDS / 校准 / 预览同一基准）
      if (this.steps.some(s => s.coord && s.coord.length === 2)) {
        const lg = document.createElement('div');
        lg.style.cssText = 'font-size:10px;opacity:.5;margin:-2px 0 5px;font-family:ui-monospace,Consolas,monospace';
        lg.textContent = '右上 = 逻辑坐标 (1280×720)';
        C.appendChild(lg);
      }

      this.steps.forEach((s, i) => {
        const r = this.results[i];
        const isActive = i === this.active;
        const row = document.createElement('div');
        const c = r === 'ok' ? '126,231,135' : r === 'fail' ? '248,81,73' : r === 'run' ? s.color : '110,118,129';
        row.style.cssText = [
          'display:flex', 'gap:6px', 'align-items:flex-start', 'padding:4px 5px', 'margin:2px 0',
          'border-radius:6px', 'border-left:3px solid rgb(' + c + ')',
          'background:' + (isActive ? 'rgba(88,166,255,.16)' : 'rgba(255,255,255,.03)'),
          isActive ? 'outline:1px solid rgba(88,166,255,.4)' : '',
        ].join(';');

        const badge = document.createElement('span');
        badge.style.cssText = 'flex:0 0 15px;text-align:center;opacity:.75;font-size:11px';
        badge.textContent = r === 'ok' ? '✓' : r === 'fail' ? '✗' : r === 'run' ? '▶' : String(i + 1);

        const body = document.createElement('span');
        body.style.cssText = 'flex:1;min-width:0';

        // 标题行：标题（左）+ 坐标（右，等宽字体）
        const line1 = document.createElement('div');
        line1.style.cssText = 'display:flex;align-items:baseline;gap:6px';
        const t = document.createElement('span');
        t.style.cssText = 'flex:1;min-width:0;color:' + (isActive ? '#ffffff' : '#c9d1d9') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        t.textContent = s.title || '';
        t.title = s.title || '';
        line1.appendChild(t);
        if (s.coord && s.coord.length === 2) {
          const cd = document.createElement('span');
          cd.style.cssText = 'flex:0 0 auto;opacity:.72;font-size:11px;font-family:ui-monospace,Consolas,monospace;white-space:nowrap';
          cd.textContent = '(' + s.coord[0] + ',' + s.coord[1] + ')';
          cd.title = '逻辑坐标（1280x720 基准，与 COORDS / 校准 / 预览一致）';
          cd.style.color = '#7ee787';
          line1.appendChild(cd);
        }
        body.appendChild(line1);

        if (s.detail) {
          const dt = document.createElement('div');
          dt.style.cssText = 'opacity:.6;font-size:11px;line-height:1.35';
          dt.textContent = s.detail;
          body.appendChild(dt);
        }
        row.appendChild(badge); row.appendChild(body);
        C.appendChild(row);
      });
    },

    hide() { this.on = false; if (this.panel) this.panel.style.display = 'none'; return 'flow hidden'; },
    show() { this.on = true; this.render(); return 'flow shown'; },
    toggle() { return this.on ? this.hide() : this.show(); },
    clear() { this.steps = []; this.results = []; this.active = -1; this.render(); return 'flow cleared'; },
  };

// ── 拖动落点安全区（v0.6.09）────────────────────────────────────────────
//  用户口径（2026-09-21）：「其余有拖动操作的脚本也是一样的」+「拖动的落点左边不能
//    超过 130，右边不能超过 1150，如果超过的改到这两个值上去」。
//
//  背景（2026-09-21 13:50 实跑 trace）：NAV 前两步 drag 的**落点**分别是 x=12 和 x=117，
//    都贴到屏幕最左侧 —— 而左侧那条竖排是「历练/副本/组织…」等**图标菜单栏**。
//    手指落在图标上抬起，被游戏判成**点击图标**（而非拖动结束）→ 直接点进了错误的
//    二级页面。trace 实证：两步 drag 之后 scene 仍是 home，然后 NAV 第 5 步
//    tap(949,531) 之后 scene 变成 other ——「明显点错了才进去的」（用户原话）。
//
//  ⚠ 必须放在 GameOperator 之前：swipe 在类方法里引用这两个常量，而 const 有 TDZ，
//    定义在类之后会在首次调用时抛 "Cannot access ... before initialization"。
const SECRET_REALM_DRAG_X_MIN = 300;
const SECRET_REALM_DRAG_X_MAX = 1000;

// ══════════════════════════════════════════════════════════════════════
//  标准件：主界面横向拖动（拖到最左 / 最右）
//  用户口径（2026-09-23）：
//    ·「拖动操作的 y 坐标都定位为 360」
//    ·「拖动速度都按之前秘境调整的来统一」→ 取录制实测速度的平均值，**匀速**
//    ·「直接弄成一个标准件，需要用到的直接调用，不每个脚本弄一个版本，
//       每个脚本只给出需求，比如移动到最左，或者移动到最右」
//
//  各任务**只声明需求**：`await dragScene(ctx, 'left' | 'right')`
//  坐标/次数/速度全部由本文件单点维护，任务里不再出现任何拖动数字。
//
//  ⚠⚠ 方向语义（用户 2026-09-21 纠正，勿改）：
//    **「从右往左滑 → 把主界面拖到最右」**（抓取拖动语义：手指左滑，画面跟着左移）
//    反之「从左往右滑 → 拖到最左」。故常量按**最终结果**命名，不按手势方向。
// ══════════════════════════════════════════════════════════════════════

/** 横拖固定 y = 画面垂直中部（BASE_H 720 的中值）——用户口径「y 坐标都定位为 360」。 */
const DRAG_Y = 360;

/** 横拖速度（px/s）：取用户录制实测速度的平均值，统一为匀速。
 *  样本（小队突袭.json / 小队突袭3.json 四次真实拖动）：
 *    1111px/506ms=2196 · 880px/595ms=1479 · 706px/245ms=2882 · 929px/315ms=2949
 *    平均 ≈ 2377 px/s。即一次拖动耗时 = 行程 / 速度，不再各处写死 duration。 */
const DRAG_SPEED_PX_S = 2377;

/** 按匀速把「行程」换算成时长（ms），下限防极短拖动退化成瞬移。 */
function dragDurationFor(dx) {
  return Math.max(120, Math.round(Math.abs(dx) / DRAG_SPEED_PX_S * 1000));
}

/** 拖到最右：手右→左滑。起点取安全区右端、落点安全区左端。
 *  ⚠ 落点钳制只影响**抬起位置**（防点到边缘图标），不影响行程 —— 见 op.swipe。 */
const SCENE_DRAG_TO_RIGHT = { kind: 'drag', x1: SECRET_REALM_DRAG_X_MAX, y1: DRAG_Y, x2: SECRET_REALM_DRAG_X_MIN, y2: DRAG_Y, duration: dragDurationFor(SECRET_REALM_DRAG_X_MAX - SECRET_REALM_DRAG_X_MIN) };
/** 拖到最左：手左→右滑。 */
const SCENE_DRAG_TO_LEFT  = { kind: 'drag', x1: SECRET_REALM_DRAG_X_MIN, y1: DRAG_Y, x2: SECRET_REALM_DRAG_X_MAX, y2: DRAG_Y, duration: dragDurationFor(SECRET_REALM_DRAG_X_MAX - SECRET_REALM_DRAG_X_MIN) };

/** 主界面横向拖动次数：用户录制每次拖 2 次（「一次肯定拖不完」）；
 *  单次行程受安全区限制（700px），故补到 3 次。 */
const SCENE_DRAG_TIMES = 3;

/** 最后一次拖动后的**缓冲**（用户口径：「最后一次平移之后 +1s 延迟」）。
 *  3 次拖动后主界面惯性/回弹尚未停稳，紧接着的下一指令会点到错位图标。 */
const SCENE_DRAG_SETTLE_MS = 1000;

/** 生成「拖到最左/最右」的拖动步序列。
 *
 *  v0.6.27：步数**与 dragScene 同源**（`SCENE_DRAG_TIMES`）——用户口径：「秘境那个拖动也统一，
 *    因为都是在主界面进行的，同一逻辑」。之前这里写死 2 步，与 dragScene 的 3 步不一致，
 *    是「同一动作两套实现」的残留。
 *
 *  ⚠ v0.6.27 缓冲修复（用户口径）：「主界面平移改为 3 次之后没有缓冲直接就是下一个按键，
 *    把主界面平移这个标准块最后一次平移之后 +1s 延迟」。
 *    本函数产出的序列会被 `replaySeq` 按时间轴执行，而 replaySeq 的时间轴**只认 dt/pre**，
 *    不认识 dragScene 里的 sleep —— 所以这里把 1s 缓冲并进**最后一步拖动自身的 dt**:
 *    最后一步 drag 跑完后，累计时刻多出 SCENE_DRAG_SETTLE_MS，下一步（tap）自然被推后。
 *    这样 `dragScene`（自己 sleep）与 `replaySeq`（认 dt）两条路径的缓冲语义一致。
 *
 *  @param dir 'left' | 'right' —— 指最终结果（主界面跑到哪边）
 *  @param dtGap 第二步起的相对时间戳（ms）
 *  @param pre   每步前的等待（ms） */
function sceneDragPair(dir, dtGap, pre) {
  const d = dir === 'left' ? SCENE_DRAG_TO_LEFT : SCENE_DRAG_TO_RIGHT;
  const gap = dtGap == null ? 1800 : dtGap;
  const p = pre == null ? 1500 : pre;
  return Array.from({ length: SCENE_DRAG_TIMES }, (_, i) => {
    const isLast = i === SCENE_DRAG_TIMES - 1;
    return Object.assign({}, d, {
      dt: i === 0 ? 0 : gap,
      pre: p,
      // 最后一步附带缓冲：供 replaySeq 的时间轴把后续 tap 推后 1s
      ...(isLast ? { settleMs: SCENE_DRAG_SETTLE_MS } : {}),
    });
  });
}

/**
 * 把主界面拖到最左 / 最右（**统一动作，固定拖 2 次**）。
 *
 * 用户口径（2026-09-21）：
 *   ·「拖到最左和拖到最右都是要拖两次哟，一次肯定拖不完」
 *   ·「任务集会所的拖动…或者没把拖动这个动作，统一成拖到屏幕最左和拖到屏幕最右」
 *   ·「其他的拖动也都检查一下，应该都是一样的逻辑」
 *
 * 背景：各任务原先各写一套录制坐标（`152→951` / `997→254` / `1089→-22` /
 *   `173→1589` / `423→1357` …共 9 处），既难维护又频繁越界 ——
 *   实测 18:43 集会所两次拖动落点被钳到边缘、位移缩水，面板根本没打开。
 *   统一后只认「最终结果」两个方向，坐标由 SCENE_DRAG_TO_* 单点维护。
 *
 * @param ctx 任务上下文（需有 ctx.op）
 * @param dir 'left' | 'right' —— **指最终结果**（主界面跑到哪边）
 */
async function dragScene(ctx, dir) {
  const d = dir === 'left' ? SCENE_DRAG_TO_LEFT : SCENE_DRAG_TO_RIGHT;
  const what = dir === 'left' ? '最左' : '最右';
  // v0.6.25 关键修复：原先直接调 ctx.op.swipe —— **绕过了 TaskContext.drag()，
  //   因此从不调 _advance，流程图一步都不推进**。
  //   面板看起来就"卡在『打开 XXX』那一步"（用户 2026-09-23 反馈丰饶之间）。
  // ⚠ 拖动在流程图里算**一个**步骤（用户口径把「主场景拖到最右」当作一步，
  //   内部拖 2 次是实现细节）→ 整段只 _advance 一次，且必须在真实 swipe **之前**
  //   （_advance 语义是"即将执行第 i 步"，否则面板会提前亮下一步）。
  ctx._advance(`主场景拖到${what}`);
  for (let i = 0; i < SCENE_DRAG_TIMES; i++) {
    await ctx.op.swipe(d.x1, d.y1, d.x2, d.y2, d.duration);
    if (i < SCENE_DRAG_TIMES - 1) await Utils.sleep(1600);   // 让滑动惯性动画走完再拖下一次
  }
  // v0.6.27：**最后一次拖动后再缓冲 1s**（用户口径：「主界面平移改为 3 次之后没有缓冲
  //   直接就是下一个按键…最后一次平移之后 +1s 延迟」）。
  //   背景：步数由 2 增至 3 后，主界面横向惯性/回弹还没停稳，下一条指令（如秘境导航里的
  //   tap）就落下去了，落点对应的图标已因画面仍在滚动而错位 —— 实测连点到了（79,329）
  //   附近的「福利站/社区入口」，进错页面且回不来。
  //   ⚠ 这 1s 是**独立于**循环内 1600ms 的那次（那次只在两次拖动之间）。
  await Utils.sleep(SCENE_DRAG_SETTLE_MS);
  ctx.stepResult(true);
}

  class GameOperator {
    constructor(sdk, config) {
      this.sdk = sdk;
      this.config = config;
    }

    get jitter() { return this.config.num('input.jitter') || 4; }

    async click(x, y, label) {
      if (!this.sdk.ready) throw new Error('SDK 未就绪');
      const p = this.sdk._map(x, y);
      // 流程图画圈时不再重复画（避免同位置蓝红两圈）。label 由 FlowChart 提供时跳过。
      const drawnByFlow = typeof FlowChart !== 'undefined' && FlowChart.on && FlowChart.active >= 0 && label;
      if (!drawnByFlow) {
        Marks.circle(x, y, label ? { label } : null);
      }
      this.sdk._down(x, y, 0);
      try {
        await Utils.sleep(Utils.random(30, 80));
      } finally {
        // 0.5.42：即使中途被 AbortError 打断也务必补上「抬起」。
        // 否则云端一直停在「按住」状态，之后所有点击都被当成重复按下而静默失效
        // ——历史上「点了没反应」的一大来源。
        this.sdk._up(x, y, 0);
      }
      Utils.log('debug', `click(${x},${y}) → (${p.x},${p.y})`);
      AutoTrace.record('tap', { coord: [x, y], label: label || '' });
      return p;
    }

    async clickNatural(x, y, radius, label) {
      const r = radius == null ? this.jitter : radius;
      return this.click(Math.round(x + Utils.random(-r, r)), Math.round(y + Utils.random(-r, r)), label);
    }

    /** 点击并按配置等待 */
    async tap(x, y, waitRange) {
      await this.clickNatural(x, y, null, this.lastLabel);
      this.lastLabel = null;
      await this.config.wait(waitRange || 'delay.click');
    }

    async tapCoord(coord, waitRange) {
      await this.clickNatural(coord.x, coord.y);
      await this.config.wait(waitRange || 'delay.click');
    }

    async clickMultiple(x, y, count, interval) {
      for (let i = 0; i < (count || 2); i++) {
        await this.clickNatural(x, y);
        if (i < count - 1) await Utils.sleep(interval || 300);
      }
    }

    async swipe(x1, y1, x2, y2, duration) {
      const dur = duration || 500;
      // ── 横向拖动落点安全区钳制（v0.6.09 引入，v0.6.11 收窄到 [300,1000]）────
      //  用户口径（2026-09-21）：「其余有拖动操作的脚本也是一样的」+「拖动的落点
      //    左边不能超过 130，右边不能超过 1150」（首版），随后二次收窄：
      //    「滑动的范围还要继续缩小，左边最左边不能小于 300，右边不大于 1000」。
      //    最终档位见 SECRET_REALM_DRAG_X_MIN / _MAX。
      //
      //  背景：NAV 的 drag 落点 x=12/117 贴到屏幕最左，而左侧竖排是图标菜单栏 ——
      //    手指落在图标上抬起会被判成**点击图标**（而非拖动结束），直接点进错误页面。
      //    trace 实证（13:50）：两步 drag 后 scene 仍是 home，第 5 步 tap 后才变 other。
      //
      //  ⚠ 只对**横向拖动**钳制：竖向拖动（如 (100,150)→(140,600) 上下滑列表）的 x
      //    本来就该保持在 100~140 这种小值，钳到 300 会破坏它。判据用 |Δx| > |Δy|。
      //  放在 GameOperator 层（而非各调用点）⇒ replaySeq / Calibrator / 各任务
      //    的 swipe 全部自动受益，不会再漏掉某条路径。
      let _x2 = x2;
      if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
        _x2 = Math.max(SECRET_REALM_DRAG_X_MIN, Math.min(SECRET_REALM_DRAG_X_MAX, x2));
        if (_x2 !== x2) {
          Utils.log('info', `  ↳ 横向拖动落点 x=${x2} 超出安全区 [${SECRET_REALM_DRAG_X_MIN},${SECRET_REALM_DRAG_X_MAX}] → 夹到 ${_x2}（防点到边缘图标）`);
        }
      }
      // ⚠ v0.6.27：钳制只作用于**抬起点**，行程仍用原始 x2 走完。
      //   旧写法 `x2 = _x2` 把「手指走多远」与「手指在哪抬起」当成一回事，
      //   落点被钳到 300 时行程也被砍掉（1100 → 700px），主界面滑不到尽头
      //   —— 这正是用户反馈的「拖不到最右」。
      //   现在：手势一路 move 到原始 x2（行程完整），最后抬起到钳制后的 _x2
      //   （抬起位置仍避开边缘图标），两个目标各自满足。
      //   ⚠ 仅当钳制确实改变了落点时才走「分开」分支：否则与旧行为逐像素一致，
      //     不影响任何本就落在安全区内的拖动（如拖列表那种竖拖）。
      const clamped = _x2 !== x2;
      const steps = Math.max(5, Math.floor(dur / 30));
      const markDur = this.config.num('ui.markDuration') || 500;
      Marks.line(x1, y1, x2, y2, { duration: Math.max(markDur, Math.min(dur, 1200)) });
      this.sdk._down(x1, y1, 0);
      try {
        for (let i = 1; i <= steps; i++) {
          await Utils.sleep(dur / steps);
          this.sdk._move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
        }
        if (clamped) this.sdk._move(_x2, y2, 0);   // 行程已走完，轻移到安全抬起点
      } finally {
        this.sdk._up(clamped ? _x2 : x2, y2, 0);   // 0.5.42：中断也要抬起，避免云端卡住「按住」态
      }
    }

    async longPress(x, y, duration) {
      this.sdk._down(x, y, 0);
      try { await Utils.sleep(duration || 1000); }
      finally { this.sdk._up(x, y, 0); }   // 0.5.42
    }

    /**
     * 按住不放（战斗普攻专用）：只发 _down，不发 _up，直到 releaseHold() 被调用。
     *
     * 2026-09-13 用户口径 + 忍术对战3.json 实测：真人是**按住普攻**打的
     * （录制里 31 次普攻键平均按住 1721ms、最长 11.07s），而脚本原来每 0.2s
     * 「点一下抬一下」，游戏中会不停打断连击 → 打不稳。
     * 用户实测：按住普攻的同时轮询技能/大招/密卷/通灵也不会跳过结算画面。
     *
     * ⚠ 必须保证 releaseHold() 一定被调用（结算 / 画面静止 / 超时 / stop），
     *   否则云端会一直卡在「按住」状态，之后所有点击都被当成重复按下而静默失效
     *   —— 这正是 0.5.42 那次「点了没反应」的根源，见下方 click() 的 finally 注释。
     */
    pressHold(x, y, label) {
      if (!this.sdk.ready) throw new Error('SDK 未就绪');
      const fresh = !this._hold;                   // 0.5.61：重按（断言已有按住）不再刷日志
      if (this._hold) this.releaseHold(true);      // 换位置前先松开旧的（静默）
      const p = this.sdk._map(x, y);
      Marks.circle(x, y, { label: label || '按住普攻', duration: 1500 });
      this.sdk._down(x, y, 0);
      this._hold = { x, y };
      if (fresh) Utils.log('info', `    👊 普攻按住不放 @(${x},${y})`);
      return p;
    }

    /** 松开 pressHold 按住的点（幂等：未按住时返回 false；quiet=重按场景不刷日志） */
    releaseHold(quiet) {
      if (!this._hold) return false;
      const { x, y } = this._hold;
      this._hold = null;
      try {
        this.sdk._up(x, y, 0);
        if (!quiet) Utils.log('info', `    ✋ 已松开按住 @(${x},${y})`);
      } catch (e) {
        Utils.log('warn', `    松开按住失败：${(e && e.message) || e}`);
      }
      return true;
    }

    /** 当前是否处于「按住不放」状态 */
    get holding() { return !!this._hold; }

    key(k) { Marks.key(k, []); AutoTrace.record('key', { key: k }); return this.sdk.key(k); }

    /**
     * 原生键盘事件发送（v0.5.92 实测确立的唯一有效键盘通道）。
     *
     * 2026-09-21 真机逐项对照实验（战斗练习页，每次只发一个动作）：
     *   ❌ pc.keyboard.sendKeyEvent(ev, 60/61, true)   —— 从没生效
     *   ❌ pc.keyboard.sendMockKey(kc, 1/0, true)      —— 从没生效
     *   ❌ pc.keyboard.sendKeyEvent(ev, 1/2, true)     —— 从没生效
     *   ✅ window.dispatchEvent(new KeyboardEvent(...)) —— 生效，**且支持多键同按**
     *   ✅ 鼠标点摇杆坐标                                —— 生效，但单指针，第二键会挤掉第一键
     *
     * 关键证据：单按 S+D 同按 → 用户确认「同时生效了，变成斜向了」。
     *
     * 为什么 SDK 那几条路不通：`sendKeyEvent` 是我自己直接调 SDK 底层，
     *   绕过了页面 window 监听器里那套按键状态机（维护 kd 按键数组 + R.emit）；
     *   而原生事件会真正走进那套状态机。
     *
     * @param {string} keyName 单字符键名（如 'w'/'j'），或 ' '（空格）
     * @param {'down'|'up'} type
     * @param {boolean} [repeat] 是否为**自动重复**事件（长按补发，见 holdKey）
     * @returns {boolean} 是否派发成功
     */
    keyEvent(keyName, type, repeat) {
      const info = KEY_CODE_MAP[keyName];
      if (!info) {
        Utils.log('warn', `    键 ${keyName} 无键码映射（KEY_CODE_MAP 未收录），跳过`);
        return false;
      }
      try {
        const ev = new KeyboardEvent(type === 'up' ? 'keyup' : 'keydown', {
          key: info.key, code: info.code, keyCode: info.keyCode, which: info.keyCode,
          repeat: !!repeat,
          bubbles: true, cancelable: true, view: window,
        });
        // 必须派发到 window：页面真正的按键状态机监听器挂在这里。
        //   实测 video 元素上没有任何 keyXxx 监听器，派发到它等于丢弃。
        window.dispatchEvent(ev);
        return true;
      } catch (e) {
        Utils.log('warn', `    派发 ${type} ${keyName} 失败：${(e && e.message) || e}`);
        return false;
      }
    }

    /** 抬起所有仍按住的键盘键（幂等；宏结束/异常/停手时兜底，防止云端卡按压态）。 */
    releaseAllKeys() {
      this._clearRepeatTimers();          // 先停自动重复，避免抬起后又被补发 keydown
      const held = this._heldKeys;
      if (!held || !held.size) return 0;
      let n = 0;
      for (const k of [...held]) {
        if (this.keyEvent(k, 'up')) n++;
      }
      held.clear();
      if (n) Utils.log('info', `    ⌨ 已抬起全部按键：${n} 个`);
      return n;
    }

    /**
     * 紧急释放一切按压态（键盘键 + 鼠标按住）。
     *
     * ⚠ v0.6.12 新增：**必须挂到 Runtime.onAbort 上**，这是「脚本停了但游戏还在
     *   自动战斗」这个严重 bug 的根治手段。
     *
     * 故障链（2026-09-21 实测）：
     *   用户按 ⏹ → scheduler.stop() → Runtime.abort()
     *     → Utils.sleep 的 onAbort 监听把 promise reject(new AbortError())
     *     → replayKeyTimeline 的 for 循环被异常打断，**循环后的 releaseAllKeys() 走不到**
     *     → holdKey 注册的 setInterval 补发定时器仍然存活，持续向云端发 keydown
     *     → 云端认为 j/k/i/o 一直按着 → 用户手动进雷霆秘境就「自动战斗」
     *       （用户 2026-09-21 原话：「我进入雷霆秘境，没有点任何脚本，就开始自动战斗了」）
     *
     * 为什么用 onAbort 而不是只加 try/finally：
     *   abort 是**同步广播**的（Runtime.abort 里 forEach 直接调监听器），
     *   能保证在任何 await 点被中断的瞬间就执行释放，不依赖异常传播路径，
     *   也不受「finally 里再 await 会二次抛 AbortError」的影响。
     *   try/finally 仍然保留（正常路径/普通异常），两者互为补充、幂等。
     */
    emergencyRelease() {
      try { this._clearRepeatTimers(); } catch (e) { /* ignore */ }
      try { this.releaseAllKeys(); } catch (e) { /* ignore */ }
      try { this.releaseHold(true); } catch (e) { /* ignore */ }
      Utils.log('warn', '  ⏹ 已紧急释放所有按压态（按键 + 按住），防止云端卡住');
    }

    /**
     * 按住一个键盘键（记录到 _heldKeys，供 releaseAllKeys 兜底）。
     *
     * ⚠ v0.5.94：**长按必须补发 repeat 事件** —— 这是「只放技能、不普攻」的根因。
     *
     * 证据：10 份录制里 k（普攻）共 13 次，其中 **12 次是长按**（中位 1919ms，
     *   最长 6098ms）；毒风 6098 / 水牢 5057+782 / 罡体 2447+453+337+0+5077。
     *   也就是说用户的操作是「按住 k 持续输出」，不是「点一下 k」。
     *
     * 而 `window.dispatchEvent(new KeyboardEvent('keydown'))` 只发**一次** ——
     *   没有物理按键，浏览器不会产生 OS 级自动重复（key repeat）。
     *   游戏引擎靠 keydown 的重复流来连续出拳 → 只出第一拳，看起来像「没攻击」。
     *
     * 修法：按住期间按系统默认重复率（约 30/s，取 33ms 保守些）补发
     *   `repeat=true` 的 keydown，直到 releaseKey/抬起为止。
     *   与真实键盘行为一致（首个 keydown repeat=false，后续 repeat=true）。
     */
    holdKey(k) {
      if (!this._heldKeys) this._heldKeys = new Set();
      if (this._heldKeys.has(k)) return true;      // 已在按住，不重发（避免定时器重复挂）
      if (!this.keyEvent(k, 'down')) return false;
      this._heldKeys.add(k);

      // 长按自动重复（模拟 OS key repeat）。仅对「非摇杆方向键」补发？
      //   —— 不，方向键同样需要：录制里 w/a/s/d 也有 hold（如 leiting d hold=700），
      //      持续走位同样依赖重复流。全部统一补发。
      if (!this._repeatTimers) this._repeatTimers = new Map();
      const period = KEY_REPEAT_MS;
      const timer = setInterval(() => {
        // 已被抬起（重复期间被 release）→ 自停
        if (!this._heldKeys || !this._heldKeys.has(k)) {
          clearInterval(timer);
          if (this._repeatTimers) this._repeatTimers.delete(k);
          return;
        }
        this.keyEvent(k, 'down', true);
      }, period);
      this._repeatTimers.set(k, timer);
      return true;
    }

    /** 松开一个键盘键（同时停掉自动重复定时器） */
    releaseKey(k) {
      if (this._heldKeys && this._heldKeys.has(k)) this._heldKeys.delete(k);
      if (this._repeatTimers) {
        const t = this._repeatTimers.get(k);
        if (t) { clearInterval(t); this._repeatTimers.delete(k); }
      }
      return this.keyEvent(k, 'up');
    }

    /** 停掉全部自动重复定时器（不抬键，供异常路径单独用） */
    _clearRepeatTimers() {
      if (!this._repeatTimers) return;
      for (const t of this._repeatTimers.values()) clearInterval(t);
      this._repeatTimers.clear();
    }
  }

  // ============================================================
  //  Navigator — 弹窗清理 / 回主界面 / 场景导航
  // ============================================================
  class Navigator {
    constructor(op, scenes, config, vision) {
      this.op = op;
      this.scenes = scenes;
      this.config = config;
      this.vision = vision;   // v0.6.07：退出确认弹窗探针需要读像素
      this.stats = { popupsClosed: 0, homeRecoveries: 0 };
    }

    /** 关掉当前弹窗；返回是否点过 */
    async dismissOnce() {
      const r = this.scenes.detect(false);
      if (r.scene !== SCENE.POPUP) return false;

      // 若同时命中二级页返回键，说明这不是真弹窗而是可返回的二级页 → 点返回键，别去点关闭位
      if (r.hits.backBtnX && r.hits.backBtnX.ok) {
        const [bx, by] = (r.hits.backBtnX.clickPoint || PROBES.backBtnX.click);
        Utils.log('info', `检测到二级页返回键，改走返回而非关窗 → (${bx},${by})`);
        await this.op.tap(bx, by, 'delay.short');
        return true;
      }

      // 选距离最小的关闭按钮，精准点击
      const candidates = ['closeX', 'closeGray', 'closeRed']
        .map(k => ({ k, hit: r.hits[k] }))
        .filter(c => c.hit && c.hit.ok)
        .sort((a, b) => a.hit.dist - b.hit.dist);

      if (candidates.length) {
        const best = candidates[0];
        const probe = PROBES[best.k];
        Utils.log('info', `关闭弹窗: ${probe.label} (d=${best.hit.dist})`);
        await this.op.tap(probe.click[0], probe.click[1], 'delay.popup');
        this.stats.popupsClosed++;
        return true;
      }

      // 兜底：通用关闭位
      await this.op.tap(COORDS.common.close.x, COORDS.common.close.y, 'delay.popup');
      this.stats.popupsClosed++;
      return true;
    }

    async dismissPopups(maxRounds) {
      const rounds = maxRounds || this.config.num('nav.popupRounds') || 4;
      let closed = 0;
      for (let i = 0; i < rounds; i++) {
        Runtime.check();
        if (!(await this.dismissOnce())) break;
        closed++;
      }
      return closed;
    }

    /**
     * 强制回主界面。
     *
     * 三条路径：
     *  1) 视觉可用 → 按场景判定走（弹窗/加载/返回按钮），精准点
     *  2) 视觉不可用（拿不到画面 / 画面被跨域污染）→ 盲按返回：ESC + 返回位轮转
     *  3) 手动开 nav.blindBack → 强制走 2)
     *
     * 视觉不可用是最常见的「什么都做不了」根因，这里必须能降级。
     */
    /**
     * 探测「秘境退出确认弹窗」—— 画面正中的金色【确定】按钮。
     *
     * 用户口径（2026-09-21）：「秘境的回桌面有一个点 x 之后的中间的金色的确定
     * 需要点，直接给回桌面的流程，是回卡住的」。
     *
     * ⚠ 不能用 SCENE.POPUP 代替：POPUP 的探针是右上角 closeX/closeGray/closeRed，
     *   而本弹窗按钮在画面正中且为金色，三个探针全打不到 → 会退化成盲按返回。
     *
     * 实测分离度（2026-09-21）：
     *   弹窗上：金色占比 0.94~0.97，色距≈0
     *   准备界面同位置：金色占比 0.001，色距 156
     *
     * ⚠ v0.6.27：金色判据**单独不可靠** —— 实测小队突袭准备界面中央也有金色元素
     *   （金色占比 0.74），导致 goHome 连续 6 轮误判成秘境确认框、反复点 (637,449)，
     *   最终「未能确认回到主界面」。
     *   现改为**金色 AND 遮罩变暗**双满足：
     *     · 金色 = 定位「确定按钮在这里」（用户口径：这是它的基础）
     *     · 遮罩 = 确认「这是模态弹窗」（全局压暗，误判率极低）
     *   两者职责不同、互补，缺一不可。
     *
     * ⚠ 语义澄清（用户 2026-09-23）：本判据**不限于「退出确认」**，而是认
     *   **秘境里所有「中央金色确定」的模态确认框**。实测另一句文案完全不同的弹窗
     *   （tools/realms/罡体战斗-frame1.jpg「继续挑战无法获得饰品…是否继续挑战?」）
     *   也被正确命中 —— 这**是期望行为**：这类框都要求点中央确定才能继续/离开，
     *   而 goHome 的目的就是"清干净回主界面"。故不因文案不同而收窄。
     *   （⚠ 该文件名带「战斗」容易误导 —— 它其实是个弹窗，不是战斗画面。）
     *
     * 判据回归（tools/verify-exitconfirm.cjs，6 例全对，零误判零漏判）：
     *   ✅ 命中：退出确认框 · 罡体"继续挑战"确认框
     *   ✅ 排除：同界面无遮罩 · 毒风准备页 · 小队突袭准备界面(事故帧 r3-41-89.6s)
     */
    detectExitConfirm() {
      try {
        const [x1, y1, x2, y2] = SECRET_REALM_EXIT_CONFIRM_REGION;
        const d = this.vision.ctx.getImageData(x1, y1, x2 - x1, y2 - y1).data;
        const ref = SECRET_REALM_EXIT_CONFIRM_COLOR;
        let r = 0, g = 0, b = 0, n = 0, gold = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          r += R; g += G; b += B; n++;
          if (R > 150 && G > 120 && B < 110) gold++;
        }
        const mean = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        const goldPct = gold / n;
        const dist = Math.sqrt((mean[0] - ref.r) ** 2 + (mean[1] - ref.g) ** 2 + (mean[2] - ref.b) ** 2);
        const goldOk = goldPct >= SECRET_REALM_EXIT_CONFIRM_GOLD_MIN &&
                       dist <= SECRET_REALM_EXIT_CONFIRM_DIST_MAX;
        // ★ 追加：遮罩变暗（多处背景同时被压暗）
        const dim = this.sawDarkMask();
        const ok = goldOk && dim.ok;
        return {
          ok, goldPct: +goldPct.toFixed(3), dist: Math.round(dist), mean,
          goldOk, dimOk: dim.ok, dimDark: dim.dark, dimTotal: dim.total,
        };
      } catch (e) {
        return { ok: false, reason: e.message, goldPct: 0, dist: 999, dimOk: false };
      }
    }

    /**
     * 「遮罩变暗」探测（v0.6.27）—— 模态弹窗把整屏压暗，是它的**全局**特征。
     *
     *  用户观察（2026-09-23）：「秘境退出确认按钮周围都暗下来了，右上角的红叉也变暗了」。
     *  实现：在多块**远离中央对话框**的背景区各取平均亮度，统计有几块「足够暗」。
     *  @returns {{ok:boolean, dark:number, total:number, lumas:number[]}}
     *    ok=true ⇒ 有遮罩（5 块里 ≥4 块亮度 ≤ 阈值）
     */
    sawDarkMask() {
      const lumas = [];
      let dark = 0;
      try {
        for (const a of SECRET_REALM_DIM_AREAS) {
          const w = a[2] - a[0], h = a[3] - a[1];
          // ⚠ v0.6.28：必须走 this.vision.ctx —— Navigator **没有** this.ctx。
          //   上一版误写 this.ctx → 每帧抛异常被 catch 吞掉 → dim.ok 恒为 false
          //   → detectExitConfirm 永远 ok:false → 秘境退出确认框再也点不到（静默失效）。
          const d = this.vision.ctx.getImageData(a[0], a[1], w, h).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { s += (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8; n++; }
          const luma = s / n;
          lumas.push(Math.round(luma));
          if (luma <= SECRET_REALM_DIM_LUMA_MAX) dark++;
        }
      } catch (e) {
        return { ok: false, dark, total: SECRET_REALM_DIM_AREAS.length, lumas, err: e.message };
      }
      return { ok: dark >= SECRET_REALM_DIM_NEED, dark, total: SECRET_REALM_DIM_AREAS.length, lumas };
    }

    /** 点掉秘境退出确认弹窗。返回是否真的点了。 */
    async tapExitConfirm(label) {
      const d = this.detectExitConfirm();
      if (!d.ok) return false;
      const [cx, cy] = SECRET_REALM_EXIT_CONFIRM_CLICK;
      Utils.log('info', `   ⚠ 探测到「秘境退出确认」金色【确定】(金色占比=${d.goldPct} 色距=${d.dist}` +
        ` 遮罩=${d.dimOk ? '是' : '否'}(${d.dimDark}/${d.dimTotal})` +
        `)${label ? ' ← ' + label : ''} → 点击 (${cx},${cy})`);
      try { Marks.circle(cx, cy, { label: '退出确认-确定', color: '241,196,15', duration: 800 }); } catch (e) {}
      await this.op.tap(cx, cy, 'delay.short');
      return true;
    }

    async goHome(timeout) {
      const deadline = Date.now() + (timeout || this.config.num('nav.homeTimeout') || 20000);
      const maxBack = this.config.num('nav.maxBack') || 6;
      const forceBlind = this.config.get('nav.blindBack');
      const useEsc = this.config.get('nav.useEsc');
      const spots = this.config.get('nav.backSpots') || [[1150, 80], [66, 677], [1229, 36], [40, 40], [66, 40], [640, 690]];
      const hasKeyboard = this.op.sdk && this.op.sdk.caps && this.op.sdk.caps.sendKeyboardEvent;

      let lastScene = SCENE.UNKNOWN;
      let blindTurn = 0;

      // ─── 0.5.52：解决用户报的「回主界面来回跳」 ──────────────────────────────
      // 根因：判「不是主界面」时只看一帧。页面切换/加载动画期间的瞬时帧经常被判成"非主界面"，
      //   于是立刻再按一次返回 —— 但上一次返回其实**已经**回到主界面了，这一下又把主界面上的
      //   东西点开（或带回二级页），下一轮再按回来…… 表现就是反复来回跳。
      // 两道延时：
      //   ① homeConfirmGap：判非主界面前先等这么久复检一次，过渡帧直接翻案；
      //   ② homeSettleMs  ：每按完一次返回后等动画走完再进入下一轮，避免叠加按。
      //
      // ⚠ v0.6.04：用户口径（2026-09-21 实跑 13:05:07/13:05:12）：
      //   「这两次点击之间的时间差太久了，2s 足够了」。
      //   实测点击间隔约 5s = confirmGap(2500) + settleMs(1500) + 探测(≈70ms×2)。
      //   现改为 confirmGap=0 + settleMs=2000 → 间隔 ≈2s，正是用户要的。
      //   场景探测实测仅 25~40ms，不是瓶颈，不用动。
      //   注：confirmGap=0 时「二次确认」退化为**立即复检一次**（代码结构不变），
      //   仍能抓住「同一帧内判错」，只是不再等 2.5s。过渡帧保护由 settleMs=2000 承担。
      const settleMs = this.config.num('nav.homeSettleMs') || 2000;
      const confirmGap = this.config.num('nav.homeConfirmGap') ?? 0;
      const detectScene = () => {
        let sc = SCENE.UNKNOWN, rr = null;
        try { rr = this.scenes.detect(false); sc = rr.scene; }
        catch (e) { sc = 'error'; }
        return { sc, rr };
      };

      for (let i = 0; i < maxBack && Date.now() < deadline; i++) {
        Runtime.check();

        let { sc: scene, rr: r } = detectScene();
        const firstScene = scene;
        lastScene = scene;

        if (scene === SCENE.HOME) { this.stats.homeRecoveries++; return true; }

        // ⚠ v0.6.04：秘境退出确认弹窗（画面正中的金色确定）优先处理。
        //   它的按钮不在右上角，SCENE.POPUP 的三个关闭探针全打不到，
        //   不先点掉就会退化成「盲按返回」→ 卡死（用户 2026-09-21 报）。
        if (await this.tapExitConfirm('goHome 第' + (i + 1) + '轮')) {
          await Utils.sleep(settleMs);
          continue;
        }

        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }
        if (scene === SCENE.LOADING) { await Utils.sleep(1500); continue; }
        if (scene === SCENE.BATTLE || scene === SCENE.BATTLE_END) {
          Utils.log('warn', '检测到仍在战斗/结算，交由结算流程处理');
          return false;
        }

        // ② 二次确认：等 confirmGap 再复检一次；这一下能救掉绝大多数"过渡帧误判"
        await Utils.sleep(confirmGap);
        Runtime.check();
        ({ sc: scene, rr: r } = detectScene());
        lastScene = scene;
        if (scene === SCENE.HOME) {
          Utils.log('info', `    ↺ 复检确认已回主界面（首判=${SCENE_LABELS[firstScene] || firstScene}，` +
            `等 ${confirmGap}ms 后校正；避免了多按一次返回）`);
          this.stats.homeRecoveries++; return true;
        }
        if (await this.tapExitConfirm('goHome 复检后')) {
          await Utils.sleep(settleMs);
          continue;
        }
        if (scene === SCENE.POPUP) { await this.dismissOnce(); continue; }
        if (scene === SCENE.LOADING) { await Utils.sleep(settleMs); continue; }
        if (scene === SCENE.BATTLE || scene === SCENE.BATTLE_END) {
          Utils.log('warn', '检测到仍在战斗/结算，交由结算流程处理');
          return false;
        }

        const noVision = scene === 'error' || scene === SCENE.UNKNOWN;
        if (forceBlind || noVision) {
          if (noVision && !forceBlind && i === 0) {
            Utils.log('warn', `⚠ 场景无法识别（${r && r.error || scene}），改用盲按返回。建议先用诊断器确认画面取像素是否正常。`);
          }
          if (useEsc && hasKeyboard) {
            Marks.key('Escape', ['盲按']);
            this.op.sdk.key('Escape');
            await Utils.sleep(1000);
          }
          const s = spots[blindTurn++ % spots.length];
          Marks.circle(s[0], s[1], { label: '盲按返回 #' + blindTurn, color: '241,196,15', duration: 900 });
          await this.op.tap(s[0], s[1], 'delay.short');
          await Utils.sleep(settleMs);   // ② 按后静置
          continue;
        }

        // 视觉正常：优先二级页返回键 backBtnX，其次左下返回键 returnBtn，最后通用返回位
        if (r && r.hits.backBtnX && r.hits.backBtnX.ok) {
          const [bx, by] = (r.hits.backBtnX.clickPoint || PROBES.backBtnX.click);
          Marks.circle(bx, by, { label: '二级页返回键(探针命中)', color: '188,140,255', duration: 900 });
          await this.op.tap(bx, by, 'delay.short');
        } else if (r && r.hits.returnBtn && r.hits.returnBtn.ok) {
          Marks.circle(PROBES.returnBtn.click[0], PROBES.returnBtn.click[1], { label: '返回按钮(探针命中)', color: '188,140,255', duration: 900 });
          await this.op.tap(PROBES.returnBtn.click[0], PROBES.returnBtn.click[1], 'delay.short');
        } else {
          Marks.circle(COORDS.common.back.x, COORDS.common.back.y, { label: '通用返回位', color: '188,140,255', duration: 900 });
          await this.op.tap(COORDS.common.back.x, COORDS.common.back.y, 'delay.short');
        }
        await Utils.sleep(settleMs);   // ② 按后静置：等页面切换动画结束再进入下一轮判定
      }

      let ok = false;
      try { ok = this.scenes.detect(false).scene === SCENE.HOME; } catch (e) { ok = false; }
      if (ok) this.stats.homeRecoveries++;
      else Utils.log('warn', `⚠ 未能确认回到主界面（最后场景=${SCENE_LABELS[lastScene] || lastScene}）。` +
        `若画面取像素失败，请把 nav.blindBack 打开；若取像素正常但仍判不出场景，需要重新标定探针。`);
      if (typeof FlowChart !== 'undefined' && FlowChart.taskName) {
        Marks.circle(640, 340, { label: ok ? '✓ 已回主界面' : '✗ 回主界面失败（最后场景=' + (SCENE_LABELS[lastScene] || lastScene) + '）', color: ok ? '126,231,135' : '248,81,73', size: 46, duration: 1800 });
      }
      return ok;
    }

    async ensureHome() {
      if (!this.config.get('nav.requireHome')) return true;
      if (this.scenes.detect(false).scene === SCENE.HOME) return true;
      return this.goHome();
    }
  }

  // ============================================================
  //  BattleFlow — 战斗进入 / 等待结束 / 结算清理
  // ============================================================
  class BattleFlow {
    constructor(op, scenes, nav, vision, config) {
      this.op = op;
      this.scenes = scenes;
      this.nav = nav;
      this.vision = vision;
      this.config = config;
      this._comboIdx = 0;
    }

    /** 战斗点击位（2026-09-13 桌面校准「键盘按键.json」实测）
     *  该 JSON 里录的 9 个点击位置，按顺序依次代表按键 a d 空格 j k i o e r ——
     *  也就是「用点按钮代替发键盘」。现在战斗辅助走这里点的位置，不再依赖键盘通道
     *  （键盘在部分云游戏实例下不可靠：通道能"发送成功"但游戏无响应）。 */
    static get PLACES() {
      return {
        a:     [126, 550],    // 左移（原 a）
        d:     [297, 550],    // 右移（原 d）
        space: [855, 634],    // 替身（原 空格）
        j:     [998, 633],    // 技能1（原 j）
        k:     [1137, 589],   // 普攻（原 k）
        i:     [1023, 496],   // 技能2（原 i）
        o:     [1149, 430],   // 大招（原 o）
        e:     [1153, 279],   // 密卷（原 e）
        r:     [1151, 175],   // 通灵（原 r）
      };
    }

    /** 战斗辅助节奏（2026-09-13 改点击版，用户指定）：
     *   · 平时一直按住普攻（k 位置）
     *   · 每 5s 轮询一次：大招、密卷、通灵 —— 挨个点（不判冷却，盲点）
     *   · 替身（space）单独 0.4s 快拍「秒替」
     *   · 技能1(j)/技能2(i) 0.5s 高频补点（模拟持续按住；鼠标通道单指针无法多点同按）
     *   · 进场 15s 起交替点 a / d 调整左右朝向，之后每 15s 一次
     *  坐标见 PLACES（来自校准 JSON：a d 空格 j k i o e r 依次对应的 9 个点） */
    static get ASSIST() {
      return {
        kGap: 200,          // 普攻节拍间隔（按住模式下仅作节流）
        burst: 5000,        // 大招/密卷/通灵轮询周期
        burstKeys: ['o', 'e', 'r'],
        burstGap: 120,      // 轮询里每个位置之间的间隔
        sub: 400,           // 替身（space）秒替快拍间隔（0.4s）
        jiFast: 500,        // 技能1(j)/技能2(i) 高频补点间隔（0.5s，2026-09-13 用户指定）
        move: 15000,        // 左右朝向调整周期
        tapR: 3,            // 点击抖动半径（按钮较大，抖 3px 足够防"同点连击被吞"）
      };
    }

    /** 一次连招节拍（battle.keyAssist 开启时），返回本拍后的等待 ms；关闭返回 0
     *
     * 2026-09-13 改（用户口径 + 忍术对战3.json 实测）：
     *  · 普攻位 k **改成一直按住不放**（battle.holdAttack，默认开）：真人是按住普攻打的
     *    （录制 31 次 k 键平均按住 1721ms、最长 11.07s），点一下抬一下会不断打断连击。
     *  · 按住普攻期间：大招/密卷/通灵 5s 轮询、替身 0.4s 秒替、技能1/2 0.5s 高频补点
     *    （用户实测：不松普攻也不会跳过结算）。
     *  · 其余逻辑（5s 轮询、15s 左右朝向、两道安全闸）与原来完全一致。
     */
    async combatStep() {
      if (!this.config.get('battle.keyAssist')) return 0;
      const A = BattleFlow.ASSIST;
      const P = BattleFlow.PLACES;
      const holdAtk = this.config.get('battle.holdAttack') !== false;
      const now = Date.now();
      if (!this._combatT0) { this._combatT0 = now; this._burstAt = now; this._moveAt = now; this._subAt = now; this._jAt = now; this._iAt = now; }

      // ── 安全闸 ①：本场连招总时长上限（battle.assistMaxMs，默认 150s）──────────
      // 战斗再久也不该无限连点。超过上限就停手，避免「战斗其实早已结束、辅助还在盲点」时
      // 把所在界面的按钮（如小队突袭房间的「匹配」）反复点下去。
      // 0.5.78：waitForEnd 可按场传 opts.assistMaxMs（角斗场一局实测 149s，默认 150s 贴脸）
      const maxMs = this._assistMaxMs || this.config.num('battle.assistMaxMs') || 150000;
      if (now - this._combatT0 > maxMs) {
        if (!this._maxWarned) {
          this._maxWarned = true;
          Utils.log('warn', `    ⚠ 连招已达单场上限 ${Math.round(maxMs / 1000)}s，停止点击辅助`);
        }
        this.op.releaseHold();
        return 0;
      }

      // ── 安全闸 ②（v0.6.18 已删除）────────────────────────────────────────
      // 原「画面连续静止 → 停手」已移除。用户 2026-09-21 口径：
      //   「静止确认完全不需要，有末尾的战斗结束判断，中间直接全部连点器就可以了」。
      //   战斗中短暂静止（被击倒 / 双方对峙 / 登场画面）本就是常态，一旦停手就会出现
      //   用户反馈过的「打一会儿不按键了」。现在只靠**结算图标 / 金色横幅 / 黑屏过场**
      //   这类离散 UI 事件收手，不再用「画面动能」这种连续量。

      // ── 安全闸 ③（0.5.79）：黑屏过场期间绝不点 ──────────────────────────────
      //   本次 trace 实测：一局打完是「胜负已分 → 战斗结果 → 黑屏 → 奖励/任务面板」，
      //   脚本在黑屏那两拍照旧点了 (1020,494)/(852,637) —— 面板就是这么被点开的。
      if (this._lastScene === SCENE.LOADING) { this.op.releaseHold(); return 0; }

      // 每拍收尾：重建普攻按住态（0.5.61 关键修复，见 _reassertHold 注释）
      const finish = async (gap) => { this._reassertHold(holdAtk, P); return gap; };

      // 快拍区（独立于 5s 轮询组）：
      //   · 替身（space）0.4s「秒替」
      //   · 技能1(j)/技能2(i) 0.5s 高频补点 —— 用户指定模拟「持续按住」；
      //     鼠标通道单指针无法多点同按（0.5.59 已确认），补点是当前通道下的近似
      // ── 快拍区：替身（space）0.4s「秒替」────────────────────────────────
      //   ⚠ v0.5.87：新增 battle.useSubstitute 开关（默认 true = 忍术对战原行为不变）。
      //     秘境连点阶段会传 false —— 用户口径：「直接用忍术对战的连点器，去掉替身就行了」。
      //     依据：秘境的 8 份战斗录制里 space 只出现在罡体2 一份（steps 35/36/37），
      //     其余 7 份都没有；用户确认「我的连点器应该没让你包含替身那个按键」。
      //     ⚠ 通灵(r) 用户说「可去可不去，不影响」→ 保留（仍在 5s 轮询的 burstKeys 里）。
      if (this.config.get('battle.useSubstitute') !== false
          && now - (this._subAt || 0) >= A.sub) {
        this._subAt = now;
        try { await this.op.clickNatural(P.space[0], P.space[1], A.tapR, null); } catch (e) {}
      }
      if (now - (this._jAt || 0) >= A.jiFast) {
        this._jAt = now;
        try { await this.op.clickNatural(P.j[0], P.j[1], A.tapR, null); } catch (e) {}
      }
      if (now - (this._iAt || 0) >= A.jiFast) {
        this._iAt = now;
        try { await this.op.clickNatural(P.i[0], P.i[1], A.tapR, null); } catch (e) {}
      }

      // 5s 轮询：大招/密卷/通灵 —— 依次点对应按钮（有就点，盲点）
      if (now - (this._burstAt || 0) >= A.burst) {
        this._burstAt = now;
        for (const name of A.burstKeys) {
          if (name === 'k' && holdAtk) continue;
          const p = P[name];
          if (!p) continue;
          try { await this.op.clickNatural(p[0], p[1], A.tapR, null); } catch (e) { /* 单击失败不影响主流程 */ }
          await Utils.sleep(A.burstGap);
        }
        return finish(150);
      }

      // 15s 交替左右朝向（先 a 后 d）
      if (now - (this._moveAt || 0) >= A.move) {
        this._moveAt = now;
        this._moveDir = (this._moveDir === 'a') ? 'd' : 'a';
        const p = P[this._moveDir];
        try { await this.op.clickNatural(p[0], p[1], A.tapR, null); } catch (e) {}
        return finish(250);
      }

      // 平时：按住态由 finish 重建；关掉「按住」时才走原来的连点
      if (!holdAtk) {
        try { await this.op.clickNatural(P.k[0], P.k[1], A.tapR, null); } catch (e) {}
      }
      return finish(A.kGap);
    }

    /**
     * 每拍末尾重建普攻按住态（0.5.61 关键修复）。
     *
     * 0.5.61 真机接管实测（对照帧差分）：按住普攻后 0.4s 内只要发生任何一次
     * 其他位置的点击（替身秒替/j/i 快拍、大招轮询、左右朝向），云端单指针模型
     * 会把按压点「挤走」—— 普攻按住立即失效，表现为用户报告的
     * 「按住普攻没起作用」（纯按住不动则完全有效，6s 帧差 25~41 vs 空闲 1）。
     * 修复：每拍收尾重新 pressHold（内部 = 静默松开旧点 + 重新按下），
     * 云端表现为「普攻补点一次 + 恢复按住」，连击不中断（实测帧差恢复 19~22）。
     */
    _reassertHold(holdAtk, P) {
      if (!holdAtk) return;
      try { this.op.pressHold(P.k[0], P.k[1]); } catch (e) { /* 按住失败不阻断轮询 */ }
    }

    /** 持续连招 ms 毫秒（用于最短等待期边打边等） */
    async combatFor(ms) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        Runtime.check();
        const g = await this.combatStep();
        await Utils.sleep(g || 800);
      }
    }

    /** 进战斗后开自动 / 倍速（尽力而为，失败不影响主流程） */
    async tryEnableAuto() {
      if (this.config.get('battle.autoBattle')) {
        try { await this.op.clickNatural(COORDS.battle.autoFight.x, COORDS.battle.autoFight.y, 3); }
        catch (e) { /* ignore */ }
        await Utils.sleep(1000);
      }
      if (this.config.get('battle.speedUp')) {
        try { await this.op.clickNatural(COORDS.battle.speedUp.x, COORDS.battle.speedUp.y, 3); }
        catch (e) { /* ignore */ }
        await Utils.sleep(1000);
      }
    }

    /**
     * 等待战斗结束
     * 三级策略：最短等待 → 结算画面指纹 → 帧差异静止 → 超时
     */
    async waitForEnd(opts = {}) {
      const minWait = (opts.minWaitMs != null ? opts.minWaitMs : this.config.num('battle.minWait')) || 15000;
      const maxWait = (opts.maxWaitMs != null ? opts.maxWaitMs : this.config.num('battle.maxWait')) || 180000;
      const poll = this.config.num('vision.poll') || 1200;
      const stableNeed = this.config.num('vision.stableFrames') || 3;
      const threshold = this.config.get('vision.diffThreshold') || 0.012;

      // ── 0.5.78 新增：按场可调的结算识别参数（不传 = 老行为，其它任务完全不受影响）──
      // 背景（2026-09-19 用户 trace「忍术对战一场」1020 帧实证）：
      //   ① 「胜负已分」横幅在小局之间只显示 0.3~1s（实测 #335/336、#568/569 各只采到 2 拍）
      //      → 老条件「连续 3 拍」必然漏判，漏判后脚本继续在 黑屏/战绩/评测/入口页 上盲点。
      //   ② 老「近 12s 出现过黑屏即确认」太松：开场的加载黑屏 + 探针误报就能凑成假结束。
      //   ③ 静止画面（双方登场/加载）会被判成「一局打完」→ 之后 10s 空窗，真正开打时不出手。
      const vsConfirm = opts.vsConfirm != null ? opts.vsConfirm : 3;
      const blackWindowMs = opts.blackWindowMs != null ? opts.blackWindowMs : 12000;
      const banDefeat = !!opts.noDefeat;               // 不认「失败」探针（角斗场：该探针在登场/加载画面必误报）
      const bannerRecencyMs = opts.bannerRecencyMs != null ? opts.bannerRecencyMs : 30000;
      const graceMs = opts.bannerGraceMs || 0;         // 命中横幅后的「观察窗」：判断自动续局 or 真的打完
      this._assistMaxMs = opts.assistMaxMs != null ? opts.assistMaxMs : null;
      // v0.6.22：点「开战」后的**开场静默期**（忍术对战 10s）。
      //   用户 2026-09-22 口径：「点开战之后等 10s 才开始战斗模块」。
      //   依据：用户录制「末尾快速点击快速过了结算画面.json」实测 —— 点开战（seq1, t=0.00s）
      //     到第一个按键（seq2, t=22.68s）**空档 22.68s**，中间走完
      //     开战 → 加载过场 → 双方登场 → 战斗画面（对比两帧全屏均值：
      //     准备界面 [110,84,54] 暖色 → 首键时刻 [84,87,86] 灰暗中性=已在战斗画面）。
      //   取 10s 而非 22.68s：22.68s 是用户**眼睛看到战斗画面才动手**的反应时间，
      //     每局加载时长会抖，写死会「加载慢→键打在过场上 / 加载快→开场几秒不出手」。
      //     10s 是保守预热：把最伤的开场过场盖住，剩下的交给 SCENE.LOADING 闸。
      //   ⚠ 这段是**静默**的（不发任何键），且**不计入本场时长** —— _fightStart 与
      //     start 都在它之后才起算，否则 10s 会白吃掉 minWait/maxWait 的预算。
      const startDelayMs = opts.startDelayMs != null ? opts.startDelayMs : 0;

      // ── v0.6.27：可选「暂停键守卫」（opts.pauseGuard）──────────────────────────
      //  用户口径（2026-09-23）：「暂停按键可以作为正在战斗的依据…」→ 已封装成
      //    `vision.battleWatch()`（延迟 3s / 每 1s / 连续失败 3 次判退出）。
      //  这里把它接成 waitForEnd 的**正向判据**：命中过暂停键即确认"确实在战斗"，
      //  之后再连续 3 次看不到暂停键 ⇒ 已离开战斗画面 ⇒ 落判 settlement。
      //
      //  ⚠ **opt-in**（默认关闭）：不传 opts.pauseGuard 时行为与改动前**逐位一致**，
      //    不影响任何既有任务。原因：该判据只在"战斗中会出现暂停键"的玩法成立
      //    （小队突袭/秘境/角斗场已实测），而别的玩法界面未必有暂停键 —— 贸然默认开启
      //    会让那些玩法每场都误判成"战斗结束"。
      //  ⚠ 与 redXEnd 的分工：redXEnd = "已回到准备界面"（事件型，落判）；
      //    pauseGuard = "仍在战斗"（状态型，先确认进入、再确认退出）。两者可同时开。
      const pauseGuard = opts.pauseGuard ? this.vision.battleWatch(opts.pauseGuardOpts) : null;
      if (pauseGuard) Utils.log('info', '    ⏸ 暂停键守卫已开启（延迟3s / 每1s / 连续失败3次判退出）');

      Utils.log('info', `    ⏳ 等待战斗结束（最短 ${Math.round(minWait / 1000)}s）...`);
      await this.tryEnableAuto();
      // 0.5.51：每场战斗重置连招计时/静止计数（否则 assistMaxMs 跨场累计，第二轮一进场就停手）
      this._combatT0 = 0; this._burstAt = 0; this._moveAt = 0;
      this._maxWarned = false;
      // v0.5.94：外部（秘境用「左下角返回」模板）一旦确认结算，置此标志 → waitForEnd 立即收手。
      //   为什么必须有：连点器每拍点击都会**改变画面**，等于自己喂自己的静止检测
      //   → 日志实测 `画面静止 1/3 ... 已连续静止 3.6s` 反复出现、计数永远上不去，
      //     静止判据被连点自己破坏。而模板探针（detectSettleBack）是看左下角固定 UI，
      //     不受点击影响，所以由它来「叫停」最可靠。
      this._settleConfirmed = false;
      // 0.5.59：「黑屏 → 结算」序列确认用的时间戳/计数 + 快拍计时器，每场重新起算
      this._blackAt = 0; this._vsCnt = 0; this._subAt = 0; this._jAt = 0; this._iAt = 0;
      // 0.5.78：本场起点（静止落判的时间闸）+ 横幅时间戳/观察窗状态
      this._fightStart = Date.now(); this._bannerAt = 0; this._holdUntil = 0; this._holdBlack = false;
      this._stillSince = 0;   // 0.5.79：本场「画面开始持续静止」的时间戳（0 = 画面在动）
      this._bannerMuteUntil = 0;
      // v0.6.22：开场静默期 —— 点开战后先什么都别按，等过场/登场走完
      if (startDelayMs > 0) {
        Utils.log('info', `    ⏳ 开场静默 ${Math.round(startDelayMs / 1000)}s（等过场/登场走完再开始连招）`);
        this.op && this.op.releaseHold && this.op.releaseHold();
        await Utils.sleep(startDelayMs);
        Runtime.check();
        // 静默期结束后**重设本场起点**：否则这 10s 会被算进本场时长，
        // 白吃掉 minWait（最短等待）与 maxWait（6 分钟上限）的预算。
        this._fightStart = Date.now();
      }

      const preMs = Math.max(0, minWait - 2000);
      if (this.config.get('battle.keyAssist')) {
        await this.combatFor(preMs);   // 边打边等：连招辅助从一开始就输出
      } else {
        await Utils.sleep(preMs);
      }

      const start = Date.now();

      // 只用中心区域算帧差异，避免 HUD 动画干扰
      const region = [260, 90, 1020, 560];
      this.vision.snapshot(region);

      while (Date.now() - start < maxWait) {
        Runtime.check();

        // v0.5.94：外部模板探针已确认结算（秘境左下角返回）→ 立刻收手，不再浪费一拍。
        //   这一拍的延迟对「连点器点进下一轮」很关键（用户口径：结算验证一定要及时）。
        if (this._settleConfirmed) {
          Utils.log('info', '    ✓ 外部已确认结算画面 → 连招立即收手');
          this.op && this.op.releaseHold && this.op.releaseHold();
          return 'settlement';
        }

        // 识别节流：0.5.51 由 0.7s 收紧到 0.3s。
        // 原因：小队突袭这类玩法「战斗结束会自动结算并自动退回房间界面」，而辅助的普攻位
        // k(1137,589) 恰好压在房间界面右下角的「匹配」大字上 —— 节流太长（0.7s + 静止确认）
        // 会在发现"已退出战斗"之前多按好几次，把「匹配」点开、白打一场。收紧后最坏只多拍一次。
        const nowX = Date.now();
        const due = nowX - (this._detectAt || 0) >= 300;
        if (due) {
          this._detectAt = nowX;
          const r = this.scenes.detect(false);
          this._lastScene = r.scene;

          // ── v0.6.24：右上角红叉落判（opts.redXEnd）──────────────────────────
          //   用户口径：「就用红x就行了」「可以直接用回到主界面的那个红x的探针」
          //   「这个的判定不需要那么及时」，且「开始战斗后 10s 以后才开始轮询」。
          //   ⚠ v0.6.26 语义修正（用户 2026-09-23）：「我给你的红x的判断依据是回到了
          //     **小队突袭的准备界面**的，不直接是战斗结算的」——
          //     红叉 = 游戏已自行结算完并退回准备界面（该 UI 常驻、稳定），
          //     不是结算页那个一闪而过的画面，故落判偏晚更稳、也不怕连点器干扰。
          //   复用既有 PROBES.closeX（area [1185,2,1272,70]，verified:true）——
          //   实测丰饶入口页：区域均值 [106,62,42] vs 目标色 {102,56,34}，距离仅 17。
          //   小队突袭录制佐证：红叉点击色 (162,46,19) @(1203,20,1227,44) ⊂ 该区域，
          //   距离 62.6（容差 105）、std 26 ≥ 10 ⇒ 同样命中。
          // ⚠ 不用 backBtnX：区域 [1040,0,1280,120] 太大被背景稀释，实测距离 199 不命中。
          //   10s 闸的意义：跳过开场过场/加载（刚进场画面不稳，红叉可能还没就位）。
          // v0.6.26：丰饶专属开关改名通用 redXEnd，**小队突袭也复用**（用户口径
          //   「战斗结束的探针也复用之前回到主界面的右上角的红x吧，战斗开始 10s 后开始探测」）。
          //   小队突袭原先只认 squadVictory（结算页「胜利」大字）→ 打不到该帧，
          //   fight 不落判、连点器一直点。abundanceRedX 保留为兼容别名。
          if ((opts.redXEnd || opts.abundanceRedX) && nowX - this._fightStart >= ABUNDANCE_REDX_START_MS) {
            if (nowX - (this._abxAt || 0) >= ABUNDANCE_REDX_POLL_MS) {
              this._abxAt = nowX;
              try {
                const m = this.vision.sawRedX();   // 标准件①（探针单点维护在 PROBES.closeX）
                if (m && m.ok) {
                  Utils.log('info', `    ✓ 检测到右上角红叉（结算）dist=${m.score} → 判定本场结束`);
                  this._vsCnt = 0; this._holdUntil = 0; this._holdBlack = false;
                  this.op && this.op.releaseHold && this.op.releaseHold();
                  return 'settlement';
                }
              } catch (e) { /* 探针失败不影响主流程 */ }
            }
          }

          // ── v0.6.27：暂停键守卫落判（opts.pauseGuard）─────────────────────────
          //  正向判据：先命中过暂停键 ⇒ 确认"确实在战斗"；之后连续 3 次看不到
          //  ⇒ 已离开战斗画面 ⇒ 落判。实现全在 vision.battleWatch()（含 3s 静默 + 1s 节流）。
          //  ⚠ 只在**已确认进入战斗**之后才可能 exited（未进入时的失败不计数）——
          //    这样开战过场期（暂停键本就还没出现）不会被误判成"已结束"。
          if (pauseGuard) {
            const s = pauseGuard.poll();
            if (s.exited) {
              Utils.log('info', `    ✓ 暂停键连续 ${BATTLE_WATCH_FAIL_NEED} 次未命中 → 判定已退出战斗（采样 ${s.samples} 次）`);
              this._vsCnt = 0; this._holdUntil = 0; this._holdBlack = false;
              this.op && this.op.releaseHold && this.op.releaseHold();
              return 'settlement';
            }
          }

          // ── v0.6.16：忍术对战结算图标判据（opts.arenaEndIcon）───────────────────
          //   放在最前面：它是离散的「UI 元素存在」判断，不像横幅/黑屏那样需要
          //   等序列确认或时间闸，命中即可落判（配合下面的观察窗决定续局还是收尾）。
          if (opts.arenaEndIcon) {
            const ae = await this.detectArenaEnd();
            if (ae.ok) {
              // v0.6.20：**命中即落判**，不再开观察窗。
              //   图标是结算画面的确定判据（实测 正样本 2.5 / 负样本 ≥41.7，10 倍分离），
              //   不需要像金色横幅那样靠 6s 观察窗去分辨「自动续局 or 真的打完」。
              //   旧写法开观察窗 → 结算画面一直在 → 每拍重复打日志、还要空等 6s
              //   （用户 2026-09-21 反馈「图标明明在却要等十几秒才结束」）。
              this._vsCnt = 0;
              this._holdUntil = 0; this._holdBlack = false;
              Utils.log('info', `    ✓ 检测到结算图标（战斗详情·卷轴）score=${ae.score}`
                + ` @(${ae.x},${ae.y}) → 判定本场结束`);
              return 'settlement';
            }
          }

          // ── 黑屏时间戳（0.5.59）：只用于给「结算」做序列确认，绝不单独判结算 ──────
          // detect() 里 brightness < 12 会直接返回 SCENE.LOADING（全屏几乎纯黑）。
          // 忍术对战实测：一局打完是「胜负已分横幅 → 黑屏 → 下一局」，黑屏帧全屏均值只有
          // 1.3~4.4，而战斗中最暗的帧也有 43 → 不会互相混。
          // 注意：2026-09-13 用户明确否掉过「纯像素黑屏单独当判据」（暗场景战斗帧也可能很黑），
          // 所以这里只把它当作「序列里的一环」，主判据仍是金色横幅。
          if (r.scene === SCENE.LOADING) {
            this._blackAt = nowX;
            // ── v0.6.19：原「黑屏 = 整场结束」快通道已删除 ──────────────────────
            //   用户 2026-09-21 反馈：**小局切换也是黑屏**（「胜负已分 → 黑屏 → 下一小局」），
            //   而该闸用的是**_整场**开始时间 _fightStart —— 打到 25s 后，任何一次小局切换的
            //   黑屏都会被误判成「整场结束」，把连点器提前停掉（用户看到「小局被停」）。
            //   0.5.81 当初加它是为了救「整场结束的黑屏后停在不认识的面板页」那个场景；
            //   现在结算图标（arenaEndIcon）在那之前就能命中、来得及停手，这条不再需要。
            //   保留 _blackAt：仍作为金色横幅的「序列确认」一环（见下方 recentBlack）。
          }

          // ── v0.6.20：金色横幅判据已删除（用户 2026-09-21 口径）─────────────────
          //   「删掉横幅判据，只用结算图标」。
          //   横幅的问题：① 它前面那拍场景未必是 BATTLE_END ② 与图标同时命中会打架
          //   （实测 23:54:09 横幅先命中开观察窗 → 23:54:10 又判"自动续局" → 23:54:11
          //    图标才命中，白绕一圈）③ 战败局根本没有金色横幅。
          //   现在忍术对战的结算**只认右上角「战斗详情」卷轴图标**。

          // ── v0.6.18：画面「静止」相关的三条判据全部删除 ──────────────────────
          // 删除：① 静止计数 stable/endStableNeed ② 静止判结束 return 'stable'
          //      ③ 静止兜底 return 'frozen'（staticBailMs 空转 20s）
          // 保留：结算图标 / 金色横幅 —— 都是**离散 UI 事件**，
          //   不像「画面不动」既是战斗常态、又必须等好几秒才敢下结论。
          let diff = 1;
          try {
            diff = this.vision.frameDiff(region);
          } catch (e) {
            diff = 1;   // 视觉不可用 → 当作「画面在动」，绝不停手、绝不判结束
          }

          // ── 0.5.78：横幅观察窗结算（黑屏过场后画面是否重新动起来）──────────────
          //   · 动起来 → 自动续下一小局：撤回暂停、连招上限重新计时，接着打（不出任务层）
          //   · 窗口结束仍不动/黑屏 → 本局（整场）真的打完 → 返回 settlement
          if (this._holdUntil) {
            if (r.scene === SCENE.LOADING) {
              this._holdBlack = true;
            } else if (this._holdBlack && diff >= threshold) {
              Utils.log('info', '    ↻ 过场后画面重新动起来 → 判定自动续局，继续连招辅助');
              this._holdUntil = 0; this._holdBlack = false;
              this._bannerMuteUntil = Date.now() + 4000;   // 横幅余像别立刻再落判一次
              this._combatT0 = 0;                          // 新一小局：连招计时/上限重算
              this._bannerAt = 0;
            } else if (nowX >= this._holdUntil) {
              Utils.log('info', '    ✓ 观察窗内画面始终未恢复动态 → 判定本局结束');
              return 'settlement';
            }
          }
        }

        // 键盘/点击辅助开启就发点：⚠ 不能限定 scene === BATTLE —— 战斗探针（沙地色摇杆/金技能钮）
        // 是按某张地图实测的，换个地图就判不出 BATTLE，会导致 15s 后一次都不点（用户看到"没反应"）。
        // 只排除已判定的结算/主界面（那两种情况上面已 return）+ 横幅观察窗（_holdUntil，
        // 那时已确认结算、不该再连点）。v0.6.18 起不再看「画面静止」——
        // 用户口径「中间直接全部连点器就可以了」，静止与否都继续连招。
        const stillFighting = !this._holdUntil && this._lastScene !== SCENE.BATTLE_END
          && this._lastScene !== SCENE.HOME;
        const comboGap = (this.config.get('battle.keyAssist') && stillFighting) ? (await this.combatStep()) : 0;
        await Utils.sleep(comboGap || (due ? 150 : 200));
      }

      Utils.log('warn', '    ⚠ 等待战斗超时，继续走结算清理');
      return 'timeout';
    }

    /** v0.5.95：把判定写进追踪（Battle 里拿不到 task 的 ctx，走 app.trace）。
     *  追踪未开时静默返回，零副作用。 */
    _traceDecide(probe, d) {
      try {
        const t = this.app && this.app.trace;
        if (t && t.on) t.decide(probe, d);
      } catch (e) { /* 追踪不能影响主流程 */ }
    }

    /** 结算画面点到底：确认 / 领奖励 / 再次挑战取消，直到回主界面。
     *
     * ⚠ v0.5.94 安全化：`spots` 是为**忍术对战**校准的一组盲点坐标
     *   （含 [659,410]「完胜展示跳过位」、confirm/confirmMid/tapAny）。
     *   用户实测（2026-09-21）：秘境结算画面布局与忍术对战不同，盲点在那边
     *   **点到了需要金币的消费项** → 必须加闸。
     *
     * 现在每轮盲点前先做一次判定：
     *   · 已回主界面 / 已在弹窗 / 仍在战斗 → 原逻辑处理（这些分支本就是安全的）
     *   · BATTLE_END 且探到 settleConfirm → 点确认（安全）
     *   · **其余情况（探不到任何结算特征）→ 不盲点**，只记日志继续下一轮
     *     （宁可少点几下让上层 retry，也不点未知位置 —— 点错是要花金币的）
     *
     * @param {object} [opts]
     * @param {boolean} [opts.allowBlind] 显式允许盲点（默认 false；
     *   仅当你确信当前画面就是结算页、且模板判据失效时才用）
     */
    /**
     * 忍术对战（角斗场）**结算画面**专用判据 —— 右上角「战斗详情」左侧的蓝色卷轴图标（v0.6.16）。
     *
     * 用户口径（2026-09-21）：「战斗结束的判断不对，我建议参考秘境的结束判定，找个图标，
     * 右上角战斗详情几个字的左边有个图标，只在战斗结束的时候出现，用这个作为判断依据」。
     *
     * 相对旧判据的优势：**这是一个离散的 UI 元素存在性判断**，而不是
     *   「画面动能」（静止/黑屏）或「大字配色」（横幅）这类连续量阈值判断 ——
     *   前者要等 6~20s，后者在战败局/登场画面分别漏报与误报。
     *
     * 返回 {ok, score, x, y}：ok=true 表示结算画面在（score < ARENA_END_ICON_THRESH）。
     * ⚠ 比 scenes.detect 贵（模板 SAD），只在 waitForEnd 的 300ms 节流拍上调用。
     */
    async detectArenaEnd() {
      try {
        const tmpl = await loadArenaEndIconTemplate();
        const res = this.vision.findTemplate(tmpl, ARENA_END_ICON_REGION,
          { step: 1, thresh: ARENA_END_ICON_THRESH });
        return {
          ok: !!(res && res.ok),
          score: res && res.score !== undefined ? res.score : null,
          x: res ? res.x : null,
          y: res ? res.y : null,
        };
      } catch (e) {
        return { ok: false, score: null, x: null, y: null, err: e.message };
      }
    }

    async clearSettlement(opts) {
      const o = opts || {};
      const allowBlind = !!o.allowBlind;
      const rounds = this.config.num('battle.postRounds') || 8;
      const spots = [
        PROBES.settleConfirm.click,
        [659, 410],   // 完胜展示跳过位（2026-09-12 忍术对战校准实测）
        [COORDS.common.confirm.x, COORDS.common.confirm.y],
        [COORDS.common.confirmMid.x, COORDS.common.confirmMid.y],
        [COORDS.common.tapAny.x, COORDS.common.tapAny.y],
      ];

      for (let i = 0; i < rounds; i++) {
        Runtime.check();

        const r = this.scenes.detect(false);

        if (r.scene === SCENE.HOME) { Utils.log('info', '    ✓ 结算完成，已回主界面'); return true; }
        if (r.scene === SCENE.POPUP) { await this.nav.dismissOnce(); continue; }
        if (r.scene === SCENE.BATTLE) { Utils.log('warn', '    ⚠ 仍在战斗中，停止结算点击'); return false; }

        if (r.scene === SCENE.BATTLE_END) {
          const hit = r.hits.settleConfirm;
          if (hit && hit.ok) {
            // v0.5.95：点确认前记判定，报告里能看出「依据是什么」
            this._traceDecide('clearSettlement', {
              scene: r.scene, round: i + 1, spot: 'settleConfirm',
              score: hit.score, verdict: 'hit-confirm',
            });
            await this.op.tap(PROBES.settleConfirm.click[0], PROBES.settleConfirm.click[1], 'delay.short');
            continue;
          }
          if (!allowBlind) {
            // v0.5.95：**不点也要记** —— 这正是旧版出问题的地方，必须留痕
            this._traceDecide('clearSettlement', {
              scene: r.scene, round: i + 1, score: hit ? hit.score : null,
              verdict: 'skip-no-confirm', why: '结算页但未探到确认位 → 不盲点',
            });
            Utils.log('info', '    ⚠ 结算页但未探到确认位 → 本轮不盲点（防误点消费项）');
            continue;
          }
        } else if (!allowBlind) {
          // 场景都认不出是结算页 → 绝不盲点
          this._traceDecide('clearSettlement', {
            scene: r.scene, round: i + 1,
            verdict: 'skip-not-settle', why: '场景非结算页 → 不盲点',
          });
          Utils.log('info', `    ⚠ 场景=${r.scene} 非结算页 → 不盲点（防误点）`);
          continue;
        }

        const s = spots[i % spots.length];
        // v0.5.95：盲点也要留痕（这是「被点掉金币」类事故的取证关键）
        this._traceDecide('clearSettlement', {
          scene: r.scene, round: i + 1, spot: s,
          verdict: 'BLIND', why: 'allowBlind=true 才可能走到这里',
        });
        await this.op.tap(s[0], s[1], 'delay.short');
      }

      Utils.log('warn', '    ⚠ 结算清理轮次用尽');
      return false;
    }

    /** 完整战斗流程：等待结束 → 清结算 → 回主界面
     *
     * 0.5.59 新增 opts.noHome：忍术对战这类「连打多局」的玩法，一局打完**不需要回主界面**，
     * 由调用方（任务 run）自己决定是继续下一局、还是重复点「选对手 / 开始对战」。
     * 无论走哪条路径，退出前都必须松开「按住不放」的普攻 —— 否则云端会卡在按压态，
     * 后续所有点击都被当成重复按下而静默失效（0.5.42 踩过）。
     */
    async run(opts = {}) {
      try {
        const reason = await this.waitForEnd(opts);
        this.op.releaseHold();               // 先松手，再做结算/导航点击（避免按压态干扰）
        if (opts.noHome) return reason;
        await this.clearSettlement();
        await this.nav.goHome();
        return reason;
      } finally {
        this.op.releaseHold();
      }
    }

    /** 0.5.59：判断「上一局打完后有没有自动进入下一局」。忍术对战实测：一局打完
     *  （胜负已分横幅 → 黑屏）游戏会**自动**开下一局，这时脚本什么都不用点，继续辅助即可。
     *  返回 true = 画面还在动/已判定为战斗（自动续局）；false = 停在结算或角斗场界面。
     *
     *  之所以不只看 SCENE.BATTLE：战斗探针是按某张地图实测的，换地图可能判不出战斗
     *  （代码里 waitForEnd 也备注过这点），所以补一个「画面是否持续变化」的时间维度判据。
     */
    /**
     * 0.5.65 重写（用户录制「忍术对战5.json」120 帧实测）：判据从「画面是否在动」
     * 换成「结算流程走完没、回到房间页没」。
     *
     * 实测一局的完整节奏（帧号取自该录制）：
     *   ① 战斗中（scene=other —— 战斗探针是按别的地图标定的，这张图判不出 BATTLE）
     *   ② v0.6.20 起忍术对战**不再看**「胜负已分」金横幅 victoryBanner ——
     *      用户 2026-09-21 口径「删掉横幅判据，只用结算图标」（两者打架：
     *      横幅先命中→判自动续局→图标才命中，白绕一圈）。
     *      改认右上角「战斗详情」卷轴图标 arenaEndIcon，命中即落判。
     *      ⚠ victoryBanner 仍留在 SCENE_RULES 里给**其他玩法**用，不要删。
     *      = **这一把打完了**（f1-4 / f84-91）
     *   ③ 结算过场动画（约 9s，scene=other，画面持续变化）
     *   ④ 房间页：整屏均匀浅色界面，titleDaily 命中 → SCENE.DAILY（f15-16 / f100-101）
     *      = **这一把彻底结束，可以开下一把了**
     *   ⑤ 游戏自动开下一局（或停在房间页等手动点「选对手 → 开始对战」）
     *
     * 旧实现只看「画面是否在动」→ ③ 的过场动画会被当成「已自动续局」→ 不点选对手，
     * 结果停在房间页干等；而且 ④ 的房间页在 0.5.65 前会被 squadVictory 误判成 BATTLE_END，
     * 「这一把结束没有」根本分不清。现在改成显式等房间页。
     *
     * @returns {'room'|'battle'|'home'|'timeout'}
     *   room    = 已回房间页，需要手动点「选对手 / 开始对战」
     *   battle  = 游戏已自动开下一局，不用点
     *   home    = 意外回了主界面（交给上层兜底）
     *   timeout = 都没等到（多半是过场比预期长），调用方按「需要手动开」兜底
     */
    async waitRoomPage(ms) {
      const end = Date.now() + (ms || 16000);
      while (Date.now() < end) {
        Runtime.check();
        const r = this.scenes.detect(false);
        if (r.scene === SCENE.DAILY) return 'room';
        if (r.scene === SCENE.BATTLE) return 'battle';
        if (r.scene === SCENE.HOME) return 'home';
        await Utils.sleep(1000);
      }
      return 'timeout';
    }
  }

  // ============================================================
  //  TaskContext — 任务里能用到的所有能力
  // ============================================================
  class TaskContext {
    constructor(op, cfg, nav, scenes, battle, progress, vision) {
      this.op = op; this.cfg = cfg; this.nav = nav; this.scenes = scenes;
      this.battle = battle; this.progress = progress; this.vision = vision;
    }
    /** 点击坐标点 {x,y} 或 [x,y] */
    async tap(c, wait, label) {
      const x = Array.isArray(c) ? c[0] : c.x;
      const y = Array.isArray(c) ? c[1] : c.y;
      const l = label || this._nameRef(c);
      this._advance(l);                 // 流程图推进（若已 flow()）
      await this.op.clickNatural(x, y, null, l);
      this.lastTapLabel = l;
      this.stepResult(true);            // 点击成功即记 ok（异常会抛出，不会走到这）
      await this.cfg.wait(wait || 'delay.click');
    }
    /** 宿主页面 DOM 层点击（分享图 / 页面级弹窗等不在云游戏画面里的元素）
     *  与 tap() 的区别：tap 把事件派发到 video（云游戏内），domTap 派发到该坐标处真实的
     *  页面元素（elementFromPoint）。命中页面覆盖层返回 true；该点是游戏画面层或找不到
     *  元素返回 false（调用方再走普通 tap 兜底）。
     *  坐标可为 {x,y} 或 [x,y]；opts.xpath 可指定 XPath 兜底定位。 */
    async domTap(c, label, opts) {
      const x = Array.isArray(c) ? c[0] : c.x;
      const y = Array.isArray(c) ? c[1] : c.y;
      const l = label || this._nameRef(c);
      this._advance(l);                 // 流程图推进（每个步骤只推进一次，兜底点击不要再调）
      let r = { ok: false, reason: 'domClick 不可用' };
      try { r = this.op.domClick(x, y, opts) || r; }
      catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      if (r.ok) {
        Utils.log('info', `    🖱 页面层点击「${l}」@(${x},${y}) → 命中 ${r.path}`
          + ` (client ${r.at.x},${r.at.y} 尺寸 ${r.rect.w}x${r.rect.h}${r.xpath ? ' [按XPath]' : ''})`);
      } else {
        Utils.log('warn', `    🖱 页面层点击「${l}」@(${x},${y}) 未生效：${r.reason || '未知'}`
          + (r.path ? ` 命中元素 ${r.path}` : ''));
      }
      this.stepResult(!!r.ok);
      await this.cfg.wait('delay.click');
      return !!r.ok;
    }
    /** 按住拖动：从 (x1,y1) 拖到 (x2,y2)，duration 毫秒
     *  坐标可为 {x,y}/{x1,y1,x2,y2} 对象或 [x1,y1,x2,y2] 数组 */
    async drag(a, b, c, d, duration, label) {
      let x1, y1, x2, y2, dur = duration;
      if (Array.isArray(a)) { [x1, y1, x2, y2] = a; }
      else if (a && typeof a === 'object' && a.x1 !== undefined) { x1 = a.x1; y1 = a.y1; x2 = a.x2; y2 = a.y2; if (dur == null) dur = a.duration; }
      else {
        x1 = Array.isArray(a) ? a[0] : (a && a.x); y1 = Array.isArray(a) ? a[1] : (a && a.y);
        x2 = Array.isArray(b) ? b[0] : (b && b.x); y2 = Array.isArray(b) ? b[1] : (b && b.y);
      }
      if (dur == null) dur = 600;
      this._advance(label || '按住拖动');
      await this.op.swipe(x1, y1, x2, y2, dur);
      this.stepResult(true);
      await this.cfg.wait('delay.click');
      return { x1, y1, x2, y2, duration: dur };
    }
    /** 长按某点 duration 毫秒 */
    async longPress(c, duration, label) {
      const x = Array.isArray(c) ? c[0] : c.x;
      const y = Array.isArray(c) ? c[1] : c.y;
      const l = label || this._nameRef(c);
      this._advance(l);
      await this.op.longPress(x, y, duration || 1000);
      this.stepResult(true);
      await this.cfg.wait('delay.click');
    }
    /** 从坐标对象反查可读名字（用于点击标记） */
    _nameRef(c) {
      if (c && typeof c === 'object' && (c.name || c.id)) return c.name || c.id;
      // 反查 COORDS 里同名引用
      const key = this._keyOf(c);
      return key || null;
    }
    /** 在 COORDS 中查找该对象引用对应的键名 */
    _keyOf(ref) {
      if (!ref || typeof ref !== 'object') return null;
      const roots = [['COORDS', COORDS]];
      for (const [prefix, root] of roots) {
        for (const g of Object.keys(root)) {
          const grp = root[g];
          if (!grp || typeof grp !== 'object' || Array.isArray(grp)) continue;
          for (const k of Object.keys(grp)) {
            if (grp[k] === ref) return prefix + '.' + g + '.' + k;
          }
        }
      }
      return null;
    }
    /** 声明本任务的流程图步骤（在 run 开头调用）
     *  两种用法：
     *    ctx.flow(taskDef)                       —— 推荐，从任务对象的 steps 字段读
     *    ctx.flow('任务名', [step, step, ...])     —— 直接给数组
     *  steps: [{ kind:'tap'|'key'|'wait'|'check', title, detail?, coord?, color? }]
     *  之后每次 tap/go/home/fight/waitScene 会自动推进到下一步 */
    async flow(a, b) {
      let name, steps, key = '';
      if (typeof a === 'string') { name = a; steps = b || []; }
      else if (a && typeof a === 'object') {
        name = a.name || a.key; steps = a.steps || []; key = a.key || '';
      } else { name = '未命名'; steps = []; }
      this._flowName = name;
      FlowChart.define(name, steps, key);
      this._flowIdx = -1;
      this._flowSteps = steps.length;
      Utils.log('info', `📋 流程图已展开：${name}（${steps.length} 步）`);
      return steps.length;
    }
    /** 手动推进流程图（用于自动推进不适配的场景） */
    step(label) {
      const cur = (this._flowIdx === undefined || this._flowIdx === null) ? -1 : this._flowIdx;
      this._flowIdx = cur + 1;
      FlowChart.entering(this._flowIdx, label);
      return this._flowIdx;
    }
    /** 标记当前步结果 */
    stepResult(ok) {
      const i = (this._flowIdx === undefined || this._flowIdx === null) ? -1 : this._flowIdx;
      if (i >= 0) FlowChart.result(i, ok);
      return ok;
    }
    /** 内部：自动推进一步 */
    _advance(label) {
      if (this._flowIdx === undefined) return;   // 未启用流程图
      const cur = (this._flowIdx === null) ? -1 : this._flowIdx;
      this._flowIdx = cur + 1;
      FlowChart.entering(this._flowIdx, label);
    }
    /** 导航点击（等页面加载）。推进由 tap() 内部完成，这里不再重复推进。 */
    async go(c, wait, label) { return this.tap(c, wait || 'delay.pageLoad', label); }
    /** 清弹窗 */
    async popups() { return this.nav.dismissPopups(); }
    /** 回主界面 */
    async home() { this._advance(null); const r = await this.nav.goHome(); this.stepResult(!!r); return r; }
    /** 打一场。opts.noHome=true 表示「一局打完不回主界面」，由任务自己处理续局（0.5.59） */
    async fight(opts) { this._advance(null); const r = await this.battle.run(opts || {}); this.stepResult(true); return r; }
    /** 等待场景 */
    async waitScene(s, t) { this._advance(null); const r = await this.scenes.waitFor(s, t); this.stepResult(!!r); return r; }

    /**
     * 等画面连续静止（每 interval 采一帧，连续 times 次无变化即认为已稳定）。
     * 返回过程中观察到的「仍在变化」的次数（>0 说明期间画面又动过）。
     *
     * 用途（0.5.51，为小队突袭而加）：该玩法「战斗结束 → 自动结算 → 自动退回房间界面」，
     * 而辅助的普攻位 k(1137,589) 正好压在房间界面右下角的「匹配」上，结算瞬间可能误触、
     * 又开一场。主流程在这里等画面彻底静止，把「误触多开的那一场」吸收掉，避免状态错乱。
     */
    /**
     * 等「忍术对战·战斗准备界面」（v0.6.20）。
     *
     * 用于把角斗场改成**真循环**：结算跳过之后不离开角斗场，就地等这个界面回来。
     * 用户口径（2026-09-21）：
     *   「循环的内容是 识别战斗准备界面 - 点开战 - 连点器 - 识别结算图标 - 点一下跳过结算」。
     *
     * 判据：「开始对战」按钮（1165,629）的**蓝色高亮**。该按钮是准备界面独有的，
     *   战斗中有 HUD 遮挡、结算页没有它。
     *   实测特征：按钮主体偏亮蓝（R<G<B 且 B 明显高），与周围暗色背景分离度高。
     *
     * 返回 {ok, ms, why}。ok=true 表示准备界面已就绪、可以点「开始对战」。
     */
    async waitArenaReady(budgetMs) {
      const t0 = Date.now();
      const budget = budgetMs || 20000;
      const need = 2;                                  // 连续 2 拍命中才算稳定
      let hit = 0;
      try { await loadArenaReadyIconTemplate(); } catch (e) {
        return { ok: false, ms: 0, why: e.message };
      }
      while (Date.now() - t0 < budget) {
        Runtime.check();
        let icon = Infinity, red = 0;
        try {
          this.vision.capture();
          const tm = await loadArenaReadyIconTemplate();
          const r1 = this.vision.findTemplate(tm, ARENA_READY_ICON_REGION,
            { step: 1, thresh: ARENA_READY_ICON_THRESH });
          icon = (r1 && r1.score !== undefined) ? r1.score : Infinity;
        } catch (e) { icon = Infinity; }
        try {
          const [a1, b1, a2, b2] = ARENA_READY_X_REGION;
          const d = this.vision.ctx.getImageData(a1, b1, a2 - a1, b2 - b1).data;
          let n = 0, rr = 0;
          for (let i = 0; i < d.length; i += 4) {
            n++;
            const R = d[i], G = d[i + 1], B = d[i + 2];
            if (R > 130 && R > G + 60 && R > B + 60) rr++;
          }
          red = n > 0 ? rr / n : 0;
        } catch (e) { red = 0; }
        const ok = icon < ARENA_READY_ICON_THRESH && red >= ARENA_READY_X_RED_MIN;
        hit = ok ? hit + 1 : 0;
        if (hit >= need) {
          return { ok: true, ms: Date.now() - t0,
            why: `感叹号 score=${icon.toFixed(1)} + 红X ${(red * 100).toFixed(0)}%` };
        }
        await Utils.sleep(ARENA_READY_POLL_MS);
      }
      return { ok: false, ms: Date.now() - t0, why: `等 ${Math.round(budget / 1000)}s 未出现准备界面` };
    }
    async waitQuiet(interval, times) {
      const iv = interval || 1500, need = times || 3;
      const region = [200, 90, 1080, 620];
      const thr = this.cfg.get('vision.diffThreshold') || 0.012;
      let stable = 0, churn = 0;
      const t0 = Date.now();
      try { this.vision.snapshot(region); } catch (e) { return 0; }
      while (stable < need && Date.now() - t0 < 45000) {
        Runtime.check();
        await Utils.sleep(iv);
        let d = 1;
        try { d = this.vision.frameDiff(region); } catch (e) { d = 1; }
        if (d < thr) { stable++; } else { stable = 0; churn++; }
      }
      return churn;
    }

    /** 按录制时间间隔回放动作序列（tap/drag/key）。
     *  seq: [{kind:'tap',x,y,dt}, {kind:'drag',x1,y1,x2,y2,duration,dt}, {kind:'key',key,hold,dt}]
     *  dt 为相对上一动作的时间间隔（ms）。
     *  用于秘境挑战 1:1 复刻录制按键。 */
    async replaySeq(seq, opts) {
      const o = opts || {};
      const label = o.label || '录制回放';
      this._advance(label);
      const t0 = Date.now();
      // v0.5.86：宏数组第 0 项可能是 {kind:'lead', ms:N} —— 开场的「点匹配 → 首键」间隔。
      //   录制里这段是玩家走位/等待战斗开始的时间；宏的 dt 是相对首键的，把它丢了
      //   会让脚本比录制提前 N 毫秒按键（用户实测：宏打不对劲，靠连点器才赢）。
      //   ⚠ 传 sinceMs（点匹配的时刻）时 lead 按**绝对时间**对齐，
      //     前面轮询识别花掉的时间会被抵扣，不会额外拖长。
      const since = (o.sinceMs != null ? o.sinceMs : null);
      // 累计目标时刻（v0.5.92）：dt 是相对间隔，必须逐步累加后再与真实流逝比较
      let accMs = 0;

      // ── v0.5.92 分流：含 key 步 → 走**时间线并发调度**（见 replayKeyTimeline）──
      //   录制里 806 处「某键按住窗口内出现另一键」。原生键盘事件支持多键同按
      //   （用户实测 S+D 同按 = 斜向），所以这里不再需要旧的鼠标坐标中点合成。
      //   tap/drag 的宏（导航）不含 key，走下面的原路径。
      if (seq.some(s => s.kind === 'key') && !o.legacySerial) {
        const lead = seq.find(s => s.kind === 'lead');
        if (lead) {
          const elapsed = (since != null ? Date.now() - since : Date.now() - t0);
          const w = Math.max(0, (lead.ms || 0) - elapsed);
          if (w > 0) await Utils.sleep(w);
        }
        await replayKeyTimeline(this.op, seq, { sinceMs: since });
        this.stepResult(true);
        return;
      }

      for (let i = 0; i < seq.length; i++) {
        Runtime.check();
        const s = seq[i];
        if (s.kind === 'lead') {
          const elapsed = (since != null ? Date.now() - since : Date.now() - t0);
          const w = Math.max(0, (s.ms || 0) - elapsed);
          if (w > 0) await Utils.sleep(w);
          continue;
        }
        // v0.5.87：`pre` = 本步点击**之前**额外强制等待（不受 dt 压缩影响）。
        //   用户实测：点「匹配」前只等了 1.1s，界面还没渲染完 → 点击失效（没点上）。
        //   dt 是「距上一步」且会被整体 deadline 压缩，不足以保证界面就绪，
        //   所以关键步骤（如点匹配）需要这个独立的、强制的前置等待。
        if (s.pre && s.pre > 0) await Utils.sleep(s.pre);
        // ⚠ v0.5.92 修 BUG：`s.dt` 是**距上一步的相对间隔**，不是距 t0 的绝对时刻。
        //   旧代码 `Math.max(0, (s.dt||0) - (Date.now()-t0))` 拿相对值减绝对耗时，
        //   第一步之后 wait 恒为 0 → 整个宏失控狂发。实测偏差（录制 vs 旧实现）：
        //   gangti 末键 33946→14496（早 19.45s）、lieyan 16954→7902、leiting 13482→6439。
        //   正确做法：维护**累计目标时刻** acc，逐步累加 dt 后与真实流逝时间比较。
        accMs += (s.dt || 0);
        const wait = Math.max(0, accMs - (Date.now() - t0));
        if (wait > 0) await Utils.sleep(wait);
        if (s.kind === 'tap') {
          await this.op.tap(s.x, s.y);
        } else if (s.kind === 'drag') {
          // ⚠ v0.6.09：落点安全区钳制已**下沉到 op.swipe 内部**统一处理
          //   （见 SECRET_REALM_DRAG_X_MIN/_MAX 与 GameOperator.swipe 的说明）。
          //   这里不再重复钳制，保持一处实现，避免两条路径不一致。
          await this.op.swipe(s.x1, s.y1, s.x2, s.y2, s.duration || 600);
          // v0.6.27：拖动后的**缓冲**（如主界面横向平移的最后一步）。
          //   景：主界面 3 次平移后惯性未停稳，紧接的 tap 会落在错位图标上
          //   （实测点到「福利站/社区入口」(79,329) → 进错页且回不来）。
          //   这里用真实 sleep 保证「拖完→下一步」之间确实有间隔；
          //   同时把 accMs 也加上，避免后续 dt 把这 1s 抵扣掉。
          if (s.settleMs > 0) {
            accMs += s.settleMs;
            await Utils.sleep(s.settleMs);
          }
        } else if (s.kind === 'key') {
          // ⚠ v0.5.92：含 key 的宏走**时间线并发调度**，本分支只处理
          //   `opts.legacySerial:true`（回滚用）。见 replayKeyTimeline。
          if (this.op.holdKey) this.op.holdKey(s.key);
        }
      }
      this.stepResult(true);
    }

    /** v0.5.99：券刷光（**已明确读到数字 0**）后的专属退出。
     *
     *  用户口径（2026-09-21）：券=0 时界面弹一个「任务完成」浮层，
     *  先点右上角 X，再点 (636,455) 的确定，之后即可走标准回主界面流程。
     *
     *  ⚠ 调用方必须自己确认「读到的是数字 0」—— 本方法不判断券，
     *    只负责点这两下。读不到数字（best=Infinity）**不得**调它。
     *  @returns {Promise<boolean>} 两步是否都已执行
     */

    async realmTicketDoneExit() {
      const flow = SECRET_REALM_TICKET_DONE_EXIT;
      if (!Array.isArray(flow) || flow.length !== 2) {
        Utils.log('warn', '  ⚠ 未配置「券刷光退出」坐标（SECRET_REALM_TICKET_DONE_EXIT），跳过');
        return false;
      }
      Utils.log('info', '  🎫 券已刷光：关闭完成浮层（右上 X → 确定）');
      for (let i = 0; i < flow.length; i++) {
        await this.op.tap(flow[i][0], flow[i][1]);
        if (i < flow.length - 1) await Utils.sleep(SECRET_REALM_TICKET_DONE_GAP);
      }
      await Utils.sleep(SECRET_REALM_TICKET_DONE_GAP);
      return true;
    }

    /** 秘境挑战「战斗卡住强制退出」：① 右上角暂停 → ② 退出游戏 → ③ 确定 → 回战斗前界面。
     *
     *  坐标为 null 或长度不为 3 时**不点任何未知位置**，只记录告警并返回 false。
     *  返回 true = 三步已执行；false = 未配置坐标，调用方应自行兜底。 */
    async realmForceExit() {
      const flow = SECRET_REALM_FORCE_EXIT;
      if (!Array.isArray(flow) || flow.length !== 3) {
        Utils.log('warn', '  ⚠ 未配置「暂停→退出游戏→确定」坐标（SECRET_REALM_FORCE_EXIT），跳过强制退出');
        return false;
      }
      Utils.log('info', '  ⏸ 强制退出：暂停 → 退出游戏 → 确定');
      for (const [x, y] of flow) {
        await this.op.tap(x, y);
        await Utils.sleep(SECRET_REALM_EXIT_GAP);
      }
      await Utils.sleep(SECRET_REALM_EXIT_SETTLE);
      return true;
    }

    /** 轻量探一次「结算画面到了没」。用 scenes.detect(false)，比 waitForEnd 快得多
     *  （waitForEnd 有 minWaitMs 默认 15s 的下限，不适合连点期间的秒级轮询）。 */
    isSettlementNow() {
      try {
        return this.scenes.detect(false).scene === SCENE.BATTLE_END;
      } catch (e) {
        return false;
      }
    }



    /**
     * 探一次「结算画面的左下角返回按钮在不在」—— 秘境的**主结算判据**（v0.5.88）。
     *
     * 为什么用它而不是 scenes.detect：
     *   · 秘境录制的 scene 字段全是 other/popup，**没有一帧是 battle_end**，
     *     说明通用场景规则并不贴合秘境的结算画面；
     *   · 「左下角返回」是秘境结算独有的 UI 元素，战斗中该区域是空的，
     *     实测分离度极大（正 0~33.7 / 负 76.7~82.9），比整屏场景判定可靠。
     *
     * 返回 {ok, score, x, y}：ok=true 表示按钮在（score < 阈值）。
     * ⚠ 只在连点期间每 2s 调一次（见 SECRET_REALM_SETTLE_PROBE_MS），不参与常态轮询 ——
     *   实测模板匹配比 scenes.detect 贵，没必要每拍都跑。
     */
    async detectSettleBack() {
      try {
        const tmpl = await loadSettleBackTemplate();
        const RG = SECRET_REALM_SETTLE_BACK_REGION;
        // findTemplate 的 ok 已是 `score <= thresh`，直接用
        const res = this.vision.findTemplate(tmpl, RG, { step: 1, thresh: SECRET_REALM_SETTLE_BACK_THRESH });
        return {
          ok: !!(res && res.ok),
          score: res && res.score !== undefined ? res.score : null,
          x: res ? res.x : null,
          y: res ? res.y : null,
        };
      } catch (e) {
        return { ok: false, score: null, x: null, y: null, err: e.message };
      }
    }

    /** 识别当前战斗顶部中央的秘境名称，返回 luoyan/dufeng/leiting 或 null */
    async identifyRealmName() {
      const tmpls = await loadRealmNameTemplates();
      // SECRET_REALM_NAME_REGION 已是像素 [x1,y1,x2,y2]，直接透传（旧版按比例换算且几何含义不符）
      const RG = SECRET_REALM_NAME_REGION;
      let bestRealm = null, bestScore = Infinity;
      for (const realm of Object.keys(tmpls)) {
        const res = this.vision.findTemplate(tmpls[realm], RG, { step: 2, thresh: 25 });
        if (res.ok && res.score < bestScore) {
          bestScore = res.score;
          bestRealm = realm;
        }
      }
      if (bestRealm) {
        Utils.log('info', `    秘境识别: ${bestRealm} (score=${bestScore.toFixed(1)})`);
      } else {
        Utils.log('warn', '    秘境识别失败');
      }
      return bestRealm;
    }

    /**
     * 轮询识别秘境名，一识别到就立刻返回。
     * ⚠ v0.5.86：不能「睡满固定秒数再识别一次」—— 用户实测那样会让宏晚开场
     *   好几秒（2026-03-19 反馈：「进入战斗后好几秒了都才开始战斗，宏无法如预期
     *   执行，最后靠保底连点器才打赢」）。
     *   录制实测：点匹配 → 首个按键仅 4.8~6.5s，宏必须尽早开打。
     *   所以这里改成高频轮询：每 NAME_POLL_MS 试一次，命中即停。
     * 返回秘境 key 或 null（超时未识别）。
     */
    async pollRealmName(budgetMs) {
      const t0 = Date.now();
      let tries = 0;
      while (Date.now() - t0 < budgetMs) {
        tries++;
        const r = await this.identifyRealmName();
        if (r) {
          Utils.log('info', `    ⚡ 第 ${tries} 次轮询命中（+${Date.now() - t0}ms）→ ${r}`);
          return r;
        }
        await Utils.sleep(SECRET_REALM_NAME_POLL_MS);
      }
      Utils.log('warn', `    轮询 ${tries} 次、${budgetMs}ms 内未识别到秘境名`);
      return null;
    }

    /**
     * 读「剩余挑战券」数量。
     * 返回 {ok, value, matched}：
     *   value 为识别到的数字字符串（已知模板之一），value===null 表示全部失配（疑似 0 或未收录数字）。
     * 用户口径：只需判断「是不是 0」，不做精确 OCR。
     */
    /** 加载「挑战券图标」模板（只解析一次，之后缓存）。 */
    async loadPrepIconTemplate() {
      if (this._prepIcon) return this._prepIcon;
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('挑战券图标模板解码失败'));
        i.src = SECRET_REALM_PREP_ICON_TMPL;
      });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      this._prepIcon = cv;
      return cv;
    }

    /**
     * 探测「当前画面是秘境准备界面吗」—— 用挑战券左侧的小图标做模板匹配。
     *
     * 为什么需要：`readTicketCount()` 失配（best=Infinity）时无法区分
     *   「券=0」和「画面根本不在准备界面」。前者要停手，后者要重导航。
     *   实测这一步**不能靠颜色探针**：画面亮区很多（屏幕中央 bright%=0.91、
     *   左上角 0.88，都比图标区还高），颜色判据毫无特异性；模板匹配则
     *   目标 2.1 / 反例 52+，分离度 50。
     *
     * @returns {Promise<{ok:boolean, score:number, reason?:string}>}
     */
    async atSecretRealmPrep() {
      let tmpl = null;
      try { tmpl = await this.loadPrepIconTemplate(); }
      catch (e) { return { ok: false, score: 999, reason: 'tmpl-load-failed' }; }
      try {
        const r = this.vision.findTemplate(tmpl, SECRET_REALM_PREP_ICON_REGION,
          { step: 1, thresh: SECRET_REALM_PREP_ICON_THRESH });
        return { ok: !!r.ok, score: r.score, reason: r.reason };
      } catch (e) {
        return { ok: false, score: 999, reason: 'detect-error' };
      }
    }

    async readTicketCount() {
      const tmpls = await loadTicketTemplates();
      const keys = Object.keys(tmpls);
      if (!keys.length) return { ok: false, value: null, matched: null };
      // ⚠ v0.6.04 修复关键 bug：SECRET_REALM_TICKET_REGION 是 [x, y, w, h] 写法，
      //   而 findTemplate 的 region 语义是 [x1, y1, x2, y2]（内部按 R[2]-R[0] 算宽）。
      //   旧代码把 [496,620,40,52] 直接传进去 → 被当成 x1=496,y1=620,x2=40,y2=52
      //   → 宽 = 40-496 = -456 → 命中 `tw > rw` 分支返回 {ok:false, score:999}
      //   → **readTicketCount() 从上线起就恒返回 value:null**，
      //     这正是「券数识别不到 / 准备界面识别不对」的真根因。
      //   这里显式换算成 x2/y2 再传。
      const [rx, ry, rw, rh] = SECRET_REALM_TICKET_REGION;
      const region = [rx, ry, rx + rw, ry + rh];
      let best = null, bestScore = Infinity;
      for (const k of keys) {
        const res = this.vision.findTemplate(tmpls[k], region, { step: 1, thresh: 40 });
        if (res.ok && res.score < bestScore) { bestScore = res.score; best = k; }
      }
      if (best !== null && bestScore <= SECRET_REALM_TICKET_THRESH) {
        return { ok: true, value: best, matched: best, score: bestScore };
      }
      return { ok: true, value: null, matched: null, score: bestScore };
    }

    /**
     * 探测「继续挑战无法获得饰品」提示弹窗。
     * 判据：弹窗中央有白字标题「提示」+ 两行正文，故在 NOTICE_REGION 内用 findTextRows
     *       找白字行（grayMin=170 / satMax=60），命中 ≥2 簇即认为弹窗在。
     * ⚠ 关键：不盲点。弹窗只在饰品掉落次数用完时出现，缸体秘境战斗2 那份录制就没有。
     */
    async detectNoticePopup() {
      const [rx, ry, rw, rh] = SECRET_REALM_NOTICE_REGION;
      try {
        const r = this.vision.findTextRows([rx, ry, rx + rw, ry + rh], { minCount: 10, gap: 6 });
        return !!(r && r.ok && r.clusters && r.clusters.length >= 2);
      } catch (e) {
        return false;
      }
    }

    /** 处理提示弹窗：① 勾选「本周不再提示」② 点【确定】。返回是否真的处理了。 */
    async clearNoticePopup() {
      if (!(await this.detectNoticePopup())) return false;
      Utils.log('info', '    ⚠ 探测到「继续挑战无法获得饰品」提示弹窗 → 勾选不再提示 + 确定');
      for (const [px, py] of SECRET_REALM_NOTICE_POPUP) {
        await this.op.tap(px, py);
        await Utils.sleep(SECRET_REALM_NOTICE_GAP);
      }
      return true;
    }

    log(...a) { Utils.log('info', '   ', ...a); }
  }

  // ============================================================
  //  TASK_DEFS — 任务定义
  //  每个任务：{ key, name, category, timeout?, run(ctx) }
  //  ⚠ 除 nav 组外坐标均为估算值，需按实际画面校准
  // ============================================================

  // 分享生成的图：关闭按钮的宿主页面 DOM 覆盖层路径（2026-09-12 用户从 DevTools 复制）
  // ⚠ 索引类 XPath（div[9]）会随页面结构变化而失效，仅作兜底；主路径仍按坐标 elementFromPoint 定位
  const SHARE_IMG_CLOSE_XPATH = '/html/body/div[9]/div/div[2]/div[1]/div[3]';

  // 小队突袭步骤常量（预览 + 运行共用）。0.5.63 全量按 2026-09-16 用户录制「小队突袭.json」重录：
  // 界面已改版（BOSS 页「宇智波鼬 S」，右下按钮为「挑战」），旧「进入 (1173,617) → 金币多倍弹窗」流程废弃。
  const SQUAD_COMMON = [
    // v0.6.27：原来拆成「第一次/第二次」两条，现合并为**一条** ——
    //   拖动已由标准件（dragScene）统一，内部拖几次是实现细节，
    //   流程图只表达「主场景拖到最左」这一个意图（否则高亮会多走一格）。
    { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
    { kind: 'tap', title: '打开小队突袭', detail: '点「小队突袭」入口 (793,253)', coord: [793, 253], color: '88,166,255' },
  ];
  // 每场通用流程：挑战 → （弹窗时）勾选本周不再提示 + 继续出战 → 战斗 → 关结算。
  // 「是否消耗100金币确认勾选」弹窗与旧「金币多倍弹窗」同一探针区域（米白 240,238,213 std≈2）。
  // 勾选框 (575,485)：弹窗只在未勾选时出现（勾过「本周不再提示」本周内不再弹），
  // 所以弹窗出现时勾选框必然是空的 → 点它永远安全，不会把已勾的勾掉（2026-09-16 用户确认按录制来）。
  const SQUAD_ROUND = [
    { kind: 'tap', title: '挑战', detail: '点右下「挑战」(1158,615)', coord: [1158, 615], color: '126,231,135' },
    { kind: 'tap', title: '勾选本周不再提示', detail: '金币确认弹窗 → 点勾选框 (575,485)（弹窗出现时必然未勾，点了就勾上）', coord: [575, 485], color: '126,231,135' },
    { kind: 'tap', title: '继续出战', detail: '金币确认弹窗 → 点「继续出战」(529,412)（探针确认出现才点）', coord: [529, 412], color: '210,153,34' },
    { kind: 'check', title: '打完并关结算', detail: 'fight(noHome) 等战斗结束（squadVictory 胜利大字探针）→ 点 (1041,166) 关结算，留在小队突袭页', coord: null, color: '248,81,73' },
  ];


  // ============================================================
  //  模板资源 —— 从校准录制帧抠图，配合 Vision.findTemplate 使用
  //  签到菜单模板：**2026-09-13 从真机活动页重抠** 108x36（旧 118x28 已失效：
  //  用户反馈「活动页新增功能后菜单位置/样式变了」，旧模板在当前画面最佳 score=26.2 > 阈值 25，
  //  直接匹配不上 → 于是走了兜底坐标，反而点到「好友召回」）
  //  新模板「每月签到」文字：真机 score=0.0（命中 (92,314)）；首页/战斗/小队突袭等 6 张其它画面
  //  最佳 score ≥35 → 阈值 25 判别余量充足，不会误报。
  // ============================================================
  const SIGN_MENU_TMPL_SRC = 'data:image/png;base64,' + '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';
  let _signMenuTmpl = null;
  /** 加载「每月签到到」菜单项模板画布（懒加载缓存） */
  function loadSignMenuTmpl() {
    return new Promise((resolve, reject) => {
      if (_signMenuTmpl) return resolve(_signMenuTmpl);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        _signMenuTmpl = c;
        resolve(c);
      };
      img.onerror = () => reject(new Error('签到菜单模板图加载失败'));
      img.src = SIGN_MENU_TMPL_SRC;
    });
  }

  // ============================================================
  //  免费招募「普通招募」页签模板：**2026-09-13 从真机招募页重抠** 92x26
  //  与「每日签到」同一套口径：页签位置/菜单项数量可变 → 模板识别为准，识别不出就跳过任务，
  //  **不做兜底盲点**（旧兜底 (90,421) 一旦失手就会点错页签）。
  //  实测（2026-09-13 真机招募页）：模板在当前画面 score=0.0（命中 (88,424)）；
  //  主界面 55.9 / 招募结果界面 79.0 / 战斗画面 ~53 → 阈值 25 判别余量充足，不会误报。
  // ============================================================
  const RECRUIT_TAB_TMPL_SRC = 'data:image/png;base64,' + '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'; // 0.5.62 重抠：2026-09-14 现场 1080p 流帧 (42,412) 92x26；720p 旧模板因流分辨率变化重采样抗锯齿不同，SAD 0→28.7 卡死阈值 25
  let _recruitTabTmpl = null;
  /** 加载「普通招募」页签模板画布（懒加载缓存） */
  function loadRecruitTabTmpl() {
    return new Promise((resolve, reject) => {
      if (_recruitTabTmpl) return resolve(_recruitTabTmpl);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        _recruitTabTmpl = c;
        resolve(c);
      };
      img.onerror = () => reject(new Error('普通招募页签模板图加载失败'));
      img.src = RECRUIT_TAB_TMPL_SRC;
    });
  }


  // ============================================================
  //  秘境挑战（secretRealm）录制回放专用常量
  //  来源：
  //    - 导航宏：秘境探险.json 前 6 步
  //    - 战斗宏：naruto-calib-2026-09-17T15-30/38/44 → 落岩/毒风/雷霆
  //    - 名称模板：从对应 calib 战斗帧顶部中央抠取
  //  退出/继续战斗坐标由用户根据默认 UI 位置指定，可在面板配置覆盖。
  // ============================================================
  const SECRET_REALM_EXIT_BATTLE = [430, 500];   // ⚠ 已废弃（v0.5.85）：进战斗后才能识别秘境，
                                                 // 非目标/不适合的秘境一律走 realmForceExit() 暂停退出，
                                                 // 不再用这个「退出战斗」按钮。保留常量仅为兼容旧注释。
  const SECRET_REALM_CONTINUE_BATTLE = [850, 500]; // ⚠ 已废弃（v0.5.85）：录制时序证明不存在
                                                   //  「继续战斗」按钮 —— 点完匹配自动进战斗。
  // ⚠ 0.5.82：SECRET_REALM_CHALLENGE 已删除。
  //   证据：秘境探险.json / 秘境探险3.json 两份录制里，第 6 步点完 (1165,587)/(1183,617)
  //   之后 seq6→seq7 帧差 53.34 / 51.90（画面剧变=已进战斗），说明这一下就是「匹配/进战斗」。
  //   而 SECRET_REALM_NAV 的第 6 步已经是这个坐标 → run() 里再点一次是纯重复点击。
  //   实机 trace（2026-09-20T14-09-40）实测：重复点击把流程打乱，6 步就退出、战斗没进去。
  const SECRET_REALM_CHALLENGE = [1183, 617];    // 匹配按钮（秘境探险3.json seq6 实测）
  const SECRET_REALM_MATCH_WAIT = 7000;          // 点完匹配后等进战斗（录制实测 6701ms，留余量）
  const SECRET_REALM_BATTLE_TIMEOUT = 300000;    // 单场战斗总限时 5 分钟（用户口径：超 5 分钟算失败）
  // 「战斗卡住强制退出」三步流程（用户口径）：
  //   战斗中超过 5 分钟没结束 → ① 点右上角【暂停】→ ② 点中间【退出游戏】→ ③ 点中间【确定】
  //   → 回到战斗前界面，再重新进入战斗。
  // 「战斗卡住 → 手动退出」三步坐标。**两条独立证据互证**（见下）。
  //   证据A｜用户 5 份「XX秘境.json」录制（罡体/雷霆/烈焰/落岩/阴阳），每份都是同一套三步：
  //          ① 1238~1249 / 31~39    均值 (1243,36)  标准差 (3.9,2.9)
  //          ② 513~540   / 437~456  均值 (524,449)  标准差 (9.0,6.3)
  //          ③ 509~536   / 442~461  均值 (521,452)  标准差 (10.0,6.5)
  //   证据B｜v0.5.83 CDP 接管真实浏览器实测（进战斗后逐步点）：
  //          ① 右上角【暂停】(1238,46)  ②【退出战斗】(521,464)  ③ 确认弹窗【确定】(521,464)
  //          橙色按钮像素簇实测：左 x424~618 / y421~504，右 x660~850 / y420~503
  //   两套证据差值 11.5 / 15.6 / 12.4 px —— 全部远小于按钮尺寸 191×84，均在按钮内。
  //   → 取两套均值：① (1241,41) ② (523,457) ③ (521,458)
  //   注意 ②③ 布局相同：下层「退出战斗/继续战斗」、上层「确定/取消」，取各自左侧按钮。
  const SECRET_REALM_FORCE_EXIT = [[1241, 41], [523, 457], [521, 458]];
  const SECRET_REALM_EXIT_GAP = 1500;            // 三步之间的间隔
  const SECRET_REALM_EXIT_SETTLE = 2500;         // 退出后等界面稳定
  // ── v0.5.99：券刷光（读到 0）后的**专属退出**（用户 2026-09-21 口头给定）────
  //   场景：刷完券，界面弹「任务完成/券已用尽」浮层，右上是关闭 X，中间是「确定」。
  //   用户口径：「先点右上角的 X，再点一下 (636,455) 这个位置的确定按键，
  //             接下来的就使用标准的回到主界面的流程就可以了」。
  //   ⚠ 只在**明确读到数字 0** 时才走（用户明确选了这个触发条件）——
  //     `best=Infinity`（读不到任何数字）不算刷光，那通常是「画面根本不在准备界面」。
  // ── 「秘境退出确认弹窗」探针：画面正中的金色确定按钮（v0.6.04）────────────
//  用户口径（2026-09-21）：「回桌面需要把这种界面纳入考虑，因为秘境的回桌面有
//  一个点 x 之后的中间的金色的确定需要点，直接给回桌面的流程，是回卡住的」。
//
//  根因：goHome() 只处理 SCENE.POPUP，而 POPUP 的探针是右上角 closeX/closeGray/
//  closeRed。秘境这个确认框的按钮在**画面正中且是金色**，三个关闭探针全打不到
//  → 场景落进 other/UNKNOWN → 走「盲按返回」→ 确定没人点 → 流程卡死。
//
//  标定（用户截图 1920x1080，÷1.5 换算到 1280）：
//    金色按钮主体 x 814~1097 / y 632~716 → 1280 坐标 x 542~731 / y 421~477
//    中心 (637, 449)，均值 (214,183,111)，金色占比 0.94~0.97
//    对照（准备界面同位置）：金色占比 0.001，色距 156 → 分离极清晰
const SECRET_REALM_EXIT_CONFIRM_REGION = [542, 421, 731, 477];
const SECRET_REALM_EXIT_CONFIRM_COLOR = { r: 214, g: 183, b: 111 };
// 金色占比阈值：命中时 0.94+，未命中 ≤0.05 → 取 0.5
const SECRET_REALM_EXIT_CONFIRM_GOLD_MIN = 0.5;
// 色距上限：命中色距≈0（同一按钮），未命中 ≥156 → 取 60
const SECRET_REALM_EXIT_CONFIRM_DIST_MAX = 120;
// 点击点 = 按钮中心
const SECRET_REALM_EXIT_CONFIRM_CLICK = [637, 449];

// ── v0.6.27：追加「遮罩变暗」判据（用户口径 2026-09-23）──────────────────
//  用户观察：「秘境退出确认按钮有个特征，**周围都暗下来了**，而且右上角的红x也变暗了」
//    「金色还是要，这是确定按钮在这里的基础；暗下来这个你可以拓宽一点阈值」。
//  ⚠ 为什么必须补这条：光靠"金色占比"会**误判** —— 实测小队突袭两把打完后停在
//    准备界面，那里中央恰好有金色元素（金色占比 0.74），goHome 连续 6 轮把它
//    当成秘境确认框、反复点 (637,449)，最终「未能确认回到主界面」。
//  遮罩是**全局**特征（整屏被压暗到约 1/4），比局部金色稳健得多。
//
//  正负样本实测（tools/calib-mask-dim.cjs，同界面有/无遮罩各一张）：
//    区域        无遮罩 luma / 有遮罩 luma
//    左上          71 / 18
//    右上          74 / 19
//    左下          45 / 11
//    左右中带      55 / 13 · 51 / 13
//    右上角红叉    64 / 16   ← 用户指出的「红叉也变暗」得到精确验证
//  六处比值一致为 0.24~0.26 ⇒ 遮罩把画面均匀压暗到约 1/4。
//  阈值取「中点再放宽」（用户要求拓宽）：无遮罩最小值 45，故统一放宽到 40 ——
//    有遮罩时六处全部 ≤19，留了 2 倍余量；同时要求**多处同时**达标防单点误判。
const SECRET_REALM_DIM_AREAS = [
  [30, 60, 240, 190],     // 左上
  [1040, 60, 1250, 190],  // 右上
  [30, 540, 240, 690],    // 左下
  [30, 300, 170, 440],    // 左中带
  [1110, 300, 1250, 440], // 右中带
];
const SECRET_REALM_DIM_LUMA_MAX = 40;   // 每块平均亮度 ≤ 此值算「这块暗了」（实测有遮罩 ≤19）
const SECRET_REALM_DIM_NEED = 4;        // 5 块里至少 4 块暗 → 判定有遮罩（防单块偏暗误判）

// ── 忍术对战「奖励领取」面板常量已上移到 VisionCore 之前（见文件上方注释：TDZ）──

const SECRET_REALM_TICKET_DONE_EXIT = [[1224, 33], [636, 455]];
  const SECRET_REALM_TICKET_DONE_GAP = 1000;     // 用户口径：这几步之间间隔 1s
  const SECRET_REALM_ROUNDS = 10;                // 连刷目标场数（刷满即结束）
  // 🧪「券=0 不退出」测试开关已移到 config：secretRealm.ignoreZeroTicket（面板可点）。
  // 结算两步：录制 seq20 (125,677) → seq21 (520,603)；
  // 秘境探险3.json seq15/16 为 (126,684)/(566,559)，首点差 7px 一致、次点差 64px。
  // 战斗后处理结算的两步。用户口径（2026-03-19）：「我战斗后其实还点过两次，
  //   两次都是为了跳过结算，一次点的返回，一次点的结算的画面」。
  // 6 份战斗录制的倒数两步实测（v0.5.84 统计）：
  //   ① 返回：雷霆(120,674) 烈焰(135,677) 落岩(122,666) 阴阳(122,670) 水牢(146,670) 毒风(122,668)
  //           x 跨 26px / y 跨 11px → 稳定，取均值 (128,671)
  //           vision_describe 实测「返回」按钮本体 (28,650)~(185,700)，本坐标落在按钮内 ✅
  //   ② 结算画面：雷霆(677,590) 烈焰(711,530) 落岩(571,585) 阴阳(696,595) 水牢(563,569) 毒风(578,504)
  //           x 跨 148px / y 跨 91px → **浮动很大**，它不是固定按钮而是「点画面跳过」，
  //           取均值 (628,562)；若失效改点南侧空白区（避开中央奖励图标）。
  //   ⚠ v0.5.88：① 现在**优先用探测到的实际坐标**（detectSettleBack 返回的 x+18,y+16），
  //      这个常量只在探测失败时兜底。实测 9 份录制该按钮 x∈[112,146]（中位 122,670），
  //      按模板匹配取到的是真实中心，比写死坐标准。
  //   ⚠ 旧值 [126,684]/[566,559]：①偏 14px（尚可），②偏 75px（本次修正）。
  const SECRET_REALM_SETTLE_TAPS = [[128, 671], [628, 562]];
  const SECRET_REALM_SETTLE_GAP = 4500;          // 两个结算点击之间的间隔（录制实测 4391ms）
  // 宏回放结束后，等结算画面出现的预算（用户口径：30s 没检测到结算就走强制退出）。
  // 依据 6 份战斗录制实测「宏结束 → 结算出现」间隔：
  //   水牢 4.8s | 烈焰 6.9s | 阴阳 7.2s | 毒风 9.3s | 落岩 11.6s | 雷霆 22.3s
  // 取 30s 覆盖最长 22.3s 并留 ~8s 余量。
  const SECRET_REALM_SETTLE_WAIT = 30000;
  // ── 连点器兜底（用户口径 2026-03-19，二次修正节奏）─────────────────
  //   「宏打完没弹结算 = 敌人还没死 → 用连点器继续打 2 分钟；
  //    过程中一直检测结算，到了立马停走结算流程；2 分钟后还没结算 → 走暂停退出流程。」
  //   节奏（用户 2026-03-19 二次修正，已与用户逐条确认）：
  //     ① j → i → o 三个键**各隔 0.1s**，走完一轮 0.3s，再等 0.2s 凑满 **0.5s 周期**；
  //     ② k **不掺和**进这个循环，是**独立的每 0.2s 按一次**。
  //   ⚠ 连点器是**兜底**不是主力：主力仍是录制宏（用户原话「录制的脚本基本 1~2 分钟必定
  //     搞定，高效且稳定」）。只在宏没打死时才启用，且全程盯着结算。
  // ⚠ v0.5.87：连点器已改为**复用忍术对战的战斗模块**，`SECRET_REALM_TURBO_JIO` /
  //   `_JIO_GAP` / `_JIO_CYCLE` / `_K` / `_K_GAP` / `_HOLD` / `_PROBE` 全部删除
  //   —— 节奏改由 `BattleFlow.ASSIST` 统一定义（两套坐标本就完全一致，见调用处注释）。
  //   只保留 `_MAX`（本阶段的最长兜底时长）。
  const SECRET_REALM_TURBO_MAX = 120000;     // 连点兜底最长 2 分钟
  // 识别到这些秘境**直接强制退出**（不适合脚本操作）。
  //  用户口径：「缸体秘境建议是进入后检测清楚了之后就立即走暂停退出流程」。
  //  gangti/gangti2 都指罡体/缸体（用户两份录制命名不一致，实为同一秘境）：
  //    · 它有额外的「继续挑战无法获得饰品」弹窗，流程更复杂
  //    · 战斗节奏不适合录制的按键序列
  //  与其硬打（大概率打不过、白扣券），不如识别到就退出重匹配。
  //
  //  ⚠ v0.5.87 新增 'yinyang'（用户口径：「阴阳秘境改为采用暂停跳过的方式，不打这个」）。
  //    阴阳虽然有一份可用录制宏（11 步 / 15.8s），但用户决定不刷它 ——
  //    识别到就走 realmForceExit()（暂停 → 退出 → 确定）退出重匹配，一招不发。
  //    ⚠ 注意区分：这是「主动跳过」，和「战斗超时被迫退出」不是一回事 ——
  //      跳过的场不计入 round、不扣券，直接重匹配。
  const SECRET_REALM_SKIP_REALMS = ['gangti', 'gangti2', 'yinyang'];
  // 挑战券刷光后，点了匹配也进不去战斗 → identifyRealmName 连续失败。
  // 连续失败达到这个次数就判定「刷不动了」→ 停手退出（用户口径：停手退出，不回头重刷）。
  const SECRET_REALM_FAIL_LIMIT = 2;
  // 匹配尝试总次数上界：即使一直识别失败/一直匹配到非目标秘境，也绝不会无限循环。
  // 券刷光后每次都要等 MATCH_WAIT(7s)，所以这个上界同时也是「最多耗多久」的保证。
  const SECRET_REALM_MATCH_TRIES_MAX = 60;
  // 战斗失败（超时）连续达到这个场数就停手退出，避免一直失败一直重试。
  const SECRET_REALM_FAIL_MAX = 3;

  // ── 跳过/重匹配风暴的护栏（v0.5.93）────────────────────────────────
  //  用户实测：「第一次缸体秘境退出后，怎么一直在点退出，不应该是识别了挑战券数量
  //  之后继续点出战吗」。
  //
  //  病因：秘境是**随机匹配**的。gangti/yinyang 在 SKIP_REALMS 里 → 识别到就退 3 步
  //    然后 `continue` 回去**重新点匹配**。若连续匹配到同一个被跳过的秘境，
  //    就形成「点匹配 → 识别 gangti → 退出 → 再点匹配」的循环，
  //    直到 matchTries 撞上 60 次上限才停 → 用户看到的就是「一直在点退出」。
  //
  //  更根本的缺陷：`realmForceExit()` 只点三步坐标 + 睡 2.5s，**既不校验退出是否
  //    成功、也不把界面带回秘境准备界面**。退出后若停在主界面/秘境入口，
  //    下一轮的「点匹配 (1183,617)」就是点在空白处 → 点空 → 轮询失败 → 又退出。
  //
  //  三道护栏：
  //   ① 连续跳过的**总次数**上限 —— 撞上就停手，不再无限重匹配（券没丢，可手动再跑）。
  //   ② 连续跳过同一秘境的上限 —— 说明匹配池里这个秘境占比高或识别有误，停手比空转强。
  //   ③ 退出后**重新导航回准备界面**（重跑 NAV）—— 保证下一轮点匹配落在正确位置。
  //      只在前 N 次跳过时做（NAV 本身要 17s+，不能每次跳过都付这个代价）。
  const SECRET_REALM_SKIP_STREAK_MAX = 8;     // 连续跳过（含非目标秘境）总次数上限
  const SECRET_REALM_SAME_SKIP_MAX = 3;       // 连续跳过**同一**秘境的上限
  // v0.6.03 删除 SECRET_REALM_SKIP_RENAV_MAX：跳过后不再补跑 NAV 归位。
  //   用户口径（2026-09-21）：「不打的秘境识别退出后，延迟2s，回到秘境准备页面，
  //   这时应该重新回到循环流程的第一步，识别挑战卷才对」—— 退出游戏做完就已经在
  //   准备页面，再跑 home()+NAV 会点到主界面按钮上（实跑 12:59:15 归位失败）。


// AUTO-GENERATED secret realm macros & templates (do not hand-edit)
// ⚠ v0.5.88：**NAV 不再包含「点匹配」**（原第 6 步 tap(1165,587) 已移出）。
//  用户口径：「NAV 第六步也应该属于主循环，挑战券读数量应该在点匹配之前」。
//  原设计的时序错误：
//    NAV[0..5] 里第 5 步就把匹配点了 → 循环第 1 轮再读券时，画面已在加载战斗，
//    券数区域可能已不可见/正在变化 —— 这正是用户早先反馈的
//    「第一次开始的时候，都没识别券的数量就直接进了」的根因。
//  现在：NAV 只负责「导航到秘境准备界面」，**点匹配统一由主循环负责**，
//    循环每轮严格按「读券 → 点匹配 → 轮询秘境名」执行，第 1 场与第 N 场走同一条路径。
//  → 点匹配的 3000ms 前置等待移到循环里的 SECRET_REALM_PRE_TAP_WAIT。
//  ⚠ v0.6.09：拖动已**统一为标准动作**（用户口径：「左滑 2 下 / 右滑 2 下
//    的目的都是一样的，让主界面跑到最左边或者最右边」）。
//    旧录制坐标 (973,299)→(12,299) 与 (981,312)→(117,296) 的**落点 x=12/117 贴左边缘**，
//    落在左侧图标菜单栏上被游戏判成点击 → 点进错误页面（13:50 trace 实证）。
//    ⚠ 方向（用户 2026-09-21 纠正）：「从右往左滑 → 把主界面拖到**最右**」。
//      原录制两步都是右→左滑，所以统一动作取 SCENE_DRAG_TO_RIGHT。
//    v0.6.27：拖动步**改为由标准件生成**（`sceneDragPair('right')`）——
//      坐标/y/速度/步数与其余任务完全同源（同一个 SCENE_DRAG_TIMES），不再各写一套。
//      ⚠ 步数由 2 增至 3：`dt` 是**相对上一步的间隔**（replaySeq 累加成绝对时间轴），
//        多出的一步会占用 1765ms，后面的 tap 会被顺延 —— 时序语义不变（仍是"按录制节奏
//        依次执行"），但绝对时刻整体后移，属于预期内的统一。
const SECRET_REALM_NAV = [
  ...sceneDragPair('right', 1765, 1500),
  { kind: 'tap', x: 614, y: 403, dt: 2499, pre: 2000 },
  { kind: 'tap', x: 79,  y: 329, dt: 5856, pre: 2000 },
  { kind: 'tap', x: 949, y: 531, dt: 4068, pre: 3000 },
];

// ── 拖动落点安全区（v0.6.08）────────────────────────────────────────────
//  用户口径（2026-09-21）：「我脚本从右往左拖动，落点太靠左边，导致点到图标了，
//    这个把落点往中间稍微移一点就好了，**拖动的落点左边不能超过 130，右边不能超过
//    1150**，如果超过的改到这两个值上去」。
//
//  背景（2026-09-21 13:50 实跑 trace）：NAV 前两步 drag 的**落点**分别是 x=12 和 x=117，
//    都贴到屏幕最左侧 —— 而左侧那条竖排是「历练/副本/组织…」等**图标菜单栏**。
//    手指落在图标上抬起，被游戏判成**点击图标**（而非拖动结束）→ 直接点进了错误的
//    二级页面。trace 实证：两步 drag 之后 scene 仍是 home，然后 NAV 第 5 步
//    tap(949,531) 之后 scene 变成 other ——「明显点错了才进去的」（用户原话）。
//
//  实现方式：在 replaySeq 的 drag 分支里对**落点**做钳制，而不是改死数据。
// 拖动落点安全区常量已上移到 GameOperator 之前定义（见文件上方 SECRET_REALM_DRAG_X_MIN）。

const SECRET_REALM_MACROS = {"leiting":[{"kind":"lead","ms":5000},{"kind":"key","key":"j","hold":677,"dt":0},{"kind":"key","key":"i","hold":1392,"dt":964},{"kind":"key","key":"o","hold":1357,"dt":1450},{"kind":"key","key":"k","hold":3878,"dt":1982},{"kind":"key","key":"j","hold":1715,"dt":4001},{"kind":"key","key":"i","hold":649,"dt":1851},{"kind":"key","key":"k","hold":0,"dt":806},{"kind":"key","key":"j","hold":505,"dt":1306},{"kind":"key","key":"j","hold":134,"dt":1022},{"kind":"key","key":"k","hold":147,"dt":520}],"lieyan":[{"kind":"lead","ms":200},{"kind":"key","key":"s","hold":155,"dt":0},{"kind":"key","key":"j","hold":131,"dt":464},{"kind":"key","key":"i","hold":1423,"dt":1099},{"kind":"key","key":"o","hold":741,"dt":1584},{"kind":"key","key":"k","hold":7031,"dt":1815},{"kind":"key","key":"j","hold":331,"dt":7264},{"kind":"key","key":"i","hold":839,"dt":1079},{"kind":"key","key":"k","hold":9484,"dt":1107},{"kind":"key","key":"j","hold":733,"dt":9850},{"kind":"key","key":"i","hold":27,"dt":951},{"kind":"key","key":"k","hold":927,"dt":282},{"kind":"key","key":"i","hold":1209,"dt":1098}],"luoyan":[{"kind":"lead","ms":200},{"kind":"key","key":"d","hold":0,"dt":0},{"kind":"key","key":"s","hold":221,"dt":1069},{"kind":"key","key":"j","hold":0,"dt":927},{"kind":"key","key":"i","hold":0,"dt":68},{"kind":"key","key":"i","hold":238,"dt":567},{"kind":"key","key":"o","hold":2472,"dt":364}],"yinyang":[{"kind":"lead","ms":200},{"kind":"key","key":"d","hold":0,"dt":0},{"kind":"key","key":"s","hold":497,"dt":1385},{"kind":"key","key":"a","hold":81,"dt":1080},{"kind":"key","key":"j","hold":0,"dt":167},{"kind":"key","key":"i","hold":0,"dt":55},{"kind":"key","key":"i","hold":474,"dt":609},{"kind":"key","key":"d","hold":0,"dt":546},{"kind":"key","key":"o","hold":1352,"dt":56},{"kind":"key","key":"i","hold":507,"dt":7158},{"kind":"key","key":"j","hold":1164,"dt":639},{"kind":"key","key":"k","hold":2306,"dt":1754}],"shuilao":[{"kind":"lead","ms":200},{"kind":"key","key":"d","hold":1745,"dt":0},{"kind":"key","key":"a","hold":122,"dt":1841},{"kind":"key","key":"j","hold":0,"dt":854},{"kind":"key","key":"i","hold":0,"dt":72},{"kind":"key","key":"i","hold":405,"dt":541},{"kind":"key","key":"o","hold":2097,"dt":573},{"kind":"key","key":"k","hold":5057,"dt":5360},{"kind":"key","key":"k","hold":782,"dt":5443},{"kind":"key","key":"i","hold":594,"dt":980},{"kind":"key","key":"j","hold":500,"dt":794}],"dufeng":[{"kind":"lead","ms":200},{"kind":"key","key":"d","hold":1201,"dt":0},{"kind":"key","key":"w","hold":395,"dt":1706},{"kind":"key","key":"w","hold":200,"dt":2460},{"kind":"key","key":"d","hold":330,"dt":3090},{"kind":"key","key":"d","hold":263,"dt":4363},{"kind":"key","key":"j","hold":0,"dt":6543},{"kind":"key","key":"i","hold":0,"dt":6607},{"kind":"key","key":"i","hold":347,"dt":7172},{"kind":"key","key":"o","hold":1529,"dt":7682},{"kind":"key","key":"i","hold":956,"dt":14073},{"kind":"key","key":"j","hold":1116,"dt":15139},{"kind":"key","key":"k","hold":3528,"dt":16339},{"kind":"key","key":"i","hold":545,"dt":20388},{"kind":"key","key":"k","hold":0,"dt":21075},{"kind":"key","key":"j","hold":899,"dt":21657}],"gangti":[{"kind":"lead","ms":200},{"kind":"key","key":"s","hold":0,"dt":0},{"kind":"key","key":"d","hold":244,"dt":193},{"kind":"key","key":"j","hold":0,"dt":422},{"kind":"key","key":"i","hold":0,"dt":77},{"kind":"key","key":"i","hold":526,"dt":588},{"kind":"key","key":"o","hold":1470,"dt":713},{"kind":"key","key":"k","hold":2447,"dt":6294},{"kind":"key","key":"k","hold":453,"dt":3907},{"kind":"key","key":"k","hold":337,"dt":724},{"kind":"key","key":"j","hold":0,"dt":1531},{"kind":"key","key":"i","hold":0,"dt":262},{"kind":"key","key":"i","hold":32,"dt":543},{"kind":"key","key":"d","hold":0,"dt":701},{"kind":"key","key":"i","hold":87,"dt":214},{"kind":"key","key":"i","hold":115,"dt":195},{"kind":"key","key":"i","hold":69,"dt":214},{"kind":"key","key":"i","hold":101,"dt":168},{"kind":"key","key":"d","hold":0,"dt":478},{"kind":"key","key":"k","hold":0,"dt":34},{"kind":"key","key":"k","hold":5077,"dt":584},{"kind":"key","key":"a","hold":1099,"dt":5282},{"kind":"key","key":"i","hold":567,"dt":6837},{"kind":"key","key":"d","hold":0,"dt":686},{"kind":"key","key":"w","hold":0,"dt":70},{"kind":"key","key":"i","hold":0,"dt":280},{"kind":"key","key":"i","hold":78,"dt":583},{"kind":"key","key":"j","hold":571,"dt":564},{"kind":"key","key":"o","hold":535,"dt":1802}],"gangti2":[{"kind":"lead","ms":200},{"kind":"key","key":"a","hold":0,"dt":0},{"kind":"key","key":"s","hold":214,"dt":51},{"kind":"key","key":"d","hold":128,"dt":447},{"kind":"key","key":"j","hold":0,"dt":162},{"kind":"key","key":"i","hold":0,"dt":53},{"kind":"key","key":"i","hold":300,"dt":588},{"kind":"key","key":"o","hold":2148,"dt":514},{"kind":"key","key":"a","hold":0,"dt":6114},{"kind":"key","key":"s","hold":242,"dt":1159},{"kind":"key","key":"j","hold":168,"dt":611},{"kind":"key","key":"d","hold":0,"dt":259},{"kind":"key","key":"i","hold":352,"dt":172},{"kind":"key","key":"w","hold":0,"dt":1095},{"kind":"key","key":"i","hold":0,"dt":114},{"kind":"key","key":"i","hold":533,"dt":586},{"kind":"key","key":"k","hold":1303,"dt":1006},{"kind":"key","key":"d","hold":0,"dt":1757},{"kind":"key","key":"o","hold":77,"dt":126},{"kind":"key","key":"o","hold":76,"dt":153},{"kind":"key","key":"o","hold":65,"dt":172},{"kind":"key","key":"d","hold":0,"dt":434},{"kind":"key","key":"w","hold":32,"dt":45},{"kind":"key","key":"w","hold":0,"dt":1190},{"kind":"key","key":"a","hold":0,"dt":472},{"kind":"key","key":"e","hold":119,"dt":228},{"kind":"key","key":"e","hold":67,"dt":342},{"kind":"key","key":"s","hold":0,"dt":3163},{"kind":"key","key":"a","hold":0,"dt":114},{"kind":"key","key":"j","hold":128,"dt":612},{"kind":"key","key":"j","hold":334,"dt":203},{"kind":"key","key":"k","hold":1722,"dt":1300},{"kind":"key","key":"i","hold":91,"dt":2015},{"kind":"key","key":"i","hold":89,"dt":170},{"kind":"key","key":"e","hold":35,"dt":1191},{"kind":"key","key":" ","hold":56,"dt":187},{"kind":"key","key":" ","hold":60,"dt":188},{"kind":"key","key":" ","hold":65,"dt":186},{"kind":"key","key":"i","hold":294,"dt":339}]};
const SECRET_REALM_NAME_TEMPLATES = {"luoyan":"data:image/jpeg;base64,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","dufeng":"data:image/jpeg;base64,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","leiting":"data:image/jpeg;base64,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","lieyan":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAyAKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8+jrsg6k/nUv9tReh/wC+qs32l2I+7GR+FUriPS7f74Ncyirn3LpxZopK79Wx+NLMj92H4GsG+1N7ZPNkukRO5ZsYrGf42+BdI/5Cd87/AO4c16yqRseV7Jo74qw52Njy9xPGB+tYs/xH8EW0rW8utRB1/h3da4HxD+1DYT6bcwaZo0fkv+7gw3L+47141rWs3EMw1PWdOntTPsMYkibBRv4gSBnHpWX1yFOoqbspS2Rg1NvU+rIfFHhe5mSK21uBi3+1jFW2uYE+WS6RW/ulhXzz4J+DPx7+KXh64+Ivwr8FajfaZYQ+bcNBHllj7tgHkCswfEPxRdQXE2s6jKktrJtl5Iwa8/D5phoYl0oTUnHex01ElsfT1pcWMb7rm5jT2dxVlNR0qV0SO7iO7qTKBivBPgX4R+K/7SXju0+HPwluLW51K7TfGt3IwXaPv4Pcj071qfHL4a/H79lLx7J4F+Nnh62juW/1X2WQsTn7nHHX68Vnis7wNHH/AFN1EqvLz+zv71jpoU5Ro6K57Wk1m/8Ay3h/7/CmNLbyHb9rh3egkzXz3B8SNRyCDb4/iBJ3A+gGea1/Bo+KPxg8S2/gH4SaJeX+uXPEVpbxF2B9DjpWn9s4enSlOrLljDdnr1cupUVvc9rt1jeLzfPQj2alDK33ImNeKeI/Enxe+Bfi28+FHxc8P3Nhr9hzdWMseGjX1OeK6PwtqPx71f4dXHxZ0r4d3F34dtHdbnVIoG8uPb36dPeoqcQ5bQhGpOquWduV6W97bXqSsDCtTutz0jaFP+swPXdUkEaMm/zAT6bq8em+OutXOlpcWtsjBupz0/Sqsvxs8XaBJDJq9i8KXH+peSMhHx9/DY52/r7V2/XISrunK0bba/F6HoVsnjSo3clc9uJTHDjJ6D1pFMb/AHW/NsUv7LvwM/aQ/bT8L634z+CtnZGLw1Fm5t7tthuX/uxHHzfWuHg8ceJbXVb/AEPxNaxWt7pl29vfWrn543X2rz8BxTlmPzCrgaUk6lPc+d/s6r7WCWzO5AB6yKPxqxBGf75/75rk9O+IyW4zd20b/jj+lWoPiRblN6p+Gf8A61e19Zh3N55VXqfEQXGrTy9SF/CuT8eeIJNMt3uFDMF/ur1rWvbttm9F/DNcj8RfFiaPpL280GWbuy14UqkpfAGIbh8J5J448beJNUee1bVXRW6Kp6Vy2mxskm2aeR/99qsareNfag1xGmA38OelRbcPvBx7V1U6k5bs8r2s+59Of8EnPg/8MPjV+0xL4O+Jnwc1LxDKq/aLW4tbnZa2UY++7KVwyj13DPtX0F+3t8LPH/7UP7VfgP8AZk8LfAWbw54GTWk0+21yLSTE9zbp9+Ziq/KB9T9a4j/glR8Qf+E7a8/Zvg8IjSLe6lTUNf8AHdtNgWsD/fjlkAUwof7mT9a9J/4KZft/fEv9mb9svwR41+Eup6dqHhnwpoPkaJHb3RlS5B++ZfmOWb17V+H51LO8T4kuFCN5woz5U2+VNbT7X8novxOqGHi8B7VvU6L9iaytf2bf2s/jt8H/AAorTeG/C3wt1E2WnucjzV6Ng5wa/NSO/s/GPxBtz4rYwaNeat/xMfsyfcX655/SvsX/AIJxftDeKv2hf2hvjT8SPF/lrquv/DbUnkjhTYqe3uPfAr4l0fw/d+M/Hdv4Ts7qSGOa7dZhGrHle/y5r6DhvB4nCZpjI4zSpGnScpLu4vmf3mHJOUacnsz9VvgR+wb+xj+z1+0n8PvF3wa+NereJtXu5RdQaZoLiRIR/wAtTM2fkHtg16P+3npHww0X466tc/tC/s6anr/hTWkjbUPGFmPtJtM/d2Kq/utn+9z7V4z/AME2rPwx8Avix4Y8L/B34d+K/FOp6s6Qah4q8QW728FlE3+tNusqD+de/ftE/CP9q/4f/tNw/D/9lTxCt9pPiaOdPENr4vkWa0iH8JCs3H6V+CZxiMXS45p08TipSl7Ga55vkbinfSUdadunNzXPpqMKuHwd6dNI/F3xXbaToni/VdL8FXb3Gk2185sbq7+SQor7c9/rX3F/wQv8S/EjV/2g7Hw14F8A2hskn83XvEFxCBLCvs/NfKv7TfwA8Vfsg/tPJ4G+LWnLqVvZ6s8ksdmfluYjN91ev581+oX/AATa/aC+GI8Upo3w9+AVt4I0HWrOa2lt5JMXkwjTd9oKlQUjPTPOK/ZfEbOlDgCX1Kn7aFaF3O+qffpr2033PLwtW+J5Kmx5ZB4Y+Cdz8d/j38X/ANoXxHo/jjxh4G1WaPwz4SuJS8d9bx9Gdu+7+7zj1Navjf44+JfAn/BJJ/iHrfhqx0i88f3j2mmaBZRLHDb2Z/jbjr+Ar1Xwz+xb+ybH+3rpfiv4fajfa1o3j+wFxqdhcsWS3uu6uSBvB/CrH7Umv/sq+M/jjpf7Lfi7we9x4U8G+XbvFaqYreyRuslw3PT0xz61+NviDL8wx2Dw1OFWrFezqvS3JCnFRcLK32+u7PYpQjQon5DR2ms3Hh6DRNDszNfX8u2ztkHzP9AcV+h3/BUn9k3w94B/4JifDjxPPZaRo/iDQ4YX1W3knC3EzSpudE4zIT07V8nfGn4kfCj9lz9vv+1f2WryD4g6RaPANGtNYtvNW2uJOsJwfn2+uBn0FfZX/BW/9ojwbo/wM+GGt/GfS7bUfFU01tfS6AAM27rD1MfZCeOa/WOLMzznF8Q5C8InGlNuVvtuNr2knsu7OKpW9thqkZS1Wx7f/wAEtPF/grVvgZo3wr8Gw2kUR0v7TrPirQLE28Bl/wCeaOScyf7Nfn/+1v8AsS/tO/Cj4veNfi9ofwm1O/8AC091NeT3El/bySvCPvzAJIzcemOfWvoX9jD4LfHDxTpsPi/4XfE/UbTTLmSO/wBA8JQae8NpAjdZZTwMj6c+1ebf8FofE/hrQ/2ivCeh/CXxdcx30mhzWXiyOG8OI2P30ZIyq8+vb3r4vhKpPA+J2Ijgq0ZOunzR95qHLq7t2s3t27HpupGGEpTl8fc+YND1Marotrq7bh9p6x/3Px71vadDcoux48+9clYNd6VHFbxKpii6J0rrrfWzcJvgtSfbP/1q/pOkr7no1KqVHmW5pyKypsYZrkPiD8Pbzxkf3ep+SPT739RXayPC/wDFTNsY+7Eo/CiNVQ2PlK9Jy3PmTxZ4U1bwpq7adewMrD/VsFyG/wAKy/OToevpX0v428MaJ4i05oJUUSH/AFcpTJX+VeD+NfAWq+FLzzZrbzIv76CupVbLQ4q2BnR8z6x8L+FP2q7n4FaJ8DP2Wv2WtU0Gy8S2cN5rPiq5gUS6pF/01lLKAvtXLv8A8Eif2tNc1PTbH4reKPDuhX2sDyfDGm67rYMuqt6Qc4I981i+Mf8Agp5+0Xr/AOzTY/s0RWf2bT7C2SGHU13JOIV/5ZjBBH1z+FeV+Jv2hPjR8RJNDu/GHja+vG8Np5ehFrhj9gT0iOcqffJr4DB4DiunOU4OlRcnJ3tKctdtZN77W2S2OaEqcaHspSZ+lf7Gf7NPwf8A2cfHOrfCv48ePNG0b4v+LvC97o9jHbTL9kSGSPcN+DgHPy18J3+gfHf/AIJwftiXGi3nhOK+1a1ne4trb7GJ0ngfPlyBCDjd6ZOPevKNa+J/xC1/xXP468R+I9QvdUmdGOoz3BaZAGyQrdVyOK9K8fftrfGr4kfEez+IM2o2U2q2VjBaQ3V3bhpPLi+6Cx6/lU5bwzneBzCvialb28K1JKrF6csltyta212PVr0oQy+MVuj9M/gh8WJ7wj/goB+3Bqlt4As9A0hD4Y8CrdGM3+PvukGSW3ehAx6mvPviTpOk/wDBTbxdc/tC/sZ/tVXnhTxOkkajwtrep/YhJt6lQWPX6V+c/inx18YPjLfTav8AEfxNqOrXtynl+XM5MaR/3QDwPwAp3g7wN480i5h1Tw1qFzp1zBJujnt5mWT8W7/lXz+D8NPZVp5hTrqOIStBNKVJRe8bS96V+rbOrDS54Wk/d9T1j9pz9n//AIKOeHdRt/i3+0f4C1HUhocfl2mryx/aIQd+7ezKPmFdD/wT2+M3jb4y/t0H4l/Fbxja2V23he/hYu3kWu1Y9ojEecKD9a5if9oX9vO88Of8IVffG2/bRprb7NLZ3t35kRi9NrDr71xWmfBbVrGf+0LPVkjm2MnmRSbW2t1GQa+ro5TmVfKq2BxipRco8sfZ3at6PQxhg6c8ReLPsn4cf8FhL/4J/DzRLT4i+FLDWdV8NHOhahp0iiW5PrKRGc10XgzxL+xV+2D4+ufjZq37TEfgLUNf06SLxj4W1jUCWv3bo+4KoXHpg18NWfwDllnH2m42Y6CN+n0q7H8HfDum3UaTIJPLk3AOAQR6HjP614K8Nchi518NVdCrO6bTb0bu1Z3S11026HoScqc+Spqij4suNE+DP7Tdx4l+B9/pfiTTvCurGfRdUa33x3L9mlB+/j0zXVfC/SbD9rn4ra38fv2t/wBoHTdLh0Wdb2Sy1KVt9yyvu8qBf+eeONoBp+nfDPRLGy+z2sEaofvR7RtY+uBSD4W+F7ss09n5rt90tj5B6DIr7qWRQxFBRhVtWUeXnsrqPWz6X8jyaeGpSbdtz680v/grxp3huaX4R+H1i07whcaLJoWleJHgZBEzdLhyCC8Y9ePwr55H/BPj463vhzxx8aviH400a8t9HtXv9K12LxJb3Zu3b/lm/wA6sfrj8K5WbwFodzbCxubSO4hCbNsw5C/3R2C+2KzYvhnpdm7pYO9vbypsmtUdtjr6EbsfpXyOE4MwXDvtP7NahOpbmdrt283qvPudsKdfE0ld3tsZnh7TI9QsrW7myTcx7in9z2967bS7GG3TYIV/EVTtNMtbKGKGBMCKPaOKuBbwpvhG6vuaFXQ6nHFuNm9CLA9BS0UVkc1Xco3IBmwRTL+ztJ9IPn2sb/76A0UV0Lc36HkHxgtbaKyBit0U+d1VAKwdDhiGm5ES9P7tFFfRLY8Ov/vRYEUbSlWjUj0Ira8NafYSXBZ7KFj6mIGiivEwv8Sfqd2L/hHqHgq3t1s4mWBAfUKK6pooll+WNRx2WiiuCt/yM4Cwf+7GTqiI9pIHQHHTIpdMRDDyo6elFFc+B+CBWC/jF/SOZjmm6oiG85UflRRW8PjO2p/GNO3VfJ+6PypoAW8wAB9KKK9Kn8BxUgKq3VQfqKzLzrRRXnYn/ej1st/gkdaem8RcUUVlR3PQP//Z","yinyang":"data:image/jpeg;base64,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","shuilao":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAyAKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD41nFz537ts/hU4v7yL7h3VoaxpbRPvg49sUyxsBCqm4BLN1UL0r7aikj8h5pDNIu5X/1isPwraE6hNijFUri6srGB7q5nSGOP/Ws4xtrgte/aa+FmhI27W/Pdf4YeaiVanT+JnTQwlWttE63xAlq0f2p3CqE3H0HtmuNvviB4L02Rjea5DHtk2AO+Mt6VwGvftcadrF6+mQ6eINMmTb50jYKfhjn86n8U/sA/tGfE39n9v2wvhFp1vrXgu0LLeiCfdPHIqbi+zqfTFfOZtxZk2UpLEVeVTlyJvbmPfwfDeLxVSyZq+NPitomp6T9i0jxDCW/ub8Vg2PjAjS/KXVEDeu+vmu31W4JJedgwfaDgjn39KuR61qFknmT3smOwV85PpXLPFVpx54rT1PXhwtUp7s+g7/VtNks/N/tOMn+83/1s1FYai0M2TcoB/ttgfnWH+wj+zT4n/bR+Olv8G7f4hz+HGuIHkS4itTOCV/hxuUfiWFM/at/Zy+NX7FHxjuPg58UbgXUUKb4dSjOYp0/vLgkmvAlxRk8s6/suVZLE8vPy/wB3+vmdP+qONVD2i1R2p1GEx7HmRz6rW/YxJYJvaRfzr54sPGesqSLK4YkdQx6fWuh8AXHxo+LHi22+H/w50K81nVrnmO1t85K+oxmvSr42nRh7evJQp976GX+qOI5uW+p7xPf27W2xHQ/jXHa9Z3kt5uSDcn94GvNvHOqfFn4L+MLz4efF7Rb/AEPV7Jgr2N1GfMc98diB65re8MeFv2ofE/w6n+NehfDLWbzwjbTCOXV0tiEB7kew9c1zSzfLYwVSVZKnK1p3XL721u5VPhTHvdnTWQuuhhcfgP8AGrUxPksSMbP1rzlfG2pnT/7SFwgj2bsqpP8AWi2+I2tWFit/rttNb21zH5lvcXEZVZE9V45rWWMoQkoydnLY0jwbjZw51PQ76zvFgeR1xJ5fXb3+lUtZSWeV7qMhCvTJ611n7Hv7F3x5/bh+HPj/AMffDPxdJC3hGDfp1i1oQb5/7gbcNv1w30ryOy1jX4rqXw34mLC+sZ/JvIFzuST+7ggVwYbPstx+OrYKhUTqUfiXUiXB+LpxhN7M6UXaiH5Tg+uah+3THuSPTNUfNfZs3fjUtrOqHDjNel9YiYLhzHReh9e31kjPsIz74rkviV4q1Twho0r6N4curu47LGnT+dd0QrPvHze1cP8AG/4paD8NfCrX2p6XM8z9DBk19zOqoUbxPg8MueraSPjv4i/G/wCLuraveaD4g1B7Qu+2SBvlrhV3KjhbjDt/HjpV74g+Kbzxp4vutccEtcybgGT7n+NYvmLHeQQXEwSKWfY83XYn9/Hf6frXyNarPebufpOBwlONK6RoaL4S8efEHVpfCvgvwpqWs34g80wadAZmRf7xAxhf9r9K/Y3/AIJl3nxI8Ff8EZPG+heH/C0t54jj1G8trLTLm2ZpHeSFMHZgYC7+vfHaud/4I2v+x/4A8V3mi/AnTbnxXJZaGl74y8d6zbCKC33Ju+yAHd8nbO78K+q/2fPjNYfHb9nD4m+KfBGs6foNs/i25sNN1GzaKOOGNUhUN1AJPXtX8meMXHGOziTyuGD5KeGrUqnNJtXbe2muva97an6bkWUYPDw+sSqf9un56/HD/gjl8HPh3+y/L8R/F37Qen+G/iOun/2tNpGqagiJKP8AnjgE7G98H6V8ofsH/AFfj98Zi3jKwMvhTwhplzq/ie4RcIIIk3BVb+It09verv7df7Pn7YHwr+LOoz/tFtq2pwX83m2Gr+a01ndJ/ssCQB7VY/4J1ftg6L+zN4x1n4ZeM7T7V4O8bac1hr+yF2ljLJtLRHYSR328fWv1vLIZ7S4Pq4mGMWLqyV4qKSjFW1S6u3S/b5Hl1fq9fMKdGpD2cXu7tn2F+z7qmrfs/wDw9g/4KD/8INd6d4Siu5ILTw/4S0RYhOrvtjkuHdySjeoUV9Gav461n42/GGy8e/tO/sg+EvCvgubS0mvPGXi7UFkwrJu8qH92Ppn9K8T8Z/txJ+1dD4U/Z6/Z6/Y58Wa/8J9H8hL5orR4I7t4n3LvfYMp224/GveP+Cl3w3/aA+PXw70f9lr4a6B4P0HStUsYWmutc1aKG6tvk27I1Z8e+c/hX8/51HE1s9oRzCiqVeuqkXUdT3qNBWtpF61F/eWp9Xh1Sp4eccM+eK7nwt/wVu+GX/BPbwXYQ/FD9kD4raa2uCdFvvD9pMZVmRv4wRgL9OfrWp/wQp1LxbqXx2tbD4ZeD7QLFZPf+LPEuoW+RbRL/wAsYj/AffP4V4z+1X/wTg+JX7BmpeE/HPxf1DRfE3hu4vkS+tfD9yp83b/yzCvyc+ua/Rr/AIJ6ftM/DC5uv+EX+G3wEtPh94Y1o3IbTr+IRahchU3+awK7kh7Z5Fff8S4/+yvDZ4bL6s8dCXMlWk7cttk4q0nbovvPIw9CVbNf30VTXlqeGx+E/gXq3xz/AGgf2jf2hfElp8R/EPw6ubn/AIR7wxDcgwvYt0PQlmH0rpvE3x98S/C7/giTJ4g1ewg0aXxnrM9v4d0SBAPKtXzjnAD7drc8ZwOmePQvBf7E/wCyf4R/bb8PeN/BY1O80v4l6a8uo2d1PmJZGyfKkPRm2qzbcDoB3yH/ALXPi/8AZR8YftB6R+yj4x8BXF34P8DP9im0q0XyrDTjsDefK3IX7qjbnseeePh3xDgMzx+FwtKFWrGHsqslayUKS5XBRT5fj1vuz0I4edOleTPyPs7cXOi2Hhbw5Kt5e6lIkFtbwnczM3tX6Cf8FN/2NNL+Hn/BM/4ZeINR1DS9H1jwlawLqKX0wjmuDIm4wJgEyyL0x39q+W/jF43+CH7Kv7c8Gpfscw2njjT18hdMt7yEypb3ndF4PmY9cCvtb/gsX8ePCPhf4G/CPxD8TxBqfjVo4dQvPChj2qkkkP8ArmjO7a6njBHPtX6vxPnGc4jiDI/qkXGlVbk1Zc7ilezT2S7nlUXCOEqU09Vse+/8EmPEPhPX/wBni3+EPg1oooptB+1ax4n0CyFrEJv7gck+a35V+cf7bn7BH7QPwY+KfjH40aD8MdYbwDLqX2h9S1G+t5Zcf3gInLH8q9+/Yj+C3x+8UajB458D/FqfT9JeeO78OeGbezkhsIQ3VpnHybR6Z5rzr/guF4h0W3/aM8KeCPD3i+a3uB4dx4osrK9KxGb+7sjbbu9q+B4Oo4jLvFTE08vrxqQxKftPi91x77Wb27LoepiZP+yoqeklsfLGk3H9sQpcWygJJ/qyzdatvpdy/wBxxWdFHawWyW9pG4Cf6pQMVes9Wt0TfMs30CZr+oaVFy3ifP47GVsNRvFJn6C67/wTR+O9hb/abXxldOvojZP868k+L/8AwSr+O/j9ooYvHWp4j62xgYhv+BZ/pX3j4b8ffEa1nzFr0zf7Uj5H5YrpNQ+JvxSa0UjxNOC3pGuR+OK/R3RpyjZrQ/m2nmGOpy5owR+FPx//AGOvi9+z1q0tj8R9BurQRybVmMRUSj1T1rzey8H6e+vaW/iXUFtNLe+/0q4ILFIPXbxn86/b79pn9mqf9pbwDe6Z4i1qSW5mg/dXFywLQH1QcY/Ovys/aL/Zk8V/s/eLf+ET8RI1/BNHlLhFLRFf7vQ/nXz2Z4Hmo3hpc++yPiCFaHJU3PqvVv2/v+Cfvwu+Er/sufs26dqmm6T4mhS08V+OrK32P8qbfMxgE567cj617z8Vvhh8J/2cP+CJnirSfgb8bI/EdpqtxFJb6qkkaTTXzbMxhBkq/wAnTJ61+S8Wn6ZbvJZXmm7yvIOwE59eMD9K0LW91Q+Ff+EMbx1qA0ZL5LqDSJbtmgSRf49oxl/9r9K/D8x8J8M6tGeFxUlGNSNSope/7SUdtZa6eVl5H6XQ4goxlzNXZ9Gfsd/8FNfi78DvDJ+FH7S3wib4m+D7j5Wj1CEXElqn92N2BK/Wrmr/ALY37JXw8/aG1T4ufAD9i+21XT77TtsWmalbttsrj1RDn+lfOFpq13aFlFwxUfeXccN+Rp9m+y7WWC5dJJOZCrlSW9cjNfTPgDh6tjqlakpQVT4lGU4xf/bqaS+SMIZnOnFRctFtdI9S+IP/AAUH/bc8eeLNL0rw94kTwXpd/qKNbaToyraQxBuzFQM/pXr3/BaxfG+ofHr4eada+KZFv4fCMAvPs93uKTf3iy4z9MV81T+BPFnxAso44NNurhvk8uYRMShXuOleleGv2Xv2h/EN2vivX01PVbuOBIlu9YLuVVfr/jTjwDgaWcYXF4OjCFOmpJpRV2pKzu9xRzejGi6dWrvvay/I8z8QeGP2mtaaxGseKdQ1f+y5/O0+21K6M6Rv6kSbt36V7t+wxrfxg+IX7ec3jr48+Krexvv+EQv1RpZRb24CpsESqSQAetT6H+yt8Zpp/tE+rLE3+3LXQt+wFf8AjVP7b8TeMZ1ljRkM1m8gdlbqMgCvfzbhXD5nlmIwVGChKaaTSto97WPNXE2VYefN7Rt/ea/wo/4Kwav8N/hzoieJvA9l4j8QeG0+yeGLPSE3STLwPtUjBT8+xVXGOxOea7bwLdfsR/thfEKf4x6h+04vw/fxHx8RPAPiuYQNNJs24HzjPr2ryXSv2CfC/gmMz6HrUtnctHsa4t22vj2JJxVy3/Y2+FUWqRaz4ngXU7k/NJJcwI29/wC8eMn6Zr42t4RZZSqSeCrPD13dOS1Vm7tWldb67adAqcfZfGPLKdzwlvgPrHgT9qDX5P2T9TPjDTPBusyXvhvW4bfzreV26bmx2/GtT4f+AB+038VvEPx0/bU/aOg06+0a6Mv2G9YtJMN+4JGrFdoA44Br6w+F3ha0+EthLpXwx1Q6PbTybpba1jVUb8KueI/g78HvidqkWt/EvwhY6hdRf8tXtlTf/vAda+0rcJTxGB5VWtiOXl57K9uqT6X62Pm48cYfD4h3heLL3gv/AIKL+KtNuYvDE3ww1Lwj8K9V8PyaF4Z8R3FoYVkun/1czjhSPbH418uaf/wS4/ag8Y+HvFfxZ8R67oV+sFz9v0zXV1+O7lnf+5tVywH4Gvq74gXXhnxj4NtPAPilTf6HpR/4luluoaKLH3CAMcr6968dX9l/4Sad4sXxVoTalZzp/wAsrfVJkhI9PLRlWvnsP4YUMhryrZPONCVbl53USk5cvXTa/Wx01PEZ4yE4YiN0tun5FvwJ/wAE9NX17wtZ6vqGkBXb7w85f/iq63SP+CYXj66wmleDRLGfvSmVcL9eafZ3k9hAmn2Wp3KxJ0UXDf410Wh+NviJpunzaZY+OtSSG4/1w+0MSfoc8V+p4bDUoQ5Zq8j4bE59mtSNo1Hb5H11a2doum5W1jB9QgqC9VcRjaPyoor3FsfPrYx7mSQ+apkbHkdM15J8QtD0TV5rVdV0e1ugIOBcW6vj8waKK4cV/u535d/vB+eH7Yug6HpfiqVdM0a0th6QW6p/IV4XbAGbkUUV81V/3eifouX7D9M+aWVG5X0PSvb/ANlzRdH1Awtf6TbTn1mgVv5iiiqp/Cb4g+1vCOlaZZ6dEbPToIv+ucKr/IVq+IJ50025jSZwv90McUUV30fimfFZh/HH+FlWT/WKG/3hmu/8SRxwabKsEaoPRBiiiuuX8OB5UDx/xx8s2F4+lZ0IAWLAooqV8RzQJrMA3RBGaTxAAmdgx9KKKylsay+Ey9RVVgj2qBnrgVBCSYsk0UVvR/5dEv8A5eD7QDzulbtiB6UUVc/95Ihsj//Z","gangti":"data:image/jpeg;base64,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"};

// 秘境名区域（战斗界面顶部中央的金色「XX秘境」）。
//  实测（vision_describe 对战斗帧测量）：文字本体 (575,20)-(705,55)，四周留边距 → (560,12)-(720,62)。
//  ⚠ 格式为 [x1, y1, x2, y2]（与 vision.findTemplate / findTextRows 的取法一致），
//    不再是旧版的 [比例x, 比例y, 比例w, 比例h] —— 旧版换算后几何含义不一致（见下方 identifyRealmName）。
const SECRET_REALM_NAME_REGION = [560, 12, 720, 62];
// 点匹配后等进入战斗的时间（覆盖：加载 + 弹窗 + 顶部秘境名渲染）。
//  录制实测：点匹配 → 首个按键 4.8~6.5s（8 份），罡体含弹窗 8.6s。
//  ⚠ 这是「点匹配后」的**总等待**，不叠加在 SECRET_REALM_MATCH_WAIT 之上。
const SECRET_REALM_NAME_WAIT = 7000;
// ── 按键 → 屏幕坐标映射（秘境宏专用）────────────────────────────────
//  ⚠ v0.5.92：**已废弃、不再被任何代码引用**。保留仅作校准记录。
//
//  废弃原因：v0.5.86 曾判定「宏不能发键盘事件，必须映射到屏幕坐标点按」，
//    依据是「云游戏实例下键盘通道能发送成功但游戏无响应」。该结论**部分正确但不完整** ——
//    真正的情况是：SDK 的 `pc.keyboard.sendKeyEvent/sendMockKey` 确实无效（直调底层、
//    绕过了页面按键状态机），但**原生 KeyboardEvent 派发到 window 是有效的**，
//    而且支持多键同按（v0.5.92 真机逐项验证，用户确认 S+D 同按出斜向）。
//    坐标方案的致命缺陷：`_domDispatch` 发的是 mouse 事件（pointerId 固定 1），
//    第二个 pointerdown 被当成同一指针移动 → 用户实测「按键弄一起，另外的按键会被吃掉」。
//
//  来源（两处实测互相印证，差值 6~9px 说明都可信）：
//   ① 2026-09-13「键盘按键.json」校准 → BattleAssist.PLACES（a d space j k i o e r）
//   ② 2026-03-19 用户新标定的 WASD 四点（naruto-calib-2026-09-20T18-49-46-822Z.json）
//      W(219,466) A(135,548) S(217,634) D(303,549) —— 标准十字，中心≈(219,550) 半径≈84，
//      与既有探针 battleStick.area [190,520,280,610] 吻合。
const SECRET_REALM_KEY_POS = {
  w:     [219, 466],   // 摇杆上
  s:     [217, 634],   // 摇杆下
  a:     [135, 548],   // 摇杆左
  d:     [303, 549],   // 摇杆右
  space: [855, 634],   // 替身
  j:     [998, 633],   // 技能1
  k:     [1137, 589],  // 普攻
  i:     [1023, 496],  // 技能2
  o:     [1149, 430],  // 大招
  e:     [1153, 279],  // 密卷
  r:     [1151, 175],  // 通灵
};
// 点了之后保持按压的时长上限（防止云端卡在按压态）
const SECRET_REALM_KEY_HOLD_MAX = 8000;

/**
 * 键名 → 原生 KeyboardEvent 字段映射（v0.5.92）。
 *
 * 来源：SDK 模块 `22744` 的映射表 `KEYBOARD_<NAME>`（207 项）实测取值。
 *   sendKeyboardData('KEY_W') → KEYBOARD_KEY_W = 87，与 ASCII 大写字母码一致。
 *   旁证：录制 JSON 的 key 事件自带 (key, code, keyCode) 三元组，逐条核对完全一致
 *   （tools/check_keys.py，10 份秘境战斗录制）。
 *
 * ⚠ 必须同时给 `key` / `code` / `keyCode`：页面的按键状态机用 `key` 做去重数组
 *   （`kd.indexOf(n)`），用 `keyCode` 做云端上报。缺任何一个都可能被丢弃。
 *
 * ⚠ 键名必须与**录制里的 `key` 字段完全一致**（宏是录制生成的，不是手写）：
 *   空格键在录制里是 `' '`（单个空格字符），**不是** `'space'` —— 早期用 'space'
 *   做键名会导致查找失败、静默跳过。见 tools/check_keys.py 的核对输出。
 */
const KEY_CODE_MAP = {
  w:  { key: 'w', code: 'KeyW', keyCode: 87 },
  a:  { key: 'a', code: 'KeyA', keyCode: 65 },
  s:  { key: 's', code: 'KeyS', keyCode: 83 },
  d:  { key: 'd', code: 'KeyD', keyCode: 68 },
  j:  { key: 'j', code: 'KeyJ', keyCode: 74 },
  k:  { key: 'k', code: 'KeyK', keyCode: 75 },
  i:  { key: 'i', code: 'KeyI', keyCode: 73 },
  o:  { key: 'o', code: 'KeyO', keyCode: 79 },
  e:  { key: 'e', code: 'KeyE', keyCode: 69 },
  r:  { key: 'r', code: 'KeyR', keyCode: 82 },
  u:  { key: 'u', code: 'KeyU', keyCode: 85 },   // 录制里出现过 1 次（备用菜单）
  ' ': { key: ' ', code: 'Space', keyCode: 32 }, // ⚠ 单个空格字符，与录制一致
};

// 长按自动重复的间隔（ms）—— 模拟 OS key repeat。
//  为什么要它：录制里 k（普攻）13 次中 12 次是长按（中位 1919ms，最长 6098ms），
//  即用户操作为「按住普攻持续输出」。而单发一次 KeyboardEvent 没有自动重复，
//  游戏只会出第一拳 → 用户实测「只放技能，没攻击」。
//  取 33ms ≈ 30 次/秒（Windows 键盘重复率上限附近，比默认 500ms 初始延迟后 ~31/s 更密）。
//  保守起见不复刻「首次延迟 500ms」，从按下起就以稳定频率补发 —— 游戏只关心有没有重复流。
const KEY_REPEAT_MS = 33;

/**
 * 键时间线编译（v0.5.92 恢复，配合原生键盘事件）。
 *
 * 动机：录制里 806 处「某个键的按住窗口内出现了另一个键」，逐条串行会把这些
 *   并存关系全部拉平 —— 走位断裂、技能延后。实测峰值同时点数 1~2，
 *   多键同按正是原生的强项（用户已确认 S+D 同按会变成斜向）。
 *
 * 编译规则：
 *   · 每个 key 步的 `dt` 是「距上一步」的相对间隔 → 累加成绝对时刻 abs
 *   · `hold > 0`  → 抬起时刻 = abs + hold
 *     `hold = 0`  → 抬起时刻 = abs + TAP（默认 60ms，模拟轻点）
 *   · 同一时刻**先 up 后 down**：先腾出手指再按新的，避免瞬时键数过多
 *
 * @param {Array} seq 已过滤为 kind==='key' 的宏序列
 * @param {number} [tapMs] hold=0 时按住多久
 * @returns {{events:Array<{at:number,act:'down'|'up',key:string}>, totalMs:number, dropped:string[]}}
 */
function buildKeyTimeline(seq, tapMs) {
  const TAP = tapMs || 60;
  const events = [];
  const dropped = [];
  let abs = 0;
  for (const s of seq) {
    abs += (s.dt || 0);
    if (!KEY_CODE_MAP[s.key]) { dropped.push(s.key); continue; }
    const hold = s.hold > 0 ? Math.min(SECRET_REALM_KEY_HOLD_MAX, s.hold) : TAP;
    events.push({ at: abs,          act: 'down', key: s.key });
    events.push({ at: abs + hold,   act: 'up',   key: s.key });
  }
  events.sort((a, b) => (a.at - b.at) || (a.act === 'up' ? -1 : 1));
  const totalMs = events.length ? events[events.length - 1].at : 0;
  return { events, totalMs, dropped };
}

/**
 * 时间线回放：按绝对时刻调度 keydown/keyup，天然支持多键同按。
 *
 * 这是**含 key 的宏的唯一路径**。旧的鼠标坐标方案（stickPos 取中点）已废弃：
 *   用户实测「不会斜向走位，按键弄一起，另外的按键会被吃掉」—— 因为
 *   _domDispatch 发的是 mouse 事件（pointerId 固定为 1），第二个 pointerdown
 *   被当成同一指针的移动，把第一个挤掉了。原生键盘事件没有这个限制。
 *
 * @param {GameOperator} op
 * @param {Array} seq 宏序列（含 lead 项时会被跳过，由调用方处理）
 * @param {{sinceMs?:number}} [opts]
 */
async function replayKeyTimeline(op, seq, opts) {
  const o = opts || {};
  const keySteps = seq.filter(s => s.kind === 'key');
  const tl = buildKeyTimeline(keySteps);
  if (tl.dropped.length) {
    Utils.log('warn', `    ⚠ 未收录键码的键被跳过: ${[...new Set(tl.dropped)].join(',')}`);
  }
  Utils.log('info', `    ⌨ 时间轴 ${keySteps.length} 键 → ${tl.events.length} 事件 / ${tl.totalMs}ms`);
  // ⚠ v0.5.94：时间轴起算点。
  //   默认 `base = 现在`（宏的 dt 相对首键，从开播算合理）。
  //   但传了 sinceMs（= 点匹配时刻）时必须**倒推**：宏第 0 键在录制里是「点匹配后
  //   lead 毫秒」，所以它的绝对时刻应是 `since + lead`，而不是「从这里开始 + 0」。
  //   调用方 replaySeq 已先行等过 lead，这里的倒推保证单独调用/被复用时也正确
  //   （且 lead 已被等过时，`base + ev.at` 仍指向同一绝对时刻，不会二次等待）。
  const leadMs = (seq.find(s => s.kind === 'lead') || {}).ms || 0;
  const base = (o.sinceMs != null) ? (o.sinceMs + leadMs) : Date.now();
  let peak = 0;
  const live = new Set();
  // ⚠ v0.6.12（严重 BUG 修复）：releaseAllKeys() 必须在 **finally** 里，
  //   否则中断（用户按停止 → Runtime.check() 抛 AbortError）会直接跳出函数，
  //   循环后的释放语句永远走不到 → 云端所有按键卡在「按下」态，
  //   且 holdKey 注册的补发 repeat 定时器还在持续发 keydown。
  //   用户实测（2026-09-21 14:04 中止后）：「我进入雷霆秘境，**没有点任何脚本**，
  //   就开始自动战斗了」—— 正是上一次中止残留的按键在云端一直按着。
  try {
    for (const ev of tl.events) {
      Runtime.check();
      const w = base + ev.at - Date.now();
      if (w > 0) await Utils.sleep(w);
      if (ev.act === 'down') {
        op.holdKey(ev.key);
        live.add(ev.key);
        if (live.size > peak) peak = live.size;
      } else {
        op.releaseKey(ev.key);
        live.delete(ev.key);
      }
    }
  } finally {
    // 兜底：无论正常结束、抛异常还是被中止，都把所有仍按住的键抬起 + 清掉 repeat 定时器
    try { op.releaseAllKeys(); } catch (e) { /* ignore */ }
    // 再对局部记录做一次保险（防止 holdKey 未登记进 _heldKeys 的情况）
    try {
      for (const k of live) op.releaseKey(k);
    } catch (e) { /* ignore */ }
  }
  if (peak > 1) Utils.log('info', `      峰值同时按键 ${peak} 个`);
  return { events: tl.events.length, totalMs: tl.totalMs, peak };
}

/**
 * 把一个宏按键步落到屏幕上：按下 → 按住 holdMs → 抬起（用 op.pressHold/releaseHold）。
 * ⚠ v0.5.86：不再走 sdk.key() 发键盘事件（云游戏实例下游戏无响应）。
 * 返回 {ok, at:[x,y]|null, skipped:bool}
 */

// 点匹配后先等多久再探弹窗。罡体录制实测弹窗在 +1.4s 出现，取 1500ms 刚好探到。
//  ⚠ 必须先探弹窗再等进战斗 —— 弹窗会挡住后续流程。
const SECRET_REALM_POPUP_WAIT = 1500;
// 点「匹配」**之前**的缓冲。
//  用户口径：「主要是我点匹配，都好多次，画面还没加载就点击，导致按键失败了，
//  所以我让你在点匹配前都加点延迟」。
//  ⚠ v0.5.88：**NAV 不再点匹配**（见 SECRET_REALM_NAV 注释），点匹配统一由主循环负责，
//    所以这里是**所有场次**（含第 1 场）点匹配前的唯一等待，取 3500ms。
//    它要覆盖两种情况：
//      · 第 1 场：NAV 第 5 步刚把「秘境准备界面」推出来（NAV 那步自带 pre 3000ms）
//      · 第 N 场：上局刚结束（结算 → 返回 → 准备界面），界面还在切回
const SECRET_REALM_PRE_TAP_WAIT = 3500;
// 轮询识别秘境名的间隔（v0.5.86）。
//  ⚠ 必须 > vision.capture() 的帧缓存 90ms，否则每次轮询读到的都是同一帧，白费。
//    取 150ms：既能及时捕捉到「秘境名刚出现」的那一刻，又不会空转烧 CPU。
const SECRET_REALM_NAME_POLL_MS = 150;

  // ── 挑战券数量识别 ────────────────────────────────────────────
  // 用户口径：「把零作为结束战斗的标志」→ 只需二值判据：非0 继续 / 0 停手。
  // 区域（1280x720）：由 vision_describe 对 6 张真实准备界面实测定位，
  //   「剩余挑战券：」文字 (345,630)~(466,660)，红色票券图标 (468,622)~(500,668)，
  //   数字本体 (503,628)~(527,664)。此处取 x496~536 y620~672 留边距，
  //   保证两位数（如 10）完整落入。
  // 交叉验证：6 份录制按时间戳排序，识别出的券数 10→9→8→7→5→3 严格递减
  //   （雷霆10 / 阴阳9 / 烈焰8 / 落岩7 / 毒风5 / 水牢3；毒风打完剩4），序列自洽。
  const SECRET_REALM_TICKET_REGION = [496, 620, 40, 52];
  // 匹配分数阈值：低于此值才算「匹配上了」。findTemplate 是 SAD，越小越像。
  const SECRET_REALM_TICKET_THRESH = 22;
  // ⚠ 负样本缺失：至今未采到「券=0」的画面，故 0 无模板。
  //    判据因此是「单向」的：匹配到已知非0数字 → 判非0；
  //    全部失配 → 记一次「疑似0」，连续 TICKET_ZERO_CONFIRM 次才停手。
  //    宁可多打一场，不可误停（误停=白跑一趟，多打=只花几十秒）。
  const SECRET_REALM_TICKET_ZERO_CONFIRM = 2;

  // ── 「继续挑战无法获得饰品」提示弹窗（罡体/缸体秘境专属）───────────────
  //  用户口径（2026-03-19）：「缸体秘境那个在点进入的时候还有个弹窗要点，这个需要探测确定后才能点」。
  //  实测（罡体秘境战斗.json seq2/seq3）：点匹配后 +1.4s 出现弹窗，用户两步处理：
  //    ① (645,406) 勾选「本周不再提示」复选框（复选框本体 (527,384)~(557,414)，文字标签到 x731）
  //    ② (653,460) 点【确定】（按钮 (540,434)~(730,496)，中心 (635,465)）
  //  弹窗正文：「继续挑战无法获得饰品，但仍可获得忍具，是否继续挑战？」
  //  ⚠ 不是每次都有：只在饰品掉落次数用完时出现。缸体秘境战斗2 那份录制就没有弹窗（点匹配后直接开打）。
  //    → 必须先探测再点，不能盲点。勾选「本周不再提示」后本局内不再复弹。
  const SECRET_REALM_NOTICE_POPUP = [[645, 406], [653, 460]];
  // 两步之间的间隔（录制实测 seq2→seq3 相隔 0.7s）
  const SECRET_REALM_NOTICE_GAP = 700;
  // 探测该弹窗的区域：取弹窗标题条一带（避开底部底层按钮）
  const SECRET_REALM_NOTICE_REGION = [500, 180, 460, 340];

const SECRET_REALM_TICKET_TEMPLATES = {"10":"data:image/jpeg;base64,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","8":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8TpdD1GTmG1kP1TFJBoOs97Bx+B/wr6Cm8DeGIMG4AYHjh8EH0OAaJPDvhIsAWmQt/CbpGZf94LnH611Q4gy2ynHnlzbJpI9JZlhObmV2jwSPw5rj/wDMOkH4U8eD/Ek3C6c6/hXvMXg3SGl8iCUs/mbQp4yPWoZ/D1rYFvOkfav8WKP9Y8r/AJif7UwX8x4rbeBPE2/zRbNG3qKK9qg0PRr+byt0kI/vb8/4UVL4jy9/aF/aNLsdd+xP8FvDn7f37Uej/Am18bXOnaAls+oa1cWBKStEv8K+p9q+r/EX/BNn/gnX8dND+IXgf9kTWPEfh7x38LjMmoXN1O/lSyx/wsDkMD/ezx6Gvm//AIN6/gxqnxG/bGvfiTaeNrrRbXwXpr393DYuFe6Q/wDLPHYfn9K/QX4GftO/C79ubX/jj+zp8NPgle/DbVFs7lL7xTpTqkt8GJ+Z/kGw/wDAjX8r+JmecQZTxZVo4KtUjTw0KUpcsoqMHKpyt1E176a0SifR5BgMHWy7mnBNn496J8dvBn9mRR6zrvkajAXjuVZT8pX+IHvn0rbX9oT4YXlk1pd68rM/8fkPx+G2vA/iT4Rl8BfEPXfBt7eCeXRdYubWSYqCJCsmzP8AXGaxN2Pugj/gbf41/RFDK8DiYU5xlZM+Gq0+V6I+irz43/CK1H+ieMFkPqLWQf8AstFfO6B36SuP+Bn/ABorb+yaXYmyPZP2KP2zvir+wl8Z4/jF8KXinleHyNR0+6/1d3F/dJwcfka+vviV/wAHCmv3/gvXdI+A/wCyR4f8CeIfEcDx6vrlpcCRpi3fb5SY/wC+q/OSBSeSM1IsSBdj5cf7RJNeFnPAfCnEGPjjcfhlOpFJXvJXUXdJpNKVn3TPWw2a47B0vZ0p2j6IL7VbrWr6bVNScy3NxNNNcTO2TJK77tx+lVPJap0tNn/LTP4VL5S/89P0r7KMYwgoRWiPNlOUtyonye9FTfZP+mn6UUpaMwUmyxCq5xim0UVJ0LYKg3t60UVoZk9FFFKfxGMdj//Z","7":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8TX06/f8A5diPwP8AhTk8Pa4n/MOc/gf8K97uPBfhe3QMZJQ3dXkVf59alHhjwyx8uO6nZz91RMOR69K3pcR4CoueF35OLR6kcfhqm1zwSPw5rcv+r06Q/hTz4P8AEkz74tOk+hGK96s/BWkTOIbOfMh+byv4in94Dv8ASobjwykRf7WGCr/EDitv9Ysq/mM/7UwX8x4la+BvFMcnmwo4b1Vcf1or22DRdKuZvKR3h992f8KKb4jyh7SF/aNLsan7Jfi7/gnr43+IPiOX9tTX9cSxUf8AEhOkFkH4819v/DL/AIJ+/wDBIT48fAvxR8cfhWniSHRfDlpIs+qX+pyxoHTqAd3Nfj58LPhr4l+LnxB0n4beDLA3Ooa3fx2dtAi5bzG68eg9a/UX/gqv4p8N/wDBO/8AYG8F/wDBPX4Y6rCms6vYRz+Kp7b70jD/AFjOBk/P6Z496/nvxFy7GLiHA4HK8wqwxOImrwjN8qpR+Oo1/wAGx6+UumqVStWopxWx8I+GPjX4N0+3Ntc+IiDa3E8dpMVPmGCPoS3+16dvet9f2h/hbNZNaXfiHezf8tPs8g/TbXzbgFd7MeMBRxwvcdO9Mmlcfd4/4E3+Nfsayiklax8o4wb2PonUPjf8Kbe8/wBF8Tbx3P2aQf0or53V5X5AwfXc3+NFL+x6K6GdkeufsS/tQL+xv+0dpX7QC/Dyy8UTaUsgj06/n8tWZujB9jbSPXaai/bO/au8d/tnfHvWfjt49thbXGqSfuNOjm3x2sf/ADzU4GfrgfSvMIjLDHsjxn1IzT5I3f8A5Z/rT/sfLXmqzJ0066i4KXVRe6XT9Tqji8RGg6Kl7r3RW/g21G6l+xFWvsn/AE0/Sl+zD1H5V61jnuxqJbp/y1z/AMBop32Vf736UUpaMynJqVkWNi+lV/Pl/vUUVJoS0UUVoAUUUUp/EZT+I//Z","9":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8TW06/P8Aqbct9cj+lNg8P60fuWLn/gJr6Cm8CeG4IzJcTM2OwcA59DwcVJL4Y8L5CQpcI5/gNygKj1bOMfrXRDiPLOaEISlJve8Wj0o5lhKkuZN2PAoPDmuH72nSH8KkfwH4jfpakV7xZ+DtJnl8lHbeeikdaiuvD8doXWVTlfROtV/rHlafxB/aGC/nPD7X4eeKYvmRHRv7y0V7ja6Dot7N5JkkjH97fmitXxJlLd1Iz+uUTv8A9g/9mq0/4KL/ALQNx8N7LxXdaV4R0G1/tDxFfWb+XJJH/dTJ5+ufwr6j07/gm/8A8Evf2mLHxX8Mf2NvHut6Z478E2riS5S/aSO5K98SFt/5ivhP/glH/wAFA9P/AGCPj9eeJvFmiS6l4b8R2iafrlnbIDMiN3jBBHHpmv1d+Cmm/sI/sk/Abx1/wUP+Enh/XdEh8UWE5hGvuEaR+0cSHpn15+lfyp4p5jxZkGeTVKrWjGfso4ZQSadW/vxqXXVH0GSYXL8Vg480Vp8R+Qx+LGmeD9SvPCnjjVPs2r6PezWt4nlnh432Y/H9Ksw/tG/DCSye2vPEAkkb/lr9mkGPw214L8Q/Gur/ABA8c63471ls3et6rNfT4x8rSPux05x0zWI+9vutj8W/xr+gsJk8Z4ZOovesr+vX8T4qrTpxrWS0Pou8+NXwntJNtr4xST/aFtIP/ZaK+dzH+72CSTPqZG/xordZPRXQPZwNbwfrFl4S8Uab4gu9Fi1KGxvkuJdOuGIinC/wnqR9ea+kP+CgP/BUX4iftzWeieB7HwdaeDfB2g2scVl4c065LRFl6ux2IDn02/jXzCkcydYyaCCw2lAV9G5qsXkmW47H0sbiIc9Sk24ttuzfW17N+bVzajiq+HhKFOVlLcjcb/4MfjTPJarfl+9Hl+9ers7mLbk7sgkgdO4P40VLJbI/ciiploxKTsO85/apdi+lFFUDGUUUUAFFFFKfxCWx/9k=","3":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8UX0XUV6QE/gf8KjTw7rL/wCrtH/75NfQD+DPDtvAsz3EpJ/gbAIPp0NO/wCEX8MzFEsxcbn6AXCEH8R/XFdT4gy20ZvnXNsrI9KGZYWpHnV7Hgn/AAjXiD/oFyU5/BOvv0tZB/wD/wCvXvNt4P0u6kSCO5YSN/AV6frUF74XgsS/m78L3zR/rHlf8zK+v0DxKH4f+JV+aMbG/vLmivb7TR9HvZvJaeeIf3vMB/pRTfEuVSekjL65SOj/AGPvAHwj/bQ+PQ8C+OPi+PDfg/SNP/tLWLuK6EElwv8AzyUsRg/n9K+l/Gf7Cf8AwT3/AGgf2dvGXxb/AGCfFevadrPw9SQ391f3Dm3vyqbgHGcPnpwRX5sfAL9nf45/H7UNXu/gf4Futabw7afbdX+yuVxF74xuHtX66fsK/Ej4Vftx/sHeNv2SfhJ8NL/4U61oXh8NrN5YqB9rljTaXdiq/e64JOPev568SquNyHEwxuDxk1Gm6anFSjy0lJq7qR+KXNeysetkVHDV6LoTpp+Z+ZmmfH3wC+mwXeqav5N0T8wQFsfpWgfj78MpbJ7S68RiRm/5aeRIMfhtr568R6Pf+E9e1DQL+RZJtPu3gdlIILL6VRz7H/v43+NfsMMrwVWmqkZaM+TdGmnsfQ978aPhNaNstfGBk/2vscg/pRXz1s/d7AefXc3+NFaLJqC2Qezge2/sOftwfFj9g/4pSfEb4Yx295DeQfZ9W0i+H7q7g/uE4OPrg19V/Fj/AIOAfEWrfDbWPA37Pn7KuhfDy81+B4tV1jT5hI8wb/Z8pMf99V+d3lTf88zUoiT+LLf7xzXi5twJwxnmYRx2NwynVVtbyV+Xa6TSdvNM7sNmeNwlL2dKVl6L87XIrhLi7nkurqYySyO8jOzZJkb+I+tQ+S1WPsqepp/l+9fZQjGFPkS0OH2kWVX+T3oqZ7Tf/wAtMfhRSlo9DOc5KWhJ5z+1OoorZbFhRRRWZzrcKKKKU/iKn8R//9k=","5":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8Tjoeoz/6q1kP1XFJJoOsyf6qwf8A75P+Fe//APCH+E4Y1d/3nd1DBSq+tSf8I14VAUxNMN/IxcAnHr92upcT4Kf8NN+sWj0v7SwnS7PA4PDmuTSbDp0ij+9il/4QjxPN009lr3qLwfo82baCYmQdPRvoaifwtDZlvPVwq/xbutWuIsq/mH/aFHseKW3gDxZH8zWrBv7y8UV7XBoulXc/lJLIo/vb80VT4kylu6kR9epmt+yz4N8E/tm/tVeC/wBn231SdtJ1O7dtZksyYnNuqbvvHp6V9QftUfs9/wDBEv8AZ11DxH4I14eNLXXtIie2DxzTSR+evZTv5B9a+FP+Cdfx5+If7MH7Sdn+0F8PPhbc+Ln0GydLyyghLqsTJt3nCnb69DX6f/sh/Hvwh/wWE+EnxT0P9o39mHw7ox0qwlms9e0qwEUyn0ZyBlvfP4V/OHiS88yTPViqlWosDSjCNRU6sYyU5TtfW7enTTTY9XI6WGxGGdJwSn/N/Wh+X/gz44eDbLRLddX8RhHh/wBUfJkJX6/LzW2n7RfwtmsmtbvX9zN/y0NvIP0218663YjSNbvdJSXzFhu3hRxI2GC/xfe/Sqj726Nj/gTf41+2UctwNSKfNufLvRn0ZqHxs+FttN5Nj4lDf7f2aQf0or53Rd44JB9d7f40VTyainojDkifQH7BX7fPjr9g3x7qPi3wt4O03xBZ6za/Z9X0vVVXE6+zlG2f98mvon46/wDBe/X/ABX8HNX+Ef7Ov7Lug/DhNeR11a/064EjzBvQCGPH5mvz82N6U5rZj0hX/gWTXhZvwJwzn2YRxuYYdVKiaerlZuLum435XZ90/M9GjmeNw9L2dOVl6IrHdcfe3ZaR3cscli1L5LVOls6fwZqXyl/56fpX2UUo7I4eZlRPk96Km+yf9NP0oom3cyUmyzsX0qv58v8AeoorVbGgefL/AHqbvb1oorMCeiiilP4jGOx//9k=","6":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8TBpGozH/AI9JB/wGnw+H9XJ+Syc/8BNe+HwL4Wij82JXdT93sTUsnhXwyr+WpniYDDq1wuQ3pjFdVPiHAS+J2PSjmODqbSPA/wDhGvEH/QLkpR4K8RyvvFk6+2K96Twfpkr+XHcsW9Mf/XqGbwvY2RfMcrKv8WcZo/1jyv8AmK+v0DxOHwD4kX5402N/eUmivbrTRdJvZvKaaeIf3vMB/pRSlxJlsndSZl9cpGVa/EnSviDqVp4D+FRm1TxLq19Ha6ZZRQkZduvrwPXv7V79+3b+x1+zt+wL+zb4bt/iH441LUPjfrF3HeXSW9wTDaQt1EkeSBj/AHuaT/g3B+Efg7xp+1V4k+KHiERXdz4M8OST6ZbSAFizdGXPceuDX2T8M/j18Dv+Cs/xI+J/wL+Mv7KEOnvoNpPDYeJJIs3RTJwWJRcYx61/NPGfGGJyXjF4SlTk8Jg6cKmIknFOXtXaEVzdI9UrX6nr5Tk1GtgedpOVX4P7v9eZ+VA+O3w1hk3xeJwJDwhaCQAn0+7V1P2ivhf9ie1n8RB2b/lp9lkGPw214V8WPBtt4A+KHiPwLZXSzw6Lrl1bxy7mIdYpNoYfN/F1xk49TXPeY/t/303+NfumHy7AYmgpxdrpP7z5CpRhGryo+iL344/CS0m8q18WrJ/ti1kH/stFfPSlpBw7A+u8/wCNFbLJ6KVkhckT2H9jH9sn4pfsNfGSH4v/AAqaG4m8nyL6xvhuS5i/uk44/I19ffF3/g4h8Y+J/A2r+Hfgh+yvoXgXW9fgePVvEEE4lmmLd8CGPH/fVfnMkcydYyaa0Qb5mUs/95mzXiZzwJwvxBmCx2YYaNSorau9ny7cyTtK3mmenhc4xmDpezpTsvRC3l3PqFxJf30ry3M07SzTu2S7M+45/lUPktU32SWpvKX/AJ6fpX2MFGnHlilY8+TcpXZUT5Peipvsn/TT9KKUtGZTk1KyJPOf2qXYvpRRWy2JK/ny/wB6m729aKKzNieiiilP4jKp8R//2Q==","4":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8TZdFv5P9TET9VIpU0HWQm+OwdvbBH9K9/uPB/ha3VDO0rs8m1VUgZHr0pf8AhHvCxh/cLMvPJa5UY9sYzn2xXU+IcB10PUWOwq2k2eBpoGuP/wAwySpn8D+JX6acwr3i28CaRLJ5EFwzSdlIxn9ar3Xha2s2bzjIFX+L1o/1jyv+YPr9A8Th+HXiAfNASr/3lJFFe22uh6VdvsS4nh/7aA/0FFaviTKW7qRl9cpGJP8AGTwbr6x6F4Fu5dQ1e8f7PptnFayFnlP3APl7/pX31r3/AARs+BfhD9hfXPHPjLxJqT/FvRdBj1rUr6DUjm2unTcsLR9PbP6V83f8EB/2aPAfxg/aZn+MXxN1zTbe08E2/wBosLK+uxE09wPuPgtxj0wc1+n/AIL/AGZ/i/4j8BfHi78cfE7Q766+Ik0zaQ9tfForSIQ/IhYAgBfXjPoK/lXxQ4yqZJnKy/L68qfsfZynLlvzqU7OCumtFvax7vD2V06mGderBNdj8QvDvx98FHSIH1TXhHdp95hFJz/47Wyf2ivhhdWTWl34iDM38f2aT+W2vBfir8OtU+FXxG174e61fQXVzouqSWM9zaXDNC0inqrA8j3rEeR2+7x/wJv8a/oKlleBxFJTjKysj4urShGtZI+ibz42fCq0m/0bxOJPpbSD+lFfO5SPfuCH/vtv8aKpZRSWyH7OBoaTr/iHwvcPd+F9evNOmf70tjcNGSPfB5r6Z/Zd/wCCqXxc/Zj+AXjn4HS6Lc66fGlu8a6xe6vIJNPLJt3IpVt3r95a+XEVk6jP41II3H/LZj9ea0zfIcnz6l7PHUIzV09raxd1qrPRm9DFYjDSvTk0QXd1PezPdXTySSyFzK8jlt7N/E2ep96Z5LVY+zD1H5VJ5S/89P0r1YxjGnyJaGEm5SuypRU32T/pp+lFKSSehnOclLQs7F9KZRRVlhUG9vWiigCeiiilP4jKp8R//9k=","0":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8S5dKv5D+5gLfUEf0og8P60yb47Jz7bTX0FP4G8LwoJJJ3cH/AGgCD6HANOg8N+F8i1tlnMzf8slukYr/AL2Bx+tdUOIMt5lCPPJy2ukj0/7RwnJzq7R4J/wjmu/9A2T8qkfwX4hk+9YP+Ve8Q+C9Mnl8hCfM7KT1qCfw3bWxfzpXCr/Ftq/9YsqX2iPreFPFLX4f+J4pPNSBkPqtFe2Wuh6NfzeUhkQf3t+aKl8S5VJ6SF/aNLsd1+wv+zzb/wDBRH9oBPhbo/iy40zwlolr/aHifUbI+U6x/wB0E/zz+FfSkP7AX/BM39qrTfF3w0/Yt8Y67pXxB8DxzOLi5uyYroR+vPzZ+tcj/wAG1l/pN1qHxZ8OxOh1S58OYjUFQXj9AT1rH/4N9fAvjTwz+3l44v8AX7Oe1t9G0y9GriZDt743buufSv5i4wzLNoZpm0qGMlRWAhSdOKa95y3c1bVPa22v3/QZZgcJTwWGjKKl7a//AG6fKC/FjSvC08/h7x1qJtNX0u9a1vYypJWRX2EdvrV+H9oT4X3Vk9pd68rM38f2eTj8Ntea/tmazp2r/tZ/EnWdGkVrO58Z6nJA8ZBUjzztYcV5nvwPlBH/AANv8a/eMvy6nictpYmS1kk2vVJnxeKo0qFZxSuj6LvPjZ8KLIf6D4rDH1FrIP6UV85pGH6KR/20b/Git3ktCL0RnZHrX7IH7XvxN/Yq+M9p8ZfhYtvNcxJ5d3Y3gJiuo/7hA6fXBr7D+Lf/AAcD+JfEHw317wz8D/2V9D8D634kgEeseILaZZZp/U4EKYz/AL1fnOiMv3hmphjO54y7erPmvGzfgjhvPsfHG47DqdRJK95K6Wykk0pW/vJno4fN8XhafJTnZeiI7yeW/u5b66kaSa4dnmdzkszPuJ/pUfktU32SWpfL96+vglTSUehwucpS5nuQ7VhTfjPtRT3gldNm3FFE2+YhbC1PsX0oorUyK/ny/wB6paKKzNiLz5f71FFFKfxCWx//2Q==","1":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8Sn0m+kXaID+R/wAKlTQNXl/1dk5/4Ca99j8D+GrfB3SSZ7B1Bx7ZxmnxeFfDcfyotzxwWScMob0yBXT/AG/lnJf379rI9L+0sJyc+tjwODwzrs0mw2Eij+9ipv8AhEfER+7pkh/Cvd4PBmkTDyI5WEn0qv8A8I6ljM8Fwr5Xvng048R5XHaTJ/tXBfzHilr8P/E8U/2hIGRv9mivbYdD0a6m8kmSMf3t+aK0/wBZMt6SJ/tPCfzHU/sJQfsSftDftCTeCP2ptY1iePVBDa+Fo9OmMYkld9uGx0x1966r/go38D/gz+wH+1gnwp8H6zfQeHrvRUulivpzMyuw65wM18ofsRru/a6+Hp2+WB4otCw24OfO6rX1/wD8HI++b9s/SgWcbPCkJbeAdx9BivxLMaWJwXifhMHHESdGpSqSlG+l42s12O2nCg8inJxXMtmfPb/H74ZRv5tp4k+b+95En/xNSJ+0P8LZbJ7O/wBechv4vssmR+lfNqQ+X91j/wB9N/jSP5j/AHpWP/A2/wAa/S/7Go9j5tKPY+jb341fCuKbybTxOH/2hbSD+lFfOkMZxw5z67m/xoqv7JprZFadl9x0vwl8fah8JviXoPxM02AXN1oGqQ3lvFI+0PsfdsJwcZ6ZwfpXq/8AwUM/bj1v9vz44QfFrWfAg8Ni205LW3sLa48zaF7lyq5+m38a8KyvqfypzQtJzNbhz6sTV1smy7EZpTzGpTvWgnGMtdFLdW219DZYmtGk6afuvci2N6U3yWq35fvR5fvXpWMCmjFP4CaKs/Zh6j8qKm7An81vQflUfnP7UUVYDqKKKACiiiswP//Z","2":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAA0ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8S5dKv5D+5gLfUEf0oj8P60v+rsnb/gJFfQN14J8KQED7RJKT2+6QfQ8Gpv8AhFvCzFEtDMzyybY0W6Qlh68dPxxXTDP8sspw55c2yaSPS/tHCKV020fPyeFPEL/8w+QfhUr+CPEb9LJx/wABr3iz8IabPJ5EMxLnop4zUV14XW0LmUttX+L1p/6x5X/MY/2hg/5jxS1+H3iVPmggcP8A3lOKK9stdD0a7m8pWkhH97fu/wAKKUuJMtk7qTL/ALRpdjtf2IvgXY/8FBv2hLX4S6X4un0nwxpdq+oeJNSsv3cgRf4Rkj88/hX1VP8A8E4/+Cb/AO078MfG1l+xR4v1my8W+AbeYXF3LfN5d68fZ8n95n2K4r8tv2ZtU/aGHxIh8J/s361qsWv+Iw2nmLSZCPODfwsQPlHua/Tf4uaj4V/4IsfsC3HwS8Pa0NT+MXxFsTLrd3B84tGlHJDYONo9+fav528RY55hM+w9DK8dJV6rpxo0Vto/3s6unwJbHs5NSwawDnOkmj4C0X47+D4tOWLWtYEOoW8jrKFBIO3vmte1/aH+Fs9k9pe687s3/LT7LIMfhivmvzXmD3Mku4STzeYc5Yn8qTzHH3Xcf9tG/wAa/a6eTUZLVHydW0Xol9x9F3vxq+FdoP8ARfE4kPqLaQf0or5zVXk6ZH/A2/xoq3k1GOiRlZH0T/wTf/bksv2AfjRe/GCT4MWvjWS40/7NbW9xcCL7M3/PVWKPz+A+tfW3xS/4OGPhX8YYLqXx3/wTm0PVL26tZIWvtS1mOZ03dCv+jjGPSvzGK5fLRhk/uMf8MVIih/4AP+AL/hXz+b+HXDGe5sszxtHmrpW5lOcXbtaMkvw1PWwWd4vC0PY0naPov1Jtd1S313XL/WIdNjs0u7p5obeI5EAb+HOBu/IVS8iX+7Uz2krfd4qXY/8Af/SvtYRVNJRPLk3J6kO1YU34z7UVI8G9Nm7H4UVrFKSuyVsFTQqucYoorC7NaKRB58v96paKKszCiiitafwiWx//2Q=="};
// ── 「秘境准备界面」探针：挑战券左侧小图标（v0.6.04）───────────────────
//  用户口径（2026-09-21）：「秘境战斗准备界面又没识别对，要不增加一个这个界面
//  识别的探针，识别到了再识别挑战券数量？」「直接把挑战券数量左边的那个小图标
//  做成探针」。
//
//  为什么要它：读券失败（best=Infinity）时无法区分「券=0」和「画面根本不在准备
//  界面」。旧代码把后者当成「疑似券刷光」，掩盖真正的故障（2026-09-21 12:23 实跑
//  就是「没从结算退出来」被误判成券的问题）。有了本探针，就能明确区分：
//    图标在  → 确实是准备界面 → 读不到数字 = 真·疑似券0
//    图标不在 → 画面不对 → 回主界面重导航，绝不当成券0
//
//  标定数据（2026-09-21 准备界面实时画面，34x38 模板 @458,630）：
//    目标区 [440,615,510,680] → score=2.1，连采 5 次全中且坐标一致 (@475,649)
//    同图反例：屏幕中央 52.2 / 左上角 56.6 / 右下角 58.5
//    → 分离度 50，阈值取 20（宽裕）
const SECRET_REALM_PREP_ICON_TMPL = "data:image/jpeg;base64,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";
// 搜索区（图标应落在此；留了 ~15px 余量，容忍轻微位移）
const SECRET_REALM_PREP_ICON_REGION = [440, 615, 510, 680];
// 匹配阈值（SAD，越小越像）。实测 目标2.1 / 反例52+，取 20
const SECRET_REALM_PREP_ICON_THRESH = 20;


// ── 结算判据：「左下角返回按钮」模板（v0.5.88）──────────────────────────
//  用户口径：「结算明确左下角会出现返回，如果不点会持续十几秒，感觉比较适合作为判断依据」。
//  从 10 份「XX秘境战斗.json」录制里实测提取 —— 这是**秘境自己的结算特征**，
//  不是照抄忍术对战的方案：
//    · 9/10 份录制的最后阶段都有一次 click 落在 x∈[112,146] y∈[666,677]（中位 122,670）
//      —— 就是左下角这个「返回」；唯一没有的缸体2 是直接点了确定类按钮。
//    · 该 click 距上一个按键 4.8~22.3s（中位 8.1s），印证「不点会持续十几秒」。
//  模板 = 落岩录制该帧的 (105,653)-(141,685)，36x32。
//  ⚠ 阈值 55 由实测分离度决定（不是拍脑袋）：
//      正样本（9 份结算帧）最佳匹配差 0.00~33.72
//      负样本（落岩宏 6 个战斗按键帧）最佳匹配差 76.67~82.87
//      → 分离区宽 42.9，取中点 55，两侧各留约 21.5 余量。
//  用法：只在**连点期间每 2s** 探一次（用户口径），不参与常态轮询。
const SECRET_REALM_SETTLE_BACK_TMPL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAgACQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8ug5jbZIMnOMZ2g+uCa95/Zh/Y++K37TPiBbbwzpZstFgfN1ql4jJbqo5IU/xnHp1r0f4l/Fv9lbS/wBry68a/D74UReLfClzCLf+yHTyof7QEgHmQr0KnGcHOSa/YHwTf61YfBe11bw58NbDQtWudPFzZeHrf5VjlaMeXHIVGFOTyc8CgD8cP2o/+CePxZ/Z38NSeO3n0zWPDtrIqXN1YyEmHPTcpGRXycHHU9a+0P24bL9tXQEm1P4+X19NourAQ27WdwRZBCSwjZF43KOMtnNfE7NkfMcA9TQBP5rf3R+dFfXXwI/Yhtvjf8NNN8faH4nSzS5LwXEFzHuZJ0OGAIA45BH1ooA2f+CZP7Pvgv4j+Nta+KnxLWW20L4eG2vFknCLZmctnErP6AKTj1Ffovqfgr42fE/9p/wv8QdM8cW//Cm9HsDdwJo+pELf3ByFEsaH5gM4PbA5HWvlD4j+Pv2cvhL8MbD4N/E3RPEPh0+Ptdn8UeK9M0JUM2mCdvMitJHdCsiohRWVW3DYa6fT/wDgp7+y78A/h/o3gv4E+Atb1eytZFSSG5zbLHFkbyZDu3NjJAAxntQBwv8AwV//AGjbfVtc039n3wzqCyW+lbb7Wdjqw84jEcfsR1NfmbuP0xX6ufHj9nP4J/t5fDzUPj7+zNcJB41hiFxqFiwO68cLl1kXBYScbVPAPHAr8rNT0zUNF1G50rU7WS3vLORop4nUq0bq2CCCOuRQB+kn7Kniy5+HvwG8LaXJfG3N7FNf7AOzzOAf/HKK5DQ/B/iu9+HHw/utFt7u5tZfDNu6ui8AmWYkfgTRQB//2Q==';
// 「返回」按钮搜索区域（覆盖 9 份录制全部落点 x=107~146, y=665~690）
const SECRET_REALM_SETTLE_BACK_REGION = [85, 640, 190, 705];
// 匹配阈值：低于此值即认为「结算返回按钮在」
const SECRET_REALM_SETTLE_BACK_THRESH = 55;

// ── v0.6.24：丰饶之间「战斗结束」轮询参数 ────────────────────────────────
// 判据本身直接复用既有 PROBES.closeX（右上角红叉，label '关闭(X)'，verified:true），
// 不再新建探针 —— 用户口径：「直接用回到主界面的那个红x的探针就可以」。
// 这里只放两个节奏参数：
const ABUNDANCE_REDX_POLL_MS = 1000;    // 轮询间隔（用户：「这个的判定不需要那么及时」）
const ABUNDANCE_REDX_START_MS = 10000;  // 开战后静默 10s 才开始轮询（用户明确要求）
// 连点期间探测结算的间隔（用户口径：每 2s 一次）
const SECRET_REALM_SETTLE_PROBE_MS = 2000;

// ── 忍术对战（角斗场）「结算画面」探针 —— 蓝色卷轴图标（v0.6.16）───────
//  用户口径（2026-09-21）：「战斗结束的判断不对，我建议参考秘境的结束判定，
//  找个图标，右上角战斗详情几个字的左边有个图标，只在战斗结束的时候出现，
//  用这个作为判断依据」。
//
//  为什么换掉旧判据（横幅 / 黑屏 / 静止）：
//    · victoryBanner（「胜」字金色）只在部分结算出现，战败局打不到 → 靠超时兜底；
//    · defeatBanner 在「双方登场」暗背景必误报（d=16~24 vs tol=25）；
//    · darkEndAfterMs 黑屏快通道要等 ≥25s 才启用，且小局切换也有暗帧；
//    · staticBailMs 静止兜底要等 20s。
//    实测 trace 2026-09-21T14-40-06：第 1 局靠「观察窗未恢复动态」多等 6s，
//    第 2 局靠「全屏黑过场」兜底 —— 两条路都不稳。
//
//  ✅ 本探针：右上角「战斗详情」左侧的蓝色卷轴图标，**只在该结算画面出现**。
//     模板 = 用户 2026-09-21 提供的 1920x1080 结算截图，图标本体
//       1920 坐标 (1669,18)-(1725,70) → **1280x720 逻辑坐标 (1112,11)-(1151,48)，39x37**。
//     ⚠ 必须从**归一化到 1280x720 的画布**上切模板，与运行时搜索同空间 ——
//       早先直接切 1920 原图再让 findTemplate 缩放搜索，正样本自匹配只有 42.9
//       （阈值 30 会把正样本判成"没有"），根因就是缩放插值把模板糊了。
//  ✅ 阈值由「正负样本实测」定（工具 tools/verify-arena-icon-2sided.cjs）：
//     ① 结算截图自匹配               score = 0.00，其它 11 张画面 44.92~52.57
//     ② 用户真实结算录制（2026-09-21「末尾快速点击快速过了结算画面.json」71 帧，
//        连点器 k 把结算画面压到约 0.5s —— 恰恰是最难识别的场景）：
//          命中簇: a063(2.52) a064(2.51) a065(2.51) a066(10.94)
//          未命中: 其余 67 帧，**最低 41.71**
//        → 间隙 30.77，阈值取 30：距命中簇 19.1 / 距未命中簇 11.7。
//     ⚠ 旧判据在 0.5s 窗口内**必然失败**：该局是战败（无金色横幅）、
//       darkEndAfterMs 要 ≥25s、staticBailMs 要 20s、观察窗在命中后才开 ——
//       只有本图标探针能在 0.5s 内落判。
//     方法论：阈值必须由正负样本实测值取中，不能拍脑袋 —— 见
//     docs/视觉驱动自动化脚本-开发方法论.md §2。
const ARENA_END_ICON_TMPL = 'data:image/png;base64,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';
// 搜索区域（在模板四周各留约 12px 余量；findTemplate 的 region 是 [x1,y1,x2,y2]）
const ARENA_END_ICON_REGION = [1095, 2, 1168, 62];
// 匹配阈值：低于此值即认为「结算画面到了」。SAD，越小越像。
const ARENA_END_ICON_THRESH = 30;   // 实测：正 0.00 / 负 ≥44.92

// ── 忍术对战「战斗准备界面」探针（v0.6.20）────────────────────────────────
//   循环回到起点的判据（用户 2026-09-21：「感叹号模板 + 右上角红X 这两个应该就可以」）。
//
//   组件① 「规则说明」左侧的**蓝色感叹号**图标，26x32 @ 1280x720 (1090,112)。
//      ⚠ 踩过的坑：一开始想用**颜色统计**（区域 B-R / 蓝色像素占比）判这个图标，
//        实测完全不可分 —— 负样本 70 帧里 31 帧误命中（战斗中该区域本来就偏青蓝，
//        mean=[103,121,134] 与准备界面的 [81,102,113] 几乎重合，B-R 只差 1）。
//        改用**模板匹配**后立刻分开（正 0 / 负 ≥22.98）。
//      实测（tools/calibrate-ready-tmpl.cjs，正负样本各 1 / 70 帧）：
//        正样本（准备界面 a001）            score = 0.00
//        负样本（战斗中/结算/黑屏/蓝过场）  score = 22.98 ~ 27.10
//      → 阈值 11.5（两侧余量各 11.5）。
//
//   组件② 右上角**红色 X**（1190,10)-(1261,71)，红色像素占比。
//      实测：正样本 0.3018 / 负样本 0 ~ 0.2397 → 阈值 0.27。
//
//   两者取 **AND**：实测 0 误报、正样本命中。任一条单独都够，双条件是为了
//   防 UI 改版导致单条失配（方法论：关键判据要有互不相关的双证据）。
const ARENA_READY_ICON_TMPL = 'data:image/png;base64,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';
const ARENA_READY_ICON_REGION = [1075, 100, 1135, 160];   // [x1,y1,x2,y2]
const ARENA_READY_ICON_THRESH = 11.5;                     // 实测：正 0 / 负 ≥22.98
const ARENA_READY_X_REGION = [1190, 10, 1261, 71];        // [x1,y1,x2,y2] 右上角红X
const ARENA_READY_X_RED_MIN = 0.27;                       // 实测：正 0.3018 / 负 ≤0.2397
const ARENA_READY_POLL_MS = 500;      // 轮询间隔（> 帧缓存 90ms）
let _arenaReadyIconTmpl = null;
function loadArenaReadyIconTemplate() {
  if (_arenaReadyIconTmpl) return Promise.resolve(_arenaReadyIconTmpl);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      _arenaReadyIconTmpl = c;
      res(c);
    };
    img.onerror = () => rej(new Error('忍术对战准备界面图标模板加载失败'));
    img.src = ARENA_READY_ICON_TMPL;
  });
}
let _arenaEndIconTmpl = null;
/** 懒加载「忍术对战结算图标」模板画布 */
function loadArenaEndIconTemplate() {
  if (_arenaEndIconTmpl) return Promise.resolve(_arenaEndIconTmpl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      _arenaEndIconTmpl = c;
      resolve(c);
    };
    img.onerror = () => reject(new Error('忍术对战结算图标模板加载失败'));
    img.src = ARENA_END_ICON_TMPL;
  });
}

let _settleBackTmpl = null;
/** 懒加载「结算返回按钮」模板画布 */
function loadSettleBackTemplate() {
  if (_settleBackTmpl) return Promise.resolve(_settleBackTmpl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      _settleBackTmpl = c;
      resolve(c);
    };
    img.onerror = () => reject(new Error('结算返回按钮模板加载失败'));
    img.src = SECRET_REALM_SETTLE_BACK_TMPL;
  });
}

let _ticketTemplates = null;
/** 懒加载挑战券数字模板画布 */
function loadTicketTemplates() {
  if (_ticketTemplates) return Promise.resolve(_ticketTemplates);
  return new Promise((resolve, reject) => {
    const out = {};
    const keys = Object.keys(SECRET_REALM_TICKET_TEMPLATES);
    let done = 0;
    if (!keys.length) { _ticketTemplates = out; resolve(out); return; }
    for (const k of keys) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        out[k] = c;
        done++;
        if (done === keys.length) { _ticketTemplates = out; resolve(out); }
      };
      img.onerror = () => reject(new Error('挑战券模板加载失败: ' + k));
      img.src = SECRET_REALM_TICKET_TEMPLATES[k];
    }
  });
}

let _realmNameTemplates = null;
/** 懒加载秘境名称模板画布 */
function loadRealmNameTemplates() {
  if (_realmNameTemplates) return Promise.resolve(_realmNameTemplates);
  return new Promise((resolve, reject) => {
    const out = {};
    const keys = Object.keys(SECRET_REALM_NAME_TEMPLATES);
    let done = 0;
    for (const k of keys) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        out[k] = c;
        done++;
        if (done === keys.length) { _realmNameTemplates = out; resolve(out); }
      };
      img.onerror = () => reject(new Error('秘境名称模板加载失败: ' + k));
      img.src = SECRET_REALM_NAME_TEMPLATES[k];
    }
  });
}

  // ============================================================
  //  任务集会所（missionHall）0.5.75 起 —— 顶部槽位判空闲 + 宝箱筛选 + 常驻循环
  //  0.5.80：按 2026-09-11 真机录制「任务集会所1 / 任务集会所2」二次标定（见下方「0.5.80 二次标定」段）
  //
  //  ── 几何（游戏 1280x720；实测自 2026-09-18 用户提供的 16 张真机截图）──
  //   奖励格：x = 799/879/961/1042（间距 80），y = 261/374/484（行内从 799 起连续填充）
  //     ⚠⚠ 宝箱 = 该行**最右侧**奖励格！行内奖励项 1~4 个不定，绝不能固定取第 3 格
  //   接取按钮：x = 1173，y = 285/398/510；金色 = 可接取
  //   顶部 3 个派遣槽位：中心 x = 650/767/885（图标与标签同轴）
  //     图标带 y 118~170；标签行 y 178~196（「可领取」或倒计时）
  //
  //  ── 空闲判定（0.5.75 按用户口径重写）──
  //   ❌ 不再看底部「可接受任务: N/9」——该计数在任务**完成的那一刻就归还**：
  //      真机 #7 三个槽位全是「可领取」时它仍显示 9/9，把它当空闲数 → 会以为有 3 个
  //      空位去硬接，实际 3 个槽都被未领取的任务占着。
  //   ✅ 只看顶部 3 个槽位，每槽三态之一：空缺 / 计时中 / 可领取
  //        空闲位 = 「可领取」数 + 「空缺」数
  //        满 3   = 3 个槽**全部计时中**（既无可领取、也无空缺）
  //      即「有空闲」的充要条件就是用户说的：上面有可领取 或 有空缺。
  //      （领掉「可领取」后该槽变为空缺，所以可领取等价于「可腾出」。）
  //
  //  ── 三态判据（16 张真机截图 × 3 槽 = 48 个样本实测，余量都很宽）──
  //   ① 空缺：图标带没有图标 —— 空槽 V≤70.5 / S≤10.3，有图标 V≥77.4 / S≥24.2 → 阈值 V>74 且 S>16
  //   ② 可领取：标签行灰度 SAD 命中模板 —— 可领取 6.8~9.7，计时中 45.9~52.0 → 阈值 25（余量 36）
  //   ③ 剩下的「有图标但不命中」即为计时中（在跑）
  //   交叉校验：可领取的图标外围有一圈**金色光晕**（光环 V 65.1~74.4，计时中 56.8~61.0），
  //   模板万一在某环境下漏检就用光晕兜底；两个信号都写进日志，便于回传定位。
  //
  //  ── 0.5.80 二次标定（依据 2026-09-11 用户真机录制「任务集会所1」+「任务集会所2」）──
  //   录制内容（= 用户手动走通的正解）：
  //     「任务集会所1」进面板：drag (325,282)→(1117,273) dur 532
  //                           drag (301,282)→(1017,294) dur 692
  //                           click (545,466)
  //     「任务集会所2」接任务：click (1173,398) 接取第 2 行 → click (936,580) 推荐小队
  //                           → click (1172,627) 出发
  //   与脚本逐项比对：
  //     ✅ entry(545,466) / acceptBtn(936,580) / launchBtn(1172,627) / btnX 1173 —— 全部一致
  //     ❌ 两段拖动的 y 写的是 360，录制实测 **282**（差 78px）→ 已改（MISSION.swipeY）
  //        · 主场景 (301,282) 图像 std≈3.9（纯色远景＝干净的起拖区）
  //        · 主场景 (301,360) 图像 std≈31.7（压在 UI 元素上，起拖易被当成点击吞掉）
  //     ❌ panel 判据 `hangOk || btnOk>=2` 太松：点「接取」后的**推荐小队页**与随后的
  //        **出发页**在 (1171,653) 处同样有金色 → hangOk 命中 → 误判「还在面板」→
  //        后续 collectDone / keepAlive 在这两页乱点（「点到其他页面」的成因之一）。
  //        已收紧为 `btnOk>=2`（+ 「可领取」标签模板复核兜底）
  //     ❌ 槽位**光晕兜底**没有量程上限：非面板页光晕 86~228 会把 3 个槽位全判「可领取」。
  //        已加上限 MISSION_GLOW_V_MAX
  //   六帧实测（进面板 3 帧 + 面板/推荐小队页/出发页）：
  //     btnOk        : 面板 3 │ 主场景 0 │ 推荐小队 0 │ 出发页 0
  //     hangOk       : 面板 1 │ 主场景 0 │ 推荐小队 1 │ 出发页 1   ← 不可单独作判据
  //     「可领取」SAD : 面板 11.6 │ 主场景 48~52 │ 推荐小队 63~107 │ 出发页 63~89（阈值 25）
  //     槽位光晕      : 面板 58~68 │ 主场景 141~166 │ 推荐小队 86~228 │ 出发页 86~228
  //   槽位三态在面板帧上的交叉验证：#1 模板 11.6 + 光晕 68.0 → 可领取；#2 SAD 46.1/光晕 61.1 → 计时中；
  //                              #3 S≈11.2 → 空缺 （两个独立信号结论一致）
  // ============================================================
  const MISSION = {
    // —— 候选任务 3 行（红/蓝宝箱从这里挑）——
    cellX: [799, 879, 961, 1042],
    cellY: [261, 374, 484],
    btnX: 1173,
    btnY: [285, 398, 510],
    // —— 顶部 3 个派遣槽位（空闲/满 3 的唯一判据）——
    slotCx: [650, 767, 885],     // 槽位中心 x（图标与标签同轴，实测）
    slotIconCy: 158,             // 领取落点①：图标带内偏下（0.5.77 按真机录制 (648,166) 下调）
    slotLabelCy: 187,            // 领取落点②：「可领取 ▶▶▶」标签行（图标没反应时改点这里）
    slotBandHW: 40,              // 图标带半宽
    iconY0: 118, iconY1: 170,    // 图标带上下边
    labelY0: 178,                // 标签行上边（模板高 18）
    labelW: 54, labelH: 18,
    labelPad: 14,                // 标签模板横向搜索余量
    concurrency: 3,              // = 顶部槽位数（同时可派遣上限，用户口径）
    loopMin: 30,                 // 每轮间隔（分钟）—— 任务半小时刷新一轮
    loopHours: 8,                // 常驻循环总时长上限（小时）
    /** 0.5.81：每轮领取/补接结束后**回主界面**等待的分钟数，到点再重新拖屏进面板。
     *  用户口径（2026-09-20）：「集会所任务完成后就回到桌面，然后间隔 5min，再重新执行集会所任务，
     *  这样就能在主界面和集会所界面之间来回切换」—— 靠两个界面来回切换保持活跃，
     *  替代旧的面板内保活（用户实测「左右滑动还是被判无操作超时」）。 */
    pollMin: 5,
    acceptBtn: [936, 580],       // 接取 → 推荐小队
    launchBtn: [1172, 627],      // 接取 → 出发
    // —— 主界面入口路径（0.5.80 按 2026-09-11 真机录制「任务集会所1」标定）——
    //   录制原始手势：drag (325,282)→(1117,273) 532ms / drag (301,282)→(1017,294) 692ms / click (545,466)
    //   ⚠ 0.5.75~0.79 这里写的是 y=360，与录制实测的 282 差 78px → 0.5.80 改回录制值
    swipeY: 282,                 // 两段拖动的高度（真机录制实测；次段录制落点 294，取同一高度更稳）
    swipeYAlt: 360,              // 备用拖动高度（旧值：首轮没打开面板时再按这个高度重拖一次）
    entry: [545, 466],           // 主界面「任务集会所」入口（与录制一致）
    entryAlt: [591, 480],        // 入口备用落点（0.5.77：真机录制录到的新位置）
    // —— 「多个任务可领取」时的确认弹窗（0.5.77 真机录制 step4/5）——
    //   点任一「可领取」槽位图标 → 弹「当前有多个任务奖励可领取，是否一键领取所有奖励？」
    popupOkBtn: [519, 451],      // 「确定」（左，实测中心）
    popupCancelBtn: [754, 450],  // 「取消」（右，我们从不点它）
    popupBox: [362, 227, 916, 500],  // 弹窗主体区（浅米色占比判据用）
    // —— 「恭喜你获得」奖励展示浮层（领取成功后覆盖全屏，点一下收起）——
    overlayPts: [[528, 457], [640, 620], [360, 672]],  // 收起落点，依次尝试
    // —— 面板内保活（长时间不动云游戏会超时断连）——
    // v0.6.27 删除：keepAlivePt / keepAliveDrag —— 面板内保活已废弃（见 MissionHall.sleepAtHome）
    // —— 面板特征锚点 ——
    hangBtnPt: [1171, 653],      // 右下「换一组」金色按钮
                                 //   ⚠ 0.5.80 实测：它**不是**面板独有 —— 推荐小队页 (212,181,78) /
                                 //     出发页 (207,174,73) 同位置也有金色元素，hangOk 会误命中
                                 //     （放大采样块到 23x16 后推荐小队页 r-b 仍=116，过线）。
                                 //     现在它只负责「触发模板复核」这一件事，见 panelAnchors / anchorsOf。
  };
  const MISSION_DONE_SAD = 25;     // 「可领取」SAD 阈值（命中 6.8~9.7 / 计时中 45.9~52.0）
  // —— 槽位「有图标 / 空槽」判据（0.5.77 换成以**饱和度**为主）——
  //   空槽：S 实测 ≤10.3（旧 16 张样本）/ 8.4~9.1（新 3 张）
  //   有图标：S 实测 ≥24.2（旧）/ 57.6~70.1（新）
  //   阈值 18 → 两侧余量 8 / 6；旧判据 V>74 的空槽实测最高 70.7，余量只有 3.3，太险
  //   ⚠ 必须用 S 而不是 V：槽位全空时面板会显示「还没有领取任务，快来领取任务吧！」浅色提示文字，
  //     它压在图标带上会把 V 抬上来；但文字是灰白的，S 依然很低 → S 判据不受影响
  const MISSION_SLOT_S = 18;
  const MISSION_SLOT_V = 50;       // 辅助下限（防空槽装饰纹误判）
  const MISSION_POPUP_PALE = 0.55; // 「一键领取」确认弹窗：主体区浅米色占比（弹窗 0.74 / 其它 ≤0.37）
  const MISSION_DARK_LUM = 60;     // 「恭喜你获得」浮层：面板区亮度（浮层 33 / 正常面板 ≥81）
  const MISSION_GLOW_V = 63;       // 金色光晕兜底阈值（可领取 ≥65.1 / 计时中 ≤61.0）
  /** 光晕兜底的**量程上限**（0.5.80 新增）。
   *  ⚠ 光晕只在「面板内」才有区分度：面板 56.8~74.4（本次录制新增 61.1 / 68.0）。
   *    readSlots 一旦被非面板页面调用，主场景 141~166 / 推荐小队页·出发页 86~228
   *    会**全部**被误判成「可领取」→ collectDone 就会在那些页面上乱点。
   *  80 取在面板最高 74.4（余量 5.6）与非面板最低 86.1（余量 6.1）的中间。 */
  const MISSION_GLOW_V_MAX = 80;
  const MISSION_SLOT_TXT = { empty: '空缺', running: '计时中', done: '可领取' };

  // 顶部槽位「可领取」标签模板（从真机 16 张样本的 #7 槽1 抠取，54x18）
  //   实测：可领取 6.8~9.7；计时中（数字+时分秒）45.9~52.0；空槽无文字 61.7~63.6
  //   → 阈值 25，判别余量 36，非常稳
  const MISSION_KELINGQU_SRC = 'data:image/png;base64,' + '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';
  let _mhKelingquTmpl = null;
  function loadMissionKelingquTmpl() {
    if (_mhKelingquTmpl) return Promise.resolve(_mhKelingquTmpl);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        _mhKelingquTmpl = c;
        resolve(c);
      };
      img.onerror = () => reject(new Error('任务集会所「可领取」模板加载失败'));
      img.src = MISSION_KELINGQU_SRC;
    });
  }

  const MissionHall = {
    /** 取一块区域的 RGB 均值 */
    _mean(D, W, cx, cy, hw, hh) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy - hh; y < cy + hh; y++) {
        for (let x = cx - hw; x < cx + hw; x++) {
          const i = (y * W + x) * 4;
          r += D[i]; g += D[i + 1]; b += D[i + 2]; n++;
        }
      }
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    },
    /** 区域亮度均值 v / 饱和度均值 s */
    _stat(D, W, cx, cy, hw, hh) {
      let v = 0, s = 0, n = 0;
      for (let y = cy - hh; y < cy + hh; y++) {
        for (let x = cx - hw; x < cx + hw; x++) {
          const i = (y * W + x) * 4;
          const r = D[i], g = D[i + 1], b = D[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          v += mx; s += mx - mn; n++;
        }
      }
      return { v: v / n, s: s / n };
    },
    /** 该奖励格是否有内容：真机实测空格背景 V≈52~56/S≈33~37，有格 V>95/S>45 */
    hasCell(D, W, cx, cy) {
      const st = this._stat(D, W, cx, cy, 30, 30);
      return st.v > 95 && st.s > 45;
    },
    /** 该行**最右**奖励格（=宝箱格）中心 x；整行都空（已接取置灰）返回 null */
    chestCellX(D, W, rowIdx) {
      const cy = MISSION.cellY[rowIdx];
      let last = null;
      for (let k = 0; k < MISSION.cellX.length; k++) {
        if (this.hasCell(D, W, MISSION.cellX[k], cy)) last = MISSION.cellX[k];
      }
      return last;
    },
    _px(D, W, x, y) {
      const i = (y * W + x) * 4;
      const r = D[i], g = D[i + 1], b = D[i + 2];
      return { p: [r, g, b], s: Math.max(r, g, b) - Math.min(r, g, b) };
    },
    _hue(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d === 0) return 0;
      let h;
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
      return h;
    },
    /** 宝箱格边框主色相（内圈 1~5px，取饱和度最高 1/4 像素的中位色） */
    frameHue(D, W, cx, cy) {
      const hw = 36, hh = 36, pts = [];
      for (let off = 1; off <= 5; off++) {
        const yt = cy - hh + off, yb = cy + hh - off;
        const xl = cx - hw + off, xr = cx + hw - off;
        for (let x = xl; x <= xr; x += 2) { pts.push(this._px(D, W, x, yt)); pts.push(this._px(D, W, x, yb)); }
        for (let y = yt; y <= yb; y += 2) { pts.push(this._px(D, W, xl, y)); pts.push(this._px(D, W, xr, y)); }
      }
      pts.sort((a, b) => a.s - b.s);
      const sel = pts.slice(pts.length - Math.max(8, pts.length >> 2));
      const med = [0, 1, 2].map(ch => {
        const vs = sel.map(p => p.p[ch]).sort((a, b) => a - b);
        return vs[vs.length >> 1];
      });
      return this._hue(med[0], med[1], med[2]);
    },
    /** 该行宝箱类型：'red' | 'blue' | 'green' | null（整行置灰/无格） */
    chestType(D, W, rowIdx) {
      const cx = this.chestCellX(D, W, rowIdx);
      if (cx == null) return null;
      const h = this.frameHue(D, W, cx, MISSION.cellY[rowIdx]);
      if (h >= 95 && h < 175) return 'green';
      if (h >= 175 && h < 260) return 'blue';
      if (h >= 260 && h < 350) return 'red';
      return null;
    },
    /** 接取按钮是否可点（金色）：真机实测可点区均值≈(169,135,49) */
    btnAvailable(D, W, rowIdx) {
      const m = this._mean(D, W, MISSION.btnX, MISSION.btnY[rowIdx], 23, 16);
      return m.r > 130 && (m.r - m.b) > 70 && m.g > 90;
    },

    // ————— 顶部槽位三态判定 —————
    /** 槽位图标带统计（亮度均值 v / 饱和度均值 s） */
    iconStat(D, W, k) {
      const y0 = MISSION.iconY0, y1 = MISSION.iconY1;
      return this._stat(D, W, MISSION.slotCx[k], (y0 + y1) / 2, MISSION.slotBandHW, (y1 - y0) / 2);
    },
    /** 该槽位是否有任务图标（空槽是一条平带：S≤10.3；有图标 S≥24.2） */
    slotOccupied(D, W, k) {
      const st = this.iconStat(D, W, k);
      return st.s > MISSION_SLOT_S && st.v > MISSION_SLOT_V;
    },
    /** 图标外围「金色光晕」亮度均值（可领取才有；空槽装饰纹也偏亮，故只在确认有图标时才用） */
    glowV(D, W, k) {
      const cx = MISSION.slotCx[k];
      let sum = 0, n = 0;
      for (let y = 122; y < 166; y += 2) {
        for (let dx = -56; dx < -44; dx += 2) { const i = (y * W + cx + dx) * 4; sum += Math.max(D[i], D[i + 1], D[i + 2]); n++; }
        for (let dx = 44; dx < 56; dx += 2) { const i = (y * W + cx + dx) * 4; sum += Math.max(D[i], D[i + 1], D[i + 2]); n++; }
      }
      return n ? sum / n : 0;
    },
    /** 「可领取」标签模板匹配（灰度 SAD）；返回 {ok, score} */
    labelHit(ctx, tmpl, k) {
      const cx = MISSION.slotCx[k], pad = MISSION.labelPad, y0 = MISSION.labelY0;
      const hw = MISSION.labelW / 2;
      const region = [cx - hw - pad, y0 - 3, cx + hw + pad, y0 + MISSION.labelH + 3];
      try {
        const r = ctx.vision.findTemplate(tmpl, region, { step: 1, thresh: MISSION_DONE_SAD });
        return { ok: !!r.ok, score: (typeof r.score === 'number' ? r.score : 999) };
      } catch (e) {
        return { ok: false, score: 999, err: (e && e.message) || String(e) };
      }
    },
    /** 读顶部 3 个槽位状态 → {ok, slots[], done, empty, running, free} */
    async readSlots(ctx) {
      let D, W;
      try { const img = ctx.vision.grab(0); D = img.data; W = img.width; }
      catch (e) { return { ok: false, why: `取像素失败：${(e && e.message) || e}` }; }
      let tmpl = null;
      try { tmpl = await loadMissionKelingquTmpl(); } catch (e) { /* 无模板 → 只分 空缺/占用 */ }
      const slots = [];
      for (let k = 0; k < MISSION.slotCx.length; k++) {
        const st = this.iconStat(D, W, k);
        if (!this.slotOccupied(D, W, k)) {
          slots.push({ k, state: 'empty', via: '', v: st.v, s: st.s, sad: -1, glow: 0 });
          continue;
        }
        const glow = this.glowV(D, W, k);
        const hit = tmpl ? this.labelHit(ctx, tmpl, k) : { ok: false, score: 999 };
        let state = 'running', via = '';
        if (hit.ok) { state = 'done'; via = 'sad'; }
        else if (glow >= MISSION_GLOW_V && glow < MISSION_GLOW_V_MAX) { state = 'done'; via = 'glow'; }
        slots.push({ k, state, via, v: st.v, s: st.s, sad: hit.score, glow });
      }
      const done = slots.filter(o => o.state === 'done').length;
      const empty = slots.filter(o => o.state === 'empty').length;
      const running = slots.filter(o => o.state === 'running').length;
      return {
        ok: true, slots, done, empty, running,
        free: done + empty,                                   // 空闲位 = 可领取 + 空缺
        full: running >= MISSION.concurrency,                 // 满 3 = 三槽全在计时中
      };
    },
    /** 一行摘要，如「可领取 / 计时中 / 空缺」 */
    fmtSlots(s) {
      return s.slots.map(o => MISSION_SLOT_TXT[o.state] + (o.via === 'glow' ? '(光晕)' : '')).join(' / ');
    },
    /** 明细（V/S/SAD/光晕），排查用 */
    detail(s) {
      return s.slots.map(o => `#${o.k + 1}${MISSION_SLOT_TXT[o.state]}` +
        `(V${o.v.toFixed(0)}/S${o.s.toFixed(0)}` +
        (o.state === 'empty' ? ')' : ` SAD${o.sad.toFixed(0)}/光晕${o.glow.toFixed(0)})`)).join(' ');
    },

    // ————— 面板检测（0.5.77：改用面板独有金色按钮，主场景不再误判）—————
    /** 右下「换一组」金色按钮（集会所面板独有；主场景 / 推荐小队页实测 0 命中） */
    hangBtnOk(D, W) {
      const hx = MISSION.hangBtnPt[0], hy = MISSION.hangBtnPt[1];
      for (let d = -1; d <= 1; d++) {
        const m = this._mean(D, W, hx + d * 40, hy, 8, 6);
        if (m.r > 170 && (m.r - m.b) > 90 && m.g > 110) return true;
      }
      return false;
    },
    /** 面板特征：① 右下「换一组」金按钮 ② 接取按钮金色 ≥2 行（两者任一成立即判在面板）
     *  ⚠ 0.5.75 的「奖励行 / 槽位图标」两个锚点**已降级为纯日志**：
     *     主场景（明亮山水）整屏 V≈218/S≈66，会把奖励行和槽位图标全部命中 →
     *     主场景被误判成「在面板」，挂机时就永远不会触发面板恢复。 */
    panelAnchors(D, W) {
      const hangOk = this.hangBtnOk(D, W) ? 1 : 0;
      let btnOk = 0;
      for (let r = 0; r < MISSION.btnY.length; r++) if (this.btnAvailable(D, W, r)) btnOk++;
      let rowsOk = 0;
      for (let r = 0; r < MISSION.cellY.length; r++) {
        let n = 0;
        for (let c = 0; c < MISSION.cellX.length; c++) if (this.hasCell(D, W, MISSION.cellX[c], MISSION.cellY[r])) n++;
        if (n >= 2) rowsOk++;
      }
      let slotOk = 0;
      for (let k = 0; k < MISSION.slotCx.length; k++) if (this.slotOccupied(D, W, k)) slotOk++;
      // 0.5.80：panel 收紧 —— **hangOk 不再单独成立**。
      //   ⚠ 2026-09-11 录制「任务集会所2」实测：点「接取」后的**推荐小队页**、点「推荐小队」后的
      //     **出发页**，(1171,653) 处同样是金色 → hangOk 命中（推荐小队 (212,181,78) /
      //     出发页 (207,174,73)），而这两页 btnOk=0。旧式 `panel = hangOk || btnOk>=2`
      //     会把它们当成面板 → collectDone / keepAlive 在那两页乱点（「点到其他页面」的成因）。
      //   实测：面板 btnOk=3 / 主场景 0 / 推荐小队页 0 / 出发页 0 —— 余量 3 个按钮。
      //   也不能改用「换一组」金色本身：把采样块放大到 23x16 后推荐小队页 r-b=116 仍过线。
      const panel = btnOk >= 2;
      // 按钮全灰（任务被接完）时 btnOk=0 → 交给 anchorsOf 用「可领取」标签模板复核
      const needSad = !panel && hangOk === 1;
      return { hangOk, btnOk, rowsOk, slotOk, panel, needSad, slotSad: -1, hits: (btnOk >= 2 ? 1 : 0) };
    },
    /** 取面板锚点（**同步** —— inPanel 依赖它，不能变 async）。
     *  0.5.80：btnOk<2 但右下金色命中时，再用「可领取」标签模板复核一次：
     *  该标签是**面板独有**——面板 SAD 11.6（命中）；主场景 48~52 / 推荐小队页 63~107 /
     *  出发页 63~89 全部不命中（阈值 25，两侧余量各 23）。
     *  这样「面板 + 3 个接取按钮全灰 + 有可领取任务」仍认得出来，
     *  而推荐小队页 / 出发页（hangOk 会误命中）被正确排除。 */
    anchorsOf(ctx) {
      let D, W;
      try { const img = ctx.vision.grab(0); D = img.data; W = img.width; }
      catch (e) { return { panel: false, hangOk: 0, btnOk: 0, rowsOk: 0, slotOk: 0, needSad: false, slotSad: -1, why: 'grab 失败' }; }
      const a = this.panelAnchors(D, W);
      if (a.needSad) {
        if (!_mhKelingquTmpl) { a.why = '可领取模板未加载 → 保守判不在面板'; return a; }
        let sad = 0;
        for (let k = 0; k < MISSION.slotCx.length; k++) if (this.labelHit(ctx, _mhKelingquTmpl, k).ok) sad++;
        a.slotSad = sad;
        if (sad >= 1) a.panel = true;
      }
      return a;
    },
    inPanel(ctx) { return this.anchorsOf(ctx).panel; },

    // ————— 弹窗 / 浮层检测（0.5.77）—————
    /** 「一键领取」确认弹窗：主体区浅米色像素占比
     *  实测：弹窗 0.74 / 正常面板 0.09~0.14 / 主场景 0.26 / 推荐小队页 0.37 → 阈值 0.55 */
    popupOpen(D, W) {
      const x0 = MISSION.popupBox[0], y0 = MISSION.popupBox[1];
      const x1 = MISSION.popupBox[2], y1 = MISSION.popupBox[3];
      let pale = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * W + x) * 4;
          const r = D[i], g = D[i + 1], b = D[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx > 150 && (mx - mn) < 60) pale++;
          n++;
        }
      }
      const ratio = n ? pale / n : 0;
      return { open: ratio > MISSION_POPUP_PALE, ratio };
    },
    /** 「恭喜你获得」奖励浮层：面板区亮度骤降（浮层 33 / 正常面板 ≥81 / 主场景 150） */
    overlayOpen(D, W) {
      let v = 0, n = 0;
      for (let y = 80; y < 640; y += 4) {
        for (let x = 200; x < 1080; x += 4) {
          const i = (y * W + x) * 4;
          v += Math.max(D[i], D[i + 1], D[i + 2]); n++;
        }
      }
      const lum = n ? v / n : 0;
      return { open: lum < MISSION_DARK_LUM, lum };
    },
    _probe(ctx) {
      try { const img = ctx.vision.grab(0); return { D: img.data, W: img.width }; }
      catch (e) { return null; }
    },
    /** 收掉弹窗 / 浮层（最多 3 轮）。返回处理次数，0 = 画面干净 */
    async clearPopups(ctx) {
      let acted = 0;
      for (let i = 0; i < 3; i++) {
        const pf = this._probe(ctx);
        if (!pf) break;
        const pu = this.popupOpen(pf.D, pf.W);
        if (pu.open) {
          Utils.log('info', `    🔔 「一键领取」确认弹窗（浅米占比 ${pu.ratio.toFixed(2)}）→ 点「确定」(${MISSION.popupOkBtn.join(',')})`);
          try { await ctx.op.clickNatural(MISSION.popupOkBtn[0], MISSION.popupOkBtn[1], null, '一键领取-确定'); }
          catch (e) { Utils.log('warn', `    ⚠ 点「确定」失败：${(e && e.message) || e}`); }
          acted++;
          await Utils.sleep(1500);
          continue;
        }
        const ov = this.overlayOpen(pf.D, pf.W);
        if (ov.open) {
          const pt = MISSION.overlayPts[Math.min(i, MISSION.overlayPts.length - 1)];
          Utils.log('info', `    🎉 「恭喜你获得」浮层（亮度 ${ov.lum.toFixed(0)}）→ 点 (${pt.join(',')}) 收起`);
          try { await ctx.op.clickNatural(pt[0], pt[1], null, '收起奖励展示'); }
          catch (e) { Utils.log('warn', `    ⚠ 收起浮层失败：${(e && e.message) || e}`); }
          acted++;
          await Utils.sleep(1200);
          continue;
        }
        break;
      }
      return acted;
    },

    /** 领取所有已完成任务（槽位「可领取」）→ 返回本轮领取数
     *  ⚠ 助手内部点击一律用 clickNatural，不走 ctx.tap ——
     *    tap 会 _advance 流程图索引，而本任务每轮都重展开流程图并由 run 显式 ctx.step()，
     *    助手内部点数不定，走 tap 会把索引顶飞、流程图与 run 阶段对不上。
     *  0.5.77：补上「多个可领取 → 一键领取确认弹窗 → 恭喜你获得浮层」两步。
     *    0.5.77 真机录制证实：点任一「可领取」槽位图标 → 先弹确认框（「确定」(519,451)），
     *    再弹奖励浮层（点 (528,457) 收起）。旧实现只点图标就回头读槽位，
     *    读到的是「被浮层盖住」的画面 → 槽位被误判成空/计时中，等于白领。 */
    async collectDone(ctx) {
      let tmpl = null;
      try { tmpl = await loadMissionKelingquTmpl(); }
      catch (e) { Utils.log('warn', `    「可领取」模板加载失败：${(e && e.message) || e}`); }
      let got = 0;
      for (let round = 0; round < MISSION.concurrency; round++) {
        await Runtime.check();
        const s = await this.readSlots(ctx);
        if (!s.ok) { Utils.log('warn', `    ⚠ 读槽位失败：${s.why}`); break; }
        const idx = s.slots.findIndex(o => o.state === 'done');
        if (idx < 0) {
          if (round === 0) Utils.log('info', `    （顶部无可领取：${this.fmtSlots(s)}）`);
          break;
        }
        const cx = MISSION.slotCx[idx];
        await this.clearPopups(ctx);   // 保证这一帧是真实面板，不是残留浮层
        let s2 = null, via = '';
        for (const pair of [[MISSION.slotIconCy, '图标'], [MISSION.slotLabelCy, '标签']]) {
          const cy = pair[0], tag = pair[1];
          Utils.log('info', `    🎁 槽位 ${idx + 1}「可领取」(SAD${s.slots[idx].sad.toFixed(0)}) → 点${tag} (${cx},${cy})`);
          try { await ctx.op.clickNatural(cx, cy, null, '领取奖励(' + tag + ')'); }
          catch (e) { Utils.log('warn', `    ⚠ 领取点击异常：${(e && e.message) || e}`); break; }
          await Utils.sleep(1200);
          // 多个可领取 → 确认弹窗；领取成功 → 奖励浮层。两步都在这里吸收掉。
          await this.clearPopups(ctx);
          await Utils.sleep(1000);
          s2 = await this.readSlots(ctx);
          if (s2.ok && s2.slots[idx].state !== 'done') { via = tag; break; }
          if (!this.inPanel(ctx)) {
            Utils.log('warn', '    ⚠ 点完后面板已不在（可能还有没收起的浮层）→ 本任务停手');
            break;
          }
        }
        if (s2 && s2.ok && s2.slots[idx].state !== 'done') {
          got++;
          Utils.log('info', `    ✓ 已领取（**${via}落点生效**，槽位 ${idx + 1} → ${MISSION_SLOT_TXT[s2.slots[idx].state]}）`);
          continue;
        }
        Utils.log('warn', `    ⚠ 槽位 ${idx + 1} 点图标/标签后仍显示「可领取」→ 本轮停手不再点（请回传这条日志以便定正确落点）`);
        break;
      }
      if (!got) Utils.log('info', '    （本轮没有可领取的任务）');
      await this.clearPopups(ctx);   // 领完再清一次，免得浮层残留影响后面的接取判定
      return got;
    },

    /** 按顶部槽位空闲数补接红/蓝宝箱任务（不用「换一组」）→ 返回本轮接取数 */
    async acceptQualifying(ctx) {
      const s = await this.readSlots(ctx);
      if (!s.ok) { Utils.log('warn', `    ⚠ 读槽位失败：${s.why}`); return 0; }
      Utils.log('info', `    📋 顶部槽位：${this.fmtSlots(s)} → 空闲 ${s.free}/${MISSION.concurrency}` +
        `（可领取 ${s.done} + 空缺 ${s.empty}），在跑 ${s.running}`);
      Utils.log('debug', `       ${this.detail(s)}`);
      const room = MISSION.concurrency - s.running;   // 还能再派遣几个 = 空闲位数
      if (room <= 0) {
        Utils.log('info', '    🈵 3 个槽位**全部计时中**（既无可领取、也无空缺）→ 判为满 3，本轮不接');
        return 0;
      }
      Utils.log('info', `    ✅ 顶部空闲 ${room} 位 → 本轮最多再接 ${room} 个红/蓝宝箱任务`);
      let got = 0;
      while (got < room) {
        await Runtime.check();
        let D, W;
        try { const img = ctx.vision.grab(0); D = img.data; W = img.width; } catch (e) { break; }
        if (!this.inPanel(ctx)) { Utils.log('warn', '    面板已离开（接取后未返回），本轮提前结束'); break; }
        // 同轮里红优先于蓝（红的更珍贵；两者都在允许清单内）
        let pick = null;
        for (let r = 0; r < MISSION.btnY.length; r++) {
          if (!this.btnAvailable(D, W, r)) continue;
          const t = this.chestType(D, W, r);
          if (t !== 'red' && t !== 'blue') continue;
          if (!pick || (t === 'red' && pick.t === 'blue')) pick = { r, t };
          if (pick.t === 'red') break;
        }
        if (!pick) { Utils.log('info', '    🔍 当前候选里没有可接的红/蓝宝箱任务'); break; }
        const which = pick.t === 'red' ? '红' : '蓝';
        Utils.log('info', `    ✅ 接取第 ${pick.r + 1} 行（${which}宝箱）`);
        try {
          await ctx.op.clickNatural(MISSION.btnX, MISSION.btnY[pick.r], null, '接取任务');
          await Utils.sleep(1400);   // 弹出「选择小队」面板
          await ctx.op.clickNatural(MISSION.acceptBtn[0], MISSION.acceptBtn[1], null, '推荐小队');
          await Utils.sleep(1000);
          await ctx.op.clickNatural(MISSION.launchBtn[0], MISSION.launchBtn[1], null, '出发');
          await Utils.sleep(1800);   // 等派遣动画 + 面板回落
        } catch (e) {
          Utils.log('warn', `    ⚠ 接取流程点击中断：${(e && e.message) || e}`);
          break;
        }
        got++;
      }
      return got;
    },

    /** 分片可中断睡眠（长挂机时用户点停止能立刻响应） */
    async sleepInterruptible(ms) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        await Runtime.check();
        await Utils.sleep(Math.min(5000, ms - (Date.now() - t0)));
      }
    },

    /** 打开集会所面板：回主界面 → 两段拖动 → 点入口；
     *  失败则**回主界面 → 换备用拖动高度重拖 → 点备用落点**。
     *  0.5.80：拖动高度改用**真机录制实测的 y=282**（依据见 MISSION.swipeY 注释）；
     *          两段之间的等待 1s → 1.6s（录制里两步间隔 1.65s，滑动惯性动画需要时间）；
     *          首轮失败后先回主界面再重试（否则第二段拖动可能落在非主场景页面上）。
     *  ⚠ 全程走底层 op/nav API（不推进流程图索引），调用方需自行 ctx.step()。 */
    async openPanel(ctx) {
      Utils.log('info', '    ▶ 回主界面 → 两段拖动 → 点开「任务集会所」');
      try { await ctx.nav.goHome(); }
      catch (e) { Utils.log('warn', `    ⚠ goHome 失败：${(e && e.message) || e}`); }
      // ── 拖动动作统一为「把主界面拖到最左」（v0.6.14）────────────────────
      //  用户口径（2026-09-21）：「任务集会所的拖动，好像是拖一次，这个是不是你没改到，
      //    或者没把拖动这个动作，统一成拖到屏幕最左和拖到屏幕最右」
      //    +「拖到最左和拖到最右都是要拖两次哟，一次肯定拖不完」。
      //
      //  集会所入口在主界面**最左边**，所以方向是"手左→右滑 ⇒ 主界面到最左"
      //  （= SCENE_DRAG_TO_LEFT，与 NAV 的 SCENE_DRAG_TO_RIGHT 正好相反）。
      //
      //  ⚠ 旧实现（0.5.80 起）用的是录制原始坐标 325→1117 / 301→1017，问题：
      //    · 落点 1117 / 1017 超出安全区上限 1000 → 被 swipe 钳到 1000，
      //      位移从 792 / 716 缩到 **675 / 699**，且贴到 x=1000 那条边缘，
      //      实测（2026-09-21 18:43）两次拖完「没打开面板」。
      //    · 与 NAV 各写一套坐标，改一处漏一处 —— 现统一走 SCENE_DRAG_TO_LEFT。
      //  备用策略（y 高度 / 备用落点）保留：万一统一动作仍开不了面板还有退路。
      //  v0.6.27：改为直接调用标准件 —— 任务层不再自己写拖动坐标/次数/速度。
      const drag = async () => { await dragScene(ctx, 'left'); };
      try {
        await drag();
        await ctx.op.clickNatural(MISSION.entry[0], MISSION.entry[1], null, '打开集会所');
      } catch (e) { Utils.log('warn', `    ⚠ 进面板操作异常：${(e && e.message) || e}`); }
      await Utils.sleep(1800);   // 面板开启动画
      if (this.inPanel(ctx)) return true;
      Utils.log('warn', `    ⚠ 统一拖动(→最左) + 入口 (${MISSION.entry.join(',')}) 没打开面板 → ` +
        `回主界面后重拖 + 备用落点 (${MISSION.entryAlt.join(',')})`);
      try {
        await ctx.nav.goHome();
        await Utils.sleep(800);
        await drag();
        await ctx.op.clickNatural(MISSION.entryAlt[0], MISSION.entryAlt[1], null, '打开集会所(备用)');
      } catch (e) { /* ignore */ }
      await Utils.sleep(1800);
      return this.inPanel(ctx);
    },

    /** 面板丢失后的恢复：先收弹窗/浮层，仍不在面板就回主界面重开。返回是否已回到面板 */
    async recover(ctx) {
      await this.clearPopups(ctx);
      if (this.inPanel(ctx)) return true;
      return await this.openPanel(ctx);
    },

    /** 0.5.81：**回主界面 → 原地等 totalMs → 下一轮重新进场**（用户 2026-09-20 口径）。
     *  背景：旧做法是在集会所面板里挂机、每 3 分钟轻点/短滑保活 —— 用户实测
     *  「左右滑动这样不行，还是被判定为无操作而超时」。
     *  现在改成在两个界面之间来回切换：每轮领完/接完就回主界面，等 pollMin 分钟再拖屏进面板。
     *  ⚠ 等待期间**刻意不做任何操作**：主界面上的拖动会移动镜头，下一轮 openPanel 的
     *     两段拖屏坐标（325→1117 / 301→1017）就会偏，反而进不去面板。
     *  返回：是否**确认**回到了主界面（goHome 每轮截图识别场景；没确认也不要紧，
     *        下一轮进场前还会再 goHome 一次）。 */
    async sleepAtHome(ctx, totalMs) {
      let atHome = false;
      try {
        await this.clearPopups(ctx);            // 先把战后/浮层残留收掉，免得盖住主界面识别
        atHome = !!(await ctx.nav.goHome());
      } catch (e) { Utils.log('warn', `    ⚠ 回主界面异常：${(e && e.message) || e}`); }
      if (atHome) Utils.log('info', '    🏠 已回主界面');
      else Utils.log('warn', '    ⚠ 未确认回到主界面（下一轮进场前会再试一次）');
      await this.sleepInterruptible(totalMs);
      return atHome;
    },
  };

  // ── 招财（collectGold）时序参数 ────────────────────────────────────────────
  /** 两次「免费招财」点击之间的间隔（ms）。
   *  0.5.76：0.5s → 2s。0.5s 太快，第 2 次点击容易落在第 1 次的招财动画里而没被记上。
   *  要再调就改这里。 */
  const GOLD_FREE_GAP_MS = 2000;

  const TASK_DEFS = [

    // ————— 每日收获 —————
    {
      key: 'collectGold', name: '招财', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-13 用户口径：**不再做视觉识别**——打开招财页后默认直接点 2 次「免费招财」位 (830,555)。
       *  2026-09-19：两次间隔 0.5s → GOLD_FREE_GAP_MS(2s)。用户反馈 0.5s 太快、第 2 次点击容易没被记上
       *  （"太快了，怕少点"）。（更早还试过用探针 goldFreeText/goldDone 判定就绪与免费态，真机上不稳定） */
      steps: [
        { kind: 'tap', title: '打开招财页', detail: '点主界面顶部「招财」入口 (762,44)，等页面加载', coord: [COORDS.collect.goldEntry.x, COORDS.collect.goldEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '免费招财 #1', detail: '不做识别，直接点 (830,555)', coord: [830, 555], color: '126,231,135' },
        { kind: 'tap', title: '免费招财 #2', detail: '等 2s（GOLD_FREE_GAP_MS）后再点 (830,555)', coord: [830, 555], color: '126,231,135' },
        { kind: 'tap', title: '返回主界面', detail: '点右上「返回」按钮 (1087,118)', coord: [COORDS.collect.goldBack.x, COORDS.collect.goldBack.y], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景（最多 6 轮）', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.collect.goldEntry, null, '打开招财页');
        // 不做识别，直接点 2 次「免费招财」位 (830,555)。
        //   这里用底层 clickNatural + 显式 sleep，而不用 ctx.tap —— ctx.tap 收尾会走
        //   delay.click 区间，间隔不可控。
        //   0.5.52：按用户要求拆成「免费招财 #1 / #2」两个流程图步骤（"做成两步"）。
        //   0.5.76：0.5s → GOLD_FREE_GAP_MS(2s)。0.5s 时第 2 次点击常落在第 1 次的招财动画
        //     /按钮刷新窗口里而**没被记上**（用户："太快了，怕少点"）。
        const GOLD_FREE_X = 830, GOLD_FREE_Y = 555;
        for (let i = 1; i <= 2; i++) {
          ctx._advance('免费招财 #' + i);
          if (i > 1) {
            Utils.log('info', `    ⏳ 等 ${GOLD_FREE_GAP_MS}ms 后点第 2 次招财`);
            await Utils.sleep(GOLD_FREE_GAP_MS);
          }
          try {
            await ctx.op.clickNatural(GOLD_FREE_X, GOLD_FREE_Y, null, '免费招财#' + i);
            Utils.log('info', `    💰 免费招财 ${i}/2 @(${GOLD_FREE_X},${GOLD_FREE_Y})`);
          } catch (e) {
            Utils.log('warn', `    ⚠ 免费招财#${i} 点击失败：${(e && e.message) || e}`);
          }
          ctx.stepResult(true);
        }
        await Utils.sleep(1000);   // 等招财动画/按钮刷新后再返回
        await ctx.tap(COORDS.collect.goldBack, null, '返回主界面');
        await ctx.home();

      }
    },

    {
      key: 'collectMail', name: '邮件领取', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  前 4 步为 2026-09-11 面板校准实测坐标（原 1~3 步已替换） */
      steps: [
        { kind: 'tap', title: '打开邮件', detail: '点主界面左侧「邮件」入口', coord: [COORDS.collect.mailEntry.x, COORDS.collect.mailEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '一键领取', detail: '点底部「一键领取」', coord: [COORDS.collect.mailAll.x, COORDS.collect.mailAll.y], color: '126,231,135' },
        { kind: 'tap', title: '一键删除', detail: '点底部「一键删除」', coord: [COORDS.collect.mailDelete.x, COORDS.collect.mailDelete.y], color: '210,153,34' },
        { kind: 'tap', title: '确认删除', detail: '点弹窗「确认」', coord: [COORDS.collect.mailConfirm.x, COORDS.collect.mailConfirm.y], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.collect.mailEntry);
        await ctx.tap(COORDS.collect.mailAll);
        await Utils.sleep(1000);   // 一键领取 → 一键删除 之间加 0.5s：等领取弹窗/列表刷新，避免连点太快漏掉删除
        await ctx.tap(COORDS.collect.mailDelete);
        await ctx.tap(COORDS.collect.mailConfirm);
        await ctx.home();

      }
    },

    {
      key: 'collectSign', name: '每日签到', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-12 每日签到 (2).json 校准实测；2026-09-13 按用户反馈重做定位：
       *  「活动页新增了功能，菜单项位置变了」→ 原来的兜底坐标 (107,386) 现在正好压在
       *  「好友召回」行上，一旦模板匹配失手就会点错页。用户口径：**必须识别准确，不靠兜底**
       *  → 删除兜底盲点，改为「新模板 + 多次重试 + 失败即跳过本任务」。
       *  实测（2026-09-13 真机活动页）：新模板在当前画面 score=0.0（命中 (92,314)），
       *  在首页/战斗/小队突袭等 6 张其它画面上最佳 score ≥35 → 阈值 25 判别余量很大。 */
      steps: [
        { kind: 'tap', title: '打开活动页', detail: '点主界面右上「活动」入口 (1231,50)', coord: [1231, 50], color: '88,166,255' },
        { kind: 'check', title: '定位「每月签到」菜单项', detail: '模板匹配左侧菜单「每月签到」文字（识别为准，失败再滚动重试；不做兜底盲点）', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '点「每月签到」菜单项', detail: '点识别到的菜单项位置（2026-09-13 实测约 (92,314)）', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '点签到', detail: '点右下「签到」按钮 (1184,576)', coord: [1184, 576], color: '210,153,34' },
        { kind: 'check', title: '领奖并回主界面', detail: '等签到奖励弹窗 → 关弹窗 → goHome', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1231, 50], null, '打开活动页');
        await Utils.sleep(2500);   // 活动页加载+动画

        // ——— 定位「每月签到」菜单项（模板匹配；识别为准，失败不用兜底坐标）———
        const SEARCH = [8, 90, 175, 700];   // 左侧菜单栏全列
        let tmpl = null;
        try { tmpl = await loadSignMenuTmpl(); } catch (e) { tmpl = null; }
        const tryMatch = (tag) => {
          if (!tmpl) return null;
          try {
            const r = ctx.vision.findTemplate(tmpl, SEARCH);
            const hit = r.ok ? [Math.round(r.cx), Math.round(r.cy)] : null;
            Utils.log('info', `    🔎 每月签到 定位[${tag}] score=${r.score} ` +
              `${hit ? '✓ 命中 (' + hit[0] + ',' + hit[1] + ')' : '✗ 未命中'}`);
            return hit;
          } catch (e) {
            Utils.log('warn', `    ⚠ 每月签到 定位异常[${tag}]：${(e && e.message) || e}`);
            return null;
          }
        };

        let pos = tryMatch('原样');
        if (!pos) { await Utils.sleep(1000); pos = tryMatch('复检'); }
        if (!pos) {
          // 菜单可能被滚动过：先向下拖（内容下移，露出上面的项）
          Utils.log('info', '    ↕ 未命中 → 菜单下拖后重试');
          try { await ctx.op.swipe(100, 150, 140, 600, 450); } catch (e) {}
          await Utils.sleep(1200); pos = tryMatch('下拖后');
        }
        if (!pos) {
          // 再向上拖（内容上移，露出下面的项）
          Utils.log('info', '    ↕ 仍未命中 → 菜单上拖后重试');
          try { await ctx.op.swipe(140, 600, 100, 150, 450); } catch (e) {}
          await Utils.sleep(1200); pos = tryMatch('上拖后');
        }

        ctx.step('定位「每月签到」菜单项');
        if (!pos) {
          // ⚠ 绝不退回盲点坐标：旧兜底 (107,386) 已压到「好友召回」上，会点进错误的页面。
          //   识别不出来就把本任务标记失败并收尾，宁可不签到也不要跳错页。
          Utils.log('warn', '    ⚠ 未能定位「每月签到」菜单项 → 跳过本任务（不做兜底盲点，避免点错页面）');
          ctx.stepResult(false);
          ctx.step('点「每月签到」菜单项(已跳过)'); ctx.stepResult(false);
          ctx.step('点签到(已跳过)'); ctx.stepResult(false);
          await ctx.home();
          return;
        }
        ctx.stepResult(true);

        await ctx.tap(pos, null, '点「每月签到」菜单项');
        await Utils.sleep(2000);   // 校准间隔 3.1s：签到页切换

        await ctx.tap([1184, 576], null, '点签到');
        await Utils.sleep(2500);   // 签到奖励弹窗
        await ctx.popups();        // 关奖励弹窗（如有）
        await ctx.home();

      }
    },

    {
      key: 'shareDaily', name: '每日分享', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准 JSON 实测坐标 */
      steps: [
        { kind: 'tap', title: '打开分享入口', detail: '点主界面左侧入口 (91,50)', coord: [91, 50], color: '88,166,255' },
        { kind: 'tap', title: '点分享', detail: '点「分享」按钮 (1052,144)', coord: [1052, 144], color: '126,231,135' },
        { kind: 'tap', title: '确认分享', detail: '点分享弹窗「确认」(1208,665)', coord: [1208, 665], color: '210,153,34' },
        { kind: 'tap', title: '关奖励弹窗', detail: '分享完成后关弹窗 (866,204)', coord: [866, 204], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([91, 50], null, '打开分享入口');
        await ctx.tap([1052, 144], null, '点分享');
        await Utils.sleep(1500);   // 校准间隔 2.5s：分享弹窗动画
        await ctx.tap([1208, 665], null, '确认分享');
        await Utils.sleep(3000);   // 校准间隔 5.4s：分享动画+奖励弹窗
        // ⚠ 分享生成的图是**宿主页面 DOM 覆盖层**（如 /html/body/div[9]/...），不在云游戏 video 里。
        //   主点击通道把事件派发到 video，这类覆盖层永远收不到 → 必须走页面层点击（domTap）。
        const closed = await ctx.domTap([866, 204], '关奖励弹窗');
        if (!closed) {
          // 兜底 1：按用户提供的 DOM 路径定位（索引类 XPath 会随页面结构变化，仅作兜底）
          let byX = { ok: false };
          try { byX = ctx.op.domClick(866, 204, { xpath: SHARE_IMG_CLOSE_XPATH }) || byX; } catch (e) {}
          if (byX.ok) Utils.log('info', `    🖱 按 DOM 路径关闭分享图成功 → ${byX.path}`);
          else {
            // 兜底 2：仍按游戏画面层点一次（若该弹窗其实在画面内）
            await ctx.op.clickNatural(866, 204, null, '关奖励弹窗(游戏层兜底)');
            await Utils.sleep(1000);
          }
        }
        await ctx.home();

      }
    },

    {
      key: 'collectRank', name: '排行榜点赞', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应） */
      steps: [
        { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开排行榜', detail: '点「排行榜」入口', coord: [COORDS.collect.rankEntry.x, COORDS.collect.rankEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点赞', detail: '点「点赞」按钮；与上一步间隔 ≥2s（等榜单加载）', coord: [COORDS.collect.rankLike.x, COORDS.collect.rankLike.y], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        // 0.5.76（用户反馈）：拖动/开页后立刻进行下一步，遇到加载延迟会点错位置 → 每步之间都补足间隔。
        //   ctx.drag / ctx.go / ctx.tap 自身收尾已有 delay.click(≥1s)，这里再按步骤补一段显式等待。
        // 统一动作：拖到最左（用户 2026-09-21 口径；原来遍历 COORDS.collect.rankDrags
        //   用的是录制原始坐标 173→1589 / 211→1196，落点 1589 会越界点到右侧图标）
        await dragScene(ctx, 'left');
        await Utils.sleep(1000);   // 等镜头滑停落位
        await ctx.go(COORDS.collect.rankEntry);
        await Utils.sleep(2000);     // 排行榜页加载（榜单刷出 + 展开动效）
        await ctx.tap(COORDS.collect.rankLike);
        await Utils.sleep(1500);     // 等点赞动效播完，再回主界面
        await ctx.home();

      }
    },

    {
      key: 'privilegeShop', name: '特权商店', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-12 特权商店.json 校准实测：商城 → 商店 → 特权商店 → 特权积分页 → 右下「领取」消费积分 */
      steps: [
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
    },

    {
      key: 'collectNinjutsu', name: '忍法帖点赞', category: 'weekly',
      /** 2026-09-14 忍法帖点赞.json 重录改版：原「进忍法帖领奖」流程废弃，改为「排行榜点赞 + 每周分享」
       *  （排行榜页提示：每周首次分享得 10 金币）；同日起任务从「每日收获」移到「周常任务」。
       *  流程：忍法帖入口(1223,448) → 底部「排行榜」(1179,676) → 给第一名「点赞」(1028,248) →
       *  右下「分享」(1041,577) → 分享页（星界游钓卡）确认分享(1177,623) → 关闭排行榜 ✕(1219,40) → 回主界面。
       *  注：录制里倒数第二下 (1224,49) 没点中 ✕ 热区（帧差分证实页面未变），真正关掉的是 (1219,40)，脚本只点有效那下。 */
      steps: [
        { kind: 'tap', title: '打开忍法帖', detail: '主界面右侧「忍法帖」入口 (1223,448)', coord: [1223, 448], color: '88,166,255' },
        { kind: 'tap', title: '打开排行榜', detail: '忍法帖底部「排行榜」(1179,676)', coord: [1179, 676], color: '126,231,135' },
        { kind: 'tap', title: '给第一名点赞', detail: '排行榜第 1 名右侧「点赞」(1028,248)', coord: [1028, 248], color: '126,231,135' },
        { kind: 'tap', title: '点「分享」', detail: '排行榜右下「分享」（每周首次得 10 金币）(1041,577)', coord: [1041, 577], color: '210,153,34' },
        { kind: 'tap', title: '分享页确认', detail: '分享卡片页右下确认分享 (1177,623)', coord: [1177, 623], color: '210,153,34' },
        { kind: 'tap', title: '关闭排行榜', detail: '等分享返回后点右上 ✕ (1219,40)', coord: [1219, 40], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1223, 448], null, '打开忍法帖');
        await Utils.sleep(3000);   // 校准间隔 3.6s：忍法帖加载
        await ctx.tap([1179, 676], null, '打开排行榜');
        await Utils.sleep(2500);   // 校准间隔 2.7s
        await ctx.tap([1028, 248], null, '给第一名点赞');
        await Utils.sleep(2000);   // 校准间隔 2.3s：点赞动效
        await ctx.tap([1041, 577], null, '点「分享」');
        await Utils.sleep(2200);   // 校准间隔 2.2s：分享页加载
        await ctx.tap([1177, 623], null, '分享页确认');
        await Utils.sleep(5000);   // 校准间隔 7.7s：分享出去→自动返回排行榜（留足余量）
        await ctx.tap([1219, 40], null, '关闭排行榜');
        await ctx.home();

      }
    },

    {
      key: 'recruit', name: '免费招募', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准（免费招募.json：仅 4 步 —— 打开招募 / 切「普通招募」页签 / 免费1抽 / 点「确定」；
       *  其中「免费1抽 → 确定」实录间隔 8.2s，就是招募动画 + 结果界面刷出的时间）
       *  2026-09-13 用户口径：
       *    ①「普通招募」页签改用**模板识别**（与「每日签到」同一套做法：识别为准，失败即跳过，不做兜底盲点）；
       *    ②取消原第 5 步「识别结果界面」——它点的 (400,555) 与第 4 步「确定」(429,571) 是招募结果界面上
       *      同一个按钮，属于重复动作；
       *    ③直接在「免费招募」与「确定」之间固定等 5s（替代原来的 3s）。 */
      steps: [
        { kind: 'tap', title: '打开招募', detail: '点主界面右上「招募」入口 (1229,148)', coord: [1229, 148], color: '88,166,255' },
        { kind: 'check', title: '定位「普通招募」页签', detail: '模板匹配左侧菜单「普通招募」文字（识别为准，失败再滚动重试；不做兜底盲点）', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '点「普通招募」页签', detail: '点识别到的页签位置（2026-09-13 真机实测约 (88,424)）', coord: null, color: '126,231,135' },
        { kind: 'tap', title: '免费招募', detail: '点「免费1抽」按钮 (884,579)', coord: [884, 579], color: '126,231,135' },
        { kind: 'tap', title: '点「确定」', detail: '等 5s 招募动画+结果界面 → 点「确定」(429,571)', coord: [429, 571], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1229, 148], null, '打开招募');
        await Utils.sleep(2500);   // 招募页加载

        // ——— 定位「普通招募」页签（模板匹配；识别为准，不用兜底坐标）———
        const SEARCH = [8, 90, 175, 700];   // 左侧菜单栏全列
        let tmpl = null;
        try { tmpl = await loadRecruitTabTmpl(); } catch (e) { tmpl = null; }
        const tryMatch = (tag) => {
          if (!tmpl) return null;
          try {
            const r = ctx.vision.findTemplate(tmpl, SEARCH);
            const hit = r.ok ? [Math.round(r.cx), Math.round(r.cy)] : null;
            Utils.log('info', `    🔎 普通招募 定位[${tag}] score=${r.score} ` +
              `${hit ? '✓ 命中 (' + hit[0] + ',' + hit[1] + ')' : '✗ 未命中'}`);
            return hit;
          } catch (e) {
            Utils.log('warn', `    ⚠ 普通招募 定位异常[${tag}]：${(e && e.message) || e}`);
            return null;
          }
        };

        let pos = tryMatch('原样');
        if (!pos) { await Utils.sleep(1000); pos = tryMatch('复检'); }
        // 2026-09-14 新增第二识别路径：白色文字行聚类。
        //  背景：云端视频流 720p→1080p，文字重采样抗锯齿变化，SAD 模板分 0→~29 卡死在阈值 25
        //  （现场帧实测 28.7，位置完全正确仍判未命中）。findTextRows 只认「灰度>170 且低饱和的白字行」，
        //  对清晰度/重采样不敏感；2026-09-12 已验证「普通招募 = 左侧菜单最后一个白色文字簇」。
        const tryTextRows = (tag) => {
          try {
            // 扫描区收窄 x∈[30,155]：避开页签右缘亮边（x161-166，恒定 ~6px/行白基线
            //  会把整列连成一个 460 行高的大簇，2026-09-14 现场帧实测）
            const r = ctx.vision.findTextRows([30, 90, 155, 700]);
            if (!r.ok || !r.clusters.length) {
              Utils.log('info', `    🔎 普通招募 文字行[${tag}] 无白色文字簇`);
              return null;
            }
            const c = r.clusters[r.clusters.length - 1];   // 普通招募 = 最后一簇
            if (c.cy < 350 || c.cy > 500) {                // 合理范围校验，防识别异常点错
              Utils.log('warn', `    ⚠ 普通招募 文字行[${tag}] 最后一簇 cy=${Math.round(c.cy)} 超出合理范围 → 弃用`);
              return null;
            }
            Utils.log('info', `    🔎 普通招募 文字行[${tag}] ✓ 最后一簇 (${Math.round(c.cx)},${Math.round(c.cy)})，共 ${r.clusters.length} 簇`);
            return [Math.round(c.cx), Math.round(c.cy)];
          } catch (e) {
            Utils.log('warn', `    ⚠ 普通招募 文字行[${tag}] 异常：${(e && e.message) || e}`);
            return null;
          }
        };
        if (!pos) pos = tryTextRows('模板未中');
        if (!pos) {
          // 菜单可能被滚动过：先向下拖（内容下移，露出上面的项）
          Utils.log('info', '    ↕ 未命中 → 菜单下拖后重试');
          try { await ctx.op.swipe(100, 150, 140, 600, 450); } catch (e) {}
          await Utils.sleep(1200); pos = tryMatch('下拖后'); if (!pos) pos = tryTextRows('下拖后');
        }
        if (!pos) {
          // 再向上拖（内容上移，露出下面的项）
          Utils.log('info', '    ↕ 仍未命中 → 菜单上拖后重试');
          try { await ctx.op.swipe(140, 600, 100, 150, 450); } catch (e) {}
          await Utils.sleep(1200); pos = tryMatch('上拖后'); if (!pos) pos = tryTextRows('上拖后');
        }

        ctx.step('定位「普通招募」页签');
        if (!pos) {
          // ⚠ 与「每日签到」同一口径：绝不退回盲点坐标（旧兜底 (90,421) 已不可靠），
          //   识别不出来就把本任务标记失败并收尾，宁可不招募也不要跳错页。
          Utils.log('warn', '    ⚠ 未能定位「普通招募」页签 → 跳过本任务（不做兜底盲点，避免点错页面）');
          ctx.stepResult(false);
          ctx.step('点「普通招募」页签(已跳过)'); ctx.stepResult(false);
          ctx.step('免费招募(已跳过)'); ctx.stepResult(false);
          ctx.step('点「确定」(已跳过)'); ctx.stepResult(false);
          await ctx.home();
          return;
        }
        ctx.stepResult(true);

        await ctx.tap(pos, null, '点「普通招募」页签');
        await Utils.sleep(1200);   // 页签切换动画
        await ctx.tap([884, 579], null, '免费招募');
        // 2026-09-13 用户口径：不再做「结果界面」识别（与下面的「确定」重复），直接在两步之间固定等 5s。
        await Utils.sleep(5000);   // 招募动画 + 结果界面刷出（原 3s 偏短）
        await ctx.tap([429, 571], null, '点「确定」');
        await Utils.sleep(2500);   // 结果界面关闭动画
        await ctx.home();

      }
    },



    {
      key: 'collectActive', name: '活跃度宝箱', category: 'collect',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-12 活跃度宝箱.json 校准实测：奖励页依次点 10/40/80/100 四个宝箱，
       *  奖励弹窗约 1.2s 自动消失，无需单独点确认 */
      steps: [
        { kind: 'tap', title: '打开奖励页', detail: '点主界面右侧「奖励」入口 (1228,349)', coord: [1228, 349], color: '88,166,255' },
        { kind: 'tap', title: '领 10 活跃度宝箱', detail: '点宝箱 (506,559)', coord: [506, 559], color: '126,231,135' },
        { kind: 'tap', title: '领 40 活跃度宝箱', detail: '点宝箱 (735,576)', coord: [735, 576], color: '126,231,135' },
        { kind: 'tap', title: '领 80 活跃度宝箱', detail: '点宝箱 (1035,553)', coord: [1035, 553], color: '126,231,135' },
        { kind: 'tap', title: '领 100 活跃度宝箱', detail: '点宝箱 (1185,563)', coord: [1185, 563], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: '关残留弹窗 → goHome', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1228, 349], null, '打开奖励页');
        await Utils.sleep(2000);   // 奖励页加载
        for (const b of COORDS.collect.activeBoxes) {   // [506,559] [735,576] [1035,553] [1185,563]
          await ctx.tap([b.x, b.y], null, '领活跃度宝箱');
          await Utils.sleep(1200);   // 校准间隔 ~1.2s：等奖励弹窗自动消失
        }
        await ctx.popups();        // 关残留弹窗（如活跃度不足的提示）
        await ctx.home();

      }
    },

    // ————— 日常任务 —————
    {
      key: 'sendStamina', name: '赠送体力', category: 'daily',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准 JSON 实测坐标
       *  2026-09-13 按用户要求从「每日收获」移入日常任务，并排日常首位（TASK_DEFS 顺序即执行/面板顺序）
       *  2026-09-13 步骤名按用户口径更正为「一键领取 / 点确认 / 一键赠送 / 关闭红叉」，
       *  并修 2→3 步无延时导致「点确认」点空（录制间隔 1.39s，原为 0s 背靠背点击） */
      steps: [
        { kind: 'tap', title: '打开体力页', detail: '点主界面左侧体力入口 (60,211)', coord: [60, 211], color: '88,166,255' },
        { kind: 'tap', title: '一键领取', detail: '点「一键领取」(521,589)', coord: [521, 589], color: '126,231,135' },
        { kind: 'tap', title: '点确认', detail: '点「确认」(626,452)；与上一步间隔 1.5s（等确认弹窗刷出）', coord: [626, 452], color: '210,153,34' },
        { kind: 'tap', title: '一键赠送', detail: '点「一键赠送」(340,595)', coord: [340, 595], color: '126,231,135' },
        { kind: 'tap', title: '关闭红叉', detail: '点右上红✕ (1185,106)；与上一步间隔 2s（等赠送结算动画走完）', coord: [1185, 106], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([60, 211], null, '打开体力页');
        await Utils.sleep(1000);   // 第1→2 步：等体力页弹窗加载完再点「一键领取」
        await ctx.tap([521, 589], null, '一键领取');
        await Utils.sleep(1500);  // 第2→3 步【本次修复】：等「一键领取」的确认弹窗刷出后再点确认
                                  //   此前该处无延时（背靠背点击），确认按钮还没渲染 → 点击落空
        await ctx.tap([626, 452], null, '点确认');
        await Utils.sleep(2000);  // 第3→4 步：确认/结算动画
        await ctx.tap([340, 595], null, '一键赠送');
        await Utils.sleep(2000);  // 第4→5 步：等赠送动画走完再关页（过早关闭可能取消赠送）
        await ctx.tap([1185, 106], null, '关闭红叉');
        await ctx.home();

      }
    },

    {
      key: 'ichiraku', name: '一乐拉面', category: 'daily',
      /** 2026-09-12 桌面校准实测；每天 11:00 后才能领——未到时间自动跳过（不算失败）
       *  2026-09-13 按用户要求移到**日常任务首位**（TASK_DEFS 顺序即执行/面板顺序）
       *  2026-09-13 补齐步间延时：每步之间至少 1s（原 2→3、3→4 为 0 延时，背靠背点击易点空） */
      steps: [
        { kind: 'tap', title: '打开一乐拉面', detail: '点入口 (1232,53)；go() 自带页面加载等待 1.8~3.2s', coord: [1232, 53], color: '88,166,255' },
        { kind: 'tap', title: '选拉面', detail: '点 (348,351)；与上一步间隔 ≥1s', coord: [348, 351], color: '88,166,255' },
        { kind: 'tap', title: '吃拉面', detail: '点 (728,363)；与上一步间隔 ≥2s（1s 基础延时 + 1s 保险，等界面切完）', coord: [728, 363], color: '126,231,135' },
        { kind: 'tap', title: '确认领取', detail: '点 (1103,364)；与上一步间隔 ≥2s（1s 基础延时 + 1s 保险，等确认弹窗刷出）', coord: [1103, 364], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        const now = new Date();
        if (now.getHours() < 11) {
          await ctx.flow('一乐拉面', [
            { kind: 'check', title: '未到 11:00，跳过', detail: '一乐拉面每天 11:00 后才能领，本次自动跳过', coord: null, color: '210,153,34' },
          ]);
          ctx.stepResult(true);
          Utils.log('info', '🍜 一乐拉面：未到 11:00，跳过领取');
          return;
        }
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1232, 53], null, '打开一乐拉面');   // go 自带 pageLoad 等待 1.8~3.2s（录制 2.45s）
        await ctx.tap([348, 351], null, '选拉面');
        await Utils.sleep(1000);   // 第2→3 步【本次修复】：此前 0 延时 → 选面后界面还没切完就点「吃拉面」
                                   //   delay.click 已保证 ≥1s，这里再加 1s 保险（录制间隔 1.09s）
        await ctx.tap([728, 363], null, '吃拉面');
        await Utils.sleep(1000);   // 第3→4 步【本次修复】：此前 0 延时 → 等吃面动画/确认弹窗刷出（录制 1.01s）
        await ctx.tap([1103, 364], null, '确认领取');
        await ctx.home();

      }
    },

    {
      key: 'equipSweep', name: '精英副本', category: 'daily',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准 JSON 实测坐标（替换原「装备扫荡」）
       *  2026-09-13 按用户要求移到**一乐拉面之后**（日常顺序：赠送体力 → 一乐拉面 → 精英副本 → 组织祈福 → …） */
      steps: [
        { kind: 'tap', title: '打开精英副本', detail: '点入口 (1159,620)', coord: [1159, 620], color: '88,166,255' },
        { kind: 'tap', title: '选择页签', detail: '点顶部页签 (231,62)', coord: [231, 62], color: '88,166,255' },
        { kind: 'tap', title: '选副本', detail: '点副本项 (771,652)', coord: [771, 652], color: '88,166,255' },
        { kind: 'tap', title: '选关卡', detail: '点关卡 (567,592)', coord: [567, 592], color: '88,166,255' },
        { kind: 'tap', title: '点扫荡', detail: '点「扫荡」按钮 (1060,588)', coord: [1060, 588], color: '126,231,135' },
        { kind: 'tap', title: '确认扫荡', detail: '点确认 (1095,541)', coord: [1095, 541], color: '210,153,34' },
        { kind: 'tap', title: '继续/领取', detail: '点 (883,213)（校准间隔 4s 后）', coord: [883, 213], color: '210,153,34' },
        { kind: 'check', title: '等结算动画 10s', detail: '0.5.52：等「继续/领取」的结算/翻牌动画彻底跑完（固定 10s）再关页面', coord: null, color: '188,140,255' },
        { kind: 'tap', title: '关闭页面', detail: '点右上红✕ (1096,109)', coord: [1096, 109], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go([1159, 620], null, '打开精英副本');
        await ctx.tap([231, 62], null, '选择页签');
        await ctx.tap([771, 652], null, '选副本');
        await ctx.tap([567, 592], null, '选关卡');
        await ctx.tap([1060, 588], null, '点扫荡');
        await Utils.sleep(2000);   // 校准间隔 3s：扫荡确认弹窗
        await ctx.tap([1095, 541], null, '确认扫荡');
        await Utils.sleep(3000);   // 校准间隔 4s：扫荡动画
        await ctx.tap([883, 213], null, '继续/领取');
        // 0.5.52 用户要求：第 7 步「继续/领取」点完有一段结算/翻牌动画，必须等它彻底跑完
        // 再点关闭；否则动画中途点右上红✕会被吃掉（或误点到底下的其它按钮）。固定 10s。
        ctx._advance('等结算动画 10s');
        await Utils.sleep(10000);
        ctx.stepResult(true);
        await ctx.tap([1096, 109], null, '关闭页面');
        await ctx.home();

      }
    },

    {
      key: 'orgBlessing', name: '组织祈福', category: 'daily',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-16 全量按用户录制「组织祈福2.json」重写：
       *  ① 祈福页改版：焚香祈福 (326,607)（6000 金币）+ 纳贡祈福 (582,579)（120 贡献），
       *     次数用完弹「今日次数已用完」→ 确定 (630,452)（orgUsedUp 探针确认才点）；
       *  ② **新增昨日遗留奖励领取**：左上「昨日奖励」礼包 (445,185)（带红点）→
       *     「昨日祈福奖励」弹窗（orgYesterday 探针）→ 点「领取」(804,269)（点两次覆盖多条目，
       *     领完按钮变灰再点无害）→ 点 (971,264) 关弹窗；
       *  ③ 收尾 ctx.home()（录制到关弹窗为止，回主界面由 goHome 兜底）。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开组织', detail: '点「组织」入口 (723,361)', coord: [723, 361], color: '88,166,255' },
        { kind: 'tap', title: '切祈福页签', detail: '点左侧「祠堂」(125,433)', coord: [125, 433], color: '88,166,255' },
        { kind: 'tap', title: '焚香祈福', detail: '点「焚香祈福」(326,607)（6000 金币，每日免费档）', coord: [326, 607], color: '126,231,135' },
        { kind: 'tap', title: '纳贡祈福', detail: '点「纳贡祈福」(582,579)（120 贡献；次数用完会弹提示）', coord: [582, 579], color: '126,231,135' },
        { kind: 'tap', title: '次数用完→确定', detail: '弹「今日次数已用完」→ 点「确定」(630,452)（orgUsedUp 探针确认才点）', coord: [630, 452], color: '210,153,34' },
        { kind: 'tap', title: '打开昨日奖励', detail: '点左上「昨日奖励」礼包 (445,185)（带红点）', coord: [445, 185], color: '126,231,135' },
        { kind: 'tap', title: '领取昨日奖励', detail: '「昨日祈福奖励」弹窗 → 点「领取」(804,269)（orgYesterday 探针确认；点两次覆盖多条目）', coord: [804, 269], color: '126,231,135' },
        { kind: 'tap', title: '关闭昨日奖励', detail: '点 (971,264) 关弹窗（录制实测）', coord: [971, 264], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）

        // 弹「今日次数已用完」就点确定；视觉不可用时兜底点一下（无弹窗落在供桌上，无害）
        const dismissUsedUp = async (label) => {
          let hit = false;
          try {
            const m = ctx.vision.match(PROBES.orgUsedUp);
            hit = !!(m && m.ok);
            Utils.log('info', `🏮 ${label}弹窗：${hit ? '出现 → 确定' : '未出现 → 跳过'}（期望(187,175,149) 实际(${(m && m.avg.r) | 0},${(m && m.avg.g) | 0},${(m && m.avg.b) | 0}) d=${m && m.dist}/${m && m.tol} std=${m && m.std}）`);
          } catch (e) {
            hit = true;
            Utils.log('warn', '🏮 次数弹窗识别失败，兜底点一次确定');
          }
          if (hit) { ctx.step('次数用完→确定'); ctx.stepResult(true); await ctx.tap([630, 452], null, '确定'); await Utils.sleep(1200); }
          else { ctx.step('无次数提示'); ctx.stepResult(true); }
        };

        await dragScene(ctx, 'left');   // 拖到最左（标准件）
        await ctx.go([723, 361], null, '打开组织');
        await Utils.sleep(1500);
        await ctx.tap([125, 433], null, '切祈福页签');
        await Utils.sleep(1800);

        // ① 焚香祈福（每日免费档）→ 可能弹「次数已用完」
        await ctx.tap([326, 607], null, '焚香祈福');
        await Utils.sleep(1800);
        await dismissUsedUp('焚香祈福');

        // ② 纳贡祈福（120 贡献）→ 次数用完弹提示
        await ctx.tap([582, 579], null, '纳贡祈福');
        await Utils.sleep(1800);
        await dismissUsedUp('纳贡祈福');

        // ③ 昨日遗留奖励：左上礼包（带红点）→ 弹窗 → 领取（两次覆盖多条目）→ 关闭
        await ctx.tap([445, 185], null, '打开昨日奖励');
        await Utils.sleep(1800);
        let opened = false;
        try {
          const m = ctx.vision.match(PROBES.orgYesterday);
          opened = !!(m && m.ok);
          Utils.log('info', `🏮 昨日奖励弹窗：${opened ? '出现 → 领取' : '未出现（可能已领取）→ 跳过'}`);
        } catch (e) {
          opened = true;   // 视觉不可用按有弹窗处理：领取/关闭坐标点在弹窗外也无害
          Utils.log('warn', '🏮 昨日奖励弹窗识别失败，按「有弹窗」兜底');
        }
        if (opened) {
          ctx.step('领取昨日奖励'); ctx.stepResult(true);
          await ctx.tap([804, 269], null, '领取#1');
          await Utils.sleep(1500);
          await ctx.tap([804, 269], null, '领取#2');
          await Utils.sleep(1200);
          await ctx.tap([971, 264], null, '关闭昨日奖励');
        } else {
          ctx.step('无昨日奖励弹窗'); ctx.stepResult(true);
        }

        await ctx.home();

      }
    },

    {
      key: 'abundanceRoom', name: '丰饶之间', category: 'daily', timeout: 300000,
      /** v0.6.25：按用户口径重写，与 run() 动作一一对应（用户 2026-09-23）：
       *  「主场景拖到最右 → 打开丰饶之间 → 点挑战 → 战斗 → 探测结算 → 回到主界面」
       *  ⚠ 拖动是**一个步骤**（dragScene 内部拖 2 次算一次统一动作）——
       *    旧版拆成「第一次/第二次」两条，加上 dragScene 当时不推进流程图，
       *    导致高亮永远对不上（用户反馈「卡在打开丰饶之间」）。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最右', detail: '标准件 dragScene：拖到最右（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开丰饶之间', detail: '点「丰饶之间」入口 (361,427)', coord: [361, 427], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮 (543,648)', coord: [543, 648], color: '126,231,135' },
        { kind: 'check', title: '战斗', detail: 'fight() 连点器打到结束', coord: null, color: '248,81,73' },
        { kind: 'check', title: '探测结算', detail: '右上角红叉（PROBES.closeX）出现即判本场结束', coord: null, color: '248,81,73' },
        { kind: 'check', title: '回到主界面', detail: '清结算 → 回主界面', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await dragScene(ctx, 'right');   // 拖到最右（标准件）
        await ctx.go([361, 427], null, '打开丰饶之间');
        await ctx.tap([543, 648], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（复用 PROBES.closeX，用户口径「直接用回到主界面的那个红x」）。
        //   修复前丰饶**没有任何结束判据** → 打完也不收手，停在丰饶页盲点到 300s 超时，
        //   用户只能手动 ⏹（2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定）。
        // v0.6.25：按用户口径拆成三步显示 —— 战斗 / 探测结算 / 回到主界面。
        //   fight() 内部本身就含「打到结束 → 清结算 → 回主界面」，这里额外补两次
        //   _advance 只为让流程图如实反映阶段（不影响实际执行）。
        // ⚠ 这里用 ctx.battle.run() 而不是 ctx.fight()：fight() 内部会 _advance 一次，
        //   那样步数会变成 7（多一格）。改由我们按用户口径显式 step，正好 6 步。
        ctx.step('战斗');
        ctx.step('探测结算');
        // v0.6.27：除红叉外，再叠一层「暂停键守卫」（正向判据：命中过暂停键 ⇒ 确实在战斗，
        //   之后连续 3 次看不到 ⇒ 已离开战斗）。丰饶与秘境/小队突袭同属一条战斗 UI 链路，
        //   暂停键探针已用真实帧验证（13 正样本全命中 / 18 负样本零误报）。
        await ctx.battle.run({ abundanceRedX: true, pauseGuard: true });
        ctx.stepResult(true);
        ctx.step('回到主界面');

      }
    },

    {
      key: 'squadRaid', name: '小队突袭', category: 'daily', timeout: 900000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-16 全量按用户录制「小队突袭.json」重写（界面已改版：BOSS 页「宇智波鼬 S」）：
       *  ① 每天默认打 squadRaidRounds（默认 2）场，**连续运行不回主界面**：
       *     进页面只走一次（拖×2 → 入口），之后每场「挑战 (1158,615) → 金币确认弹窗（探针确认
       *     才点「继续出战」(529,412)）→ fight(noHome) → 点 (1041,166) 关结算 → 直接下一场」；
       *  ② 结束判定更准：新增 squadVictory 探针（结算页「胜利」金橙大字），同归 BATTLE_END，
       *     waitForEnd 的「连续 2 拍 / 黑屏序列」落判直接适用，不再只靠画面静止/超时兜底；
       *  ③ 全部打完 → 右上红✕ (1215,32) 退回主界面（录制实测有效关闭点）。
       *  遗留防护（0.5.13 系）：战斗识别节流 0.3s + 画面静止辅助立即停手，防止普攻位 k(1137,589)
       *  在结算瞬间连点误触「挑战」又开一场 —— 现在 k 与「挑战」(1158,615) 依旧邻近，防护仍必要。 */
      steps: SQUAD_COMMON.concat(SQUAD_ROUND),
      async run(ctx) {
        const rounds = Math.max(1, ctx.cfg.num('squadRaidRounds') || 2);

        // ── v0.6.26：任务级硬闸（用户 2026-09-23 口径）───────────────────────────
        //   「多打 1 把我可以接受，但是接受不了一直在打、一直退不出循环」。
        //   病根：waitForEnd 的 maxWait 只约束**单场**等待；外层 for 循环没有任何时间上限，
        //   一旦结算判据打不到，每场都要耗满 maxWait(180s) 才「超时」返回，循环仍继续开下一场。
        //   这条闸是**兜底层**：不管判据对不对，整任务到点必定收手、必定回主界面。
        const taskDeadline = Date.now() + (ctx.cfg.num('squadRaidMaxMs') || 480000);
        const overBudget = () => Date.now() > taskDeadline;

        // 本周（周一为起点）已打次数，仅用于日志 + 视觉不可用时的兜底
        const d = new Date();
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        const weekKey = monday.getFullYear() + '-' + (monday.getMonth() + 1) + '-' + monday.getDate();

        const enterFromHome = async () => {
          await dragScene(ctx, 'right');   // 拖到最右（标准件）
          await ctx.go([793, 253], null, '打开小队突袭');
          await Utils.sleep(3000);   // BOSS 页加载（录制间隔 ~3s）
        };

        // 等「某场景消失」：用于关结算后确认结算页已切走，再点下一把/退出
        const waitSceneGone = async (s, timeout) => {
          const t0 = Date.now();
          while (Date.now() - t0 < timeout) {
            if (ctx.scenes.detect(false).scene !== s) return true;
            await Utils.sleep(1000);
          }
          return false;
        };

        for (let round = 1; round <= rounds; round++) {
          // v0.6.26 硬闸：到点就不再开新场，直接跳出走收尾（保证循环一定能退出）
          if (overBudget()) {
            Utils.log('warn', `⛔ 小队突袭已超任务时限（第 ${round}/${rounds} 场前）→ 停止开新场，收手回主界面`);
            break;
          }
          const rec = Store.get('na_squadRaid', { week: '', count: 0 });
          const weekCount = (rec.week === weekKey) ? (rec.count || 0) : 0;

          // 第 1 场从主界面完整进入；后续场**留在小队突袭页**直接挑战（用户要求不回桌面）。
          // 只有意外回到主界面（如结算被辅助提前点掉又弹回）才走完整进入兜底。
          if (round === 1) {
            await ctx.flow(`小队突袭 第 ${round}/${rounds} 场`, SQUAD_COMMON.concat(SQUAD_ROUND));
            await enterFromHome();
          } else {
            const churn = await ctx.waitQuiet(1500, 3);
            if (churn > 0) {
              Utils.log('warn', `⚠ 本场开始前画面仍在变化（${churn} 拍）——多为辅助 k 误触「挑战」又开了一场，已等它打完`);
            }
            const atHome = ctx.scenes.detect(false).scene === SCENE.HOME;
            if (atHome) {
              Utils.log('info', '⚔️ 已回到主界面 → 走完整进入流程');
              await ctx.flow(`小队突袭 第 ${round}/${rounds} 场`, SQUAD_COMMON.concat(SQUAD_ROUND));
              await enterFromHome();
            } else {
              Utils.log('info', '⚔️ 仍在小队突袭页 → 直接挑战下一场（不回主界面）');
              await ctx.flow(`小队突袭 第 ${round}/${rounds} 场`, SQUAD_ROUND);
            }
          }

          // ——— 挑战 → 弹窗处理 ———
          // v0.6.27 防污点（用户口径）：「红叉要确保界面已经回到准备界面，
          //   这时点击才是下一把的开战，否则就是污点」。
          //   第 2 场起走的是"留在小队突袭页直接挑战"（不回主界面），
          //   该分支**没有**任何界面确认 —— 若此时画面其实已切走（弹窗/加载/结算残留），
          //   这一下「挑战」就点在未知界面上。故点之前先确认红叉在场。
          //   ⚠ 仅对第 2 场起生效：第 1 场是从主界面完整进入（走 enterFromHome 后的 BOSS 页），
          //     那里本来就没有红叉，不该拦。
          if (round > 1) {
            const gate = await ctx.vision.waitRedXReady(4000, 400);
            if (!gate.ok) {
              Utils.log('warn', `⛔ 点「挑战」前未确认红叉在场（等待 ${gate.waitedMs}ms/${gate.tries} 次）→ 不盲点，本场跳过（防污点）`);
              break;
            }
          }
          await ctx.tap([1158, 615], null, '挑战');
          await Utils.sleep(2000);   // 录制间隔 ~2.4s：金币确认弹窗（若弹）

          // 「是否消耗100金币确认勾选」弹窗：与旧 squadGoldMulti 同一探针区域（米白 240,238,213 std≈2）。
          // 弹窗只在未勾选时出现 → 出现时勾选框 (575,485) 必然是空的，先勾上再点「继续出战」；
          // 勾过「本周不再提示」后本周内不再弹 → 探针确认出现才点，最多连处理 3 层。
          for (let i = 0; i < 3; i++) {
            let hit = false;
            try {
              const m = ctx.vision.match(PROBES.squadGoldMulti);
              hit = !!(m && m.ok);
              Utils.log('info', `⚔️ 金币确认弹窗：${hit ? '出现 → 勾选不再提示 + 继续出战' : '未出现 → 直接开战'}（期望(240,238,213) 实际(${(m && m.avg.r) | 0},${(m && m.avg.g) | 0},${(m && m.avg.b) | 0}) d=${m && m.dist}/${m && m.tol} std=${m && m.std}）`);
            } catch (e) {
              hit = weekCount === 0;   // 视觉不可用：本周第一场按「会弹」兜底
              Utils.log('warn', '⚔️ 金币确认弹窗识别失败，按「本周第一场」规则兜底');
            }
            if (!hit) break;
            ctx.step('勾选本周不再提示'); ctx.stepResult(true);
            await ctx.tap([575, 485], null, '勾选本周不再提示');
            await Utils.sleep(1000);
            ctx.step('继续出战'); ctx.stepResult(true);
            await ctx.tap([529, 412], null, '继续出战');
            await Utils.sleep(2000);
          }

          // ——— 战斗（不自动回主界面，由本任务决定连续下一场还是退出）———
          // v0.6.27：两个标准件同时上 ——
          //   ① redXEnd：右上角红叉 = 已回准备界面（事件型，落判）
          //   ② pauseGuard：暂停键 = 仍在战斗（状态型；延迟3s/每1s/连续失败3次判退出）
          //   两者互补：红叉管"回到准备界面"，暂停键管"真的还在打"。
          //   小队突袭已用真实帧实测暂停键探针（13 帧正样本全命中、18 帧负样本零误报）。
          const reason = await ctx.fight({
            noHome: true, redXEnd: true,
            pauseGuard: true,
            maxWaitMs: ctx.cfg.num('squadRaidFightMaxMs') || 120000,
          });

          // ——— 关结算 / 回准备界面 ———
          // ⚠ v0.6.26 语义修正：红叉 = **已回到准备界面**（非结算页），
          //   故落判后既不用关结算、也不用 clearSettlement（在准备界面上跑会白耗 8s）。
          // v0.6.27：落判后**必须再确认一次红叉当前仍在场**才允许点下一把 ——
          //   用户口径：「确保界面已经回到了准备界面，这时点击才是下一把的开战，
          //   否则就是污点」。redXEnd 只是"刚才看到过红叉"的历史事件，
          //   与下一次点击之间隔着若干秒，画面可能已切走。
          let readyForNext = false;
          if (reason === 'settlement') {
            Utils.log('info', '⚔️ 红叉已命中（已回准备界面）→ 跳过关结算，直接准备下一场');
            await ctx.waitQuiet(1500, 3);
            // ★ 闸门：确认红叉**现在**还在（= 确实停在准备界面）才放行
            const gate = await ctx.vision.waitRedXReady(5000, 400);
            readyForNext = gate.ok;
            if (gate.ok) Utils.log('info', `⚔️ ✓ 已确认红叉在场（等待 ${gate.waitedMs}ms，${gate.tries} 次）→ 可安全点下一把`);
            else Utils.log('warn', `⚔️ ✗ ${gate.waitedMs}ms 内未再确认红叉（${gate.tries} 次）→ 本场到此为止，不盲点下一把（防污点）`);
          } else if (reason !== 'timeout') {
            const settleShown = await ctx.scenes.waitFor(SCENE.BATTLE_END, 3500);
            if (settleShown) {
              ctx.step('关闭战斗结算'); ctx.stepResult(true);
              await ctx.tap([1041, 166], null, '关闭战斗结算');
              await waitSceneGone(SCENE.BATTLE_END, 3500);
            } else {
              Utils.log('warn', '⚔️ 结算屏未在 3.5s 内出现，尝试通用结算清理（不盲点）');
              await ctx.battle.clearSettlement();
            }
          } else {
            Utils.log('warn', '⚔️ 战斗超时，跳过结算关闭');
          }

          Store.set('na_squadRaid', { week: weekKey, count: weekCount + 1 });
          Utils.log('info', `⚔️ 小队突袭 第 ${round}/${rounds} 场完成（${reason}）`);

          // ★ 闸门生效点：只有确认过"红叉仍在场（= 停在准备界面）"才继续下一把。
          //   未确认 ⇒ 绝不盲目点「挑战」（那会点在未知界面上，即用户说的"污点"）
          //   ⇒ 直接跳出循环走收尾回主界面。这也顺带保证"不会一直打下去"。
          if (reason === 'settlement' && !readyForNext) {
            Utils.log('warn', '⛔ 未确认停在准备界面 → 停止开新场，收尾回主界面（防污点）');
            break;
          }
        }

        // 全部打完 → 用 ctx.home() 稳健回主界面。0.5.69 修正：
        // 固定红✕ (1215,32) 在房间页/匹配页会误点成「挑战/进入」，导致默认开第三把，
        // 改用 goHome 走场景识别 + 盲按返回，不再依赖单一坐标。
        // v0.6.26：home() 用 try/catch 包住 —— 用户口径是「接受不了一直退不出循环」，
        //   收尾一旦抛异常，外层会当成任务失败重试，等于又回到退不出去的状态。
        try {
          const sc = ctx.scenes.detect(false).scene;
          if (sc !== SCENE.HOME) {
            ctx.step('退出小队突袭'); ctx.stepResult(true);
            await ctx.home();
          }
        } catch (e) {
          Utils.log('warn', `⚔️ 退出小队突袭异常（已停手，不再开新场）：${e.message}`);
        }
        Utils.log('info', `⚔️ 小队突袭结束（已打 ${rounds} 场上限内）`);
      },
    },

    {
      key: 'squadAssist', name: '小队突袭助战', category: 'daily', timeout: 180000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  数据来源：2026-09-13 用户录制「小队突袭助战.json」+「小队突袭助战2.json」（两段相连：
       *  前段进页面并领取，后段关页面离队）。逐帧核对后的语义：
       *    主场景拖到最左（标准件，同 squadRaid，入口在主场景右半屏）
       *    → 小队突袭 → 组织助战（底部右侧拳套图标）
       *    → 我的助战（底部「我的助战」）→ 助战忍者页点「领取」（底部 681,587，金币色）
       *    → 关「助战忍者」红✕ → 关「小队突袭」红✕ → 弹窗「是否确定要离开队伍?」点「确定」
       *  注：录制里的两次主场景拖动（x861→244 / x1002→296）与 squadRaid 的
       *      「拖到最左」完全同向，这里直接复用 squadRaid 已实测的参数（863→181 / 877→231）。
       *      收尾的「确定」(649,448)：无弹窗时该点落在角色立绘上（实测 RGB 50,59,56），无害。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开小队突袭', detail: '点「小队突袭」入口 (779,285)', coord: [779, 285], color: '88,166,255' },
        { kind: 'tap', title: '组织助战', detail: '点底部「组织助战」(1013,661)', coord: [1013, 661], color: '88,166,255' },
        { kind: 'tap', title: '我的助战', detail: '点底部「我的助战」(885,649)', coord: [885, 649], color: '88,166,255' },
        { kind: 'tap', title: '领取助战收益', detail: '点「助战忍者」页底部「领取」(681,587)', coord: [681, 587], color: '126,231,135' },
        { kind: 'tap', title: '关闭助战忍者页', detail: '点右上红✕ (1221,33)', coord: [1221, 33], color: '248,81,73' },
        { kind: 'tap', title: '关闭小队突袭页', detail: '点右上红✕ (1225,33)', coord: [1225, 33], color: '248,81,73' },
        { kind: 'tap', title: '确定离开队伍', detail: '弹窗「是否确定要离开队伍?」→ 点「确定」(649,448)；无弹窗时该点落在立绘上，无害', coord: [649, 448], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）

        // ——— 进页面（与 squadRaid 同参数，均已实测）———
        await dragScene(ctx, 'right');   // 拖到最右（标准件）
        await ctx.go([779, 285], null, '打开小队突袭');
        await Utils.sleep(3000);   // 队伍页加载（与 squadRaid 一致）

        // ——— 组织助战 → 我的助战 → 领取 ———
        await ctx.tap([1013, 661], null, '组织助战');
        await Utils.sleep(1000);
        await ctx.tap([885, 649], null, '我的助战');
        await Utils.sleep(1000);
        await ctx.tap([681, 587], null, '领取助战收益');
        await Utils.sleep(1500);   // 领取动画 / 收益数字刷新

        // ——— 收尾：关两层面板 → 若有「离开队伍」确认框点确定 → 回主界面 ———
        await ctx.tap([1221, 33], null, '关闭助战忍者页');
        await Utils.sleep(1000);
        await ctx.tap([1225, 33], null, '关闭小队突袭页');
        await Utils.sleep(1000);
        // 录制里此处必有弹窗；实际没有时 (649,448) 打在角色立绘上（实测 RGB 50,59,56）无副作用，
        // 因此不写条件分支，避免"弹窗在但场景没识别出来 → 跳过 → 卡住"。
        await ctx.tap([649, 448], null, '确定离开队伍');
        await Utils.sleep(1000);
        await ctx.home();
      },
    },

    {
      key: 'survivalTrial', name: '生存试炼', category: 'daily', timeout: 420000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-12 生存试炼.json 全流程重录：进生存挑战 → 重置回新一轮 → 开始扫荡 → 确认到底 → 等 40s → 红✕返回 */
      steps: [
        { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开生存试炼', detail: '点入口 (569,145)', coord: [569, 145], color: '88,166,255' },
        { kind: 'tap', title: '选生存挑战', detail: '双入口页点「生存挑战」(881,334)', coord: [881, 334], color: '88,166,255' },
        { kind: 'tap', title: '点重置', detail: '点底部「重置」(889,660)', coord: [889, 660], color: '210,153,34' },
        { kind: 'tap', title: '确认重置', detail: '重置弹窗点「确定」(655,448)', coord: [655, 448], color: '210,153,34' },
        { kind: 'tap', title: '开始扫荡', detail: '点「开始扫荡」(767,645)', coord: [767, 645], color: '126,231,135' },
        { kind: 'tap', title: '再点开始扫荡', detail: '过传送展示后再点 (769,647)', coord: [769, 647], color: '126,231,135' },
        { kind: 'tap', title: '准备就绪', detail: '点「准备就绪」(641,596)', coord: [641, 596], color: '126,231,135' },
        { kind: 'tap', title: '出战名单确定', detail: '「确定以该名单出战」点确定 (639,464)', coord: [639, 464], color: '210,153,34' },
        { kind: 'tap', title: '扫荡券确认', detail: '扫荡券不足提示点「确定」(508,457)，随后一键扫荡执行', coord: [508, 457], color: '210,153,34' },
        { kind: 'wait', title: '等待扫荡完成', detail: '延时 40s（录制 38.5s）', coord: null, color: '188,140,255' },
        { kind: 'tap', title: '关闭返回', detail: '点右上红✕ (1236,33) 退出结算', coord: [1236, 33], color: '248,81,73' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await dragScene(ctx, 'right');   // 拖到最右（标准件）
        await Utils.sleep(1000);    // 录制间隔 1.14s
        await ctx.go([569, 145], null, '打开生存试炼');
        await Utils.sleep(1000);    // 录制间隔 1.39s
        await ctx.tap([881, 334], null, '选生存挑战');
        await Utils.sleep(1700);   // 录制间隔 2.22s
        await ctx.tap([889, 660], null, '点重置');
        await Utils.sleep(1100);   // 录制间隔 1.56s
        await ctx.tap([655, 448], null, '确认重置');
        await Utils.sleep(2000);   // 录制间隔 2.46s
        await ctx.tap([767, 645], null, '开始扫荡');
        await Utils.sleep(1000);    // 录制间隔 1.28s
        await ctx.tap([769, 647], null, '再点开始扫荡');
        await Utils.sleep(1000);    // 录制间隔 1.32s
        await ctx.tap([641, 596], null, '准备就绪');
        await Utils.sleep(1000);    // 录制间隔 1.07s
        await ctx.tap([639, 464], null, '出战名单确定');
        await Utils.sleep(1000);   // 录制间隔 1.51s
        await ctx.tap([508, 457], null, '扫荡券确认');
        await Utils.sleep(40000);  // 扫荡执行约 38.5s（录制实测），留余量
        await ctx.tap([1236, 33], null, '关闭返回');
        await ctx.home();

      }
    },

    {
      key: 'secretRealm', name: '秘境挑战', category: 'daily', timeout: 600000,
      /** 0.5.88：流程：导航到准备界面（只做一次）→ 循环{ 读券 → 点匹配 → 进战斗
       *  识别顶部秘境名 → 目标打 / 非目标暂停退出重匹配 → 结算 }。
       *  0.5.85 起：点匹配后游戏**自动进战斗**，不存在「继续战斗」按钮，
       *    非目标秘境一律走 realmForceExit() 暂停退出。
       *  0.5.88 起：「点匹配」从 NAV 移入循环，保证每轮都「先读券、后点匹配」。 */
      steps: [
        { kind: 'check', title: '导航到秘境准备界面', detail: '用 秘境探险.json 录制导航到准备界面（不含点匹配）', coord: null, color: '88,166,255' },
        { kind: 'check', title: '读挑战券数量', detail: '点匹配**之前**读左下角券数；识别到 0 → 停手退出', coord: null, color: '210,153,34' },
        { kind: 'check', title: '点匹配进战斗', detail: '点系统匹配/挑战（每轮都点），等待自动进战斗', coord: [1183, 617], color: '126,231,135' },
        { kind: 'check', title: '识别秘境名称', detail: '战斗中顶部中央名称模板匹配（准备界面没有名字）', coord: null, color: '188,140,255' },
        { kind: 'check', title: '非目标/跳过秘境退出', detail: '罡体/阴阳等 → 暂停 → 退出游戏 → 确定 → 重匹配', coord: null, color: '248,81,73' },
        { kind: 'check', title: '结算后连刷下一场', detail: '等战斗结束（30s → 连点兜底 2min）→ 结算两步 → 回到读券', coord: null, color: '210,153,34' },
        { kind: 'check', title: '卡住强制退出', detail: '超时未结算 → 暂停 → 退出游戏 → 确定 → 重匹配', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);
        // ⚠ v0.5.85：EXIT_BATTLE / CONTINUE_BATTLE 已废弃 —— 点匹配后游戏自动进战斗，
        //   不存在「继续战斗」按钮；非目标秘境一律走 realmForceExit() 暂停退出。
        // 六个秘境都有用户录制的完整战斗过程，全部作为目标
        // 可脚本化的秘境（有录制宏）。gangti 不列入 —— 它归 SECRET_REALM_SKIP_REALMS 处理
        //（识别到即暂停退出），且识别只可能产出 'gangti'（gangti2 是同一秘境的另一份录制，
        //  模板已合并，不会单独命中）。
        // ⚠ v0.5.87：yinyang 也不列入 —— 用户口径「阴阳秘境改为采用暂停跳过的方式，不打这个」。
        //   它和 gangti 一样归 SECRET_REALM_SKIP_REALMS 处理（识别到即暂停退出重匹配）。
        //   （yinyang 的宏仍在 SECRET_REALM_MACROS 里保留，只是不再被 TARGETS 触发。）
        const TARGETS = ['luoyan', 'dufeng', 'leiting', 'lieyan', 'shuilao'];
        let failStreak = 0;   // 连续「进不去战斗」次数
        let failed = 0;       // 战斗失败（超时）累计场次
        let zeroStreak = 0;   // 连续「疑似券=0」次数
        let skipStreak = 0;   // 连续跳过（SKIP_REALMS + 非目标）次数 —— 护栏①
        let sameSkipStreak = 0; // 连续跳过**同一**秘境次数 —— 护栏②
        let lastSkippedRealm = ''; // 上一次跳过的秘境名

        // ── 结构（依据 秘境探险.json 35 步录制）──────────────────────────
        //   ⚠ v0.5.88 修正分层（用户口径：「NAV 第六步也应该属于主循环，
        //     挑战券读数量应该在点匹配之前」）：
        //       导航（只做一次，到**准备界面**为止）
        //         → 循环{ 读券 → 点匹配 → 探弹窗 → 轮询秘境名 → 战斗 → 结算 }
        //     「点匹配」从 NAV 移到循环内，保证每轮顺序都是「先读券、后点匹配」，
        //     第 1 场与第 N 场走同一条路径。
        //   退出条件：刷满 SECRET_REALM_ROUNDS 场；或连续进不去战斗 / 战斗卡住累计达上限 → 停手退出。
        await ctx.home();
        Utils.log('info', `🌀 秘境挑战：回主界面→导航到准备界面（只做一次；匹配由循环负责）`);
        await ctx.replaySeq(SECRET_REALM_NAV, { label: '导航到秘境准备界面' });
        // NAV 末步落点后画面要渲染出「挑战券 N」才读得到（实跑 12:58:55 点完 NAV、
        // 12:58:56 立刻读券 → best=Infinity 全失配）。这里补一次稳定等待，
        // 让首次读券与后续每轮（点匹配前画面早已稳定）的条件一致。
        await Utils.sleep(SECRET_REALM_EXIT_SETTLE);

        let round = 0;       // 已成功开打的场序（用 while 以便「重试不计场次」）
        let matchTries = 0;  // 匹配尝试总次数（硬上界，防死循环）
        while (round < SECRET_REALM_ROUNDS) {
          await Runtime.check();
          if (++matchTries > SECRET_REALM_MATCH_TRIES_MAX) {
            Utils.log('warn', `  匹配尝试超过 ${SECRET_REALM_MATCH_TRIES_MAX} 次仍未开打 → 停手退出`);
            break;
          }

          // ── 每次进入战斗前先查券（用户口径：券为 0 就不能打了）────────
          //    ⚠ v0.5.88：这个检查点现在**严格位于点匹配之前**，且对**所有场次**一致。
          //      旧版把「点匹配」放进 NAV 末步，导致循环第 1 轮读券时匹配已经点了、
          //      画面正在加载战斗 → 用户实测「第一次开始的时候，都没识别券的数量就直接进了」。
          //      现在 NAV 只导航到准备界面，点匹配由下面的循环统一负责。
          //    判据：匹配到 '0' → 停手；其它数字 → 继续；全部失配 → 累计 2 次才停。
          // v0.5.95：标阶段 —— 报告里能按「第 N 场/读券」折叠
          if (ctx.trace) ctx.trace.setPhase(`秘境 第${round + 1}场/读券`);

          // ── v0.6.04：先探「准备界面」图标，确认在准备界面了再读券 ──────────
          //   用户口径（2026-09-21）：「这个秘境战斗准备界面又没识别对，要不增加
          //   一个这个界面识别的探针，识别到了再识别挑战卷数量？」「直接把挑战券
          //   数量左边的那个小图标做成探针」。
          //
          //   为什么必须分两步：读券失配（best=Infinity）时**无法区分**
          //     ① 真·券=0（要停手走刷光退出）
          //     ② 画面根本不在准备界面（要回主界面重导航）
          //   2026-09-21 12:23 实跑就是 ② 被当成 ①，掩盖了「没从结算退出来」这个
          //   真正的故障。有了图标探针，两者能明确区分。
          //
          //   图标探针实测：目标 score=2.1（连采 5 次稳定），同图反例 52+ → 阈值 20。
          //   ⚠ 不能用颜色探针代替：画面亮区太多（屏幕中央 bright%=0.91、左上角 0.88，
          //     比图标区 0.72 还高），颜色判据毫无特异性。
          const prep = await ctx.atSecretRealmPrep();
          if (ctx.trace) ctx.trace.decide('prepIcon', {
            score: prep.score, ok: prep.ok, at: 'beforeTicket',
            verdict: prep.ok ? 'on-prep' : 'not-prep',
          });
          if (!prep.ok) {
            Utils.log('warn', `  ⚠ 未探测到「秘境准备界面」图标（score=${prep.score}）` +
              ` → 画面不在准备界面，回主界面重导航（不读券、不当成券=0）`);
            try {
              await ctx.home();
              await ctx.replaySeq(SECRET_REALM_NAV, { label: '不在准备界面 → 重新导航' });
              await Utils.sleep(SECRET_REALM_EXIT_SETTLE);
            } catch (e) {
              Utils.log('warn', `  重导航失败: ${e.message}`);
            }
            continue;
          }

          const tk = await ctx.readTicketCount();
          // v0.5.95：券数判定进追踪（报告里能看到「读到了几 / 为什么停手」）
          if (ctx.trace) ctx.trace.decide('ticket', {
            raw: tk.value, score: tk.score === undefined ? null : Math.round(tk.score * 10) / 10,
            ok: tk.ok, streak: zeroStreak, verdict: tk.value === '0' ? 'stop-zero' : (tk.value === null ? 'miss' : 'hit'),
          });
          if (!tk.ok) {
            Utils.log('warn', '  ⚠ 券数识别未执行（模板未加载？）—— 按「券未刷光」继续，但不静默放过');
          } else if (tk.value === '0') {
            // 用户口径：**明确读到 0** 才走券刷光专属退出（关浮层 → 确定 → 回主界面）。
            // ⚠ 与下面 best=Infinity（读不到任何数字）分支严格区分：
            //   那种情况通常是「画面根本不在准备界面」，点这两个坐标毫无意义还会误触。
            //
            // 🧪 secretRealm.ignoreZeroTicket（面板开关，默认关）：为 true 时**不退出**，
            //    仅告警后继续往下走（点匹配 → 战斗），用于券已刷光时测试下游流程。
            //    关掉即恢复「券=0 → 刷光退出」的正式行为。
            if (ctx.cfg.get('secretRealm.ignoreZeroTicket')) {
              zeroStreak = 0;
              Utils.log('warn', `  🧪 [测试模式] 剩余挑战券 = 0（score=${tk.score.toFixed(1)}）` +
                ` —— 已开启「忽略券=0」开关，**不退出**，继续跑以测下游流程`);
              Utils.log('warn', `  🧪 测完请在面板关掉「秘境:忽略券=0继续跑」开关`);
              if (ctx.trace) ctx.trace.decide('ticketDoneExit', {
                value: tk.value, score: tk.score, verdict: 'skipped-by-config',
                note: 'secretRealm.ignoreZeroTicket=true，未走券刷光退出',
              });
              // 注意：不 break、不 continue —— 继续执行下面的「点匹配」
            } else {
            Utils.log('warn', `  🎫 剩余挑战券 = 0（score=${tk.score.toFixed(1)}）→ 券已刷光`);
            if (ctx.trace) ctx.trace.decide('ticketDoneExit', {
              value: tk.value, score: tk.score, verdict: 'run',
              steps: SECRET_REALM_TICKET_DONE_EXIT,
            });
            try { await ctx.realmTicketDoneExit(); } catch (e) { Utils.log('warn', `  券刷光退出异常: ${e.message}`); }
            await ctx.home();
            break;
            }
          } else if (tk.value !== null) {
            zeroStreak = 0;
            Utils.log('info', `  🎫 剩余挑战券 ≈ ${tk.value}（score=${tk.score.toFixed(1)}）→ 继续`);
          } else {
            zeroStreak++;
            // 用户口径修正（2026-09-21）：读不到任何数字 **≠ 券刷光**。
            //   本次实跑就是这么误停的：出结算后画面没回到准备界面，读券 best=Infinity，
            //   旧版把它当「疑似刷光」直接停手，掩盖了真正的 bug（结算没退出）。
            //   现在改成：先尝试回主界面重导航，再读一次；仍读不到才停手。
            Utils.log('warn', `  🎫 券数未匹配到任何数字（连续第 ${zeroStreak}/${SECRET_REALM_TICKET_ZERO_CONFIRM} 次，` +
              `best=${tk.score === undefined ? 'n/a' : tk.score.toFixed(1)}）` +
              (zeroStreak >= SECRET_REALM_TICKET_ZERO_CONFIRM
                ? ' → 画面可能不在准备界面，回主界面重导航后再试'
                : '，再试一次'));
            if (zeroStreak >= SECRET_REALM_TICKET_ZERO_CONFIRM) {
              if (ctx.trace) ctx.trace.decide('ticket', {
                verdict: 'renav', streak: zeroStreak, why: '读不到数字 → 重导航而非停手',
              });
              zeroStreak = 0;
              await ctx.home();
              await ctx.replaySeq(SECRET_REALM_NAV, { label: '读不到券数后重新导航' });
              continue;      // 回循环顶部重读券（受 matchTries 上界保护）
            }
          }

          // ── 点匹配（⚠ v0.5.88：**统一由循环负责，NAV 不再点匹配**）────────
          //    用户口径：「NAV 第六步也应该属于主循环，挑战券读数量应该在点匹配之前」。
          //    这样第 1 场与第 N 场走**同一条路径**：读券 → 点匹配 → 轮询秘境名。
          //    ⚠ 点之前先等界面稳定 —— 上局刚结束（结算 → 返回 → 准备界面），
          //      画面还在切回，不等就点会点空（用户实测「点匹配好多次，画面还没加载
          //      就点击，导致按键失败」；trace 实测点匹配前仅 1126ms 时失败）。
          await Utils.sleep(SECRET_REALM_PRE_TAP_WAIT);
          if (ctx.trace) ctx.trace.setPhase(`秘境 第${round + 1}场/匹配`);
          Utils.log('info', `  ▶ 第 ${round + 1} 场（第 ${matchTries} 次匹配）：点匹配`);
          await ctx.op.tap(SECRET_REALM_CHALLENGE[0], SECRET_REALM_CHALLENGE[1]);
          // ⚠ v0.5.94：**记下点匹配的绝对时刻**，作为后面宏 lead 的计时基准。
          //   录制里 lead = 「点匹配 → 第一个按键」的真实间隔（leiting 4756 / lieyan 6454 /
          //   gangti 8603 …）。而脚本流程是「点匹配 → 探弹窗 → 轮询识别秘境名 → 开宏」，
          //   中间这些步骤**本来就该算进 lead 里**。
          //   旧实现没传 since，lead 变成从「识别完」起算的死等 → 宏整体晚 2~6s 开打，
          //   用户实测「识别秘境花时间，导致基本战斗后 5s 才开始」，只能靠连点器兜底。
          const matchTappedAt = Date.now();
          // ⚠ 顺序很重要：弹窗在点匹配后约 1.4s 出现（罡体录制实测），
          //    必须先探掉弹窗，再等进战斗。若一把睡足 7s 再探，弹窗已挡住流程。
          await Utils.sleep(SECRET_REALM_POPUP_WAIT);

          // ── 探测并处理「继续挑战无法获得饰品」提示弹窗 ──────────────────
          //    罡体秘境战斗.json 实测：点匹配后 +1.4s 弹出，必须先处理才能继续。
          //    ⚠ 只在饰品掉落次数用完时出现，8/10 份录制都没有 → 必须探测，不能盲点。
          //    勾选「本周不再提示」后本轮内不再复弹。
          await ctx.clearNoticePopup();

          // ── 等进入战斗（⚠ 点完匹配游戏**自动进战斗**，没有「继续战斗」按钮）──
          //    v0.5.85 修正，证据是 10 份战斗录制的时序统计：
          //      8/10 份（毒风/水牢/烈焰/缸体2/落岩×2/阴阳/雷霆）点完匹配后
          //      **只有 1 次 click**（即点匹配本身），4.8~6.5s 后直接开始按键；
          //      只有罡体、阴阳2 这 2 份多出 2 次 click —— vision_describe 确认那是
          //      弹窗的两步（勾选 + 确定），不是「继续战斗」按钮。
          //    → 不存在 CONTINUE_BATTLE 这一步（旧常量 [850,500] 是错的设计）。
          //    ⚠ 同时修正更根本的错误前提：准备界面**没有**秘境名
          //      （8 张 prepare 截图实测：背景/UI/按钮全通用，仅券数与饰品数不同），
          //      秘境名（金色「XX秘境」）只在战斗中出现在顶部中央 (575,20)-(705,55)。
          //      → 识别必须在进战斗之后。代价：非目标秘境要「进一下再退」。
          // ── 轮询识别秘境名（⚠ 不能睡满固定秒数再识别）───────────────────
          //    v0.5.86 修正：上一版是「sleep 7s → 识别一次 → 再开宏」，用户实测
          //    导致宏晚开场好几秒，打得不对劲，最后全靠保底连点器才赢。
          //    录制实测点匹配 → 首个按键仅 4.8~6.5s，宏必须尽早开打。
          //    → 改高频轮询：每 150ms 试一次，一命中就立刻返回去开宏。
          Utils.log('info', '  ▶ 已点匹配，轮询等待秘境名出现');
          const realm = await ctx.pollRealmName(SECRET_REALM_NAME_WAIT);
          // v0.5.95：识别结果进追踪（含「点匹配到命中」的真实耗时 —— 这正是 lead 基准）
          if (ctx.trace) ctx.trace.decide('realmName', {
            realm: realm, verdict: realm ? 'hit' : 'miss',
            sinceTapMs: Date.now() - matchTappedAt,
          });
          if (!realm) {
            failStreak++;
            Utils.log('warn', `  未识别秘境名（连续第 ${failStreak}/${SECRET_REALM_FAIL_LIMIT} 次）` +
              (failStreak >= SECRET_REALM_FAIL_LIMIT
                ? ' → 判定券已刷光/进不去战斗，停手退出'
                : '，退出后重试一次'));
            if (failStreak >= SECRET_REALM_FAIL_LIMIT) break;
            try { await ctx.realmForceExit(); } catch (e) { /* 尽力而为 */ }
            continue;             // 本场没打成，不计场次，重试（受 matchTries 上界保护）
          }
          Utils.log('info', `  🔍 识别到秘境：${realm}`);

          // ── 不适合脚本操作的秘境 / 非目标秘境 → 退出重匹配（v0.5.93 加护栏）──
          //    旧代码这两条分支**只做 exit + continue**，没有任何上界与归位动作，
          //    实测会变成「一直在点退出」的死循环（详见 SECRET_REALM_SKIP_* 注释）。
          //
          //    用户口径（缸体）：「缸体秘境建议是进入后检测清楚了之后就立即走暂停退出流程」。
          //    非目标秘境同理。区别只是日志措辞，处理路径完全一致 → 合并成一段。
          const isSkipRealm = SECRET_REALM_SKIP_REALMS.includes(realm);
          if (isSkipRealm || !TARGETS.includes(realm)) {
            skipStreak++;
            sameSkipStreak = (realm === lastSkippedRealm) ? sameSkipStreak + 1 : 1;
            lastSkippedRealm = realm;

            const why = isSkipRealm ? '不适合脚本操作' : '非目标秘境';
            Utils.log('info', `  ⏭ ${realm}（${why}）→ 立即暂停退出，重匹配` +
              ` [连续跳过 ${skipStreak}/${SECRET_REALM_SKIP_STREAK_MAX}，同一秘境 ${sameSkipStreak}/${SECRET_REALM_SAME_SKIP_MAX}]`);

            // 护栏②：连续匹配到同一个被跳过的秘境 → 停手（继续空转只会白等）
            if (sameSkipStreak >= SECRET_REALM_SAME_SKIP_MAX) {
              Utils.log('warn', `  ⛔ 连续 ${sameSkipStreak} 次匹配到 ${realm} → 停手退出（券未消耗，可手动重跑）`);
              break;
            }
            // 护栏①：跳过总次数上限
            if (skipStreak > SECRET_REALM_SKIP_STREAK_MAX) {
              Utils.log('warn', `  ⛔ 已连续跳过 ${skipStreak} 次（上限 ${SECRET_REALM_SKIP_STREAK_MAX}）→ 停手退出`);
              break;
            }

            let sk = false;
            try { sk = await ctx.realmForceExit(); } catch (e) { Utils.log('warn', `  强制退出异常: ${e.message}`); }
            if (!sk) {
              Utils.log('warn', '  未能强制退出（缺坐标），停手以免盲点');
              break;
            }

            // ── 退出后直接走循环第一步（读券）──────────────────────────────
            //    用户口径（2026-09-21 实跑 12:59:04）：
            //    「不打的秘境识别退出后，延迟2s，回到秘境准备页面，
            //      这时应该重新回到循环流程的第一步，识别挑战卷才对」
            //
            //    ⚠ 旧代码在这里跑 `home()` + `replaySeq(NAV)` 是**错的**：
            //      「退出游戏」（暂停→退出→确定）做完后**本来就已经在秘境准备页面**，
            //      再跑一遍 home+NAV 会点到主界面的 X / 返回 上，越点越乱。
            //      实跑证据（12:59:15~12:59:33）：
            //        click(1218,33)→(65,679)→(1221,31)→(69,675) 全是主界面按钮，
            //        最后 NAV 被中止，「归位失败」→ 任务整体失败。
            //
            //    ⚠ 不要再 sleep：`realmForceExit()` 内部已含
            //      EXIT_GAP×3（1.5s×3，逐步点击之间）+ EXIT_SETTLE（2.5s，退出后稳定），
            //      合计约 7s —— 正好覆盖用户说的「延迟 2s」且更稳。
            //
            //    NAV 只在任务**开头**跑一次（见 run 入口），跳过秘境不需要重导航。
            Utils.log('info', '  ↩ 已退到秘境准备界面 → 回到循环第一步：读挑战券');
            continue;             // 回循环顶部：读券 → 点匹配（受三道护栏 + matchTries 保护）
          }
          // 打到了目标秘境 → 本轮所有「跳过/失败」连续计数全部归零
          //  （它们是「连续」语义，一旦成功开打就说明匹配池正常，重新计）
          failStreak = 0;
          skipStreak = 0;
          sameSkipStreak = 0;
          lastSkippedRealm = '';

          // ── 目标秘境 → 回放对应宏 ─────────────────────────────────────
          //    ⚠ v0.5.94：`sinceMs = matchTappedAt` —— 让宏的 lead 从**点匹配**起算。
          //      宏里的 lead 就是录制时「点匹配 → 第一键」的间隔，中间的探弹窗 +
          //      识别秘境名耗时理应被 lead 吸收，而不是叠加到 lead 之上。
          //      实测收益：识别慢时（如 1889ms）宏不会再整体晚开打。
          //      若识别耗时 > lead（极端情况），lead 等待自动归零 → 立刻开打，不再多等。
          const leadElapsed = Date.now() - matchTappedAt;
          if (ctx.trace) ctx.trace.setPhase(`秘境 第${round + 1}场/战斗`);
          Utils.log('info', `  ✅ 目标秘境 ${realm}，识别完成 → 立即开打宏（点匹配后已过 ${leadElapsed}ms）`);
          const battleStart = Date.now();
          // ⚠ v0.6.00：sinceMs 基准从「点匹配时刻」改为「**识别完成时刻**」。
          //   用户口径（2026-09-21）：「录制的按键应该在你识别到了秘境名称之后，
          //   确定秘境名称的脚本后**立即**执行按键」→ 所有宏的 lead 已置 0。
          //   若仍传 matchTappedAt，lead=0 会让第一个键在「点匹配那一瞬间」就按下 ——
          //   比真实录制早好几秒（比赛都没开始就乱按）。传 battleStart 才对：
          //   base = battleStart + 0 = 现在，第一个键立即发出。
          await ctx.replaySeq(SECRET_REALM_MACROS[realm], {
            label: `${realm} 战斗回放`,
            sinceMs: battleStart,
          });

          // ── 等战斗结束 ─────────────────────────────────────────────────
          //    用户口径（2026-03-19）：「录制的流程 30s 没有检测到结算画面就走强制暂停退出流程」。
          //    ⚠ 这个 30s 必须**从宏回放结束起算**，不能从战斗开始起算：
          //      实测 6 份录制，宏结束 → 结算出现的间隔为 4.8s / 6.9s / 7.2s / 9.3s / 11.6s / 22.3s，
          //      雷霆最长 22.3s。若从战斗开始起算（雷霆总时长 43.6s）会误杀。
          //    另保留 SECRET_REALM_BATTLE_TIMEOUT 作为单场硬上限，防宏本身卡死。
          // ── 宏打完 → 等 30s → 无结算则连点器兜底 2 分钟 → 再无结算才强制退出 ──
          //    三层递进（用户口径 2026-03-19）：
          //      ① 等 30s：正常情况宏打完就出结算（实测间隔 4.8~22.3s，雷霆最长 22.3s）
          //      ② 连点器 2 分钟：没出结算 = 敌人还没死 → j/i/o + k 轮按继续打，全程盯结算
          //      ③ 强制退出：2 分钟还没结算 → 暂停 → 退出游戏 → 确定
          //    ⚠ 30s 必须**从宏回放结束起算**，不能从战斗开始起算（雷霆总时长 43.6s，
          //       从开始算会误杀雷霆 —— 它的宏结束到结算还要等 22.3s）。
          const macroEnd = Date.now();
          const waitBudget = Math.min(
            SECRET_REALM_SETTLE_WAIT,                                   // 首选：30s
            Math.max(0, SECRET_REALM_BATTLE_TIMEOUT - (macroEnd - battleStart))  // 兜底：不超硬上限
          );
          let result = 'timeout';
          // 最近一次「左下角返回」探测结果（含实测坐标），供结算段复用
          let lastProbe = null;

          // ── 第①层（v0.5.88 重写）：每 2s 探「左下角返回按钮」────────────────
          //  用户口径：「结算画面的判断...你要从我给你的录制 json 里面提取正确的方案出来」+
          //    「结算明确左下角会出现返回，如果不点会持续十几秒，感觉比较适合作为判断依据」+
          //    「连点期间每 2s 做一次判定」。
          //  所以这一层**不再用 waitForEnd 的通用场景判定**当主判据 ——
          //  改用秘境自己的结算特征（见 detectSettleBack 注释），每 2s 一次，一命中立刻走结算。
          //  ⚠ 同时保留 waitForEnd 作为「兜底识别」：万一模板没匹配上（换分辨率/UI 改版），
          //    还能靠它认出 home/settlement 等，不至于把把超时。
          if (waitBudget > 3000) {
            const t0 = Date.now();
            let probe = null;
            let tries = 0;
            while (Date.now() - t0 < waitBudget) {
              await Runtime.check();
              probe = await ctx.detectSettleBack();
              tries++;
              if (probe.ok) {
                result = 'settled';
                lastProbe = probe;
                // v0.5.95：命中进追踪（含分数/阈值/第几次探到）
                if (ctx.trace) ctx.trace.decide('settleBack@afterMacro', {
                  score: probe.score, thresh: SECRET_REALM_SETTLE_BACK_THRESH,
                  tries, at: [probe.x, probe.y], verdict: 'hit',
                });
                Utils.log('info', `  🔔 结算画面已出现（左下角返回，score=${probe.score}，` +
                  `@${probe.x + 18},${probe.y + 16}，+${Date.now() - t0}ms）`);
                break;
              }
              await Utils.sleep(SECRET_REALM_SETTLE_PROBE_MS);
            }
            if (result !== 'settled') {
              // v0.5.95：未命中也要记 —— 否则报告里只看到「没探到」，看不到「差多少」
              if (ctx.trace) ctx.trace.decide('settleBack@afterMacro', {
                score: probe && probe.score, thresh: SECRET_REALM_SETTLE_BACK_THRESH,
                tries, waitedMs: Math.round(waitBudget), verdict: 'miss',
              });
              Utils.log('info', `  ⏳ ${Math.round(waitBudget / 1000)}s 内未探到结算返回按钮` +
                (probe && probe.score !== null ? `（最后 score=${probe.score}，阈值 ${SECRET_REALM_SETTLE_BACK_THRESH}）` : '') +
                ` → 交给连点兜底`);
              // 兜底识别：万一返回按钮判据失效，用通用场景判定再捞一次
              const oldMax = ctx.cfg.num('battle.maxWait') || 180000;
              ctx.cfg.set('battle.maxWait', 3000);
              try {
                const r1 = await ctx.battle.waitForEnd();
                if (r1 === 'home') { result = 'atHome'; Utils.log('info', '  ✅ 兜底识别：已回主界面'); }
                else if (r1 && r1 !== 'timeout') { result = 'settled'; Utils.log('info', `  ✅ 兜底识别：${r1}`); }
              } catch (e) {
                Utils.log('warn', `  兜底识别异常: ${e.message}`);
              } finally {
                ctx.cfg.set('battle.maxWait', oldMax);
              }
            }
          }

          // ② 30s 没结算 → 连点兜底。'settled' 表示期间打死了，可以走结算流程。
          //
          //    ⚠ v0.5.87：**不再自研连点器，直接复用忍术对战的战斗模块**
          //    （用户口径：「连点器还是用战斗模块吧，就不单独弄了」/「直接用忍术对战的
          //     连点器，去掉替身就行了，通灵可去可不去，不影响」）。
          //
          //    为什么能直接换：两套坐标**完全一致** —— 都来自同一份「键盘按键.json」校准：
          //      忍术 PLACES      j[998,633] k[1137,589] i[1023,496] o[1149,430] e[1153,279] r[1151,175]
          //      秘境 KEY_POS     j[998,633] k[1137,589] i[1023,496] o[1149,430] e[1153,279] r[1151,175]
          //
          //    换来的好处（自研版没有的）：
          //      · combatStep 的三道安全闸：连招总时长上限 / 静止即停手 / 黑屏过场绝不点
          //      · 停手时 releaseHold()，不会在云端卡按压态（0.5.59 教训）
          //      · 普攻 k 走**按住模式**（真人打法，录制 31 次平均按住 1721ms）
          //          —— 顺带解决了「k 每 200ms 一按会不会负担太重」的担心：不再高频点击
          //
          //    ⚠ 唯一差异处理：秘境**去掉替身**（battle.useSubstitute = false）。
          //      依据：8 份秘境录制里 space 只出现在罡体2 一份，其余 7 份都没有。
          //      通灵(r) 用户说「可去可不去」→ 保留。
          if (result === 'timeout') {
            const oldAssist = ctx.cfg.get('battle.keyAssist');
            const oldSub = ctx.cfg.get('battle.useSubstitute');
            const oldMax2 = ctx.cfg.num('battle.maxWait') || 180000;
            ctx.cfg.set('battle.keyAssist', true);        // 开连点（战斗辅助）
            ctx.cfg.set('battle.useSubstitute', false);   // ⚠ 去掉替身
            ctx.cfg.set('battle.maxWait', SECRET_REALM_TURBO_MAX);
            Utils.log('info', `  🔁 连点兜底：改用忍术对战战斗模块（去掉替身，通灵保留），` +
              `最长 ${Math.round(SECRET_REALM_TURBO_MAX / 60000)} 分钟`);
            try {
              // ⚠ v0.5.88：这一层也改成**每 2s 探「左下角返回」**（用户口径），
              //  而不是等 waitForEnd 自己收尾。理由：连点期间最怕「打死了但脚本不知道，
              //  还在继续点」→ 用户特意强调「战斗结束结算的验证一定要及时，
              //  不然会被连点器点入下一轮」。2s 一次能最快发现结算并立刻停手。
              //
              //  实现：开一个后台 waitForEnd 只负责「驱动 combatStep 连点」，
              //  主循环则每 2s 用模板探结算；一旦探到就立刻 releaseHold 并收工。
              const t0 = Date.now();
              let hit = null, probe2 = null;
              const assist = ctx.battle.waitForEnd().catch(() => null);   // 后台跑连点
              while (Date.now() - t0 < SECRET_REALM_TURBO_MAX) {
                await Runtime.check();
                probe2 = await ctx.detectSettleBack();
                if (probe2.ok) {
                  hit = probe2; lastProbe = probe2;
                  // 立刻叫停后台连招（waitForEnd 主循环每拍检查此标志，会马上 releaseHold 并返回）
                  ctx.battle._settleConfirmed = true;
                  if (ctx.trace) ctx.trace.decide('settleBack@turbo', {
                    score: probe2.score, thresh: SECRET_REALM_SETTLE_BACK_THRESH,
                    at: [probe2.x, probe2.y], elapsedS: Math.round((Date.now() - t0) / 1000),
                    verdict: 'hit',
                  });
                  break;
                }
                await Utils.sleep(SECRET_REALM_SETTLE_PROBE_MS);
              }
              if (hit) {
                result = 'settled';
                Utils.log('info', `  🔔 连点期间探到结算（左下角返回，score=${hit.score}，` +
                  `+${Math.round((Date.now() - t0) / 1000)}s）→ 立即停手`);
              } else {
                Utils.log('warn', `  连点 ${Math.round(SECRET_REALM_TURBO_MAX / 60000)} 分钟仍未探到结算` +
                  (probe2 && probe2.score !== null ? `（最后 score=${probe2.score}）` : ''));
              }
              // ⚠ v0.5.94：停手必须**真的停**。
              //   用户实测：「战斗结束结算的验证一定要及时，不然会被连点器点入下一轮」。
              //   旧实现只 `releaseHold()` + 等 3s —— 但 waitForEnd 内部的 combatStep 循环
              //   不看这个标志，3s 后它下一拍又 `按住普攻`（日志实锤：11:21:16 松开后
              //   同一秒又「👊 普攻按住不放」），然后继续点技能位。
              //   关键：`combatStep` 每拍都读 `battle.keyAssist` 配置（见 waitForEnd 里
              //   `stillFighting && keyAssist` 判断），**把它置 false 即可立刻终止连招**
              //   —— 不需要额外的 stopAssist API（不存在，不要凭空调用）。
              ctx.cfg.set('battle.keyAssist', false);
              ctx.op.releaseHold();
              await Promise.race([assist, Utils.sleep(3000)]);
              if (hit) ctx.op.releaseHold();   // 收尾后再松一次，确保云端不卡按压态
            } catch (e) {
              Utils.log('warn', `  连点兜底异常: ${e.message}`);
            } finally {
              ctx.cfg.set('battle.keyAssist', oldAssist);
              ctx.cfg.set('battle.useSubstitute', oldSub);
              ctx.cfg.set('battle.maxWait', oldMax2);
            }
          }

          if (result === 'timeout') {
            const elapsed = Math.round((Date.now() - macroEnd) / 1000);
            Utils.log('warn', `  宏结束后 ${elapsed}s（含连点器 ${Math.round(SECRET_REALM_TURBO_MAX / 60000)} 分钟）仍未结算 → 强制退出`);
            let exited = false;
            try { exited = await ctx.realmForceExit(); } catch (e) { Utils.log('warn', `  强制退出异常: ${e.message}`); }
            failed++;             // 失败场次累计（不占连刷成功名额）
            if (failed >= SECRET_REALM_FAIL_MAX) {
              Utils.log('warn', `  失败累计 ${failed} 场达上限 → 停手退出`);
              break;
            }
            if (!exited) {
              // 没有坐标就无法可靠退出战斗，继续硬跑只会盲点。停手交回用户。
              Utils.log('warn', '  未能强制退出（缺坐标），停手退出以免盲点');
              break;
            }
            continue;             // 已回战斗前界面，重新进入（受 matchTries 上界保护）
          }

          // ── 结算：战斗正常结束（含失败）都有结算画面 → 点掉「返回」+ 第二步 ──
          //    用户口径：失败也有结算画面，「那种就直接点就行了」，不走强制退出。
          //
          //    ⚠ v0.5.88：第一个点击坐标**优先用探测到的实际位置**（probe/hit 的 x,y），
          //      而不是写死的 (128,671)。实测 9 份录制该按钮落在 x∈[112,146]，
          //      写死坐标会偏 6px 左右；探测到的位置直接就是按钮中心，最准。
          //      探测不到时才退回常量。
          if (result === 'atHome') {
            Utils.log('info', '  战斗结束时已回主界面 → 跳过结算清理，直接计一场');
          } else {
            // ── v0.5.94：秘境**不再走 clearSettlement() 盲点** ────────────────
            if (ctx.trace) ctx.trace.setPhase(`秘境 第${round + 1}场/结算`);
            //  用户实测（2026-09-21）：「战斗结束结算太慢了，导致连点器没有及时结束，
            //  把其他需要金币的东西点了」。
            //
            //  真凶不是连点器，而是 clearSettlement：它有一组**为忍术对战校准**的盲点坐标
            //  （spots = [settleConfirm, 659,410「完胜展示跳过位」, confirm, confirmMid, tapAny]），
            //  每轮盲点一个。那次实跑日志里点的就是这些：
            //    click(655,408) click(643,601) click(637,500) click(129,552) click(638,359)
            //  秘境结算画面布局与忍术对战不同，这些位置很可能是「再来一次/购买」等消费项
            //  → 这正是「被点掉金币」的直接原因。
            //
            //  秘境自己有**唯一可靠判据**：左下角「返回」按钮（detectSettleBack，
            //  正样本 0~33.7 / 负样本 76.7~82.9，分离度极大）。
            //  所以这里只做两件事：点探测到的返回 → 点第二个固定位。
            const backX = (lastProbe && lastProbe.ok && lastProbe.x != null)
              ? lastProbe.x + 18 : SECRET_REALM_SETTLE_TAPS[0][0];   // +18 = 模板宽 36 的一半
            const backY = (lastProbe && lastProbe.ok && lastProbe.y != null)
              ? lastProbe.y + 16 : SECRET_REALM_SETTLE_TAPS[0][1];   // +16 = 模板高 32 的一半
            Utils.log('info', `  战斗结束，清理结算（返回按钮 @${backX},${backY}` +
              (lastProbe && lastProbe.ok ? `，实测 score=${lastProbe.score}` : '，用兜底坐标') + '）');
            await ctx.op.tap(backX, backY);
            await Utils.sleep(SECRET_REALM_SETTLE_GAP);
            // 第二步：录制里返回后还有一次点击（9/10 份有，落点 x∈[563,711] 不固定）。
            //   保守起见：**只在仍能探到结算返回时**才点，否则跳过（防点到别的界面）。
            const p2 = await ctx.detectSettleBack();
            if (p2 && p2.ok) {
              await ctx.op.tap(SECRET_REALM_SETTLE_TAPS[1][0], SECRET_REALM_SETTLE_TAPS[1][1]);
            } else {
              Utils.log('info', '  返回后已探不到结算画面 → 跳过第二步点击（防误点）');
            }
            await Utils.sleep(SECRET_REALM_SETTLE_GAP);
          }

          round++;
          failed = 0;           // 成功一场即清零失败累计
          Utils.log('info', `  ✅ 已刷 ${round}/${SECRET_REALM_ROUNDS} 场`);
        }

        if (round >= SECRET_REALM_ROUNDS) {
          Utils.log('info', `  🎉 已达目标 ${SECRET_REALM_ROUNDS} 场，结束秘境挑战`);
        } else {
          Utils.log('warn', `  秘境挑战结束：已刷 ${round}/${SECRET_REALM_ROUNDS} 场，未能继续 → 停手退出`);
        }
        await ctx.home();
      }
    },

    {
      key: 'arenaBattle', name: '角斗场忍术对战', category: 'battle', timeout: 5400000,
      /** 角斗场忍术对战
       *  2026-09-19 重写（用户 trace「忍术对战一场」1020 帧实证 + 反馈「战斗中过一会儿就不按键」）：
       *  · 一场 = 若干小局，**每个小局结束都弹一次「胜负已分」金色横幅**（实测只显示 0.3~1s，
       *    trace #335/336、#568/569 各只采到 2 拍 → 旧「连续 3 拍」条件必漏判）。
       *  · 横幅后紧跟黑屏过场：①自动续下一小局（画面重新动起来）或 ②整场打完（→ 战绩/评测/入口页）。
       *    旧实现识别到横幅就 return，再由本任务固定 sleep(10s)+3s → 自动续局时新小局开局约 13s
       *    不出手（用户看到「打一会儿就不按键了」）。现在改为 waitForEnd 的**观察窗**（bannerGraceMs）：
       *    横幅后 6s 内画面恢复动态 → 直接接着连招，不出任务层、不空窗。
       *  · 开局 40s 内不许用「画面静止」判结束：忍术对战「双方登场」画面实测静止 4.5s 以上
       *    （trace #42~#62 连续 21 帧完全不动），否则会「开局 15s 判打完 → 空窗 10s → 开打时不出手」。
       *  · 不认「失败」探针：失败页配色与「双方登场」暗背景几乎同色（d=16~24，tol=25），
       *    trace #42~#62 连续 21 帧全部误命中 → 假结束；战败小局改由「静止 2.4s」兜底判结束。
       *  · 单场连招上限 150s → 5min（实测一局含自动续局会长达 149s，贴脸会被截断）。
       *  · 普攻一直按住（battle.holdAttack），详见 combatStep。
       *
       *  2026-09-19 二次实测（trace 2026-09-19T13-35-52，2000 拍 / 21.7 分钟只打完 5 局）：
       *  · 一局（整场）打完，游戏会连弹「胜负已分 → 战斗结果(战绩) → 黑屏 → 奖励浮层 →
       *    **任务/奖励面板**」一串页面。旧实现既不认识也不清，只按固定两点盲点
       *    「选对手/挑战 + 开始对战」—— 点不到就继续盲点。实测脚本在黑屏那两拍还在点，
       *    **面板就是这么被点开的**；之后整场卡在面板上（3 局各卡 377s）。
       *  · 卡住的直接机制：waitForEnd 的 battleStarted 闸（0.5.72）只认「先看到过动态帧」，
       *    一旦开局就落在静止的陌生页面，battleStarted 永远 false →「静止 = 打完」这条唯一
       *    出口被永久关掉 → 盲点到 maxWaitMs(360s)。
       *  · 0.5.79 三层修：① waitForEnd 新增 staticBailMs（连续静止 ≥20s 无条件兜底结束）；
       *    ② combatStep 黑屏(LOADING)期间不点；③ 本任务每一步都做「点完看画面变没变」的自检，
       *    没反应就试点候选确定/关闭/返回解卡，还不行回主界面重进；连续失败就停手报错。
       *
       *  0.5.81 三次实测（同一份 trace，用户 2026-09-20 反馈「7m32s~7m33s 战斗结束没识别到」）：
       *   ① **整场结束的快通道**：全屏黑过场（BR<12）在战斗中**不可能**出现 ——
       *      实测战斗中 BR≥100、「小局切换」的暗帧 14.0~22.3（不是全屏黑），
       *      而整场结束的暗帧 1.3~5.3。于是新增 opts.darkEndAfterMs（本任务传 25s 时间闸，
       *      排除开局进战斗的加载黑屏）→ 命中即 return 'darkend'，放在所有闸之前。
       *      旧实现只在 scene=BATTLE_END 时才拿黑屏做序列确认，而黑屏后画面停在结算/面板页
       *      → 判不出 BATTLE_END → 整条路走空，只能靠 20s 静止兜底（晚 6s 以上）。
       *   ② **「点得动吗」的判据 0.012 → 0.05**：卡在战后页面时，画面自身就有 0.010~0.015 的
       *      轻微动画，用默认阈值会把「盲点」判成「点到了」，于是脚本以为选对手/开始对战生效、
       *      一路盲点下去。真点到东西时 diff≈0.16 → 取 0.05，两侧余量都 >3 倍。
       *   ③ **战后只要不是靠横幅正常收尾，就直接回主界面重进**（不再让下一轮去猜页面、
       *      也不再逐个试 8 个解卡落点 —— 那些点击本身就可能在面板上乱点）。 */
      steps: [
        // ── 流程图（v0.6.20 重写：与 run() 实际代码逐条对应）───────────────────
        //   进场（只走一次）→ 循环 { 确认准备界面 → 开战 → 打 → 结算图标 → 点 k 跳过 → 回准备界面 }
        //   ⚠ 旧的 steps 还写着「胜负已分横幅 / 6s 观察窗 / 开始对战(1165,629)」等已被删除的东西，
        //     与代码对不上 → 本版全部重写，每条都指向 run() 里真实存在的那一行。
        { kind: 'drag', title: '进场①主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲；仅首次进场走一次）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '进场②打开角斗场', detail: '点角斗场入口 (974,357)，等 2000ms 加载', coord: [974, 357], color: '88,166,255' },
        { kind: 'tap', title: '进场③打开忍术对战', detail: '点 (315,637) 推进到准备界面（场景转换点击，非"选对手"）', coord: [315, 637], color: '88,166,255' },
        { kind: 'check', title: '循环①确认在战斗准备界面', detail: '探针 = 「规则说明」左侧蓝色感叹号模板匹配(阈 11.5，正 0/负 ≥22.98) AND 右上角红X 红色占比(阈 0.27，正 0.30/负 ≤0.24)，连续 2 拍命中', coord: null, color: '126,231,135' },
        { kind: 'check', title: '领取并判断奖励', detail: '打开奖励面板 → 点 4 次领取 → 判断第1、2个是否都已领(红) → 点最右回准备界面；据此决定继续战斗还是收工', coord: null, color: '241,196,15' },
        { kind: 'tap', title: '循环②点「开战」', detail: '点 (1168,609) —— 用户确认过的第一次坐标；点完用 diff≥0.05 自检', coord: [1168, 609], color: '210,153,34' },
        { kind: 'check', title: '循环③连点器打（中间零判据）', detail: '按住普攻 k + 轮询技能；不判静止、不判黑屏 —— 小局切换的黑屏不再打断连招', coord: null, color: '248,81,73' },
        { kind: 'check', title: '循环④结算图标命中即落判', detail: '右上角「战斗详情」卷轴图标模板匹配，阈 30（正 2.5 / 负 ≥41.7）；命中直接 return settlement，不再开 6s 观察窗', coord: null, color: '248,81,73' },
        { kind: 'tap', title: '循环⑤跳过结算：点 k 位', detail: '松手 → 隔 500ms → 点 (1137,589) 一下', coord: [1137, 589], color: '210,153,34' },
        { kind: 'check', title: '循环⑥等准备界面回来', detail: 'waitArenaReady(20s) 命中 → 回到循环②开下一局；20s 未命中 → 回主界面重进角斗场（不盲点）', coord: null, color: '188,140,255' },
        { kind: 'check', title: '收工回桌面', detail: '打够 N 局 → 再查奖励面板；未领满就继续打（无限循环）。领满 → 点最右回准备界面 → goHome 回桌面', coord: null, color: '188,140,255' },
        { kind: 'check', title: '异常兜底：解卡', detail: '探针确认失败或点不动 → 逐个试点 确定(1136,306)/(645,660)/关闭/返回；全无反应 → 回主界面重进角斗场', coord: null, color: '248,81,73' },
        { kind: 'check', title: '打满后清结算回主界面', detail: '走完 rounds 局后 clearSettlement + goHome', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        const rounds = Math.max(1, ctx.cfg.num('arenaBattleRounds') || 15);
        const DIFF = [260, 90, 1020, 560];
        const THR = ctx.cfg.get('vision.diffThreshold') || 0.012;
        // 0.5.81：「这一下到底点得动吗」的判据要**显著高于背景漂移**，否则会把「画面自己在动」当成「点到了」。
        //   实测（同一份 trace 的 320×180 缩略帧）：卡在战后那个页面时，相邻两次采样之间画面本身
        //   就有 diff≈0.010~0.015 的轻微动画 —— 用 0.012 判，等于每次盲点都算「有反应」，
        //   于是脚本以为点到了「选对手/开始对战」，一路盲点下去（用户看到「点到别的页面去了」）。
        //   真点到东西时 diff≈0.16，大一个数量级。取 0.05：无效 ≈0.015 / 有效 ≈0.16，两侧余量都 >3 倍。
        const REACT = Math.max(THR * 3, 0.05);
        // 战后弹窗链里的「确定」落点（本次 trace 帧实测）：
        //   ① 任务/奖励面板的确定 = (1136,306)（金色圆角块 x1088..1185 y278..334 的质心）
        //   ② 「战斗结果」页的确定 = (645,660)（底中金色块 x570..720 y630..700）
        const ARENA_OK_BTN = [1136, 306];
        const RESULT_OK_BTN = [645, 660];

        // ⚠ v0.6.27 进场结构定稿（用户口径 2026-09-23，逐条对齐）：
        //   阶段1：
        //     进场① 主场景拖到最左        (dragScene)
        //     进场② 打开角斗场            (974,357)
        //     进场③ 打开忍术对战          (315,637)   ← 第 2 步点击，推进到准备界面
        //     循环① 确认在战斗准备界面     (探针 waitArenaReady)
        //   即进场是「拖 + **两次点击**」；两次点击是**两个不同按钮**：
        //     (974,357) = 主界面上的角斗场入口；(315,637) = 打开忍术对战。
        //   ⚠ 曾被误命名为「选对手/挑战」—— 用户澄清「根本没有选对手/挑战，
        //     这个就是场景转换的点击」。故只按"点它就推进"处理，不加业务判断。
        const enterArena = async (why) => {
          await dragScene(ctx, 'left');   // 进场① 拖到最左（标准件）
          await ctx.go([974, 357], null, '打开角斗场');      // 进场②
          await Utils.sleep(2000);        // 角斗场加载
          await ctx.tap([315, 637], null, '打开忍术对战');    // 进场③
          await Utils.sleep(2000);        // 准备界面加载
          Utils.log('info', `    🏟 已进场：${why}`);
        };

        /** 点一下 (x,y)，返回**这一下到底有没有让画面动**（0.5.81 起返回布尔）。
         *  判据用 REACT（≥0.05）而不是默认 THR（0.012）—— 见 REACT 注释。 */
        const tapAndDiff = async (x, y, label, waitMs, useFlow) => {
          try { ctx.vision.snapshot(DIFF); } catch (e) { /* 视觉不可用则按已响应处理 */ }
          if (useFlow) await ctx.tap([x, y], null, label);
          else await ctx.op.clickNatural(x, y, null, label);
          await Utils.sleep(waitMs || 1600);
          let d = 1;
          try { d = ctx.vision.frameDiff(DIFF); } catch (e) { d = 1; }
          const reacted = d >= REACT;
          Utils.log('info', `    · 点「${label}」@(${x},${y}) 画面变化 diff=${d.toFixed(4)}`
            + (reacted ? '（已响应）' : `（没反应，判据 ≥${REACT}）`));
          return reacted;
        };

        /** 卡在陌生页面 → 解卡：先松手，再逐个试点候选「确定/关闭/返回」，哪个让画面动了就用它 */
        const unstuck = async (why) => {
          ctx.op.releaseHold();
          Utils.log('warn', `    ⚠ ${why} → 开始解卡`);
          const spots = [
            ARENA_OK_BTN,                                  // 战后 任务/奖励面板 确定
            RESULT_OK_BTN,                                 // 战斗结果页 确定
            [COORDS.common.confirm.x, COORDS.common.confirm.y],
            [COORDS.common.confirmMid.x, COORDS.common.confirmMid.y],
            [COORDS.common.close.x, COORDS.common.close.y],
            [COORDS.common.closeAlt.x, COORDS.common.closeAlt.y],
            [COORDS.common.back.x, COORDS.common.back.y],
            [1150, 80],
          ];
          for (const s of spots) {
            if (await tapAndDiff(s[0], s[1], `解卡(${s[0]},${s[1]})`, 1400, false)) {
              Utils.log('info', `    ↺ 解卡命中：(${s[0]},${s[1]})`);
              return true;
            }
          }
          // 候选落点全不动 → 回主界面重进。⚠ 只有在**真的回到主界面**之后才重进：
          //   goHome 失败还继续拖屏/点入口，就是在陌生页面上盲点，等于换个方式乱点。
          Utils.log('warn', '    ⚠ 候选落点全部无反应 → 回主界面重进角斗场');
          if (!(await ctx.home())) {
            Utils.log('warn', '    ⚠ 回主界面也失败 → 本轮放弃（绝不盲点，交给下一轮重试或结束任务）');
            return false;
          }
          await enterArena('解卡失败后重进');
          return true;
        };

        await ctx.flow(`角斗场忍术对战（共 ${rounds} 局）`, this.steps);
        await enterArena('首次进场');

        /**
         * v0.6.27：打一场忍术对战（从「战斗准备界面」开战 → 打完 → 跳过结算）。
         *  抽成函数是因为新增的「奖励领取」流程需要**补打**（见下方 claimArenaRewards 循环）。
         *
         *  战斗参数说明（v0.6.20，每个都对应一条实测证据）：
         *    结算判据**只保留**「右上角战斗详情卷轴图标」（arenaEndIcon）。
         *    已删除（用户 2026-09-21 逐条否掉，理由都在 waitForEnd 注释里）：
         *      · 金色横幅「胜负已分」+ 6s 观察窗 —— 与图标打架（横幅先命中→判续局→图标才命中，白绕一圈）
         *      · 全屏黑屏快通道      —— 小局切换也黑屏，用的是整场起始时间 → 25s 后小局被误判成整场结束
         *      · 画面静止即停手/判结束 —— 战斗中静止是常态
         *  @returns {Promise<string>} fight 的结束原因（settlement / timeout / no-ready / no-start）
         */
        const playOneArenaRound = async (label) => {
          // ① 确认在「战斗准备界面」。
          //   ⚠ v0.6.27（用户口径 2026-09-23）：「**战斗循环里面不需要 (315,637)**」——
          //     该坐标是**进场时的场景转换点击**（已并入 enterArena 第 2 步 (305,631)），
          //     循环里不必再点：正常续局时游戏会自动回准备界面，等探针确认即可。
          //     （原先这里点的 (315,637) 被我误命名为「选对手/挑战」，
          //       实际根本没有这个按钮，故整段删除，只保留探针确认。）
          const atReady = (await ctx.waitArenaReady(2500)).ok;
          if (!atReady) {
            await unstuck('没到战斗准备界面（图标+红X 都未命中）');
            return 'no-ready';
          }
          Utils.log('info', '    ✓ 已在战斗准备界面');

          // ② 点「开战」
          if (!(await tapAndDiff(1168, 609, '开战', 2500, true))) {
            await unstuck('点「开战」画面没反应');
            return 'no-start';
          }

          const FIGHT_OPTS = {
            noHome: true,             // 不回主界面，续局由本任务决定
            noDefeat: true,           // 不认「失败」探针（在「双方登场」画面必然误报，trace 21 帧全中）
            assistMaxMs: 300000,      // 单场连招上限 5min（默认 150s 会把长局截断 → "不按键"）
            maxWaitMs: 360000,        // 单场等待上限 6min
            // 结算图标模板匹配（右上角「战斗详情」卷轴图标）
            //   实测：正样本 2.5 / 负样本 ≥41.7 → 阈值 30，命中即落判（不再开观察窗）
            arenaEndIcon: true,
            // 点「开战」后静默 10s 再开始连招（用户 2026-09-22 口径；录制实测空档 22.68s）
            startDelayMs: 10000,
          };
          const t0 = Date.now();
          const reason = await ctx.fight(FIGHT_OPTS);
          Utils.log('info', `⚔️ 角斗场 ${label} 打完（耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 结束原因 ${reason}）`);

          // ③ 跳过结算：松手 → 等 0.5s → 点普攻位 k(1137,589)
          //   用户口径：「结算识别后 0.5s 点 k 那个位置」。
          //   ⚠ 必须先松手：holdAttack 一直按着 k，直接点等于没点。
          ctx.op.releaseHold();
          await Utils.sleep(500);
          await ctx.op.clickNatural(1137, 589, null, '跳过结算（点 k 位）');
          ctx.op.releaseHold();
          await Utils.sleep(1200);            // 让结算动画/奖励浮层走完
          return reason;
        };

        /**
         * v0.6.27：**只读**探测「今天的忍术奖励是否已全部领完」（不点任何领取）。
         *   用途：首次进场时先看今天是否已完成 —— 已完成就直接跳过全部战斗、结束回桌面
         *   （用户口径 2026-09-23：「第一次进入的时候也先进这个奖励面板，看今天的任务是否已完成，
         *   已完成就跳过战斗，直接结束回桌面」）。
         *   末尾**点最右回准备界面**，把界面还原给调用方（无论后续打不打）。
         *  @returns {Promise<boolean>} true = 已全部领完（今天不用打了）
         */
        const peekArenaRewards = async (tag) => {
          ctx.op.releaseHold();
          Utils.log('info', `🔍 [${tag}] 打开奖励面板，检查今日是否已领完`);
          await ctx.op.clickNatural(ARENA_REWARD_ENTRY[0], ARENA_REWARD_ENTRY[1], null, '打开奖励面板');
          await Utils.sleep(1800);          // 面板展开动画
          const st = ctx.vision.arenaRewardsAllClaimed();
          Utils.log('info', `🔍 [${tag}] 奖励状态：第1个红=${st.first.redPct}%(${st.first.ok ? '已领' : '未领'}) ` +
            `第2个红=${st.second.redPct}%(${st.second.ok ? '已领' : '未领'})`);
          // 还原界面：点最右回忍术对战准备界面
          await ctx.op.clickNatural(ARENA_REWARD_EXIT[0], ARENA_REWARD_EXIT[1], null, '返回忍术对战界面');
          await Utils.sleep(1800);
          return st.done;
        };

        /**
         * v0.6.27：领取忍术对战奖励（用户口径 2026-09-23）。
         *   打开面板 → 点 4 次领取 → 探测第 1、2 个礼包是否都已领取(红)
         *
         *  ⚠ 用户口径：「奖励画面只有**点一下右边**才能回战斗准备界面，
         *    **不论是领满还是未满都需要**」——
         *    故本函数**先点最右还原界面，再返回结果**（不再是"领满就直接 return"）。
         *    否则领满时会停在奖励面板上，后续 waitArenaReady / 下一批都接不上。
         *
         *  @returns {Promise<boolean>} true = 四个礼包已全部领取
         */
        const claimArenaRewards = async (tag) => {
          ctx.op.releaseHold();
          Utils.log('info', `🎁 [${tag}] 打开忍术奖励面板`);
          await ctx.op.clickNatural(ARENA_REWARD_ENTRY[0], ARENA_REWARD_ENTRY[1], null, '打开奖励面板');
          await Utils.sleep(1800);          // 面板展开动画

          // 按录制点击 4 次（前 3 个补位同一行）
          for (let i = 0; i < ARENA_REWARD_CLAIMS.length; i++) {
            const [x, y] = ARENA_REWARD_CLAIMS[i];
            await ctx.op.clickNatural(x, y, null, `领取礼包 ${i + 1}`);
            await Utils.sleep(900);
          }
          await Utils.sleep(1000);          // 等领取动画/状态刷新

          const st = ctx.vision.arenaRewardsAllClaimed();
          Utils.log('info', `🎁 [${tag}] 奖励状态：第1个红=${st.first.redPct}%(${st.first.ok ? '已领' : '未领'}) ` +
            `第2个红=${st.second.redPct}%(${st.second.ok ? '已领' : '未领'})`);

          if (st.done) {
            Utils.log('info', `🎁 [${tag}] ✓ 第 1、2 个均已领取 → 四个礼包领完`);
          } else {
            Utils.log('info', `🎁 [${tag}] 仍有未完成礼包 → 稍后再打一批`);
          }
          // ★ 无论领满与否，都必须点最右回到战斗准备界面（用户口径）
          Utils.log('info', `🎁 [${tag}] 点最右 → 回战斗准备界面`);
          await ctx.op.clickNatural(ARENA_REWARD_EXIT[0], ARENA_REWARD_EXIT[1], null, '返回忍术对战界面');
          await Utils.sleep(1800);
          return st.done;
        };

        // ★ v0.6.27 首次进场先查「今天是否已领完」（用户口径）：
        //   已领完 ⇒ 今天的忍术奖励任务已完成 ⇒ **跳过全部战斗**，直接结束回桌面。
        //   未领完 ⇒ 进入「打 N 局 → 看一次面板」的批量循环。
        if (await peekArenaRewards('首次进场')) {
          Utils.log('info', '🎁 ✓ 今天忍术奖励已全部领完 → 跳过战斗，直接回桌面');
          ctx.step('今日已完成，跳过战斗'); ctx.stepResult(true);
          // ⚠ 不调 clearSettlement()（见文件末尾同一处说明：非结算页会空转 8 秒）
          await ctx.home();
          return;
        }
        Utils.log('info', '🎁 今天还有奖励未领完 → 正常进入战斗流程');

        // ── v0.6.27 批量循环（用户口径 2026-09-23）───────────────────────────
        //  「循环里面**不是打 1 局就看面板**，而是**打 n 局**，n = 我设定的值」。
        //  即：一个批次 = 连续打 N 局（N = arenaBattleRounds 配置）→ 打完看一次面板领奖；
        //     若还有未完成礼包，再打一个批次，如此重复。
        //  ⚠ 用户明确要求「**我就是需要无限打，直到领取奖励**」→ **不设批次上限**，
        //     一直打到「第 1、2 个礼包都变红（已领取）」才收工回桌面。
        //     （兜底只保留"本局没能开打就结束本批"与已存在的解卡逻辑，
        //       不做人为轮数截断。）
        let batch = 0;
        for (;;) {
          batch++;
          Utils.log('info', `🎁 === 第 ${batch} 批：连续打 ${rounds} 局 ===`);

          // ① 打 N 局
          for (let round = 1; round <= rounds; round++) {
            ctx.log(`—— 角斗场第 ${batch} 批 第 ${round}/${rounds} 局 ——`);
            const r = await playOneArenaRound(`第 ${batch} 批第 ${round} 局`);
            if (r === 'no-ready' || r === 'no-start') {
              Utils.log('warn', `    ⚠ 本局没能正常开打（${r}）→ 提前结束本批`);
              break;
            }
            if (round >= rounds) break;

            // 回到「战斗准备界面」再开下一局
            const ready = await ctx.waitArenaReady(20000);
            if (ready.ok) {
              Utils.log('info', `    ↻ 已回到战斗准备界面（${ready.ms}ms）→ 本批第 ${round + 1} 局`);
            } else {
              Utils.log('warn', '    ⚠ 20s 内没等到战斗准备界面 → 回主界面重进角斗场（不盲点）');
              ctx.op.releaseHold();
              if (await ctx.nav.goHome()) {
                await enterArena(`第 ${batch} 批第 ${round} 局结算后未回到准备界面`);
              } else {
                Utils.log('warn', '    ⚠ 回主界面也失败 → 交给下一轮自检');
              }
            }
            await Utils.sleep(500);
          }

          // ② 本批打完 → 领取奖励（内部会点最右还原界面）
          if (await claimArenaRewards(`第 ${batch} 批打完后`)) {
            Utils.log('info', `🎁 第 ${batch} 批后奖励已全部领完 → 结束（共 ${batch} 批）`);
            break;
          }
          Utils.log('info', `🎁 第 ${batch} 批后仍有未完成礼包 → 再打一批（第 ${batch + 1} 批）`);
        }
        // ⚠ 无批次上限（用户口径「我就是需要无限打，直到领取奖励」）→ 循环只会因
        //   「奖励全部领完」而 break。若任务因超时/手动停止而中断，由外层调度兜底。

        // 收尾：回主界面。⚠ 不再调 clearSettlement()（v0.6.27 删除，用户确认）——
        //   它默认 allowBlind=false，在非结算页**什么都不点**、只空转 8 轮（约 8 秒）后返回 false，
        //   纯浪费；且它那组坐标（settleConfirm/(659,410) 等）是为别的玩法标定的，
        //   在忍术对战的准备/奖励界面上本就不适用。此时人已在准备界面，直接 home() 即可。
        await ctx.home();
      }
    },



    {
      key: 'scoreMatchClaim', name: '积分赛段位领取', category: 'daily',
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-13 用户录制「积分赛领取（不打）.json」（仅 3 个动作）：
       *  首页横向拖 ×2 → 点首页「积分」入口 (548,166)（带红点）。
       *  用户口径：**进入积分赛后段位奖励是自动领取的**，不需要再点「领取」，
       *  所以流程到「点入口」为止，末尾回主界面即可。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最左', detail: '标准件 dragScene：拖到最左（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '点「积分赛」入口', detail: '点首页「积分」入口 (548,166)；进入后段位奖励自动领取', coord: [548, 166], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: '等自动领取完成 → goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await dragScene(ctx, 'left');   // 拖到最左（标准件）
        await Utils.sleep(1000);   // 校准间隔 1.56s
        await ctx.tap([548, 166], null, '点「积分赛」入口');
        await Utils.sleep(3000);   // 进页面 + 段位奖励自动领取
        await ctx.home();

      }
    },

    // ————— 周常任务 —————
    {
      key: 'roadOfPractice', name: '修行之路', category: 'weekly', timeout: 180000,
      /** 2026-09-14 修行之路.json 重录改版：不再打架，改「重置进度 → 后台扫荡」：
       *  主场景向左拖×2 → 试炼之地(543,144) → 选「修行之路」卷轴(392,323) →
       *  底部「重置」(761,651) → 提示框「是否将当前进度重置到第一关」确定(640,445) →
       *  「可以扫荡 420 关」点「扫荡」(644,544)（后台扫荡约 70 分钟，无需等待）→ 右上 ✕(1219,38) → 回主界面
       *  timeout 收窄 600s→180s（无战斗，纯点击流程） */
      steps: [
        { kind: 'drag', title: '主场景拖到最右', detail: '标准件 dragScene：拖到最右（内部多次+1s缓冲）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开试炼之地', detail: '点「试炼之地」招牌 (543,144)', coord: [543, 144], color: '88,166,255' },
        { kind: 'tap', title: '选「修行之路」', detail: '点左侧卷轴「修行之路」(392,323)（右边是生存挑战）', coord: [392, 323], color: '126,231,135' },
        { kind: 'tap', title: '点「重置」', detail: '底部按钮排：调整阵容/重置/扫荡/排行榜 → 重置 (761,651)', coord: [761, 651], color: '126,231,135' },
        { kind: 'tap', title: '确认重置', detail: '提示「是否将当前进度重置到第一关」→ 确定 (640,445)', coord: [640, 445], color: '210,153,34' },
        { kind: 'tap', title: '点「扫荡」', detail: '「可以扫荡 420 关」→ 扫荡 (644,544)，后台约 70 分钟', coord: [644, 544], color: '126,231,135' },
        { kind: 'tap', title: '关闭修行之路', detail: '扫荡已在后台进行，点右上 ✕ (1219,38)', coord: [1219, 38], color: '210,153,34' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await dragScene(ctx, 'right');   // 拖到最右（标准件）
        await Utils.sleep(1000);    // 校准间隔 0.4s
        await ctx.go([543, 144], null, '打开试炼之地');
        await Utils.sleep(1500);   // 校准间隔 1.6s
        await ctx.tap([392, 323], null, '选「修行之路」');
        await Utils.sleep(2300);   // 校准间隔 2.4s
        await ctx.tap([761, 651], null, '点「重置」');
        await Utils.sleep(1500);   // 校准间隔 1.5s：重置确认弹窗
        await ctx.tap([640, 445], null, '确认重置');
        await Utils.sleep(1200);   // 校准间隔 1.3s：弹窗关闭露出扫荡按钮
        await ctx.tap([644, 544], null, '点「扫荡」');
        await Utils.sleep(2500);   // 校准间隔 2.6s：扫荡启动动画
        await ctx.tap([1219, 38], null, '关闭修行之路');
        await ctx.home();

      }
    },

    {
      key: 'chaseAkatsuki', name: '追击晓组织', category: 'weekly', timeout: 420000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应） */
      steps: [
        { kind: 'tap', title: '打开追击晓组织', detail: '点「追击晓组织」入口', coord: [COORDS.weekly.akatsukiEntry.x, COORDS.weekly.akatsukiEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮', coord: [COORDS.common.challenge.x, COORDS.common.challenge.y], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 420s（含战斗））', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.weekly.akatsukiEntry);
        await ctx.tap(COORDS.common.challenge);
        await ctx.fight();

      }
    },

    {
      key: 'rebelNinja', name: '叛忍来袭', category: 'weekly', timeout: 420000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应） */
      steps: [
        { kind: 'tap', title: '打开叛忍来袭', detail: '点「叛忍来袭」入口', coord: [COORDS.weekly.rebelEntry.x, COORDS.weekly.rebelEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮', coord: [COORDS.common.challenge.x, COORDS.common.challenge.y], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 420s（含战斗））', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.weekly.rebelEntry);
        await ctx.tap(COORDS.common.challenge);
        await ctx.fight();

      }
    },

    {
      key: 'orgFortress', name: '组织要塞', category: 'weekly', timeout: 420000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应） */
      steps: [
        { kind: 'tap', title: '打开组织要塞', detail: '点「组织要塞」入口', coord: [COORDS.weekly.fortressEntry.x, COORDS.weekly.fortressEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮', coord: [COORDS.common.challenge.x, COORDS.common.challenge.y], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 420s（含战斗））', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.weekly.fortressEntry);
        await ctx.tap(COORDS.common.challenge);
        await ctx.fight();

      }
    },

    {
      key: 'heavenEarth', name: '天地战场', category: 'weekly', timeout: 420000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应） */
      steps: [
        { kind: 'tap', title: '打开天地战场', detail: '点「天地战场」入口', coord: [COORDS.weekly.heavenEntry.x, COORDS.weekly.heavenEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮', coord: [COORDS.common.challenge.x, COORDS.common.challenge.y], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 420s（含战斗））', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.go(COORDS.weekly.heavenEntry);
        await ctx.tap(COORDS.common.challenge);
        await ctx.fight();

      }
    },

    {
      key: 'missionHall', name: '任务集会所', category: 'battle',
      /** 0.5.74：从「日常」移入**战斗组**（长期挂机任务，方便单独选取）。
       *  战斗组不参与「当天已做过」记录 → Progress.tracked() 对 battle 返回 false，
       *  用户点了就是要跑，不会因为「今天做过了」被跳过。
       *  ⚠ 物理位置挪到 TASK_DEFS **末尾**：8 小时常驻循环若排在中途，
       *     会一直占着调度、把后面的秘境挑战/角斗场彻底饿死。
       *
       *  0.5.75：**空闲判定改为只看顶部 3 个槽位**（用户口径）。
       *  ❌ 旧写法读底部「可接受任务: N/9」——该计数在任务完成那一刻就归还：
       *     实测三槽全「可领取」时它仍显示 9/9 → 会被当成「有 3 个空位」去硬接。
       *  ✅ 现在：逐槽判 空缺 / 计时中 / 可领取，空闲位 = 可领取 + 空缺，
       *     3 个槽全在计时中才算「满 3」。
       *
       *  0.5.80（依据 2026-09-11 真机录制「任务集会所1」+「任务集会所2」二次标定）：
       *   ① **进面板的两段拖动 y 由 360 改为 282**（录制实测；(301,360) 处压在 UI 元素上 std≈31.7，
       *      (301,282) 处是纯色远景 std≈3.9，才是干净的起拖区）。首轮失败会回主界面用 y=360 重试一次。
       *   ② **面板判据收紧**：旧 `hangOk || btnOk>=2` 会在「推荐小队页 / 出发页」误判成在面板
       *      （那两页 (1171,653) 也是金色，hangOk 命中）→ 会在那两页乱点。
       *      现改为 `btnOk>=2`，按钮全灰时用「可领取」标签模板复核兜底。
       *   ③ **槽位光晕兜底加量程上限** 80（非面板页光晕 86~228 会被全判「可领取」）。
       *
       *  0.5.81（用户 2026-09-20 口径）：
       *   ① **挂机方式整体换掉**：旧做法是留在面板里、每 3 分钟轻点/短滑保活 ——
       *      用户实测「左右滑动这样不行，还是被判定为无操作而超时」。
       *      现在：**每轮领完/接完就回主界面 → 等 pollMin(5) 分钟 → 重新拖屏进面板**，
       *      靠「主界面 ↔ 集会所」来回切换保持活跃（见 MISSION.pollMin / MissionHall.sleepAtHome）。
       *      等待期间刻意不做任何操作 —— 主界面拖动会移动镜头，下一轮的拖屏坐标就偏了。
       *   ② 上一轮（0.5.80）修的是「进不去面板 / 在不在面板判错」；这一轮修的是「等太久被踢」。
       *
       *  0.5.77（用户三项要求，依据 2026-09-19 真机录制「任务集会所接了1次任务.json」）：
       *   ① **多个任务可领取会弹「一键领取」确认框** → 点「确定 (519,451)」，
       *      随后还有「恭喜你获得」全屏浮层 → 点一下收起。两步都补进 collectDone。
       *   ② **云游戏长时间不操作会超时** → 挂机期间每 3 分钟保活一次
       *      （轻点面板空白 / 单向短滑），节奏由 `keepAliveMin` 控制。
       *      ⚠ v0.6.27 已**整体废弃并删除**（keepAlive / keepAliveMin / sleepInPanel 均移除）：
       *        用户实测面板内轻点/短滑**仍被判无操作超时**，已改为回主界面等待（sleepAtHome）。
       *   ③ **挂机不回主界面** → 直接在集会所面板里等 30 分钟，到点原地读槽位；
       *      只有面板真的丢了才走 recover（清弹窗 → 回主界面重开）。
       *  ── 其余口径（用户 2026-09-18 确认）──
       *   · 只做 **红宝箱 / 蓝宝箱** 任务，**绿宝箱不做**
       *     （⚠ 宝箱 = 该行**最右侧**奖励格；行内奖励项 1~4 个不定，绝不能固定取第 3 格）
       *   · 同时最多 **3 个**任务在跑（= 顶部槽位数）
       *   · 不用「换一组」（右侧刷新额度不是免费的）
       *  ── 判断全部走视觉，无固定坐标盲点 ──
       *   槽位三态 空缺/计时中/可领取                 → MissionHall.readSlots
       *   宝箱色相 绿[95,175)/蓝[175,260)/品红[260,350)=红 → MissionHall.chestType
       *   接取按钮 金色(可接)/暗色(已接)              → MissionHall.btnAvailable
       *   面板检测 右下「换一组」金按钮 / 接取按钮金  → MissionHall.panelAnchors
       *   一键领取确认弹窗（浅米占比）                → MissionHall.popupOpen
       *   恭喜你获得浮层（亮度骤降）                  → MissionHall.overlayOpen
       *  几何/阈值/真机样本统计见上方 MISSION 常量注释块。 */
      timeout: MISSION.loopHours * 3600000 + 300000,   // 常驻循环，必须顶掉默认 4 分钟单任务超时
      hangLoop: true,                                  // 常驻挂机：不参与分类按钮的「跑全部」兜底，必须单独勾选
      steps: [
        { kind: 'check', title: '确保在集会所面板', detail: '已在面板内就直接继续（不回主界面）；不在才 回主界面→两次统一拖动(拖到最左 300→1000)→点入口 (545,466)，失败再试备用落点 (591,480)', coord: null, color: '188,140,255' },
        { kind: 'check', title: '读顶部 3 个槽位', detail: '逐槽判 空缺/计时中/可领取；空闲位 = 可领取 + 空缺，三个槽全计时中才算满 3', coord: null, color: '210,153,34' },
        { kind: 'check', title: '领取已完成任务', detail: '点「可领取」槽位图标；多个可领取会弹「是否一键领取所有奖励」→ 点确定 (519,451)，再点掉「恭喜你获得」浮层', coord: null, color: '210,153,34' },
        { kind: 'check', title: '按空闲位补接红/蓝', detail: '空闲 N 位就最多再接 N 个红/蓝宝箱任务；不用「换一组」', coord: null, color: '126,231,135' },
        { kind: 'check', title: '回主界面等 5 分钟', detail: '0.5.81：每轮领完/接完就回主界面，等 pollMin(5) 分钟再重新进场；靠「主界面 ↔ 集会所」来回切换保持活跃（面板内轻点/短滑实测仍被判无操作超时）', coord: null, color: '88,166,255' },
      ],
      async run(ctx) {
        const ROUND_MS = MISSION.loopMin * 60000;     // 每轮间隔（分钟 → ms）
        const HARD_MS = MISSION.loopHours * 3600000;  // 挂机总时长上限
        const t0 = Date.now();
        let round = 0, acc = 0, col = 0;
        // ⚠ 本 run 全程用底层 op / nav API（clickNatural / swipe / nav.goHome）：
        //   ctx.tap / ctx.drag / ctx.go / ctx.home 都会把流程图索引 +1，
        //   而本任务每轮重开流程图、靠 ctx.step() 显式标步 —— 混用会把索引顶飞。

        while (true) {
          await Runtime.check();                      // 用户点「停止」→ AbortError 立刻收尾
          if (round > 0 && Date.now() - t0 >= HARD_MS) {
            Utils.log('info', `⏹ 任务集会所挂机已满 ${MISSION.loopHours} 小时 → 收尾`);
            break;
          }
          round++;
          await ctx.flow({
            name: round === 1 ? this.name : `${this.name} · 第${round}轮`,
            key: this.key, steps: this.steps,
          });
          Utils.log('info', `===== 任务集会所 第 ${round} 轮 @ ${new Date().toLocaleTimeString('zh-CN', { hour12: false })} =====`);

          // —— 1) 确保在集会所面板 ——（0.5.77：挂机期间不回主界面，只有不在面板时才重开）
          ctx.step('确保在集会所面板');
          let ok = false;
          try {
            await MissionHall.clearPopups(ctx);       // 先收掉可能残留的弹窗/浮层
            ok = MissionHall.inPanel(ctx);
            if (ok) {
              Utils.log('info', '    ✓ 已在集会所面板内（沿用上一轮挂机位置，不回主界面）');
            } else {
              Utils.log('info', '    ↻ 面板不在 → 重新打开集会所');
              ok = await MissionHall.openPanel(ctx);
            }
          } catch (e) { Utils.log('warn', `⚠ 进面板阶段异常：${(e && e.message) || e}`); }
          ctx.stepResult(ok);
          if (!ok) {
            Utils.log('warn', '⚠ 未确认集会所面板 → 本轮跳过，等下一轮');
            await MissionHall.sleepInterruptible(ROUND_MS);
            continue;
          }

          // —— 2) 读顶部 3 个槽位（空闲/满 3 的唯一判据）——
          ctx.step('读顶部 3 个槽位');
          const s0 = await MissionHall.readSlots(ctx);
          if (s0.ok) {
            Utils.log('info', `📋 顶部槽位：${MissionHall.fmtSlots(s0)} → 空闲 ${s0.free}/${MISSION.concurrency}` +
              `（可领取 ${s0.done} + 空缺 ${s0.empty}），计时中 ${s0.running}`);
            Utils.log('debug', `    ${MissionHall.detail(s0)}`);
          } else {
            Utils.log('warn', `⚠ 读槽位失败：${s0.why}`);
          }
          ctx.stepResult(!!s0.ok);

          // —— 3) 先把已完成的任务领掉（腾出在跑名额）——
          ctx.step('领取已完成任务');
          const got = await MissionHall.collectDone(ctx);
          col += got;
          ctx.stepResult(true);
          if (got) Utils.log('info', `🎁 本轮领取 ${got} 个已完成任务（累计 ${col}）`);

          // —— 4) 按空闲位补接红/蓝宝箱任务 ——
          ctx.step('按空闲位补接红/蓝');
          let n = 0;
          if (!MissionHall.inPanel(ctx)) {
            Utils.log('warn', '⚠ 领取后不在面板（弹窗/浮层没收干净）→ 本轮不再接取');
            await MissionHall.recover(ctx);
          } else {
            n = await MissionHall.acceptQualifying(ctx);
            acc += n;
            if (n) Utils.log('info', `✅ 本轮接取 ${n} 个红/蓝宝箱任务（累计 ${acc}）`);
          }
          ctx.stepResult(true);

          // —— 5) 回主界面等 pollMin 分钟 → 下一轮重新进场（0.5.81 用户口径）——
          //   旧做法：留在面板里挂机 + 每 3 分钟轻点/短滑保活 —— 用户实测**仍被判无操作超时**。
          //   现在：每轮结束就回主界面，等 pollMin(5) 分钟，下一轮重新拖屏进面板 ——
          //   靠「主界面 ↔ 集会所」来回切换产生真实交互，等待期间不操作（免得改掉镜头位置）。
          ctx.step('回主界面等 5 分钟');
          const atHome = await MissionHall.sleepAtHome(ctx, MISSION.pollMin * 60000);
          Utils.log('info', `⏳ 已回主界面并等待 ${MISSION.pollMin} 分钟（到点重新拖屏进集会所）`);
          ctx.stepResult(atHome);
        }
        // 收尾：挂满或用户停止 → 回主界面，别把面板留在屏幕上
        try { await ctx.nav.goHome(); } catch (e) { /* ignore */ }
        Utils.log('info', `🏁 任务集会所结束：共 ${round} 轮，接取 ${acc} 个，领取 ${col} 个`);
      }
    },
  ];

  class Task {
    constructor(def) {
      Object.assign(this, def);
      this.status = 'pending';
      this.startTime = null;
      this.endTime = null;
      this.error = null;
      this.attempt = 0;
    }
  }

  const TaskFactory = {
    create(key) { const d = TASK_DEFS.find(t => t.key === key); return d ? new Task(d) : null; },
    createEnabled(cfg) {
      const sw = cfg.get('taskSwitches') || {};
      // 0.5.55 用户口径：「直接点开始」的执行顺序改为**日常在前、收货在后**。
      //   TASK_DEFS 数组顺序仍负责「分类内顺序」，跨分类顺序由这里的 RANK 统一决定
      //   （稳定的次级排序键用原数组下标，保证同一分类内顺序 = TASK_DEFS 顺序）。
      //  0.5.56 新增 battle（战斗）分类，排在周常之后：忍术对战单场耗时长（15 连最多 90 min），
      //   放最后，避免长战斗把前面的短任务挤掉。
      //  v0.6.22：秘境挑战已从 battle 移入 daily（用户要求放到生存试炼之后），
      //   因此它现在跟随日常组执行（RANK.daily=0），不再压在最后。
      const RANK = { daily: 0, collect: 1, weekly: 2, battle: 3 };
      return TASK_DEFS
        .map((d, i) => ({ d, i }))
        .filter(x => sw[x.d.key])
        .sort((a, b) => ((RANK[a.d.category] != null ? RANK[a.d.category] : 3) -
                         (RANK[b.d.category] != null ? RANK[b.d.category] : 3)) || (a.i - b.i))
        .map(x => new Task(x.d));
    },
    /**
     * 分类按钮（🎁 收获 / ⚔ 日常 / 📅 周常 / 🥊 战斗）用：跑该分类下**已勾选**的任务。
     *
     * 0.5.56 兜底：若该类**一个都没勾选**，则直接跑该分类全部任务并打警告。
     *   场景：秘境/忍术对战平时开关是关的（不想让「▶ 开始」自动跑长战斗），
     *   但用户专门点「🥊 战斗」就是想手动开跑 —— 这时如果还按开关过滤就会跑 0 个，
     *   点了等于没点。所以「分类按钮点了至少要跑点什么」。
     *   （开关语义不变：只决定该任务是否进入「▶ 开始」的全量流程。）
     */
    byCategory(cat, cfg) {
      const sw = cfg.get('taskSwitches') || {};
      const all = TASK_DEFS.filter(d => d.category === cat);
      const on = all.filter(d => sw[d.key]);
      if (!on.length && all.length) {
        // 0.5.74：`hangLoop` 常驻挂机任务（任务集会所 8 小时循环）**不参与**这条兜底 ——
        //   否则「一个都没勾选」时会被顺手带上，之后 8 小时调度全被它占住、别的都跑不了。
        //   要跑它请**单独勾选**。也正是靠这个，战斗组里能只挑它一项出来跑。
        const runAll = all.filter(d => !d.hangLoop);
        const hangs = all.filter(d => d.hangLoop);
        if (hangs.length) {
          Utils.log('warn', `⚠ [${cat}] 常驻挂机任务需单独勾选，不参与「跑全部」兜底：` +
            hangs.map(d => d.name).join('、'));
        }
        if (runAll.length) {
          Utils.log('warn', `⚠ [${cat}] 分类下没有勾选的任务 → 直接运行该类全部 ${runAll.length} 个：` +
            runAll.map(d => d.name).join('、'));
          return runAll.map(d => new Task(d));
        }
      }
      return on.map(d => new Task(d));
    }
  };

  // ============================================================
  //  TaskScheduler
  // ============================================================
  class TaskScheduler {
    constructor(ctx, config, progress) {
      this.ctx = ctx;
      this.config = config;
      this.progress = progress;
      this.queue = [];
      this.running = false;
      this.paused = false;
      this.current = null;
      this.history = [];
      this.listeners = {};
      this.startedAt = 0;
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, data) {
      (this.listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { Utils.log('error', '事件回调异常', e); } });
    }

    addTasks(tasks) { tasks.forEach(t => this.queue.push(t)); }
    get pending() { return this.queue.length; }

    async start() {
      if (this.running) return;
      this.running = true;
      this.paused = false;
      Runtime.reset();
      this.startedAt = Date.now();
      this.emit('start', { total: this.queue.length });
      Utils.log('info', `▶ 开始执行，共 ${this.queue.length} 个任务`);

      while (this.queue.length && this.running && !Runtime.aborted) {
        while (this.paused && this.running && !Runtime.aborted) await Utils.sleep(1000);
        if (!this.running || Runtime.aborted) break;

        const task = this.queue.shift();
        this.current = task;
        this.emit('taskStart', task);

        try {
          task.status = 'running';
          task.startTime = Date.now();
          Utils.log('info', `▶ [${task.name}] 开始`);

          await this._runWithRetry(task);

          task.status = 'done';
          task.endTime = Date.now();
          this.history.push({ key: task.key, name: task.name, result: 'success', ms: task.endTime - task.startTime });
          this.progress.mark(task, 'success', { ms: task.endTime - task.startTime });
          this.emit('taskDone', task);
          Utils.log('info', `✓ [${task.name}] 完成 (${Utils.formatDuration(task.endTime - task.startTime)})`);
        } catch (err) {
          task.status = 'failed';
          task.error = err && err.message ? err.message : String(err);
          task.endTime = Date.now();
          this.history.push({ key: task.key, name: task.name, result: 'failed', error: task.error });
          this.progress.mark(task, 'failed', { error: task.error });
          this.emit('taskFailed', { task, error: err });

          if (err instanceof AbortError) { Utils.log('warn', `⏹ [${task.name}] 已中止`); break; }
          Utils.log('error', `✗ [${task.name}] 失败: ${task.error}`);

          // 失败后强制回主界面，避免带错误状态进下一个任务。
          // ⚠ v0.6.28：**不再静默吞异常**。上一版是 `catch(e){/* ignore */}` ——
          //   回不去也没人知道，下一个任务直接在脏状态上开工（实测 2026-09-23：
          //   角斗场崩在「奖励面板已打开」状态，goHome 没成功且无日志，
          //   导致紧接着的「任务集会所」在奖励面板上拖屏/点入口 → 全错位）。
          //   现在：结果要判、失败要记、只兜一次（goHome 解决不了所有问题，
          //   定位问题靠日志，不靠无限重试）。
          try {
            if (!(await this.ctx.nav.ensureHome())) {
              Utils.log('warn', `  [${task.name}] ⚠ 失败后未回到主界面 → 再兜一次 goHome`);
              await this.ctx.nav.goHome();
            }
          } catch (e) {
            Utils.log('warn', `  [${task.name}] ⚠ 失败后复位异常（继续下一个任务）：${e.message}`);
          }
        }

        this.current = null;
        if (this.queue.length) await this.config.wait('delay.short');
      }

      this.running = false;
      this.current = null;
      const success = this.history.filter(h => h.result === 'success').length;
      const failed = this.history.filter(h => h.result === 'failed').length;
      this.emit('complete', {
        total: this.history.length, success, failed,
        duration: Date.now() - this.startedAt
      });
      Utils.log('info', `🏁 全部结束：成功 ${success}，失败 ${failed}，用时 ${Utils.formatDuration(Date.now() - this.startedAt)}`);
    }

    async _runWithRetry(task) {
      const max = this.config.num('retry.maxAttempts') || 2;
      const interval = this.config.num('retry.interval') || 2500;
      const timeout = task.timeout || this.config.num('runtime.taskTimeout') || 240000;

      for (let i = 1; i <= max; i++) {
        Runtime.check();
        task.attempt = i;
        try {
          // 任务前先确保在主界面
          if (this.config.get('nav.requireHome')) await this.ctx.nav.ensureHome();
          await Utils.withTimeout(task.run(this.ctx), timeout, task.name);
          return;
        } catch (err) {
          if (err instanceof AbortError) throw err;
          // ⚠ v0.6.28：**代码缺陷类异常不做重试**（用户口径「还是应该解决异常为主」）。
          //   依据 2026-09-23 实测：`ctx.vision.xxx is not a function`（方法放错类）
          //   属于**代码 bug**，重试必然再失败，却白跑一整轮任务流程
          //   （实测重试把角斗场重新进场、再点开奖励面板，20+ 秒全废），
          //   还把画面留在奖励面板上连累下一个任务。
          //   ⇒ 这类异常直接抛，日志标明「代码缺陷，不重试」，便于一眼定位。
          if (CODE_BUG_RE.test(err && err.message || '')) {
            Utils.log('error', `  [${task.name}] ⚠ 检测到代码缺陷类异常，不重试：${err.message}`);
            throw err;
          }
          if (i < max) {
            Utils.log('warn', `  [${task.name}] 第 ${i} 次失败，${interval}ms 后重试：${err.message}`);
            await Utils.sleep(interval);
            try { await this.ctx.nav.dismissPopups(); } catch (e) { /* ignore */ }
          } else {
            throw err;
          }
        }
      }
    }

    pause() { this.paused = true; this.emit('pause', {}); }
    resume() { this.paused = false; this.emit('resume', {}); }
    stop() {
      Runtime.abort();
      this.running = false;
      this.paused = false;
      this.queue = [];
      this.emit('stop', {});
    }

    getStatus() {
      return {
        running: this.running, paused: this.paused,
        current: this.current ? this.current.name : null,
        queueLen: this.queue.length,
        done: this.history.filter(h => h.result === 'success').length,
        failed: this.history.filter(h => h.result === 'failed').length,
      };
    }
  }

  // ============================================================
  //  Calibrator — 校准模式（教学模式）
  //  开启后只监听"真人点击"(isTrusted 过滤脚本合成事件)，逐步存档：
  //  逻辑坐标 + 点击时整帧 + 场景 + 点击点平均色 + 自动生成的探针候选代码。
  //  API: __narutoAuto.calib.toggle() / code() / dump() / download()
  // ============================================================
  class Calibrator {
    constructor(vision, scenes) {
      this.vision = vision;
      this.scenes = scenes;
      this.active = false;
      this.steps = [];
      this.max = 120;
      this._onDown = null; this._onKey = null; this._onKeyUp = null; this._overlay = null;
      this._onMove = null; this._onUp = null;
      this._pending = null;      // 正按住的键，keyup 时回填 hold
      this._drag = null;         // 正在拖动的指针状态（{x1,y1,x2,y2,moved}）
      this.app = null;           // bind(app) 后可用（回放需要 op）
      this.replaying = false;    // 回放中
      this._stopFlag = false;
    }

    bind(app) { this.app = app; return this; }

    start() {
      if (this.active) return;
      this.active = true; this.steps = [];
      this._createOverlay();
      this._onDown = e => this._onPointerDown(e);
      this._onMove = e => this._onPointerMove(e);
      this._onUp = e => this._onPointerUp(e);
      this._onKey = e => this._onKeyDown(e);
      this._onKeyUp = e => this._onKeyRelease(e);
      document.addEventListener('pointerdown', this._onDown, true);
      document.addEventListener('pointermove', this._onMove, true);
      document.addEventListener('pointerup', this._onUp, true);
      document.addEventListener('keydown', this._onKey, true);
      document.addEventListener('keyup', this._onKeyUp, true);
      Utils.log('info', '🎓 校准模式已开启：点击 / 按住拖动 / 按键都会记录（Esc 结束；Ctrl+Shift+E 录入 Esc 键本身）');
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      document.removeEventListener('pointerdown', this._onDown, true);
      document.removeEventListener('pointermove', this._onMove, true);
      document.removeEventListener('pointerup', this._onUp, true);
      document.removeEventListener('keydown', this._onKey, true);
      document.removeEventListener('keyup', this._onKeyUp, true);
      this._pending = null;
      this._drag = null;
      this._removeOverlay();
      const k = this.steps.filter(s => s.kind === 'key').length;
      const d = this.steps.filter(s => s.kind === 'drag').length;
      Utils.log('info', `🎓 校准结束，共 ${this.steps.length} 步（点击 ${this.steps.length - k - d} / 拖动 ${d} / 按键 ${k}）。__narutoAuto.calib.code() 取代码 / .download() 存盘 / .replay() 回放`);
      return this.steps;
    }

    toggle() { return this.active ? this.stop() : this.start(); }

    /** client 坐标 → 1280x720 逻辑坐标（含 object-fit: contain 黑边反算） */
    toLogical(cx, cy) {
      const el = this.vision.video || document.querySelector('canvas');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const sw = el.videoWidth || BASE_W, sh = el.videoHeight || BASE_H;
      const scale = Math.min(r.width / sw, r.height / sh);
      const offX = (r.width - sw * scale) / 2, offY = (r.height - sh * scale) / 2;
      return {
        x: Math.round((cx - r.left - offX) / scale * BASE_W / sw),
        y: Math.round((cy - r.top - offY) / scale * BASE_H / sh),
      };
    }

    /** 拖动判定阈值（逻辑像素）：位移超过它才算拖动，否则算点击 */
    static DRAG_MIN = 12;

    _onPointerDown(e) {
      if (!this.active || !e.isTrusted) return;          // 只收真人操作
      const p = this.toLogical(e.clientX, e.clientY);
      if (!p || p.x < 0 || p.y < 0 || p.x > BASE_W || p.y > BASE_H) return;
      this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, c1x: e.clientX, c1y: e.clientY,
                     t0: Date.now(), moved: false, maxDist: 0 };
    }

    _onPointerMove(e) {
      if (!this.active || !this._drag || !e.isTrusted) return;
      const p = this.toLogical(e.clientX, e.clientY);
      if (!p) return;
      const d = this._drag;
      d.x2 = p.x; d.y2 = p.y;
      const dist = Math.hypot(e.clientX - d.c1x, e.clientY - d.c1y);
      d.maxDist = Math.max(d.maxDist, dist);
      // 位移超阈值即锁定为拖动（即使松手回到起点也算拖动）
      if (d.maxDist >= Calibrator.DRAG_MIN) d.moved = true;
    }

    _onPointerUp(e) {
      if (!this.active || !this._drag || !e.isTrusted) { this._drag = null; return; }
      const d = this._drag;
      this._drag = null;
      const hold = Date.now() - d.t0;

      // 拖动 → 记一条 drag 步骤
      if (d.moved) {
        try { this.vision.capture(); } catch (err) { /* ignore */ }
        let scene = 'unknown';
        try { scene = this.scenes.detect(false).scene; } catch (err) { /* ignore */ }
        const a = this._probeAt(d.x1, d.y1);
        const b = this._probeAt(d.x2, d.y2);
        const step = {
          seq: this.steps.length + 1, t: Date.now(), kind: 'drag',
          name: this._autoName('drag'),
          x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
          duration: Utils.clamp(hold, 200, 4000),
          scene,
          color: a.color, area: a.area,        // 起点色（供生成探针）
          endColor: b.color, endArea: b.area,
          frame: this._frame(),
        };
        this.steps.push(step);
        if (this.steps.length > this.max) this.steps.shift();
        Utils.log('info', `  🎓 第 ${step.seq} 步 ✋ 拖动 (${d.x1},${d.y1}) → (${d.x2},${d.y2}) ${step.duration}ms 场景=${scene}`);
        this._flashDrag(d.x1, d.y1, d.x2, d.y2);
        return;
      }

      // 未移动 → 按点击记录（保持原有行为与字段）
      this._recordClick(d.x1, d.y1, d.x2, d.y2);
    }

    _recordClick(x, y) {
      const p = { x, y };
      try { this.vision.capture(); } catch (err) { /* ignore */ }
      const probe = this._probeAt(p.x, p.y);
      let scene = 'unknown';
      try { scene = this.scenes.detect(false).scene; } catch (err) { /* ignore */ }
      const step = {
        seq: this.steps.length + 1, t: Date.now(), kind: 'click',
        name: this._autoName('click'),
        x: p.x, y: p.y, scene,
        color: probe.color, area: probe.area,
        frame: this._frame(),
      };
      this.steps.push(step);
      if (this.steps.length > this.max) this.steps.shift();
      Utils.log('info', `  🎓 第 ${step.seq} 步 🖱 (${p.x},${p.y}) 场景=${scene} rgb(${probe.color.r},${probe.color.g},${probe.color.b})`);
      this._flash(p);
    }

    _flashDrag(x1, y1, x2, y2) {
      try {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:${Math.min(x1, x2)}px;top:${Math.min(y1, y2)}px;
          width:${Math.abs(x2 - x1)}px;height:${Math.abs(y2 - y1)}px;
          border:2px dashed #f39c12;border-radius:8px;z-index:999997;pointer-events:none;transition:opacity .6s`;
        document.body.appendChild(d);
        setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 500);
      } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------
    //  键盘录制
    // ------------------------------------------------------------

    /** keydown（捕获阶段，只收真人按键） */
    _onKeyDown(e) {
      if (!this.active || !e.isTrusted) return;
      const k = e.key;

      // Esc = 结束校准（拦截传播，避免同时触发游戏返回）
      if (k === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault(); e.stopPropagation();
        this.stop();
        return;
      }
      // 脚本快捷键 Ctrl+Shift+* 不录；其中 E 特判：录入一个 Escape 键步骤
      if (e.ctrlKey && e.shiftKey) {
        if (k === 'E' || k === 'e') {
          e.preventDefault(); e.stopPropagation();
          this._recordKey('Escape', 'Escape', 27, { ctrl: false, shift: false, alt: false });
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;               // 浏览器快捷键不录
      if (e.repeat) return;                                          // 长按只记一次按下
      if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;  // 纯修饰键不录

      this._recordKey(k, e.code || '', e.keyCode || 0, { ctrl: false, shift: e.shiftKey, alt: false });
    }

    /** keyup：回填按住时长 */
    _onKeyRelease(e) {
      if (!this.active || !this._pending) return;
      const p = this._pending;
      if (p.key !== e.key && p.code !== e.code) return;
      p.hold = Date.now() - p.t0;
      Utils.log('debug', `  ⌨ ${this.keyLabel(p)} 按住 ${p.hold}ms`);
      this._pending = null;
    }

    _recordKey(key, code, keyCode, mods) {
      try { this.vision.capture(); } catch (err) { /* ignore */ }
      let scene = 'unknown';
      try { scene = this.scenes.detect(false).scene; } catch (err) { /* ignore */ }
      const step = {
        seq: this.steps.length + 1, t: Date.now(), t0: Date.now(), kind: 'key',
        name: this._autoName('key'),
        key, code, keyCode, mods, hold: 0, scene,
        frame: this._frame(),
      };
      this.steps.push(step);
      if (this.steps.length > this.max) this.steps.shift();
      this._pending = step;
      Utils.log('info', `  🎓 第 ${step.seq} 步 ⌨ ${this.keyLabel(step)} 场景=${scene}`);
      this._flashKey(step);
      return step;
    }

    /** 自动命名：默认 stepN（保持与旧导出兼容，类型由 kind 区分） */
    _autoName() { return 'step' + (this.steps.length + 1); }

    /**
     * 给某一步改名（支持 'nav.store' 点号分组；命名后 code() 导出会自动分组）
     * @param {number} seq 步序号（1-based）
     * @param {string} name 新名字
     */
    rename(seq, name) {
      const s = this.steps.find(x => x.seq === seq);
      if (!s) { Utils.log('warn', `⚠ 没有第 ${seq} 步`); return null; }
      const old = s.name;
      s.name = String(name || '').trim() || `step${seq}`;
      Utils.log('info', `✏ [${seq}] ${old} → ${s.name}`);
      return s;
    }

    /** 批量重命名：renameAll('nav') → step1..N 依次变成 nav.1 / nav.2 ... */
    renameAll(prefix, from, to) {
      const a = from == null ? 1 : from, b = to == null ? Infinity : to;
      let n = 0;
      this.steps.forEach(s => {
        if (s.seq < a || s.seq > b) return;
        s.name = `${prefix}.${s.seq}`; n++;
      });
      Utils.log('info', `✏ 已把 ${n} 步重命名为 ${prefix}.N`);
      return n;
    }

    /** 列出当前所有步骤的序号 + 名字（供面板/控制台核对） */
    list() {
      return this.steps.map(s => ({
        seq: s.seq, name: s.name || `step${s.seq}`,
        kind: s.kind === 'key' ? '⌨ ' + this.keyLabel(s)
          : s.kind === 'drag' ? `✋ (${s.x1},${s.y1})→(${s.x2},${s.y2}) ${s.duration}ms`
          : `🖱 (${s.x},${s.y})`,
        scene: s.scene,
      }));
    }

    /** 统一的步骤描述（面板/日志用） */
    stepLabel(s) {
      if (s.kind === 'key') return '⌨ ' + this.keyLabel(s);
      if (s.kind === 'drag') return `✋ 拖动 (${s.x1},${s.y1})→(${s.x2},${s.y2})`;
      return `🖱 点击 (${s.x},${s.y})`;
    }

    /** 'f' + shift → "Shift+F" */
    keyLabel(s) {
      const m = s.mods || {};
      const mods = (m.ctrl ? 'Ctrl+' : '') + (m.alt ? 'Alt+' : '') + (m.shift ? 'Shift+' : '');
      return mods + (s.key === ' ' ? 'Space' : s.key);
    }

    _flashKey(s) {
      try {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
          background:rgba(30,144,255,.92);color:#fff;padding:6px 16px;border-radius:14px;font-size:13px;
          z-index:999997;pointer-events:none;transition:opacity .6s;font-family:"Microsoft YaHei",sans-serif`;
        d.textContent = '⌨ ' + this.keyLabel(s);
        document.body.appendChild(d);
        setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 500);
      } catch (e) { /* ignore */ }
    }

    /** 点击点周围 24x24 平均色 + 区域（供生成探针） */
    _probeAt(x, y) {
      const size = 24;
      const sx = Utils.clamp(Math.round(x - size / 2), 0, BASE_W - size);
      const sy = Utils.clamp(Math.round(y - size / 2), 0, BASE_H - size);
      let c = { r: 0, g: 0, b: 0 };
      try { c = this.vision.avg(sx, sy, size, size); } catch (e) { /* ignore */ }
      return { color: c, area: [sx, sy, sx + size, sy + size] };
    }

    _frame() {
      try { return this.vision.canvas.toDataURL('image/jpeg', 0.7); } catch (e) { return null; }
    }

    _flash(p) {
      try {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:${p.x}px;top:${p.y}px;width:16px;height:16px;margin:-8px 0 0 -8px;
          border:2px solid #e94560;border-radius:50%;z-index:999997;pointer-events:none;transition:opacity .6s`;
        document.body.appendChild(d);
        setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 400);
      } catch (e) { /* ignore */ }
    }

    _createOverlay() {
      this._overlay = document.createElement('div');
      this._overlay.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(233,69,96,.92);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;z-index:999999;pointer-events:none;font-family:"Microsoft YaHei",sans-serif';
      this._overlay.textContent = '🎓 校准中 · 点击 / 按住拖动 / 按键都会记录 | Esc 结束 | Ctrl+Shift+E 录 Esc';
      document.body.appendChild(this._overlay);
    }
    _removeOverlay() { if (this._overlay) { this._overlay.remove(); this._overlay = null; } }

    /** 生成可直接粘贴的 COORDS / PROBES 候选代码（点击→坐标，按键→key 流程） */
    code() {
      if (!this.steps.length) return '// 没有校准数据';
      const clicks = this.steps.filter(s => s.kind !== 'key' && s.kind !== 'drag');
      const drags = this.steps.filter(s => s.kind === 'drag');
      const keys = this.steps.filter(s => s.kind === 'key');
      let out = '// === 校准生成 ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ===\n';
      out += `// 共 ${this.steps.length} 步：点击 ${clicks.length} / 拖动 ${drags.length} / 按键 ${keys.length}\n\n`;

      if (clicks.length) {
        // 命名支持点号分组：'nav.store' → COORDS.nav.store
        const groups = {};
        clicks.forEach(s => {
          const nm = s.name || `step${s.seq}`;
          const parts = nm.split('.');
          const g = parts.length > 1 ? parts[0] : 'calib';
          const k = parts.length > 1 ? parts.slice(1).join('.') : parts[0];
          (groups[g] = groups[g] || []).push({ k, s });
        });
        for (const [g, items] of Object.entries(groups)) {
          out += `COORDS.${g} = {\n` + items.map(i =>
            `  ${i.k}: { x: ${i.s.x}, y: ${i.s.y} },  // ${i.s.name} @${i.s.scene}`).join('\n') + '\n};\n';
        }
        out += '\n// PROBES 候选：\n' + clicks.map(s =>
          `    calib${s.seq}: { area: [${s.area}], color: { r: ${s.color.r}, g: ${s.color.g}, b: ${s.color.b} }, tol: 35, click: [${s.x}, ${s.y}], label: '${s.name || 'step' + s.seq}@${s.scene}', verified: false },`
        ).join('\n') + '\n\n';
      }

      if (drags.length) {
        out += '// 拖动候选（起点/终点坐标）：\n';
        out += 'COORDS.drag = {\n' + drags.map(s =>
          `  ${(s.name || 'step' + s.seq).split('.').pop()}: { x1: ${s.x1}, y1: ${s.y1}, x2: ${s.x2}, y2: ${s.y2}, duration: ${s.duration} },  // @${s.scene}`).join('\n') + '\n};\n\n';
      }

      out += '// 完整操作序列（可直接回放 / 改成任务流程）：\n';
      out += 'COORDS.calibFlow = [\n';
      out += this.steps.map(s => {
        if (s.kind === 'key') return `  { kind: 'key', key: '${s.key}', mods: ${JSON.stringify(s.mods)}, hold: ${s.hold} },  // ${s.name || 'step' + s.seq} ${this.keyLabel(s)} @${s.scene}`;
        if (s.kind === 'drag') return `  { kind: 'drag', x1: ${s.x1}, y1: ${s.y1}, x2: ${s.x2}, y2: ${s.y2}, duration: ${s.duration} },  // ${s.name || 'step' + s.seq} 拖动 @${s.scene}`;
        return `  { kind: 'click', x: ${s.x}, y: ${s.y} },  // ${s.name || 'step' + s.seq} @${s.scene}`;
      }).join('\n') + '\n];\n';
      return out;
    }

    /**
     * 回放校准序列（验证录制是否正确）
     * @param {object} opt { gap: 每步间隔 ms（默认 1000）, from: 起始序号, to: 结束序号 }
     */
    async replay(opt) {
      const o = opt || {};
      const app = this.app;
      if (!app || !app.op) { Utils.log('warn', '⚠ 回放需要脚本上下文，请在页面内调用 __narutoAuto.calib.replay()'); return false; }
      if (this.replaying) { Utils.log('warn', '⚠ 正在回放中'); return false; }
      const steps = this.steps.filter(s => !o.from || s.seq >= o.from).filter(s => !o.to || s.seq <= o.to);
      this.replaying = true; this._stopFlag = false;
      Utils.log('info', `▶ 回放 ${steps.length} 步（间隔 ${o.gap || 1000}ms）`);
      for (const s of steps) {
        if (this._stopFlag) break;
        try {
          if (s.kind === 'key') {
            Marks.key(s.key, s.mods);
            await app.op.sdk.key(s.key, s.mods, s.hold > 250 ? s.hold : 60);
            Utils.log('info', `  ▶ [${s.seq}] ⌨ ${this.keyLabel(s)}${s.hold > 250 ? ` (长按 ${s.hold}ms)` : ''}`);
          } else if (s.kind === 'drag') {
            await app.op.swipe(s.x1, s.y1, s.x2, s.y2, s.duration);
            Utils.log('info', `  ▶ [${s.seq}] ✋ 拖动 (${s.x1},${s.y1})→(${s.x2},${s.y2}) ${s.duration}ms`);
          } else {
            await app.op.tap(s.x, s.y);
            Utils.log('info', `  ▶ [${s.seq}] 🖱 (${s.x},${s.y})`);
          }
        } catch (e) {
          Utils.log('warn', `  ▶ [${s.seq}] 失败: ${e.message}`);
        }
        // 回放步间隔：默认 1000ms；下限 MIN_OP_DELAY（0.5.76 起 1s）——保证回放也不会出现「连点被吞」
        await Utils.sleep(Math.max(MIN_OP_DELAY, o.gap == null ? 1000 : o.gap));
      }
      this.replaying = false;
      Utils.log('info', '⏹ 回放结束');
      return true;
    }

    stopReplay() { this._stopFlag = true; }

    clear() { this.steps = []; this._pending = null; return this; }

    dump(withFrames = true) {
      return this.steps.map(s => (withFrames ? s : Object.assign({}, s, { frame: null })));
    }

    download() {
      const blob = new Blob([JSON.stringify(this.dump(true), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `naruto-calib-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  }

  // ============================================================
  //  ControlPanel
  // ============================================================
  const UI_CSS = `
    #na-panel{position:fixed;width:330px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #e94560;border-radius:12px;color:#eee;font-family:'Microsoft YaHei',sans-serif;font-size:13px;z-index:999999;box-shadow:0 4px 20px rgba(233,69,96,.3);user-select:none;overflow:hidden}
    #na-panel .hd{background:linear-gradient(90deg,#e94560,#0f3460);padding:10px 15px;display:flex;justify-content:space-between;align-items:center;cursor:move}
    #na-panel .hd h3{margin:0;font-size:14px;color:#fff}
    #na-panel .hd .x{cursor:pointer;font-size:18px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s}
    #na-panel .hd .x:hover{background:rgba(255,255,255,.2)}
    #na-panel .hd .mi{cursor:pointer;font-size:15px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s;opacity:.85}
    #na-panel .hd .mi:hover{background:rgba(255,255,255,.2);opacity:1}

    /* 悬浮球（收起态）：默认左下角，避开游戏右上角关闭按钮 */
    #na-fab{position:fixed;width:54px;height:54px;border-radius:50%;z-index:999998;
      background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #e94560;
      box-shadow:0 3px 14px rgba(0,0,0,.45);cursor:pointer;user-select:none;
      display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;
      transition:opacity .2s,transform .15s}
    #na-fab:hover{transform:scale(1.08);opacity:1 !important}
    #na-fab .na-fab-dot{position:absolute;top:-1px;right:-1px;width:13px;height:13px;border-radius:50%;
      border:2px solid #16213e;background:#7f8c8d}
    #na-fab .na-fab-dot.running{background:#f39c12;animation:na-pulse 1s infinite}
    #na-fab .na-fab-dot.done{background:#2ecc71}
    #na-fab .na-fab-dot.failed{background:#e74c3c}
    #na-fab .na-fab-dot.paused{background:#3498db}
    #na-fab .na-fab-badge{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);
      background:#e94560;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;
      white-space:nowrap;font-family:Consolas,monospace}
    #na-panel .bd{padding:12px 15px;max-height:70vh;overflow-y:auto}
    #na-panel .sec{margin-bottom:10px}
    #na-panel .st{font-size:11px;color:#e94560;margin-bottom:5px;font-weight:700;letter-spacing:1px}
    #na-panel .br{display:flex;gap:6px;margin-bottom:6px}
    #na-panel .btn{flex:1;padding:7px 6px;border:1px solid #e94560;background:transparent;color:#e94560;border-radius:6px;cursor:pointer;font-size:11px;transition:all .2s;text-align:center}
    #na-panel .btn:hover{background:#e94560;color:#fff}
    #na-panel .btn.pri{background:#e94560;color:#fff}
    #na-panel .btn.pri:hover{background:#c73650}
    #na-panel .btn:disabled{opacity:.4;cursor:not-allowed}
    #na-panel .sb{background:rgba(0,0,0,.3);padding:7px 10px;border-radius:6px;margin-bottom:6px;font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
    #na-panel .sb .l{color:#888}
    #na-panel .sb .v{color:#3498db;font-weight:700}
    #na-panel .tl{max-height:150px;overflow-y:auto}
    #na-panel .ti{display:flex;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    #na-panel .ti .dot{width:8px;height:8px;border-radius:50%;margin-right:6px;flex-shrink:0}
    #na-panel .ti .dot.pending{background:#555}
    #na-panel .ti .dot.running{background:#f39c12;animation:na-pulse 1s infinite}
    #na-panel .ti .dot.done{background:#2ecc71}
    #na-panel .ti .dot.failed{background:#e74c3c}
    #na-panel .ti .dot.skipped{background:#7f8c8d}
    #na-panel .ti .nm{flex:1;font-size:11px}
    #na-panel .ti .tm{font-size:10px;color:#888}
    #na-panel .la{background:rgba(0,0,0,.4);padding:6px;border-radius:6px;max-height:120px;overflow-y:auto;font-family:Consolas,monospace;font-size:10px;line-height:1.5;color:#aaa}
    #na-panel .la .i{color:#3498db}#na-panel .la .w{color:#f39c12}#na-panel .la .e{color:#e74c3c}#na-panel .la .s{color:#2ecc71}
    #na-panel .cg{display:grid;grid-template-columns:1fr 1fr;gap:3px}
    #na-panel .ci{display:flex;align-items:center;gap:3px;font-size:10px}
    #na-panel .ci input{accent-color:#e94560}
    #na-pv{width:100%;aspect-ratio:16/9;background:#000;border-radius:6px;cursor:crosshair;display:block}
    #na-sample{font-family:Consolas,monospace;font-size:10px;color:#9cdcfe;background:rgba(0,0,0,.4);padding:5px;border-radius:5px;margin-top:4px;white-space:pre-wrap;word-break:break-all;min-height:28px}
    #na-set .row{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;margin-bottom:4px}
    #na-set .row input[type=number]{width:70px;background:rgba(0,0,0,.4);border:1px solid #444;color:#eee;border-radius:4px;padding:2px 4px;font-size:11px}
    #na-set .row select{background:rgba(0,0,0,.4);border:1px solid #444;color:#eee;border-radius:4px;font-size:11px;padding:2px}
    @keyframes na-pulse{0%,100%{opacity:1}50%{opacity:.4}}
  `;

  class ControlPanel {
    constructor(app) {
      this.app = app;
      this.scheduler = app.scheduler;
      this.config = app.config;
      this.calib = app.calib;
      this.scenes = app.scenes;
      this.vision = app.vision;
      this.panel = null;
      this.fab = null;
      this.visible = false;
      // 日志：保留**纯文本**历史（同时供面板渲染与导出），上限按「够复盘一整轮秘境」定
      //  v0.5.93：80 条远远不够 —— 一轮秘境 10 场 × 每场十几条 ≈ 200+ 条，
      //  出了问题只能看到尾巴，无法定位是哪条分支在循环。提到 3000 条（纯字符串，内存可忽略）。
      this.logs = [];          // 纯文本行，如 "[10:52:32] ⏳ 时间轴 12 键 → 24 事件"
      this.maxLogs = 3000;
      this.logLevels = [];     // 与 logs 一一对应的级别，导出时用
      this._previewTimer = null;
      this._fabState = 'idle';
    }

    create() {
      if (typeof GM_addStyle === 'function') GM_addStyle(UI_CSS);
      else {
        const s = document.createElement('style');
        s.textContent = UI_CSS;
        document.head.appendChild(s);
      }
      this.panel = document.createElement('div');
      this.panel.id = 'na-panel';
      this.panel.innerHTML = this._html();
      document.body.appendChild(this.panel);

      this.fab = document.createElement('div');
      this.fab.id = 'na-fab';
      this.fab.title = '火影自动化（点击展开 · Ctrl+Shift+A）';
      this.fab.innerHTML = '🍥<span class="na-fab-dot"></span>';
      document.body.appendChild(this.fab);

      this._bindEvents();
      this._bindFab();
      this._bindScheduler();
      this._startPreview();
      this._startStatusLoop();

      // 默认收起（或恢复上次状态）
      if (this.config.get('ui.collapsed')) this.collapse();
      else this.expand();
    }

    /** 展开面板 */
    expand() {
      if (!this.panel) return;
      this.visible = true;
      this.panel.style.display = '';
      this._placePanel();
      this._setFabOpacity(1);
      this._renderSettingsIfOpen();
    }

    /** 收起到悬浮球 */
    collapse() {
      if (!this.panel) return;
      this.visible = false;
      this.panel.style.display = 'none';
      this._setFabOpacity(this.config.get('ui.fabOpacity'));
    }

    toggle() { this.visible ? this.collapse() : this.expand(); }

    /** 兼容旧调用 */
    show() { this.expand(); }

    _setFabOpacity(v) { if (this.fab) this.fab.style.opacity = String(v == null ? 1 : v); }

    /** 浮球与面板都贴同一侧，避免面板跑到右上角遮住游戏关闭按钮 */
    _fabPos() {
      const cfg = this.config.get('ui') || {};
      const size = 54;
      let left = typeof cfg.fabLeft === 'number' ? cfg.fabLeft : 16;
      let top = typeof cfg.fabTop === 'number' ? cfg.fabTop : -96;
      if (top < 0) top = window.innerHeight + top - size;
      left = Utils.clamp(left, 4, Math.max(4, window.innerWidth - size - 4));
      top = Utils.clamp(top, 4, Math.max(4, window.innerHeight - size - 4));
      return { left, top, size };
    }

    _applyFabPos(p) {
      if (!this.fab) return;
      this.fab.style.left = p.left + 'px';
      this.fab.style.top = p.top + 'px';
    }

    _placePanel() {
      if (!this.panel || !this.fab) return;
      const p = this._fabPos();
      const w = this.panel.offsetWidth || 330;
      const h = this.panel.offsetHeight || 420;
      const onLeft = p.left + p.size / 2 < window.innerWidth / 2;
      let left = onLeft ? p.left : Math.max(4, p.left + p.size - w);
      left = Utils.clamp(left, 4, Math.max(4, window.innerWidth - w - 4));
      // 面板底边与浮球底边对齐，超出顶部则贴顶
      let top = p.top + p.size - h;
      if (top < 8) top = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      this.panel.style.left = left + 'px';
      this.panel.style.top = top + 'px';
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    }

    _bindFab() {
      const f = this.fab;
      this._applyFabPos(this._fabPos());

      let moved = false;
      f.addEventListener('mousedown', e => {
        const start = { x: e.clientX, y: e.clientY, ...this._fabPos() };
        moved = false;
        const onMove = ev => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
          const p = {
            left: Utils.clamp(start.left + dx, 4, window.innerWidth - start.size - 4),
            top: Utils.clamp(start.top + dy, 4, window.innerHeight - start.size - 4),
            size: start.size,
          };
          this._applyFabPos(p);
          if (this.visible) this._placePanel();
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (moved) {
            const r = f.getBoundingClientRect();
            this.config.set('ui.fabLeft', Math.round(r.left));
            this.config.set('ui.fabTop', Math.round(r.top));
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
      });

      f.addEventListener('click', () => { if (!moved) this.toggle(); });
      // 双击直接跑「全部启用任务」，收起态也能一键启动
      f.addEventListener('dblclick', () => {
        this._run(TaskFactory.createEnabled(this.config));
      });

      // 视口变化时把浮球和面板夹回可视区
      window.addEventListener('resize', () => {
        this._applyFabPos(this._fabPos());
        if (this.visible) this._placePanel();
      });
    }

    /** 更新浮球状态点与进度角标 */
    _updateFab() {
      if (!this.fab) return;
      const dot = this.fab.querySelector('.na-fab-dot');
      const st = this.scheduler.getStatus();
      let state = 'idle';

      if (this.scheduler.running) state = this.scheduler.paused ? 'paused' : 'running';
      else if (this._lastRunResult === 'failed') state = 'failed';
      else if (this._lastRunResult === 'done') state = 'done';

      if (dot) dot.className = 'na-fab-dot ' + state;

      let badge = this.fab.querySelector('.na-fab-badge');
      const total = st.queueLen + (this.scheduler.current ? 1 : 0);
      if (this.scheduler.running && total > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'na-fab-badge';
          this.fab.appendChild(badge);
        }
        badge.textContent = `${st.done + st.failed}/${total}`;
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }

    _renderSettingsIfOpen() {
      const box = this.panel && this.panel.querySelector('#na-cfg-panel');
      if (box && box.style.display !== 'none') this._renderSettings();
    }

    _html() {
      return `
        <div class="hd" id="na-drag"><h3>🍥 火影自动化 v${VERSION}</h3>
          <span><span class="mi" id="na-min" title="收起为悬浮球">－</span><span class="x" id="na-x" title="收起为悬浮球">×</span></span></div>
        <div class="bd">
          <div class="sb">
            <span><span class="l">状态</span> <span class="v" id="na-st">就绪</span></span>
            <span><span class="l">SDK</span> <span class="v" id="na-sdk">检测中</span></span>
            <span><span class="l">画面</span> <span class="v" id="na-vid">检测中</span></span>
            <span><span class="l">场景</span> <span class="v" id="na-scene">-</span></span>
            <span><span class="l">队列</span> <span class="v" id="na-qc">0</span></span>
            <span><span class="l">成功/失败</span> <span class="v" id="na-dc">0 / 0</span></span>
          </div>
          <div class="br">
            <button class="btn pri" id="na-start">▶ 开始</button>
            <button class="btn" id="na-pause" disabled>⏸</button>
            <button class="btn" id="na-stop" disabled>⏹</button>
            <button class="btn" id="na-home">🏠 回主界面</button>
          </div>
          <div class="br">
            <button class="btn" id="na-daily">⚔ 日常</button>
            <button class="btn" id="na-collect">🎁 收获</button>
            <button class="btn" id="na-weekly">📅 周常</button>
            <button class="btn" id="na-battle">🥊 战斗</button>
          </div>
          <div class="br">
            <button class="btn" id="na-probe">🔍 探测</button>
            <button class="btn" id="na-mark-btn">👁 标记开</button>
            <button class="btn" id="na-flow">📋 流程图</button>
            <button class="btn" id="na-cfg">⚙ 设置</button>
          </div>
          <div class="br">
            <button class="btn" id="na-calib">🎓 校准</button>
            <button class="btn" id="na-calib-play">▶ 回放</button>
            <button class="btn" id="na-calib-dl">💾 导出</button>
            <button class="btn" id="na-shot">📷 截图</button>
            <button class="btn" id="na-multitouch">⌨ 键盘多键自检</button>
            <button class="btn" id="na-layer">🖱 层诊断</button>
          </div>
          <div class="br">
            <button class="btn" id="na-calib-rename">✏ 命名</button>
            <button class="btn" id="na-calib-list">📃 列表</button>
            <button class="btn" id="na-calib-clr">🗑 清空</button>
          </div>
          <div id="na-flow-preview-wrap" style="font-size:11px;margin-bottom:6px;display:flex;align-items:center;gap:4px">
            <span style="opacity:.7;flex:0 0 auto">📋 预览</span>
            <select id="na-flow-preview" style="flex:1;min-width:0;font-size:11px;padding:1px 2px"></select>
          </div>
          <div id="na-calib-info" style="font-size:11px;color:#e94560;margin-bottom:6px">校准：记录真人点击 + 按键 + 抓帧取色</div>
          <div class="br">
            <button class="btn" id="na-trace">🔬 追踪</button>
            <button class="btn" id="na-trace-dl">💾 导出</button>
          </div>
          <div id="na-trace-info" style="font-size:11px;color:#2ecc71;margin-bottom:6px">追踪：关闭（真实点击全记录，定位自动运行问题）</div>

          <div class="sec" id="na-pv-wrap">
            <div class="st">画面预览（点击可取色）</div>
            <canvas id="na-pv" width="256" height="144"></canvas>
            <div id="na-sample">点击预览图取样，生成探针代码片段</div>
          </div>

          <div class="sec" id="na-cfg-panel" style="display:none">
            <div id="na-set"></div>
            <div class="st" style="margin-top:8px">任务开关</div>
            <div class="cg" id="na-switches"></div>
            <div class="br" style="margin-top:6px">
              <button class="btn" id="na-save">保存</button>
              <button class="btn" id="na-fabhome">悬浮球归位</button>
              <button class="btn" id="na-clearp">清除记录</button>
              <button class="btn" id="na-reset">重置</button>
            </div>
          </div>

          <div class="sec"><div class="st">任务</div><div class="tl" id="na-tl"></div></div>
          <div class="sec"><div class="st">日志</div>
          <div style="display:flex;gap:4px;margin-bottom:4px">
            <button class="btn" id="na-log-dl" title="导出全部日志为 .txt">💾 日志</button>
            <button class="btn" id="na-log-cp" title="复制全部日志到剪贴板">📋 复制日志</button>
            <button class="btn" id="na-log-clr" title="清空日志">🗑 清日志</button>
          </div>
          <div class="la" id="na-log"></div>
        </div>
        </div>`;
    }

    _renderSettings() {
      const box = this.panel.querySelector('#na-set');
      const num = (label, path, step) => `
        <div class="row"><span>${label}</span>
          <input type="number" data-p="${path}" value="${this.config.get(path)}" ${step ? `step="${step}"` : ''}></div>`;
      const chk = (label, path) => `
        <div class="row"><span>${label}</span>
          <input type="checkbox" data-c="${path}" ${this.config.get(path) ? 'checked' : ''}></div>`;

      box.innerHTML =
        num('点击间隔 min(ms)｜≥1000', 'delay.click.min', 100) +
        num('点击间隔 max(ms)', 'delay.click.max', 100) +
        num('页面加载 min(ms)', 'delay.pageLoad.min', 100) +
        num('页面加载 max(ms)', 'delay.pageLoad.max', 100) +
        num('战斗最少等待(ms)', 'battle.minWait', 1000) +
        num('战斗最长等待(ms)', 'battle.maxWait', 1000) +
        num('单任务超时(ms)', 'runtime.taskTimeout', 1000) +
        num('小队突袭次数(次/天)', 'squadRaidRounds', 1) +
        // 角斗场次数输入框 0.5.59 起移到「任务开关 → 🥊 战斗」组尾部（用户要求显眼可输入），
        // 这里不再重复渲染：两处同绑一个配置项，保存时互有先后会互相覆盖。
        num('帧差异阈值', 'vision.diffThreshold', 0.001) +
        num('静止帧数', 'vision.stableFrames', 1) +
        num('回主界面复检间隔(ms)', 'nav.homeConfirmGap', 100) +
        num('返回后静置(ms)', 'nav.homeSettleMs', 100) +
        num('回主界面超时(ms)', 'nav.homeTimeout', 1000) +
        `<div class="row"><span>坐标模式</span><select data-s="input.mode">
           <option value="stream" ${this.config.get('input.mode') === 'stream' ? 'selected' : ''}>stream 串流</option>
           <option value="dom" ${this.config.get('input.mode') === 'dom' ? 'selected' : ''}>dom 页面</option>
           <option value="raw" ${this.config.get('input.mode') === 'raw' ? 'selected' : ''}>raw 原样1280x720</option>
         </select></div>` +
        `<div class="row"><span>事件载荷</span><select data-s="input.protocol">
           <option value="obj" ${this.config.get('input.protocol') === 'obj' ? 'selected' : ''}>obj 对象</option>
           <option value="args" ${this.config.get('input.protocol') === 'args' ? 'selected' : ''}>args 位置参数</option>
         </select></div>` +
        chk('启用视觉检测', 'vision.enabled') +
        chk('显示预览', 'vision.preview') +
        chk('任务前回主界面', 'nav.requireHome') +
        chk('盲按返回(场景判不出时)', 'nav.blindBack') +
        chk('盲按时发ESC', 'nav.useEsc') +
        chk('跳过已完成(非战斗组)', 'runtime.skipDoneToday') +
        chk('战斗开自动', 'battle.autoBattle') +
        chk('战斗开倍速', 'battle.speedUp') +
        chk('战斗辅助(点招按钮)', 'battle.keyAssist') +
        chk('普攻一直按住(不松开)', 'battle.holdAttack') +
        num('战斗辅助单场上限(ms)', 'battle.assistMaxMs', 5000) +
        `<div class="st" style="margin-top:8px">秘境挑战</div>` +
        chk('忽略券=0继续跑 (🧪仅测试用)', 'secretRealm.ignoreZeroTicket') +
        `<div class="row" style="font-size:11px;line-height:1.5;opacity:.75">
           开启后：读到「剩余挑战券 = 0」也<b>不退出</b>，继续点匹配打战斗。<br>
           仅用于当天券已刷光时测下游流程（战斗/结算/回主界面）。<br>
           ⚠ 正式跑请关闭，否则券光后会空转到匹配上限。
         </div>` +
        `<div class="st" style="margin-top:8px">界面（避免遮挡游戏）</div>` +
        chk('启动即收起为悬浮球', 'ui.collapsed') +
        chk('运行时自动收起', 'ui.autoHideOnRun') +
        chk('Ctrl+Shift+A 切换面板', 'ui.toggleHotkey') +
        num('悬浮球透明度', 'ui.fabOpacity', 0.1);

      const sw = this.panel.querySelector('#na-switches');
      const labels = TASK_LABELS;
      const switches = this.config.get('taskSwitches') || {};
      // 按分类分组渲染：**日常任务 / 每日收获 / 周常任务 / 战斗**（与「直接点开始」的执行顺序一致）
      const GROUPS = [
        ['daily', '⚔ 日常任务'],
        ['collect', '🎁 每日收获'],
        ['weekly', '📅 周常任务'],
        ['battle', '🥊 战斗'],
      ];
      const item = k =>
        `<label class="ci"><input type="checkbox" data-t="${k}" ${switches[k] ? 'checked' : ''}>${labels[k] || k}</label>`;
      const catOf = k => {
        const d = TASK_DEFS.find(t => t.key === k);
        return d ? (d.category || 'daily') : 'other';
      };
      let html = '';
      for (const [cat, title] of GROUPS) {
        // 0.5.55：组内顺序改为**按 TASK_DEFS 顺序**渲染。原来用 Object.keys(switches)（配置里键的存入顺序），
        //   导致「调整 TASK_DEFS 顺序」面板不跟随 —— 面板顺序和实际执行顺序会不一致。
        const keys = TASK_DEFS.filter(t => t.category === cat && (t.key in switches)).map(t => t.key);
        if (!keys.length) continue;
        // 0.5.59：战斗组尾部内联「角斗场次数」输入框（用户要求：循环次数要能手动输入，
        //   原来只埋在「设置」长列表中间不好找）。与设置页的 num('角斗场次数') 同写
        //   arenaBattleRounds，保存逻辑已扩展到 #na-switches 里的 data-p 输入框。
        const extra = cat === 'battle'
          ? `<div class="cg" style="margin-top:2px"><label class="ci">角斗场次数(次/组)
               <input type="number" data-p="arenaBattleRounds" min="1" step="1" style="width:58px"
                      value="${this.config.get('arenaBattleRounds')}"></label></div>`
            + `<div style="margin-top:3px;opacity:.6;font-size:11px;line-height:1.5">`
            + `长期任务：不记录「今天做过」，不会因已完成被跳过；`
            + `任务集会所按 30 分钟一轮常驻挂机（排在本组最后，不会挡住其他任务）</div>`
          : '';
        html += `<div class="st" style="margin-top:6px">${title}</div><div class="cg">${keys.map(item).join('')}</div>${extra}`;
      }
      // 兜底：分类未知的键（历史遗留）单独一组，避免开关"消失"
      const rest = Object.keys(switches).filter(k => !GROUPS.some(([c]) => catOf(k) === c));
      if (rest.length) {
        html += `<div class="st" style="margin-top:6px">其它</div><div class="cg">${rest.map(item).join('')}</div>`;
      }
      sw.innerHTML = html;
    }

    _bindEvents() {
      const p = this.panel;

      // 拖拽
      let drag = false, sx, sy, ox, oy;
      p.querySelector('#na-drag').addEventListener('mousedown', e => {
        drag = true; sx = e.clientX; sy = e.clientY;
        const r = p.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!drag) return;
        p.style.left = (ox + e.clientX - sx) + 'px';
        p.style.top = (oy + e.clientY - sy) + 'px';
        p.style.right = 'auto';
      });
      document.addEventListener('mouseup', () => { drag = false; });

      p.querySelector('#na-x').onclick = () => this.collapse();
      p.querySelector('#na-min').onclick = () => this.collapse();

      p.querySelector('#na-start').onclick = () => this._run(TaskFactory.createEnabled(this.config));
      p.querySelector('#na-collect').onclick = () => this._run(TaskFactory.byCategory('collect', this.config));
      p.querySelector('#na-daily').onclick = () => this._run(TaskFactory.byCategory('daily', this.config));
      p.querySelector('#na-weekly').onclick = () => this._run(TaskFactory.byCategory('weekly', this.config));
      p.querySelector('#na-battle').onclick = () => this._run(TaskFactory.byCategory('battle', this.config));

      p.querySelector('#na-pause').onclick = () => {
        if (this.scheduler.paused) { this.scheduler.resume(); p.querySelector('#na-pause').textContent = '⏸'; }
        else { this.scheduler.pause(); p.querySelector('#na-pause').textContent = '▶'; }
      };
      p.querySelector('#na-stop').onclick = () => {
        this.scheduler.stop();
        this._setBtns(false);
        p.querySelector('#na-pause').textContent = '⏸';
      };
      p.querySelector('#na-home').onclick = () => this.action('回主界面', async () => {
        const ok = await this.app.nav.goHome();
        if (!ok) Utils.log('warn', '提示：若场景一直识别不出，可在设置里把 nav.blindBack 打开，改用盲按返回');
        return ok;
      });

      p.querySelector('#na-probe').onclick = () => {
        this.addLog('i', '=== 场景探测 ===');
        try {
          const r = this.scenes.detect(true);
          this.addLog('i', `亮度=${r.brightness.toFixed(1)} 场景=${SCENE_LABELS[r.scene] || r.scene}${r.error ? ' 错误=' + r.error : ''}`);
        } catch (e) { this.addLog('e', '探测异常: ' + (e.message || e)); }
      };

      // 📷 截图：抓当前 video 帧全尺寸下载 PNG（做校准脚本时留档用）
      p.querySelector('#na-shot').onclick = () => {
        try {
          const video = document.querySelector('video');
          if (!video || !video.videoWidth) { this.addLog('e', '截图失败：video 未就绪'); return; }
          const c = document.createElement('canvas');
          c.width = video.videoWidth;
          c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const a = document.createElement('a');
          a.href = c.toDataURL('image/png');
          a.download = `naruto-shot-${ts}.png`;
          a.click();
          this.addLog('i', `📷 已截图 ${c.width}x${c.height} → naruto-shot-${ts}.png`);
        } catch (e) { this.addLog('e', '截图异常: ' + (e.message || e)); }
      };

      // 💾 日志导出 / 复制 / 清空（v0.5.93）
      //  为什么要导出：原先日志只留 80 条且无法带走，出问题时只能看到尾巴，
      //  定位不了「是哪条分支在循环」这类需要看完整时间线的问题。
      p.querySelector('#na-log-dl').onclick = () => {
        try {
          const n = this.downloadLogs();
          this.addLog('i', `💾 已导出 ${n} 条日志`);
        } catch (e) { this.addLog('e', '日志导出异常: ' + (e.message || e)); }
      };
      p.querySelector('#na-log-cp').onclick = async () => {
        try {
          const r = await this.copyLogs();
          this.addLog(r.ok ? 'i' : 'w', r.ok ? `📋 已复制 ${r.n} 条日志到剪贴板` : `📋 复制失败(${r.err || '未知'})，共 ${r.n} 条，请改用「💾 日志」`);
        } catch (e) { this.addLog('e', '日志复制异常: ' + (e.message || e)); }
      };
      p.querySelector('#na-log-clr').onclick = () => {
        this.logs = [];
        this.logLevels = [];
        const area = p.querySelector('#na-log');
        if (area) area.innerHTML = '';   // DOM 一并清掉，否则增量追加会留下旧节点
        this.addLog('i', '🗑 日志已清空');
      };

      // ⌨ 键盘多键自检（v0.5.92）：验证「原生键盘事件能否多键同按」。
      //
      // ⚠ v0.5.92 已删除旧的「⌨ 键盘自检」按钮 —— 它调用 sdk.key('k')，即已被证伪的
      //   SDK 键盘通道（sendKeyEvent/sendMockKey 直调底层、绕过页面按键状态机，
      //   真机逐项实测从未生效）。它当年"检测通过"是假象：只证明事件被本地派发了，
      //   不证明云端游戏有响应。诊断价值已被下面这个四步客观对照取代。
      //
      // 背景：10 份秘境录制统计出 **806 处**「某键按住窗口内出现另一键」，
      //   leiting 步1 d(hold=700) 期间要按 i/i/o、gangti2 有 392 处。
      //   旧的鼠标方案做不到 —— `_domDispatch` 发的是 mouse 事件（pointerId 固定 1），
      //   第二个 pointerdown 被当成同一指针移动，把第一个挤掉。用户实测原话：
      //   「不会斜向走位，按键弄一起，另外的按键会被吃掉」。
      //
      // v0.5.92 真机逐项对照（战斗练习页）已确立唯一有效通道：
      //   ✅ window.dispatchEvent(new KeyboardEvent(...)) —— 支持多键同按（S+D 出斜向）
      //   ❌ pc.keyboard.sendKeyEvent / sendMockKey —— 从没生效
      //
      // 本自检做四件事，全用**画面差异**客观判断，不靠肉眼：
      //   ① 单键基线：按住 W → 记 diff1
      //   ② 多键同按：W + J 同时 → 记 diff2
      //   ③ 斜向同按：S + D 同时 → 记 diff3（最直观，用户肉眼可辨「斜着走」）
      //   ④ 串行对照：W 松开后再按 J → 记 diff4
      // 判读：diff2 > diff4 明显 → 多键并存可行，时间轴调度生效。
      p.querySelector('#na-multitouch').onclick = async () => {
        try {
          const op = this.app && this.app.operator;
          if (!op) { this.addLog('e', '键盘自检失败：operator 未绑定'); return; }


          let sceneKey = '';
          try { const r = this.app.scenes.detect(false); sceneKey = r.scene; } catch (e) {}
          const inBattle = sceneKey === SCENE.BATTLE;
          this.addLog('i', `⌨ 键盘多键自检开始（约 5 秒，期间别切窗口）当前场景=${SCENE_LABELS[sceneKey] || sceneKey || '未知'}`);
          if (!inBattle) this.addLog('w', '⌨ 当前不在战斗中 → 差异说明不了问题，请进战斗后再点一次');

          const REGION = [420, 160, 900, 560];
          const vis = this.app.vision;
          const diff = async (duringMs) => {
            try { vis.snapshot(REGION); } catch (e) { return -1; }
            await Utils.sleep(duringMs);
            try { return vis.frameDiff(REGION); } catch (e) { return -1; }
          };
          const hold = async (keys, ms) => {
            for (const k of keys) op.holdKey(k);
            const d = await diff(ms);
            for (const k of keys.slice().reverse()) op.releaseKey(k);
            await Utils.sleep(400);
            return d;
          };

          // ① 单键基线：按住 W
          const d1 = await hold(['w'], 900);
          this.addLog('i', `⌨ ① 单按 W            差异=${pct(d1)}  ← 基线`);

          // ② 多键同按：W + J（方向 + 技能并存）
          this.addLog('i', '⌨ ② 同时按 W + J（看是否边走边放技能）…');
          const d2 = await hold(['w', 'j'], 900);
          this.addLog('i', `⌨ ② 同时 W + J        差异=${pct(d2)}  ← 关键：录制里 806 处需要这个`);

          // ③ 斜向同按：S + D（最直观，肉眼可辨「斜着走」）
          this.addLog('i', '⌨ ③ 同时按 S + D（看是否斜着走）…');
          const d3 = await hold(['s', 'd'], 900);
          this.addLog('i', `⌨ ③ 同时 S + D        差异=${pct(d3)}  ← 斜向：真机已确认可行`);

          // ④ 串行对照：旧的鼠标做法（按 W → 松 → 按 J）
          try { vis.snapshot(REGION); } catch (e) {}
          op.holdKey('w'); await Utils.sleep(200); op.releaseKey('w');
          op.holdKey('j');
          const d4 = await diff(900);
          op.releaseKey('j');
          await Utils.sleep(400);
          this.addLog('i', `⌨ ④ 串行 按W→松→按J    差异=${pct(d4)}  ← 旧做法对照`);

          this.addLog('i', '⌨ —— 判读 ——');
          if (!inBattle) this.addLog('w', '⌨ 不在战斗中，数字仅供参考；请进战斗再点一次');
          if (d2 > d4 + 0.02 && d2 > 0.02) {
            this.addLog('i', `⌨ ✅ 并存(②${pct(d2)}) 强于 串行(④${pct(d4)}) → 时间轴调度生效`);
          } else if (Math.abs(d2 - d4) <= 0.02) {
            this.addLog('w', '⌨ ⚠ 并存与串行接近 → 多键可能没生效，检查 KEY_CODE_MAP');
          } else {
            this.addLog('w', `⌨ ⚠ 并存弱于串行 → 多键通路有问题`);
          }
          this.addLog('i', '⌨ 请把这 6 行日志发我');
        } catch (e) { this.addLog('e', '键盘自检异常: ' + (e.message || e)); }
      };

      function pct(v) { return v < 0 ? 'n/a' : (v * 100).toFixed(1) + '%'; }

      // 🖱 层诊断：判断"点了没反应"是不是层级问题（分享图/活动弹窗在宿主页面 DOM 层，
      //            主点击通道发到 video，这类覆盖层收不到事件）
      p.querySelector('#na-layer').onclick = () => {
        try {
          const sdk = this.app && this.app.sdk;
          if (!sdk || !sdk.overlayScan) { this.addLog('e', '层诊断失败：SDK 未绑定'); return; }
          const s = sdk.overlayScan();
          this.addLog('i', `🖱 video=${s.video ? s.video.path + ' ' + s.video.rect.w + 'x' + s.video.rect.h : '未找到'}`);
          if (s.centerHit) {
            this.addLog('i', `🖱 画面中心(${s.centerHit.at.x},${s.centerHit.at.y}) 命中 ${s.centerHit.path}`
              + ` → ${s.centerHit.isGameLayer ? '游戏画面层（点击走 SDK/video 通道）' : '⚠ 页面覆盖层（必须用页面层点击 domTap）'}`);
          }
          if (!s.overlays.length) this.addLog('i', '🖱 未见页面覆盖层（当前弹窗若存在，多半在游戏画面内）');
          else s.overlays.slice(0, 8).forEach(o =>
            this.addLog('i', `🖱 覆盖层 ${o.path} pos=${o.pos} z=${o.z} ${o.rect.w}x${o.rect.h}@(${o.rect.x},${o.rect.y})`));
        } catch (e) { this.addLog('e', '层诊断异常: ' + (e.message || e)); }
      };

      // 校准模式
      const calibBtn = p.querySelector('#na-calib');
      const calibInfo = p.querySelector('#na-calib-info');
      const playBtn = p.querySelector('#na-calib-play');
      const syncCalib = () => {
        const on = this.calib.active;
        const ks = this.calib.steps.filter(s => s.kind === 'key').length;
        calibBtn.textContent = on ? '⏹ 停止' : '🎓 校准';
        calibBtn.className = on ? 'btn pri' : 'btn';
        playBtn.textContent = this.calib.replaying ? '⏹ 停回放' : '▶ 回放';
        calibInfo.textContent = `校准${on ? '中' : '未开启'} · ${this.calib.steps.length} 步（🖱${this.calib.steps.length - ks} ⌨${ks}）`;
      };
      calibBtn.onclick = () => { this.calib.toggle(); syncCalib(); };
      playBtn.onclick = async () => {
        if (this.calib.replaying) { this.calib.stopReplay(); syncCalib(); return; }
        if (!this.calib.steps.length) { this.addLog('w', '没有校准数据'); return; }
        syncCalib();
        this.addLog('i', `▶ 回放 ${this.calib.steps.length} 步…`);
        await this.calib.replay({ gap: 900 });
        syncCalib();
      };
      p.querySelector('#na-calib-dl').onclick = () => {
        if (!this.calib.steps.length) { this.addLog('w', '没有校准数据'); return; }
        this.calib.download();
        const code = this.calib.code();
        if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
        Utils.log('info', '校准代码:\n' + code);
        this.addLog('s', `已导出 ${this.calib.steps.length} 步（代码已复制+打印到控制台）`);
      };
      p.querySelector('#na-calib-rename').onclick = () => {
        if (!this.calib.steps.length) { this.addLog('w', '没有校准数据'); return; }
        const lines = this.calib.steps.map(s =>
          `${s.seq}. ${s.name || 'step' + s.seq}  ${this.calib.stepLabel(s)}`).join('\n');
        const input = prompt('编辑步骤名（一行一步，格式：序号 名字）\n支持点号分组，如 nav.store\n\n' + lines);
        if (input == null) return;
        let n = 0;
        input.split('\n').forEach(ln => {
          const m = ln.trim().match(/^(\d+)\s+([^\s]+)$/);
          if (m) { this.calib.rename(+m[1], m[2]); n++; }
        });
        this.addLog('s', `已重命名 ${n} 步`);
        Utils.log('info', '校准步骤:\n' + this.calib.list().map(x => `  ${x.seq}. ${x.name}  ${x.kind}`).join('\n'));
      };
      p.querySelector('#na-calib-list').onclick = () => {
        if (!this.calib.steps.length) { this.addLog('w', '没有校准数据'); return; }
        const rows = this.calib.list();
        Utils.log('info', '校准步骤列表:\n' + rows.map(x => `  ${x.seq}. ${x.name}  ${x.kind}  @${x.scene}`).join('\n'));
        this.addLog('i', `当前 ${rows.length} 步：` + rows.map(x => `${x.seq}:${x.name}`).join(', '));
      };
      p.querySelector('#na-calib-clr').onclick = () => { this.calib.clear(); syncCalib(); };
      this._syncCalib = syncCalib;
      syncCalib();

      // 追踪器开关
      const traceBtn = p.querySelector('#na-trace');
      const traceInfo = p.querySelector('#na-trace-info');
      const syncTrace = () => {
        const on = AutoTrace.on;
        traceBtn.textContent = on ? '🔬 追踪中' : '🔬 追踪';
        traceBtn.className = on ? 'btn pri' : 'btn';
        traceInfo.textContent = `追踪：${on ? '开启' : '关闭'}（${AutoTrace.steps.length} 步 · 真实点击全记录，定位自动运行问题）`;
      };
      traceBtn.onclick = () => { AutoTrace.toggle(); syncTrace(); };
      p.querySelector('#na-trace-dl').onclick = () => { AutoTrace.downloadViewer(); };
      this._syncTrace = syncTrace;
      syncTrace();

      // 点击/按键可视化开关
      const markBtn = p.querySelector('#na-mark-btn');
      const syncMarks = () => {
        const on = Marks.on();
        markBtn.textContent = on ? '👁 标记开' : '👁 标记关';
        markBtn.className = on ? 'btn pri' : 'btn';
      };
      markBtn.onclick = () => {
        const on = !Marks.on();
        Marks.forceOn = on;
        this.config.set('ui.clickMarks', on);
        if (!on) Marks.clear();
        syncMarks();
        Marks.circle(640, 360, { label: on ? '标记已开启' : '标记已关闭', duration: 900 });
      };
      this._syncMarks = syncMarks;
      syncMarks();

      // 流程图开关
      const flowBtn = p.querySelector('#na-flow');
      const syncFlow = () => {
        flowBtn.textContent = FlowChart.on ? '📋 流程图开' : '📋 流程图';
        flowBtn.className = FlowChart.on ? 'btn pri' : 'btn';
      };
      flowBtn.onclick = () => {
        FlowChart.toggle();
        syncFlow();
        if (FlowChart.on) {
          // 首次打开时给个引导，说明怎么用
          if (!FlowChart.steps.length) {
            FlowChart.setHint('执行任务时自动填充；也可用下方「预览」选任务');
          }
        }
      };
      this._syncFlow = syncFlow;
      syncFlow();

      // 流程图预览选择器：不跑任务也能看某任务的步骤
      const prevSel = p.querySelector('#na-flow-preview');
      if (prevSel) {
        // 填充任务选项（按分类分组）
        const groups = [['daily', '日常任务'], ['collect', '每日收获'], ['weekly', '周常任务'], ['battle', '战斗']];   // 与执行顺序一致
        let opt0 = document.createElement('option');
        opt0.value = ''; opt0.textContent = '— 选任务看流程 —';
        prevSel.appendChild(opt0);
        groups.forEach(([cat, label]) => {
          const list = TASK_DEFS.filter(t => t.category === cat);
          if (!list.length) return;
          const og = document.createElement('optgroup');
          og.label = label;
          list.forEach(t => {
            const o = document.createElement('option');
            o.value = t.key;
            o.textContent = t.name + (t.steps ? '' : '（无步骤）');
            og.appendChild(o);
          });
          prevSel.appendChild(og);
        });
        prevSel.onchange = () => {
          const k = prevSel.value;
          if (!k) { FlowChart.clear(); return; }
          if (!FlowChart.on) { FlowChart.show(); if (this._syncFlow) this._syncFlow(); }
          const n = FlowChart.preview(k);
          Utils.log('info', n ? `📋 已预览流程图：${n} 步（不执行，仅供核对）` : '📋 该任务无步骤声明');
        };
      }

      p.querySelector('#na-cfg').onclick = () => {
        const el = p.querySelector('#na-cfg-panel');
        const show = el.style.display === 'none';
        el.style.display = show ? 'block' : 'none';
        if (show) this._renderSettings();
      };

      p.querySelector('#na-save').onclick = () => {
        p.querySelectorAll('#na-set input[data-p], #na-switches input[data-p]').forEach(i => {
          const v = parseFloat(i.value);
          if (!isNaN(v)) this.config.set(i.dataset.p, v);
        });
        p.querySelectorAll('#na-set input[data-c]').forEach(i => this.config.set(i.dataset.c, i.checked));
        p.querySelectorAll('#na-set select[data-s]').forEach(s => this.config.set(s.dataset.s, s.value));
        p.querySelectorAll('#na-switches input[data-t]').forEach(i => {
          this.config.set('taskSwitches.' + i.dataset.t, i.checked);
        });
        this.config.save();
        if (!this.visible) this._setFabOpacity(this.config.get('ui.fabOpacity'));
        this.addLog('s', '配置已保存');
      };

      p.querySelector('#na-clearp').onclick = () => {
        this.app.progress.clearAll();
        this.addLog('s', '已清除完成记录');
      };

      p.querySelector('#na-fabhome').onclick = () => {
        this.config.set('ui.fabLeft', 16);
        this.config.set('ui.fabTop', -96);
        this._applyFabPos(this._fabPos());
        if (this.visible) this._placePanel();
        this.addLog('s', '悬浮球已归位到左下角');
      };

      p.querySelector('#na-reset').onclick = () => {
        if (confirm('确定重置所有配置？')) { this.config.reset(); location.reload(); }
      };

      // 预览取色
      const pv = p.querySelector('#na-pv');
      pv.addEventListener('click', e => this._sample(e, pv));
    }

    _sample(e, pv) {
      const r = pv.getBoundingClientRect();
      const gx = Math.round((e.clientX - r.left) * BASE_W / r.width);
      const gy = Math.round((e.clientY - r.top) * BASE_H / r.height);
      try {
        this.vision.capture();
        const size = 24;
        const x = Utils.clamp(gx - size / 2, 0, BASE_W - size);
        const y = Utils.clamp(gy - size / 2, 0, BASE_H - size);
        const c = this.vision.avg(x, y, size, size);
        const area = [Math.round(x), Math.round(y), Math.round(x + size), Math.round(y + size)];
        const snippet = `{ area: [${area}], color: { r: ${c.r}, g: ${c.g}, b: ${c.b} }, tol: 35, click: [${gx}, ${gy}], label: '待命名' },`;
        const box = this.panel.querySelector('#na-sample');
        box.textContent = `(${gx}, ${gy}) rgb(${c.r},${c.g},${c.b})\n${snippet}`;
        Utils.log('info', `取样 (${gx},${gy}) = rgb(${c.r},${c.g},${c.b})`);
        if (navigator.clipboard) navigator.clipboard.writeText(snippet).catch(() => {});
      } catch (err) {
        Utils.log('warn', '取样失败: ' + err.message);
      }
    }

    _startPreview() {
      const pv = this.panel.querySelector('#na-pv');
      const ctx = pv.getContext('2d');
      this._previewTimer = setInterval(() => {
        if (!this.visible) return;                    // 收起时不做取帧，省资源
        const wrap = this.panel.querySelector('#na-pv-wrap');
        if (!this.config.get('vision.preview')) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        if (!this.vision.video || !this.vision.available()) return;
        try {
          this.vision.capture();
          ctx.drawImage(this.vision.canvas, 0, 0, pv.width, pv.height);
        } catch (e) { /* 跨域时忽略 */ }
      }, 800);
    }

    _startStatusLoop() {
      setInterval(() => {
        if (!this.panel) return;
        // 收起时也要刷新悬浮球状态
        this._updateFab();
        // 未就绪时轻量重探（放 visible 判断前，收起为悬浮球时也能自愈）
        if (!this.app.sdk.ready) this.app.sdk.rescan();
        if (!this.visible) return;
        const el = id => this.panel.querySelector('#' + id);
        const st = this.scheduler.getStatus();
        el('na-qc').textContent = st.queueLen;
        el('na-dc').textContent = `${st.done} / ${st.failed}`;
        if (!this.scheduler.running) {
          const sc = this.scenes.current;
          el('na-scene').textContent = SCENE_LABELS[sc] || sc;
        }
        if (this.calib && this.calib.active && this._syncCalib) this._syncCalib();
        if (this._syncTrace) this._syncTrace();
        if (!this.app.sdk.ready) {
          // 区分"没进云游戏"与"进了但 SDK 还没挂载"
          const v = document.getElementById('gmsdk-video-element');
          el('na-sdk').textContent = v
            ? '等待SDK挂载…'
            : (location.href.includes('arm-game') ? '云会话未建立' : '未进入游戏');
        } else {
          el('na-sdk').textContent = this.app.sdk.name;
        }
        el('na-vid').textContent = {
          'ok': '正常', 'no-element': '未找到', 'not-ready': '未就绪', 'tainted': '跨域受限'
        }[this.vision.status()] || '未知';
      }, 1000);
    }

    _bindScheduler() {
      const s = this.scheduler;
      const el = id => this.panel.querySelector('#' + id);

      s.on('start', d => { this.addLog('i', `开始，共 ${d.total} 个任务`); this._setStatus('运行中'); this._setBtns(true); this._renderTasks(s.queue.concat(s.current ? [s.current] : [])); });
      s.on('taskStart', t => { this.addLog('i', `▶ ${t.name}`); this._setTaskStatus(t, 'running'); el('na-scene').textContent = t.name; });
      s.on('taskDone', t => {
        this.addLog('s', `✓ ${t.name} (${Utils.formatDuration(t.endTime - t.startTime)})`);
        this._setTaskStatus(t, 'done');
      });
      s.on('taskFailed', ({ task, error }) => {
        this.addLog('e', `✗ ${task.name}: ${error && error.message ? error.message : error}`);
        this._setTaskStatus(task, 'failed');
      });
      s.on('pause', () => { this._setStatus('已暂停'); this.addLog('w', '已暂停'); });
      s.on('resume', () => { this._setStatus('运行中'); this.addLog('i', '已恢复'); });
      s.on('stop', () => { this._setStatus('已停止'); this.addLog('w', '已停止'); this._lastRunResult = 'failed'; });
      s.on('complete', d => {
        this._setStatus('完成');
        this.addLog('s', `🏁 完成！成功 ${d.success}，失败 ${d.failed}，用时 ${Utils.formatDuration(d.duration)}`);
        this._lastRunResult = d.failed > 0 ? 'failed' : 'done';
        this._setBtns(false);
        this._updateFab();
        // 完成后 8 秒，若仍收起则把结果留在浮球上（不自动弹出，避免遮挡）
      });
    }

    /**
     * 面板手动动作的统一入口。
     * 关键：先 Runtime.reset() —— 上一次 stop() 会把 aborted 置 true 且不会自动复位，
     * 不复位的话后续任何含 Runtime.check() 的调用会立刻抛 AbortError，
     * 而 onclick 里的 async 回调没 catch，异常被静默吞掉，表现为「点了没反应」。
     */
    /** 任务开始/手动动作前：若开了自动隐藏，收起面板避免遮挡游戏画面 */
    _autoHide() {
      if (this.config.get('ui.autoHideOnRun')) this.collapse();
    }

    async action(label, fn) {
      Runtime.reset();
      this._autoHide();
      if (!this.app.sdk.ready) {
        this.addLog('w', 'SDK 未就绪，尝试重新检测...');
        await this.app.sdk.detect(10000);
        if (!this.app.sdk.ready) { this.addLog('e', 'SDK 不可用：请先进入云游戏画面并刷新页面'); return null; }
      }
      this.addLog('i', label + '...');
      const t0 = Date.now();
      try {
        const r = await fn();
        const ms = Utils.formatDuration(Date.now() - t0);
        if (r === false) this.addLog('w', `${label}：未能确认成功（${ms}）`);
        else this.addLog('s', `${label}：完成（${ms}）`);
        return r;
      } catch (e) {
        this.addLog('e', `${label}失败: ${(e && e.message) || e}`);
        console.error('[NarutoAuto]', e);
        return null;
      }
    }

    async _run(tasks) {
      if (!tasks.length) { this.addLog('w', '没有启用的任务'); return; }
      if (this.config.get('runtime.skipDoneToday')) {        const before = tasks.length;
        tasks = tasks.filter(t => !this.app.progress.isDone(t));
        if (before !== tasks.length) this.addLog('i', `跳过 ${before - tasks.length} 个已完成任务`);
        if (!tasks.length) { this.addLog('w', '今日任务均已完成（可在设置里清除记录）'); return; }
      }
      if (!this.app.sdk.ready) {
        this.addLog('w', 'SDK 未就绪，尝试重新检测...');
        await this.app.sdk.detect(10000);
        if (!this.app.sdk.ready) { this.addLog('e', 'SDK 不可用，已取消'); return; }
      }
      this._lastRunResult = null;
      this._autoHide();
      this.scheduler.queue = [];
      this.scheduler.addTasks(tasks);
      this._renderTasks(tasks);
      await this.scheduler.start();
      // 0.5.59：整轮任务结束（正常/停止/异常）务必松开「按住不放」的普攻，
      // 否则云端一直停在按压态，之后所有点击都会被当成重复按下而静默失效。
      try { this.app.operator.releaseHold(); } catch (e) { /* ignore */ }
    }

    _setBtns(running) {
      const q = id => this.panel.querySelector('#' + id);
      q('na-start').disabled = running;
      q('na-pause').disabled = !running;
      q('na-stop').disabled = !running;
      // 运行时四个分类按钮一起置灰，避免跑到一半又插一批任务进队列
      ['na-collect', 'na-daily', 'na-weekly', 'na-battle'].forEach(id => { const b = q(id); if (b) b.disabled = running; });
    }

    _setStatus(t) { this.panel.querySelector('#na-st').textContent = t; }

    _renderTasks(tasks) {
      const el = this.panel.querySelector('#na-tl');
      if (!el) return;
      el.innerHTML = tasks.map(t =>
        `<div class="ti" data-n="${t.name}"><span class="dot ${t.status}"></span><span class="nm">${t.name}</span><span class="tm"></span></div>`
      ).join('');
    }

    _setTaskStatus(task, status) {
      const el = this.panel.querySelector(`.ti[data-n="${task.name}"]`);
      if (!el) return;
      el.querySelector('.dot').className = 'dot ' + status;
      if (task.endTime && task.startTime) {
        el.querySelector('.tm').textContent = Utils.formatDuration(task.endTime - task.startTime);
      }
    }

    /**
     * 追加一条日志。
     *  v0.5.93：内部存**纯文本**（`this.logs`），渲染时才拼 HTML ——
     *  这样导出的是可读文本、可直接贴给我定位问题，而不是一堆 span 标签。
     *  导出：面板「💾 日志」按钮 / `__narutoAuto.panel.downloadLogs()`。
     *
     *  性能：**增量追加**，不再每次全量重建 innerHTML。
     *   旧写法 `area.innerHTML = 3000行.join('<br>')` 每写一条就重建整个日志区，
     *   3000 条时要创建 3000 个 span —— 轮询期间日志密集，会明显卡顿。
     *   现在只 append 一个新节点；仅在超出上限时批量裁掉头部（每满 500 条裁一次，
     *   摊薄 DOM 删除成本，而不是每条都 shift 一个节点）。
     */
    addLog(level, text) {
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const line = `[${ts}] ${text}`;
      this.logs.push(line);
      this.logLevels.push(level || 'info');

      const area = this.panel && this.panel.querySelector('#na-log');
      if (!area) return;

      // 只追加新行
      const span = document.createElement('span');
      span.className = level === 'error' ? 'e' : level === 'warn' ? 'w' : level === 'success' ? 's' : 'i';
      span.textContent = line;
      const br = document.createElement('br');
      area.appendChild(span);
      area.appendChild(br);

      // 超上限：先把数组裁到 maxLogs，再批量删掉多余的 DOM 头节点
      if (this.logs.length > this.maxLogs) {
        const drop = this.logs.length - this.maxLogs;
        this.logs.splice(0, drop);
        this.logLevels.splice(0, drop);
        // 每行 = span + br 两个节点
        for (let i = 0; i < drop * 2 && area.firstChild; i++) area.removeChild(area.firstChild);
      }
      area.scrollTop = area.scrollHeight;
    }

    /** 导出全部日志为 .txt（可只贴出问题那一段） */
    downloadLogs() {
      const head = `火影自动化 v${VERSION} 日志\n导出时间: ${new Date().toLocaleString('zh-CN')}\n共 ${this.logs.length} 条\n` +
        `${'─'.repeat(60)}\n`;
      const body = this.logs.join('\n');
      const blob = new Blob([head + body], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `naruto-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return this.logs.length;
    }

    /** 复制全部日志到剪贴板（比下载更快贴给我） */
    async copyLogs() {
      const body = this.logs.join('\n');
      try {
        await navigator.clipboard.writeText(body);
        return { ok: true, n: this.logs.length };
      } catch (e) {
        // 剪贴板 API 需要 https/localhost 或用户手势，退化到 textarea 方案
        try {
          const ta = document.createElement('textarea');
          ta.value = body;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return { ok, n: this.logs.length };
        } catch (e2) {
          return { ok: false, n: this.logs.length, err: e2.message };
        }
      }
    }
  }

  const TASK_LABELS = {};
  TASK_DEFS.forEach(d => { TASK_LABELS[d.key] = d.name; });

  // ============================================================
  //  NarutoAuto — 主入口
  // ============================================================
  class NarutoAuto {
    constructor() {
      this.config = new Config();
      // 点击/按键可视化：把逻辑坐标映射器接进来（跟随输入模式，含黑边修正）
      Marks.cfg = this.config;
      this.vision = Vision;
      this.sdk = new SdkAdapter(this.config);
      Marks.mapper = (x, y) => this.sdk._map(x, y);
      this.scenes = new SceneDetector(this.vision, this.config);
      this.op = new GameOperator(this.sdk, this.config);
      this.nav = new Navigator(this.op, this.scenes, this.config, this.vision);
      this.battle = new BattleFlow(this.op, this.scenes, this.nav, this.vision, this.config);
      this.progress = new Progress(this.config);
      this.calib = new Calibrator(this.vision, this.scenes);
      this.calib.bind(this);
      this.trace = AutoTrace;
      this.trace.bind(this);
      this.ctx = new TaskContext(this.op, this.config, this.nav, this.scenes, this.battle, this.progress, this.vision);
      this.scheduler = new TaskScheduler(this.ctx, this.config, this.progress);
      this.panel = new ControlPanel(this);

      // ── v0.6.12 严重 BUG 修复：中止时紧急释放所有按压态 ──────────────────
      //  用户实测（2026-09-21）：「我进入雷霆秘境，**没有点任何脚本**，就开始自动战斗了」。
      //  根因：用户按 ⏹ → scheduler.stop() → Runtime.abort() → Utils.sleep 的 onAbort
      //    把 promise reject(AbortError) → 宏的时间轴循环被异常打断 →
      //    **循环后的 releaseAllKeys() 走不到**，而 holdKey 注册的 setInterval
      //    补发定时器还活着，持续向云端发 keydown → 云端认为键一直按着。
      //  修法：把紧急释放直接挂到 Runtime.onAbort —— abort 是同步广播的，
      //    能保证在任何 await 点被中断的瞬间执行，不依赖异常传播路径。
      //    同时给 replayKeyTimeline 加了 try/finally 作为第二道保险（两者幂等）。
      Runtime.onAbort(() => { try { this.op.emergencyRelease(); } catch (e) { /* ignore */ } });
    }

    async init() {
      Utils.log('info', '========================================');
      Utils.log('info', `  火影忍者云游戏自动化 v${VERSION}`);
      Utils.log('info', '========================================');

      const host = location.hostname;
      if (!/start\.qq\.com|gamer\.qq\.com/.test(host)) {
        Utils.log('warn', `当前页面 ${host} 不是已知的云游戏域名，脚本仍会加载但可能拿不到 SDK`);
      }

      // 登录态只做提示，不再强制拦截（原实现误报率高）
      const hasCookie = document.cookie.includes('uin') || document.cookie.includes('skey') || document.cookie.includes('pskey');
      Utils.log('info', `登录态 Cookie: ${hasCookie ? '存在' : '未检测到'}`);

      // 面板先起来，SDK / 画面异步探测，避免面板等到 30s 才出现
      this.panel.create();

      window.__narutoAuto = {
        app: this,
        runtime: Runtime,   // 0.5.61：接管调试需手动 reset()（上次 stop 后 aborted 不自动复位，pressHold 会抛「已中止」被静默吞掉）
        config: this.config,
        sdk: this.sdk,
        operator: this.op,
        scheduler: this.scheduler,
        panel: this.panel,
        scenes: this.scenes,
        vision: this.vision,
        nav: this.nav,
        battle: this.battle,
        progress: this.progress,
        calib: this.calib,
        trace: {
          on() { AutoTrace.start(); return AutoTrace.on; },
          off() { AutoTrace.stop(); return AutoTrace.on; },
          toggle() { return AutoTrace.toggle(); },
          state() { return AutoTrace.state(); },
          count() { return AutoTrace.steps.length; },
          dump() { return AutoTrace.dump(); },
          clear() { return AutoTrace.clear(); },
          download() { return AutoTrace.download(); },
          downloadViewer() { return AutoTrace.downloadViewer(); },
        },
        coords: COORDS,
        probes: PROBES,
        tasks: TASK_DEFS,
        /** 点击可视化：marks.on()/off()/test() */
        marks: {
          on() { Marks.forceOn = true; return 'marks ON'; },
          off() { Marks.forceOn = false; Marks.clear(); return 'marks OFF'; },
          auto() { Marks.forceOn = null; return 'marks AUTO(' + (Marks.on() ? 'on' : 'off') + ')'; },
          test() { for (let i = 0; i < 4; i++) setTimeout(() => Marks.circle(200 + i * 220, 200 + i * 80), i * 260); Marks.key('W', ['test']); return 'test fired'; },
          clear() { Marks.clear(); return 'cleared'; },
          /** 标出某任务即将用到的所有坐标（只画圈，不点击） */
          show(taskKey, holdMs) {
            const def = TASK_DEFS.find(t => t.key === taskKey);
            if (!def) return 'NO_TASK:' + taskKey + '  可用: ' + TASK_DEFS.map(t => t.key).join(',');
            const def2 = TASK_DEFS.find(t => t.key === taskKey);
            const pts = ((def2 && def2.steps) || []).filter(s => s.coord && s.coord.length === 2).map(s => ({ x: s.coord[0], y: s.coord[1], label: s.title }));
            if (!pts.length) return '该任务未声明 steps，无可标注点';
            Marks.annotate(pts, holdMs);
            TASK_DEFS.forEach(() => {});
            console.log('%c🎯 ' + def.name + ' 用到的 ' + pts.length + ' 个坐标：', 'color:#e94560;font-weight:bold');
            pts.forEach((p, i) => console.log(`  ${i + 1}. (${p.x},${p.y})  ${p.label || ''}`));
            return pts.length + ' 个标注已画出，停留 ' + ((holdMs || 6000) / 1000) + 's';
          },
          /** 列出所有可用任务 key */
          tasks() { return TASK_DEFS.map(t => t.key + '=' + t.name).join(', '); },
        },
        /** 控制台快捷：打印当前场景与全部探针距离 */
        probe() {
          const r = this.scenes.detect(true);
          console.log('场景:', r.scene, '亮度:', r.brightness);
          // v0.6.27：把两个标准件探针一起打出来 —— 战斗画面下看「暂停键」是否命中，
          //   离开战斗后看「红叉」是否命中。用于现场复核 battlePause 的 verified 状态。
          try {
            const px = this.vision.sawBattlePause();
            const rx = this.vision.sawRedX();
            console.log('探针 暂停键(战斗中):', px.ok, '竖条数=', px.bars, 'x=', px.x1, px.x2);
            console.log('探针 红叉(已结算):', rx.ok, 'dist=', rx.score, 'avg=', rx.avg);
          } catch (e) { console.log('探针异常:', e.message); }
          return r;
        },
        /** 流程图面板：flow.show() / hide() / toggle() / 查看某任务步骤 */
        flow: {
          show() { return FlowChart.show(); },
          hide() { return FlowChart.hide(); },
          toggle() { return FlowChart.toggle(); },
          clear() { return FlowChart.clear(); },
          /** 只展开某任务的流程图（不执行） */
          /** 列出所有任务的流程图状态（不执行） */
          list() {
            return TASK_DEFS.map(t => {
              const n = (t.steps || []).length;
              return `${t.category.padEnd(7)} ${t.key.padEnd(16)} ${t.name.padEnd(10)} ${n} 步`;
            }).join('\n');
          },
          /** 预览某任务的流程图（不执行、不画圈）—— 等价于面板「📋 预览」下拉 */
          preview(taskKey) {
            if (!FlowChart.on) FlowChart.show();
            const n = FlowChart.preview(taskKey);
            if (this.panel && this.panel._syncFlow) this.panel._syncFlow();
            return n ? `${n} 步已展开（仅预览，标 ▷ 为未执行）` : '该任务无步骤声明或未找到';
          },
          /** 列出各任务步骤数与当前状态 */
          dump(taskKey) {
            if (taskKey) {
              const def = TASK_DEFS.find(t => t.key === taskKey);
              if (!def) return 'NO_TASK:' + taskKey;
              return def.name + ' (' + def.key + ') ' + (def.steps || []).length + ' 步：\n' +
                (def.steps || []).map((s, i) => `${i + 1}. ${s.title}  ${s.detail || ''}`).join('\n');
            }
            return this.list();
          },
          /** 列出流程图当前步骤状态 */
          state() {
            return FlowChart.steps.map((s, i) => {
              const r = FlowChart.results[i];
              const c = s.coord && s.coord.length === 2 ? ' (' + s.coord[0] + ',' + s.coord[1] + ')' : '';
              return `${i + 1}. [${r || '-'}] ${s.title}${c}`;
            }).join('\n') || '（无步骤）';
          },
        },
        /** 控制台快捷：点一下 */
        async click(x, y) { return this.operator.clickNatural(x, y); },
        /** 显示 / 收起 / 切换控制面板（悬浮球 ↔ 面板） */
        show() { this.panel.expand(); return true; },
        hide() { this.panel.collapse(); return true; },
        toggle() { this.panel.toggle(); return this.panel.visible; },
        /** 切换坐标模式：stream / dom / raw */
        setMode(m) { this.config.set('input.mode', m); Utils.log('info', '坐标模式 = ' + m); return m; },
        /** 一键自检：把 SDK / 画面 / 场景 / 坐标映射全部打出来 */
        diag() {
          const app = this;
          const mapOf = m => { const old = app.config.get('input.mode'); app.config.set('input.mode', m); const p = app.sdk._map(66, 677); app.config.set('input.mode', old); return p; };
          let scene = null;
          try { const s = app.scenes.detect(false); scene = { scene: s.scene, error: s.error, brightness: s.brightness }; }
          catch (e) { scene = { error: e.message }; }
          const v = app.vision.video;
          const rep = {
            version: VERSION,
            url: location.href,
            sdk: { ready: app.sdk.ready, name: app.sdk.name, caps: app.sdk.caps, lastSend: app.sdk.lastSend || null },
            vision: {
              status: app.vision.status(),
              tainted: !!app.vision.tainted,
              lastError: app.vision.lastError || null,
              element: v ? {
                tag: v.tagName, id: v.id, cls: String(v.className || '').slice(0, 80),
                streamSize: (v.videoWidth || v.width || 0) + 'x' + (v.videoHeight || v.height || 0),
                readyState: v.readyState,
              } : null,
            },
            scene,
            map66_677: { stream: mapOf('stream'), dom: mapOf('dom'), raw: mapOf('raw') },
            config: { input: app.config.get('input'), nav: app.config.get('nav'), vision: app.config.get('vision') },
          };
          console.log('%c[NarutoAuto 自检]', 'color:#e67e22;font-weight:bold');
          console.log(JSON.stringify(rep, null, 2));
          const text = '```json\n' + JSON.stringify(rep, null, 2) + '\n```';
          try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            console.log(ok ? '%c✅ 自检报告已复制到剪贴板，直接粘贴给开发者' : '%c⚠ 复制失败，请手动框选上面的 JSON', 'font-weight:bold');
          } catch (e) { /* ignore */ }
          return rep;
        },
      };

      this._watchVision();
      this._bindHotkey();
      this._registerMenu();

      // 后台等 SDK，不阻塞
      this.sdk.detect(30000).then(ok => {
        if (ok) Utils.log('info', 'SDK 就绪，可以开始执行任务');
        else Utils.log('warn', 'SDK 未就绪：请确认已进入云游戏画面（能看到游戏），再刷新页面');
      });

      Utils.log('info', '✓ 初始化完成。控制台可用 __narutoAuto.probe() 查看当前场景');
      Utils.log('info', '🍥 面板已收起为左下角悬浮球（避免遮挡游戏右上角）。点击悬浮球 / Ctrl+Shift+A / __narutoAuto.show() 展开；双击悬浮球直接开跑。');
    }

    /** 画面元素可能是异步创建的，持续尝试绑定 */
    _watchVision() {
      let tries = 0;
      const timer = setInterval(() => {
        if (this.vision.video && this.vision.available()) { clearInterval(timer); return; }
        const el = this.vision.bind();
        if (el && this.vision.available()) {
          clearInterval(timer);
          Utils.log('info', `✓ 已捕获画面元素 <${el.tagName.toLowerCase()}> ${this.vision.video.videoWidth || ''}x${this.vision.video.videoHeight || ''}`);
        } else if (++tries % 10 === 0) {
          Utils.log('debug', `画面元素尚未就绪（已等待 ${tries * 2}s）`);
        }
        if (tries > 300) clearInterval(timer);
      }, 2000);
    }

    _bindHotkey() {
      if (this.config.get('runtime.stopHotkey')) {
        document.addEventListener('keydown', e => {
          if (e.ctrlKey && e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
            e.preventDefault();
            Utils.log('warn', '⏹ 紧急停止（Ctrl+Shift+Q）');
            this.scheduler.stop();
          }
        });
      }
      if (this.config.get('ui.toggleHotkey')) {
        document.addEventListener('keydown', e => {
          if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
            e.preventDefault();
            this.panel.toggle();
          }
        });
      }
      // Ctrl+Shift+M：切换点击标记可视化
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
          e.preventDefault();
          const on = !Marks.on();
          Marks.forceOn = on;
          this.config.set('ui.clickMarks', on);
          if (!on) Marks.clear();
          if (this.panel && this.panel._syncMarks) this.panel._syncMarks();
          Marks.circle(640, 360, { label: on ? '标记已开启' : '标记已关闭', duration: 900 });
        }
      });

      // Ctrl+Shift+F：切换流程图面板
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
          e.preventDefault();
          FlowChart.toggle();
          Marks.circle(640, 360, { label: FlowChart.on ? '流程图已展开' : '流程图已收起', duration: 900 });
        }
      });

      // Ctrl+Shift+C：切换校准模式
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
          e.preventDefault();
          this.calib.toggle();
          if (this.panel && this.panel._syncCalib) this.panel._syncCalib();
        }
      });
      // Ctrl+Shift+P：回放 / 停止回放校准序列
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
          e.preventDefault();
          if (this.calib.replaying) { this.calib.stopReplay(); Utils.log('warn', '⏹ 停止回放'); }
          else this.calib.replay({ gap: 900 });
          if (this.panel && this.panel._syncCalib) this.panel._syncCalib();
        }
      });
      // Ctrl+Shift+T：切换自动运行追踪（真实点击全记录，定位自动运行问题）
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
          e.preventDefault();
          AutoTrace.toggle();
          if (this.panel && this.panel._syncTrace) this.panel._syncTrace();
        }
      });
    }

    _registerMenu() {
      if (typeof GM_registerMenuCommand !== 'function') return;
      GM_registerMenuCommand('🍥 显示/隐藏面板 (Ctrl+Shift+A)', () => this.panel.toggle());
      GM_registerMenuCommand('🔍 探测当前场景', () => window.__narutoAuto.probe());
    }
  }

  // 启动
  try {
    new NarutoAuto().init().catch(err => console.error('[NarutoAuto] 初始化失败:', err));
  } catch (err) {
    console.error('[NarutoAuto] 启动异常:', err);
  }
})();
