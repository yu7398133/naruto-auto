// ==UserScript==
// @name         火影忍者云游戏自动化
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      0.5.81
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
  const VERSION = '0.5.81'; // ⚠ 改版必须与头部 @version 同步（面板标题 v${VERSION} 用这个）
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
      homeConfirmGap: 1000, // 判「不是主界面」前的二次确认间隔(ms)：躲开页面切换过渡帧（0.5.76 起 ≥1s）
      homeSettleMs: 1500,   // 每按一次「返回」后等动画走完(ms)：防叠加多按
      backSpots: [          // 盲按返回候选位，按序轮转
        [1146, 69], [66, 677], [1229, 36], [40, 40], [66, 40], [640, 690],
      ],
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
        if (!(nv.homeConfirmGap >= 1000)) nv.homeConfirmGap = 1000;
        if (!(nv.homeSettleMs >= 500)) nv.homeSettleMs = 1500;
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
     *  0.5.74 用户口径：**战斗组（battle）一律不记录** —— 角斗场忍术对战、秘境挑战、
     *  任务集会所都是长期挂机任务，用户点了就是要执行，不该因为「今天做过了」被跳过。
     *  （代价：这几项不再去重，重复点「开始/战斗」就会重复跑 —— 用户明确接受） */
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

    /** 键盘自检：列出当前 SDK 可用的按键通道（不发键），供面板「⌨ 键盘自检」诊断 */
    keyChannels() {
      const caps = this.caps || {};
      const op = caps.oprate || {};
      const lg = caps.legacy || {};
      const list = [];
      const add = (g, n, v) => { if (v) list.push(g + '.' + n); };
      add('Oprate', 'keyPressWindow', op.keyPressWindow);
      add('Oprate', 'keyDownWindow', op.keyDownWindow);
      add('Oprate', 'keyUpWindow', op.keyUpWindow);
      add('Oprate', 'keyPressElement', op.keyPressElement);
      add('Oprate', 'keyDownElement', op.keyDownElement);
      add('Oprate', 'keyUpElement', op.keyUpElement);
      add('legacy', 'sendKeyboardEvent', lg.sendKeyboardEvent);
      // 额外：扫 SDK 对象原型链上所有名字含 key 的方法，找出我没预设的通道（发给日志便于补支持）
      const extra = [];
      try {
        const names = new Set();
        let cur = this.obj;
        for (let d = 0; d < 3 && cur; d++) {
          for (const k of Object.getOwnPropertyNames(cur)) {
            if (/key/i.test(k)) { try { if (typeof this.obj[k] === 'function') names.add(k); } catch (e) {} }
          }
          cur = Object.getPrototypeOf(cur);
        }
        for (const k of names) if (!list.some(x => x.endsWith('.' + k))) extra.push(k);
      } catch (e) {}
      return { sdk: this.name, ready: this.ready, channels: list, extra };
    }
  }

  // ============================================================
  //  VisionCore — video → canvas 帧捕获
  //  坐标全部归一化到 1280x720 逻辑空间
  // ============================================================
  const SIG_W = 64, SIG_H = 36;

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
    avatar:      { area: [66, 14, 120, 84],        color: { r: 173, g: 141, b: 118 }, tol: 35, click: [93, 49],    label: '主界面头像',   verified: true },
    storeIcon:   { area: [1203, 232, 1244, 286],   color: { r: 178, g: 164, b: 141 }, tol: 35, click: [1224, 259], label: '商店入口',     verified: true },
    mailIcon:    { area: [25, 253, 90, 307],       color: { r: 162, g: 155, b: 86 },  tol: 35, click: [58, 280],   label: '邮件入口',     verified: true },
    dailyIcon:   { area: [1189, 320, 1272, 392],   color: { r: 85, g: 77, b: 70 },    tol: 35, click: [1231, 356], label: '每日入口',     verified: true },
    ninjutsuIcon:{ area: [1199, 423, 1250, 492],   color: { r: 152, g: 137, b: 119 }, tol: 35, click: [1225, 458], label: '忍法帖入口',   verified: true },
    rechargeIcon:{ area: [288, 52, 354, 81],       color: { r: 177, g: 133, b: 62 },  tol: 35, click: [321, 67],   label: '充值入口',     verified: true },
    characterNav:{ area: [26, 620, 106, 709],      color: { r: 87, g: 94, b: 99 },    tol: 35, click: [66, 665],   label: '忍者入口',     verified: true },
    summonNav:   { area: [363, 630, 415, 703],     color: { r: 175, g: 141, b: 78 },  tol: 35, click: [389, 667],  label: '通灵入口',     verified: true },
    guideNav:    { area: [993, 635, 1049, 682],    color: { r: 152, g: 108, b: 65 },  tol: 35, click: [1021, 659], label: '忍界指引',     verified: true },
    backToGame:  { area: [976, 683, 1073, 710],    color: { r: 106, g: 100, b: 34 },  tol: 35, click: [1025, 697], label: '返回游戏',     verified: true },

    // ——— 通用关闭/返回（已标定）———
    closeX:      { area: [1185, 2, 1272, 70],      color: { r: 102, g: 56, b: 34 },   tol: 35, minStd: 10, click: [1229, 36],  label: '关闭(X)',      verified: true },
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
    // min:2（0.5.17）：min:1 时忍法帖页左上角红金图案恰与 avatar 探针(dist=32/tol35)压线误命中，
    // 二级页被误判成 home → goHome 第一步就假成功返回。主界面四图标同时在场，双命中才算。
    { scene: SCENE.HOME,       probes: ['avatar', 'storeIcon', 'mailIcon', 'dailyIcon'], min: 2 },
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
      rankDrags:     [{ x1: 173, x2: 1589 }, { x1: 211, x2: 1196 }],
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
      this.steps.push(rec);
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
      parts.push('.kind-key{color:#3498db}.kind-swipe{color:#9b59b6}.kind-hold{color:#e67e22}.kind-release{color:#95a5a6}.kind-tap{color:#e6edf3}');
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
      parts.push('function render(){var s=STEPS[i];if(!s)return;');
      parts.push('$("img").src=s.frame||"";$("img").alt=s.frame?"点击时画面":"（无帧图）";');
      parts.push('var c=s.coord?(s.coord.length===4?s.coord.slice(0,2).join(",")+" → "+s.coord.slice(2).join(","):s.coord.join(",")):"—";');
      parts.push('var extra=(s.kind==="key")?("键: "+s.key+(s.hold?(" 按"+s.hold+"ms"):"")):("坐标: "+c);');
      parts.push('var hits=(s.probeHits||[]).map(function(h){return "<span>"+h.name+" d="+h.dist+"</span>"}).join("");');
      parts.push('$("info").innerHTML="<div class=row><b>步骤</b><span>#"+s.seq+" / "+STEPS.length+"</span></div>"+');
      parts.push('"<div class=row><b>时间</b><span>"+fmt(s.t)+"</span></div>"+');
      parts.push('"<div class=row><b>类型</b><span class=kind-"+s.kind+">"+s.kind+"</span></div>"+');
      parts.push('"<div class=row><b>说明</b><span>"+(s.label||"—")+"</span></div>"+');
      parts.push('"<div class=row><b>动作</b><span>"+extra+"</span></div>"+');
      parts.push('"<div class=row><b>场景</b><span>"+(s.scene||"—")+" / 亮度 "+(s.brightness>=0?s.brightness.toFixed(1):"-")+"</span></div>"+');
      parts.push('"<div class=row><b>命中探针</b></div><div id=hits>"+(hits||"<span style=\\"background:#331;color:#a55\\">无</span>")+"</div>";');
      parts.push('$("pos").textContent="第 "+(i+1)+" / "+STEPS.length+" 步";');
      parts.push('var its=document.querySelectorAll("#list .it");for(var k=0;k<its.length;k++){its[k].className="it"+(k===i?" cur":"")}');
      parts.push('if(its[i])its[i].scrollIntoView({block:"nearest"})}');
      parts.push('function go(n){i=Math.max(0,Math.min(STEPS.length-1,n));render()}');
      parts.push('$("prev").onclick=function(){go(i-1)};$("next").onclick=function(){go(i+1)};');
      parts.push('$("go").onclick=function(){go((parseInt($("jump").value,10)||1)-1)};');
      parts.push('$("play").onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent="▶ 自动播放";return}this.textContent="⏸ 暂停";timer=setInterval(function(){if(i>=STEPS.length-1){clearInterval(timer);timer=null;$("play").textContent="▶ 自动播放";return}go(i+1)},900)};');
      parts.push('var listHtml="";for(var j=0;j<STEPS.length;j++){var s=STEPS[j];var lb=(s.label||s.kind);');
      parts.push('listHtml+="<div class=it data-i="+j+"><span class=k>"+s.kind+"</span><span class=t>"+fmt(s.t)+"</span><span class=lb>"+(lb||"")+"</span></div>"}');
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
      const steps = Math.max(5, Math.floor(dur / 30));
      const markDur = this.config.num('ui.markDuration') || 500;
      Marks.line(x1, y1, x2, y2, { duration: Math.max(markDur, Math.min(dur, 1200)) });
      this.sdk._down(x1, y1, 0);
      try {
        for (let i = 1; i <= steps; i++) {
          await Utils.sleep(dur / steps);
          this.sdk._move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
        }
      } finally {
        this.sdk._up(x2, y2, 0);   // 0.5.42：中断也要抬起，避免云端卡住「按住」态
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
  }

  // ============================================================
  //  Navigator — 弹窗清理 / 回主界面 / 场景导航
  // ============================================================
  class Navigator {
    constructor(op, scenes, config) {
      this.op = op;
      this.scenes = scenes;
      this.config = config;
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
      const settleMs = this.config.num('nav.homeSettleMs') || 1500;
      const confirmGap = this.config.num('nav.homeConfirmGap') || 900;
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

      // ── 安全闸 ②：画面已连续静止 → 多半已退出战斗，本拍不点 ────────────────
      // 与 waitForEnd 的静止检测共用 this._stable：只有连续稳定帧数达到阈值才停手，
      // 避免战斗中短暂静止（被击倒、双方对峙）导致普攻突然松开。
      // 0.5.59：停手的同时必须松开「按住不放」的普攻，否则云端卡住按压态。
      const stableNeed = this.config.num('vision.stableFrames') || 3;
      if (this._stable >= stableNeed) { this.op.releaseHold(); return 0; }

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
      if (now - (this._subAt || 0) >= A.sub) {
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
      const endStableNeed = opts.stableEndFrames != null ? opts.stableEndFrames : stableNeed;
      const staticEndAfterMs = opts.staticEndAfterMs != null ? opts.staticEndAfterMs : 0;
      const bannerRecencyMs = opts.bannerRecencyMs != null ? opts.bannerRecencyMs : 30000;
      const graceMs = opts.bannerGraceMs || 0;         // 命中横幅后的「观察窗」：判断自动续局 or 真的打完
      // 0.5.79：画面「连续静止」兜底脱困。0.5.72 加的 battleStarted 闸有个致命副作用 ——
      //   它是局部变量、只认「先看到过动态帧」。若 waitForEnd 一开始就落在一个**静止的陌生页面**
      //   （战后「战斗结果 → 确定 → 奖励 → 任务面板」那一串），battleStarted 永远 false →
      //   「静止 = 打完」这条唯一出口被永久关掉 → 脚本在该页面上盲点直到 maxWaitMs
      //   （本次 trace 实测 360s/局，用户看到「卡住不动 + 点到别的页面」）。
      //   现在：只要画面**连续静止** ≥ staticBailMs 就无条件兜底结束本场。
      //   安全性：匹配/加载/双方登场这类正常过场不会像素级冻结这么久（登场上限实测约 4.5s）。
      const staticBailMs = opts.staticBailMs != null ? opts.staticBailMs : 0;
      // 0.5.81：**整场结束的「极暗过场」快通道**（角斗场专属）。实测数据（trace 2026-09-19T13-35-52，2000 拍）：
      //   · 战斗中全屏最暗也有 BR 100+（7:13~7:32 整段 100~130）；
      //   · 「小局切换」的暗帧 BR 14.0~22.3（6:47.30 / 7:06.23，不是全屏黑）；
      //   · 「整场结束」的暗帧 BR **1.3~5.3**（7:33.33 / 7:34.75）= detect() 判 SCENE.LOADING（阈值 <12）。
      //   → 本场已进行 ≥ darkEndAfterMs 之后出现 SCENE.LOADING，就是整场打完的过场黑幕。
      //   时间闸专为排除「开局进战斗的加载黑屏」。0 = 关闭，其它任务完全不受影响。
      const darkEndAfterMs = opts.darkEndAfterMs != null ? opts.darkEndAfterMs : 0;
      this._assistMaxMs = opts.assistMaxMs != null ? opts.assistMaxMs : null;

      Utils.log('info', `    ⏳ 等待战斗结束（最短 ${Math.round(minWait / 1000)}s）...`);
      await this.tryEnableAuto();
      // 0.5.51：每场战斗重置连招计时/静止计数（否则 assistMaxMs 跨场累计，第二轮一进场就停手）
      this._combatT0 = 0; this._burstAt = 0; this._moveAt = 0;
      this._stable = 0; this._maxWarned = false;
      // 0.5.59：「黑屏 → 结算」序列确认用的时间戳/计数 + 快拍计时器，每场重新起算
      this._blackAt = 0; this._vsCnt = 0; this._subAt = 0; this._jAt = 0; this._iAt = 0;
      // 0.5.78：本场起点（静止落判的时间闸）+ 横幅时间戳/观察窗状态
      this._fightStart = Date.now(); this._bannerAt = 0; this._holdUntil = 0; this._holdBlack = false;
      this._stillSince = 0;   // 0.5.79：本场「画面开始持续静止」的时间戳（0 = 画面在动）
      this._bannerMuteUntil = 0;
      const preMs = Math.max(0, minWait - 2000);
      if (this.config.get('battle.keyAssist')) {
        await this.combatFor(preMs);   // 边打边等：连招辅助从一开始就输出
      } else {
        await Utils.sleep(preMs);
      }

      const start = Date.now();
      let stable = 0;
      let battleStarted = false;   // 0.5.72：必须确认战斗真正开始过，才允许「画面静止」判结束，防止匹配/选忍界面直接判结算

      // 只用中心区域算帧差异，避免 HUD 动画干扰
      const region = [260, 90, 1020, 560];
      this.vision.snapshot(region);

      while (Date.now() - start < maxWait) {
        Runtime.check();

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

          // ── 黑屏时间戳（0.5.59）：只用于给「结算」做序列确认，绝不单独判结算 ──────
          // detect() 里 brightness < 12 会直接返回 SCENE.LOADING（全屏几乎纯黑）。
          // 忍术对战实测：一局打完是「胜负已分横幅 → 黑屏 → 下一局」，黑屏帧全屏均值只有
          // 1.3~4.4，而战斗中最暗的帧也有 43 → 不会互相混。
          // 注意：2026-09-13 用户明确否掉过「纯像素黑屏单独当判据」（暗场景战斗帧也可能很黑），
          // 所以这里只把它当作「序列里的一环」，主判据仍是金色横幅。
          if (r.scene === SCENE.LOADING) {
            this._blackAt = nowX;
            // ── 0.5.81 快通道：极暗过场 = 整场结束 ────────────────────────────────
            //   用户 2026-09-20 反馈「7m32s~7m33s 战斗结束没识别到」就是这里：
            //   那两拍 BR 5.3 / 1.3（全屏黑），而旧实现只在「scene=BATTLE_END」时才用黑屏做
            //   序列确认 —— 黑屏后画面停在结算/面板页，根本判不出 BATTLE_END，于是整条路走空。
            //   ⚠ 必须放在下面所有闸（battleStarted / staticEndAfterMs / 静止计数）**之前**：
            //     黑屏那几拍画面本来就不「静止」（恢复瞬间 diff 很大），走静止路径根本来不及。
            if (darkEndAfterMs && (nowX - (this._fightStart || start)) >= darkEndAfterMs) {
              Utils.log('info', `    ✓ 整场结束：出现全屏黑过场（本场已 ${((nowX - this._fightStart) / 1000).toFixed(0)}s`
                + ` ≥ ${Math.round(darkEndAfterMs / 1000)}s → 不可能还在战斗中）`);
              return 'darkend';
            }
          }

          // 0.5.70：结算判定必须稳定。战斗帧常把 avatar/dailyIcon/settleConfirm 误判成
          // 主界面/结算，单靠一帧 r.scene 会提前返回 → 用 scenes.current（连续 2 帧一致）。
          // 0.5.78：命中拍数阈值改由 opts.vsConfirm 决定（角斗场传 2），并允许「单拍强命中」直接落判。
          const stableEnd = this.scenes.current === SCENE.BATTLE_END;
          const bannerHit = r.hits.victoryBanner;
          // 0.5.78：单拍强命中即可（victoryBanner 在本次 1020 帧零误报：横幅帧 d=7.9~24.1，
          //   非横幅帧最近 d=175）→ 短横幅（0.3~0.5s）也能落判。
          //   ⚠ 这条捷径默认关闭（opts.strongBanner），只给角斗场开 —— 别影响小队突袭/秘境的既有节奏。
          const strongBanner = !!(opts.strongBanner && bannerHit && bannerHit.ok && bannerHit.dist <= 20);
          const defeatOnly = banDefeat && r.byProbe === 'defeatBanner';
          const muteNow = this._bannerMuteUntil && nowX < this._bannerMuteUntil;
          if (r.scene === SCENE.BATTLE_END && stableEnd && !defeatOnly && !muteNow) {
            this._vsCnt++;
            const recentBlack = this._blackAt && (nowX - this._blackAt < blackWindowMs);
            // 落判条件（OR）：
            //   ① 单拍强命中金色「胜负已分」横幅 → 立刻判（横幅短，等不起）
            //   ② 连续 vsConfirm 拍稳定命中（默认 3，角斗场传 2）
            //   ③ 近 blackWindowMs 内出现过黑屏 → 序列确认（角斗场收到 4s；12s 太松会误判）
            if (recentBlack || strongBanner || this._vsCnt >= vsConfirm) {
              const which = r.byProbe === 'defeatBanner' ? '失败'
                : (r.byProbe === 'squadVictory' ? '胜利' : '胜负已分');
              Utils.log('info', `    ✓ 检测到结算画面「${which}」` + (strongBanner
                ? `（金色横幅单拍强命中 d=${bannerHit.dist.toFixed(0)}）`
                : recentBlack
                  ? `（黑屏序列确认：${((nowX - this._blackAt) / 1000).toFixed(1)}s 前出现过黑屏）`
                  : `（横幅连续 ${this._vsCnt} 拍命中）`));
              this._bannerAt = nowX;
              if (graceMs > 0) {
                // 0.5.78：先不判结束 —— 实测「一局打完」= 横幅 → 黑屏过场 → ①自动续下一小局
                //   或 ②整场打完（战绩/评测/入口页）。给 graceMs 观察窗，续局就直接接着辅助，
                //   避免旧实现 return 后任务固定 sleep(10s) 造成的 13s 空窗（用户反馈"不按键"主因之一）。
                //   注意：已在观察窗内又命中（横幅还在屏上）只刷新时间戳，不重复开窗 —— 否则横幅只要
                //   一直显示，观察窗就会无限续期、永远不超时。
                if (!this._holdUntil) {
                  this._holdUntil = nowX + graceMs;
                  this._holdBlack = false;
                  this._vsCnt = 0;
                  Utils.log('info', `    ⏸ 进入 ${Math.round(graceMs / 1000)}s 观察窗：自动续局则继续连招，否则判本局结束`);
                }
              } else {
                return 'settlement';
              }
            } else {
              Utils.log('info', '    …命中结算横幅，等黑屏或下一拍再确认');
            }
          } else {
            this._vsCnt = 0;   // 没连续命中就清零，避免战斗中的偶发命中累积
          }

        // 0.5.70：HOME 也必须稳定（current === HOME）才返回，避免战斗 UI（头像/技能区）
          // 被误判为主界面导致 waitForEnd 提前退出。
          if (r.scene === SCENE.HOME && this.scenes.current === SCENE.HOME) {
            Utils.log('info', '    ✓ 已回到主界面');
            return 'home';
          }

          // 0.5.52：此处曾用「整屏/边缘变黑」判定「获取奖励」过场并直接 return 'reward'，
          // 2026-09-13 用户否掉了像素判据（暗场景战斗帧比奖励黑屏还黑，单帧阈值必误判）。
          // 现在改由时间维度收口：黑屏期间画面在弹奖励 → frameDiff 高 → 继续等；
          // 一旦回到房间界面并静止 → 下面 stable 检测立刻命中，且 combatStep 因 _stable 停手。

          let diff = 1;
          try {
            diff = this.vision.frameDiff(region);
          } catch (e) {
            // 视觉不可用则退化为固定等待
            diff = 1;
          }

          if (diff < threshold) {
            stable++;
            // 0.5.79：_stable 改为**单调不减**（直到画面重新动起来）。
            //   旧写法在下面两道「先不判结束」的闸里把它清零 → combatStep 的「静止即停手」被解禁
            //   → 卡在陌生页面上时一直在盲点。现在保持 ≥ 阈值，手不离开也点不下去。
            this._stable = Math.max(this._stable, stable);
            if (!this._stillSince) this._stillSince = nowX;
            const stillMs = nowX - this._stillSince;
            // 日志节流：旧写法每 300ms 打一条（静止几百秒就是上千条），现在只在关键拍打
            if (stable === 1 || stable % 10 === 0) {
              Utils.log('debug', `    画面静止 ${stable}/${endStableNeed} (diff=${diff.toFixed(4)}`
                + ` 已连续静止 ${(stillMs / 1000).toFixed(1)}s)（静止期间暂停连招点击）`);
            }
            // ── 0.5.79 兜底脱困：连续静止太久 → 不可能是在战斗，直接结束本场 ──────────
            //   放在所有闸之前，**无视 battleStarted / staticEndAfterMs** —— 这正是旧实现
            //   永远走不到出口的那条路（见 waitForEnd 顶部注释）。
            if (staticBailMs && stillMs >= staticBailMs) {
              Utils.log('warn', `    ⚠ 画面已连续静止 ${(stillMs / 1000).toFixed(1)}s`
                + `（≥ ${Math.round(staticBailMs / 1000)}s）→ 判定已不在战斗中，兜底结束本场`);
              return 'frozen';
            }
            if (stable >= endStableNeed) {
              // 0.5.72：没真正开打过（还在匹配/加载/选忍界面）就别把静止当战斗结束，
              // 否则角斗场会「一局都没打完」就判定完成、直接进下一轮。
              const aliveMs = Date.now() - (this._fightStart || start);
              const recentBanner = this._bannerAt && (Date.now() - this._bannerAt < bannerRecencyMs);
              // 0.5.78：再加一道时间闸。忍术对战「双方登场」画面实测会静止 4.5s 以上
              //   （trace #42~#62 连续 21 帧完全不动），那时战斗根本还没开始 —— 直接判结束
              //   就会出现「开局 15s 判打完 + 空窗 10s + 真正开打时脚本不出手」。
              if (!battleStarted) {
                Utils.log('info', '    画面静止但战斗尚未真正开始，忽略（可能还在匹配/加载界面），继续等待');
                // 0.5.79：只清局部计数，**不清 this._stable** → 保持「静止即停手」
                stable = 0;
              } else if (staticEndAfterMs && aliveMs < staticEndAfterMs && !recentBanner) {
                Utils.log('info', `    …画面静止 ${stable} 拍，但本场仅 ${(aliveMs / 1000).toFixed(1)}s`
                  + `（静止落判闸 ${Math.round(staticEndAfterMs / 1000)}s）且近期无结算横幅 → 先不判结束（多半还在登场/加载画面）`);
                // 0.5.79：同上，保持停手
                stable = 0;
              } else {
                Utils.log('info', '    ✓ 画面连续静止，判定战斗结束');
                return 'stable';
              }
            }
          } else {
            stable = 0;
            this._stillSince = 0;   // 0.5.79：画面重新动起来 → 静止计时归零
            // 0.5.72：首次出现「非加载画面的动态帧」即确认战斗已开始，后续静止才允许判结束
            if (r.scene !== SCENE.LOADING) battleStarted = true;
            // 画面重新动起来 → 说明又开了一场（多为辅助误触「匹配」）→ 重置静止保护并重新计时该场
            if (this._stable) this._combatT0 = Date.now();
            this._stable = 0;
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
              this._stable = 0; stable = 0; this._bannerAt = 0;
            } else if (nowX >= this._holdUntil) {
              Utils.log('info', '    ✓ 观察窗内画面始终未恢复动态 → 判定本局结束');
              return 'settlement';
            }
          }
        }

        // 键盘/点击辅助开启就发点：⚠ 不能限定 scene === BATTLE —— 战斗探针（沙地色摇杆/金技能钮）
        // 是按某张地图实测的，换个地图就判不出 BATTLE，会导致 15s 后一次都不点（用户看到"没反应"）。
        // 这里只排除已判定的结算/主界面（那两种情况上面已 return），再叠加 0.5.51 的「静止即停手」：
        // 画面一旦开始静止（退出战斗的典型征兆）就立刻停手，避免把新界面的按钮点下去。
        const stillFighting = !this._holdUntil && this._lastScene !== SCENE.BATTLE_END
          && this._lastScene !== SCENE.HOME && !this._stable;
        const comboGap = (this.config.get('battle.keyAssist') && stillFighting) ? (await this.combatStep()) : 0;
        await Utils.sleep(comboGap || (due ? 150 : 200));
      }

      Utils.log('warn', '    ⚠ 等待战斗超时，继续走结算清理');
      return 'timeout';
    }

    /** 结算画面点到底：确认 / 领奖励 / 再次挑战取消，直到回主界面 */
    async clearSettlement() {
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
            await this.op.tap(PROBES.settleConfirm.click[0], PROBES.settleConfirm.click[1], 'delay.short');
            continue;
          }
        }

        const s = spots[i % spots.length];
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
     *   ② 「胜负已分」金横幅 victoryBanner（d=9~26 极稳，持续约 1.5s）→ waitForEnd 在此返回
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
        Utils.log('debug', `    静止确认 ${stable}/${need} (diff=${d.toFixed(4)})`);
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
      for (let i = 0; i < seq.length; i++) {
        Runtime.check();
        const s = seq[i];
        const targetMs = s.dt || 0;
        const nowMs = Date.now() - t0;
        const wait = Math.max(0, targetMs - nowMs);
        if (wait > 0) await Utils.sleep(wait);
        if (s.kind === 'tap') {
          await this.op.tap(s.x, s.y);
        } else if (s.kind === 'drag') {
          await this.op.swipe(s.x1, s.y1, s.x2, s.y2, s.duration || 600);
        } else if (s.kind === 'key') {
          const hold = (s.hold > 60 ? s.hold : 60);
          await this.op.sdk.key(s.key, null, hold);
        }
      }
      this.stepResult(true);
    }

    /** 识别当前战斗顶部中央的秘境名称，返回 luoyan/dufeng/leiting 或 null */
    async identifyRealmName() {
      const tmpls = await loadRealmNameTemplates();
      const rx = Math.round(BASE_W * SECRET_REALM_NAME_REGION[0]);
      const ry = Math.round(BASE_H * SECRET_REALM_NAME_REGION[1]);
      const rw = Math.round(BASE_W * SECRET_REALM_NAME_REGION[2]);
      const rh = Math.round(BASE_H * SECRET_REALM_NAME_REGION[3]);
      let bestRealm = null, bestScore = Infinity;
      for (const realm of Object.keys(tmpls)) {
        const res = this.vision.findTemplate(tmpls[realm], [rx, ry, rw, rh], { step: 2, thresh: 25 });
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
    { kind: 'drag', title: '主场景拖到最左（第一次）', detail: '横向匀速拖动 x 1089→-22，y≈300（2026-09-16 录制实测）', coord: null, color: '88,166,255' },
    { kind: 'drag', title: '主场景拖到最左（第二次）', detail: '横向匀速拖动 x 1051→171，y≈340', coord: null, color: '88,166,255' },
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
  const SIGN_MENU_TMPL_SRC = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAGwAAAAkCAIAAADjD0ibAAAf8UlEQVR4nHV6R3ccWZbec2Ez0jtkIuEtDWiKLJZvq26NZjQr6XdIP0cLLXS00ix0jkaaM2cWmjbTVTPd1VUkiyQIEh5IIL3PyAz7jM6LAFnUYlAskBkZ8eK++6797gf/8j//VwghQohzzoUQAEAIwbsfIQSEAEIEkbyIhLwS3SVvk9chQtH9Iro5+uL9V1B+kH8AhECuDgQX8bfxRRitLz99+NL3j0ME+Y9iyBt4JE+85o/3R7LJpQGId0EIxhjHj8RCxb8BhFKK6Lb3a34gD4o+yQ1BCHm0oBA8uh6/SW7hw1cDCDDGBPzrP/J1kcogFrHUEGAYLxN9juXiIH6HEDd7e/ea6EBu/iW/4/FnCG4eeK8MGD0J4/uAgABBqT0EbrYZrRjJjyADcvPo3buivUdH/8GLP9zCjeTRMd6oINbnuyNBCOB3H2/EQHL96E4oBYdyERHpVkr07lzlSSAk75BKfG8F0ZMf2Ii8wOVGBMBA8NAXSGEACwCJXDV+jgEodxuJGUkp5PtinUaXeCSI1JSU4Z1e5MdY7ZxL440sLNKHQPI3jr+9WSgyHmknggMoGGNMQIgxRNGLpRbkckAARkMBIJMGEt0uJZPyRycUOZM8dWlj7zUuX8LjHcQXWLQLhBCM1XpjPfEagEOplGgz75RG3tt8vH/5VihPRqqYcwAY4xgKEXjzSa8hNIOphmYkLEMnUBOASwGB8t5npfHfrBMLL49NKllqViAeneU7A0fycSi1/O5EOJAKFZBEd8UmEAt1c6LyDYKyMKSUEVVD8s0IIem5jAah73ZaLYiwpmnpdFYzTA4RwgQhKB+NHEouf7P32FPio8Jyu3FMAowLhqAaHX10F+MQESgQQFzuSOrwR9sXXPyr7hxHQyAQC9zhqD9sX4xadaSqmmklkpnqykYqV2EAcXkTjWMfln4oYquPvINDBhHGSJ4+42HAGQulpUTxQHDBWaQgqcQ4gt4YDSJEM7FmQKjEliTFkQYYsNCfzYb2qO/aE4WQZDafSBbS6QIheNJrDjpX15enLPATpuEWF6qrW0o6J0AijESLtoUgjJQolfre9GB0sPK76JeUONaTNFnOBQ85dWgYMsGxSoiqykeQohASHTL/UYnyPKKdvEsPAslXcWfUbhy9mPSbCU0LZ/Z03J1AzDxn8w7REhmBVREFEwiQ9B/AbhxbLoAjK5RmILgXOEN7PJzbduDPhYzrnFMKOBXy2yjMy9NFcgtEKVZqVrZsJnNQ0URk6VimpnA8aJyfvJ6NOp49Zq6jGqmF6trtOw8QhJ2LN836CfVdAvl0GAyvjqa966WdO0hPQqwihBUtoZlpTHSE4yAiEMKRC4YAyPQYHaSMREhwDCEDkAvGqR/MR07/ejrqu0FgJpP5UlnPLmAjHedcAOGPSoyzROznEHAoKBTMsyed+vGwcWYl9J///OcBDa7rl6enp+PO+TSbSGYKABIOSBQ6MJcqAIaZUDUdSicyEda4jEDhdNA8e/tDv3k1n44RDeLsBKXZ3vhyHE64AAgTiJVxt16qrq5u7SUKi0xaMkY8cOfT9sVh/+oklTAWlpa92bTTuL54/Wc66Rq62u5eec7s448/KxYK3U7n7dvD+umbdrMOiKJommYkKrW1cnXTypR8GobUD2kQpYXIieMgJv0dRcaINE1PWEnIoT3uNU73G0fPAmdIw1Axk/nyYnX7YX55FxkQIIXgD5QYp7B4O9IMBVNEaPeue9dngLPa6tbjL36WTFnt1tXf/93/fvHdH19+21EJliEk8hSpSqgSI1lZWisuVLOlimIZAmPGKfXm02GnefpGsDCXSRlEIVEVgQmW0QzJqCazpCxKEETYtu1Oq8kDr1gs6ukCV1QMBXNtu1tvHu8zd75+Z++rX/wFZ/Sb3//D/tM/t6/OERKeN00kM7v3H9++c7/dbnP1t8++/9YejyFgiop9VQvnk2A+z+QqvdGw22259ghyCgTFIJQ+CxBHilQiwkRPlKu15ZXVdLYyG3Qa5/u+OyznTFM3+sPJqHmumqlkbiFhpGTBASC5KaDi3BbVWhDK5AsZ6zSvLg9ferNhubr06Ze/TOYrKoH2zHPdEBNDsIBSBgTD0oUFg1ggjTrB9Zkzt4eaYVhmFgoKROA7o+uzI6KIr3716wePf6olLKk3EcU/GQUQpQxheS1KzsydTf7X3/z387PjbqdhLawhpAjOx+3zxvGLYNLPFgr37j+srmxRITbbTcBkqPS8oN68KFcXK8s7eqaY4eDug4elcpkzBcuwSmfzyf7r1836SfP6nDLq2zYIPIhk4cgFBYxJi0RRbaMo1FMbswH0p2J5Xj85mvbrD+7vffGTX5eLtePXL//u//xN4/zN6s49QUOgEIjQBzExzjgynVLftwfNs4vDV+P2Valc+ujJ52s7e6qRCgJPs4r3H3+1ceuhqRJVgZAHgPlc5nEZCkaj0ZuD1/1hs9+50nIVQjQBKRCha48IUnLZ0srqup7MIIhcexbVaYIoSlyWC0iIoiAoes0riFSZqhnlPAQsaF6cne//eXh9ZCWTn//0F5u7dwwrhTG+9+jJxtoa5KLRaKovnm3t7mYKBYBJOpe/e/9BsLXDQqxgBERwcPDDm4NXk14DE1yrLW1/9BPdSCqqQggEhGBCWEjlLmTi4aNh/83By9bl28moN+y2uT/VdSVZLOdqK7luF0NA3RkLHB6EiOg3dWL8g6CgIQ380HOGg9ZJ8/ytM+yXK5VPv/jJ3Y8+XSiXFIVAoOULC1YihTBWVIJkWmOyVIyLCOqenx61G5e9bit0bSGokEbKMOIE8iCkgeNBTjFnznx6eX5CfT+q9jCS/ympXKmwUOUAM4Ac1+OMEaIwDpzx4Ozw5aB9nc0XH338yaNPvkqls4D5ECqWlSYQh55bXsS3KLt1946i4ul4SIiMowFlNPRpwKEIx+OB40w5CwhR87nc/QePCtU1QAjEUBCVA8gCHwnBIIJh0L48OT87ce1zzwtE6CuQqwQTlXhh6PpeGIacBjKCEhI1bJElvmvjBBTUs/tX5wed+lvEw7Wt3YePP7n38Emlusi86XzUDUJG5RKMBtxxuCxJhSyTiaooSKhIuK7nex6jodS4YIKHGApVwRgIFji+OxdUsCBoXJ3+7v/+vT0ZK0TWEwgTVU9s377/aSajaCYNqTOfMxYQRYNYnwzPZuNOsZR/8ukXDz76OFesnBwfzuzxyso6xMpl/ard6VSr1fXN7bSVOnjx4vrqcmllbWlpaT6bvfrh+XTYg4C2Ws2AhqqhM8pDgBkiim5i3VAMHSqq47qt/iiYzwUUiIa9bt9zaW15K1sohJ49aF4ggJlPEQCBHwRBgBE2DE1TVSZL+h8tMSp/eTibdO1BK2Pqm5t7ew8/27y1l8qV5u787PB1p9mgLKAs4IJKtUebh0CapxAhgiENvEa93m73rHTeyuQgxEjI4CeTK4SCUc54QIEGSUjFaGJ7szmOSkVFNZAajCfTIKBYEb43p4EPAFR0nRDizmaAhrWF2uNHD8rV6snp0Tff/B4Bbpl6wsp22q3RZLK6tl4sVq8uTr7+/W/G/V4qYdUWFib97sHLZ9eXpxwAbCSymRJCYNjvdVudH549nU6d2tpGsVLh/vzq+OjVi5fz8QhByvxg0G2Hnvvks59u3rozGbT++Tf/AIHCGORMNktCcKSocccsGzosU+oHFScH7swNndnmRu2rz79Y3X5gJLMOpePZpNFuD7o9JMsYgQkhRJGdrEzjIhCcUmaPemdvXg4adS2ZXl2/ncwt6rrFZa99U3UKTmXPFOXhdLbw6Zc/p6EPOIMQc8pN01hcXtF0nQvue45gAYBCJSqJ0mVIqTO3J/3OfDr53T/+5ujo7eJiZTbsB26IENje2amtrHKIT87OGvVLHnqcBaNB71gefF1VcDJXLK1s50vV+Xg0nz3t97qvXj4PAMjXFgEAvebVi+/+1Gp15bYwHPfb1+dvs7lcZbG2e/der5354ft/iVpXwCS8IVu+aBPSBuPm6yY7R/2xhBJURQUscCbD0HeE4O1WK0RwoVot/PrX1HFkJSPzKZa1ctSKEYSRlvIprR/vD5vnozaoVKuVpTUtkWFUyGbppjGRf8uKmSCAUbW2nExn4kAMAUbyMiSaRqEWBoHvOZyHCBGECQYok80bCavX6337zddh6B29eTu1p6oCL87Py8sr+Xx2bW0tnc7M506+WFxd2xz2WvXLi/rZ8eHr586kf+vu3eWtO8IsEj01m8x8NwBClMvFje2t4kLFntpPnz5vtdrLK+uPHn9iJszv//RPk3EHYcQAYpB4lNO4e5XqkiX6DU5w8yfqnd9DPQJihEkmn9V1tdOsHx78MHFZfzxPFSu5UlnTddceIUQU1eSMOZ7rOA71nWwmVcxWsKxRiO/7CAGVyKpOcCqQhAwAB0EQUMYJUYmiYUJC2QU402E/cgH2Dn2CiVRatXIyjoYB40xCCFghiprNlSqVZbt9/uqHH0LquXMbIjzz/LHj3Mrnl9fWDTM1m4wIJo8fP15cKL16/vT47ctO43zU7zBO69d1l2Mz7yZT2X67Dri/u7v92Zc/u/XgYyuZuR5d6VZ69+7DWm2pWCqn05nd2/e7jXrr+horRsih7QZ+KLhAspCMkJsbTChqwuPyME4sEe4kN8QpFJphjvrzP33zO/H0WSpd/vwXf4VYOGj1/u5v/wck6q29h5Zl9fv9t2/fdltXDx88+NVfVjggZ2f1wWAS+mH76nw8d/Mru5WVuzipCCHCIHRdR9EM3TAx4INu69mfvn7z/M/Md1wmw4zgXNP0vY+e/OKv/gPEmu97gjMUHS2T9TC3LGvCuOcHgecpipkqVfYef/nJ5z+rLVU5YK9e/nByfFgqLuzde1CqLP6sVNm8defo9fP9l0+bjWvXseuXF6nh1DCs6bija2D3zt0HHz3RrQxEaLFWyxZK0uQFRyxw3Hm5vLC6ttVrdxGSTV8YUtmTChHJE/nTTQB8j7FF2VlCahKrkJsa9nohZYqWmLmO7wZWpphIWBCgyWh6fXltpDNE1RaqtSCkAIiQMkw0jHEYsG6vK9tTIyEonfXalIGkVUqkCqGg87kNOLMsyzQNxuHc8dvt1tXlCffmIVIFDREURDfX7AmTCZ9RXxaeCGKEYMiDq/px+/p05tqC4MJibefuvXuPPl/d3DOtVBC4pydHf/znr4e91oXyZthpPvrks9rK+tbOrXKldvujT67rF9f1Y3vQmfY6w17fnw9hwpTlNROB63HhUogV06JcXJyfXrzdJwrPpSwaOBAxjGNw8z1KKiMfY1FS/QA5jaEwWelwwWngz8a9fvNS+P7i6hZUEVCN9dXtheoiRCSdzd97/AQq+kJ11bQyxVJ579797a3t9Y1NRdMYoI+efLK9voR4SOejwzf7b07OWpeHxaUNAIXvzKHgpplImGlFMSwrvbq2TWiAeMiIKlioaypRjY3t26qme9LefABkfGAsHPY6vcal59i1teXFpY3Nrd3a6kYqW06mchAjLVCXVtYtK+G7MyREJpXN5IsQojBkiqIsVBazxYXdO3d71yfPv/ntuD9UVd316PnFJf76d9OJPbWnmWL5q1/9tWGlAt87frvfap2nTQ3z0HFsosjWWmJQsZ1FmruB/29w+8ibRQSFyT4cQBp6zqTnz/rLCwuf/eTLVGkBqEbeSpfKy4mEJQB9+NkXEKrpdAEhnEln8Nq6pmqWlUQYaxpaXd/gq0sYKJPuRaPX9A9e+e6IU0cAOOg0IICV6koqnVewms3l7n/0ZGtjS7bKBAWUEqxoRDWsFMIKB3MaenHZKziYjyf2aFDMpu8/fLy992ShvAQVvd/vBb6naZqq6dlsJplOcc5pSDGACiZewM5OjtpXpwSDxc275UollclPpnPHp4gkQm92dn7aGfQpB2EYrrNQMIYEJAjKmkkzQtee2GPNTBJMpHkxiaAo8t+yuRXyzw2uL5NlBKyRGACT+BMBRFbbHsGitFCpru2GUEkoimaYlAbzmY0BTlgW53Q+cybD9nQyTlipVDZPKR30u/3ONWVMU5LDTnM4GEKAM6mcgpWJPfYdmzOWSmdS2RxHgHFmWLphFDSi34DykAiOiaKFBDIBGZXFkMQjCGG+7OgJAtlUZlEm0/HxydFl/SJpGmYiQUNmGFahVKaUjkejXreNAEvlC42r+uXpIQ2chZPD7e2dYDZuXl0ySjPZrBsEmprYXNspVJYAVjKFgplMaYaeX6jd+/yXG7Y9ap68+O4PhKipZI5gJQwDAIGqyp6FcS4znjS7GMyWeowSS+TrCEFF0VTDIJraHw6ODl61W90AkNWVtY2duzN7+t2//G46HX/y5c8K5UV3Nr84PTo6OipXarWlZU55/fRg/+kfZ/aEqAlvNmo1r7RELpFb4oxNOteOPbZS6Wx50UpnaeB0mufdxgXzA8ERBDSUCKSSSKQq1VpudQ0IwcJQwrQyOet6QiOKNuj3Gucn2VTh6Hj/4OBVGNJyueL6dDgap1LZ23f2CoVir3n99T/9IxTBk69+lk6nCsXC5cnBq29/3z7dBxDPA5EuVhNWYuz46XTmzu293b2HUNUpBIZpQoSNhLWyscVCVkfh4b5FMNF1AyNsT20aUoVgRSFcpkGpNYmly0RyM+uQ7hzhABBiYiZzqcLCtN/69l++kZrVLfKrf7+0tjUaDp9/9ydnPtne3U0m07Px6OL0+OL8TFF1Oe6g4vL05ODFs9Ggx6FQMNLMdG39br646M+nnauzMPDLazvl6oqp663G5bNvfvt2/wff8yllIQsY40Dgcrn65LMvP66WARc0DKKCSyFESxjZTH6hedp4+/ZgPJq+evk9o8HtvQera+uTmTee2LY9URWyubEmWCg4UxSysry6c+fexfnpfDIctJv9btvKVWtbe4V80XFs0O24njO1h73udSCAoutI0SFWGlfnk37bm8+bp/v9biOZTI9HXdUwB53mfDYFEKlE9cKQMRo7bjQWikaSkRIFZ0zGSITNdH5xbQ9jze5eevZwbTefzaZlahdA0YykRP2gbU+7nS6AuFKpLa1uKHpiNpkhqGRyRSDEfDZWdH11605tdZcQ2G1c95pXqqavbt5aWFjggTe4vnz99LvrywuhaIJgLjgIfQSBZWpBMEeCITlDiKBmogOopNO59e29wBtNnFF7/6U3c4Dg6Uxh9+5DrCVCxl+/fN4f9HRDtVIWUbXtne2VtQ1FMx2XTmcBwzhZKC+u7hSXdi1dbzXPOOCddv37774+OX0znc1LlaW//I8LiGgvn3734tt/ciYjEdjOfBR482d//ubeA69zferMJ1GThoXvhoGPEJLWwyGWMLisGGXHcjMsAgBgLVNZVjX9cDYBrlcs1CqVqqYp2UL+3/y7vyYEL1TLEJGt7Z3V1XWiEqLrmm7yEHz06Mnm2lLj+vS7b78eTGaqkcKqORx26mevQ99eXt/c2L6dyWSd+fjt0UG7VdcSia37n+nZRc+b965O2pdHClGz2TyCWELyQSghW2wAQDAiyVx16+6X42693zizARwPu4eHb+88+Hjr9l4+m4UQNVut4Wgsk0y+cP/hR5aVPD4+/P7pt83LY+ZNZrYe+kEwc30mpsMBgZQK/+rspHF5ZaYKycwi5ABzoCpaIl1UdROLIHTHjcuzb//4B9e1r+vHSIiElcAK9oNg7roy+miJgEM9skMBohlLBM3LeAmxIg0gkTOSebvf90NKqYRsdMPc2LrFuExoEEIFYSud03UDKiQatsGFSrVQyHihp6l6SGehIG5Au61re9SpVUuffvZFbXWDC/Fm/9Xx0QFAcGlzp7pxS01XPcce99oKVrKpdDaTlWNGGnquE40J9JDykIZIS2TKi547QYriUx8TNJ2OL+uXxcVaMp3OZPP9wfDb775fXKxt37qzsrEVCnF4dHRxcc4xwXqaC9RuNrwAmQljNOxpmr62trZQqQFilCsrC9Ulw7SIqv7y13/xk69+CgGj7uzo9bP/+Tf/bdBp//EPvxWBv7lzp1xeUOR8CriuCwBQNV2OjWXdw3+c9r2baUukWdXNdKbYUy8Gve6b1y9mtt3t9ieTsev7AfW44AgrpdLizq29ymKNCXpx9nY+6nJOz05PnZmnaQlFM+euO50MVIIe3Hvw0eMnmVy+32menh51Oy3NzBQqm7qV5xCFHHh+KBhPJpOpVAYhFAShbc8Zh1YqYyQsCZdC6HlOt3M9HfdSqVR2ZVkzUxxgxwtypcqtew9G47FqmACRew8fpXIl13N3dnazmXTouQQDezx6c/Cm2z43TMOeDCqVhY+efLF9ew9rCaJoGlERYKHvqBggBRBE3AD5gbQfomLGAk0lC6V8Mmlhgn3fm81sIUQikYggmKjAgf//yDQepyKEiuXSqJXvNq7/8Jt/MHVjbs8ljMakVTLIFVW9f//Rem2R8FKvc/WHf/zb+skBRGg2CxEX+cX1dDYXhICoeOx4g+E0DKjjTF+/fvF6/6Xrumu7d5P5ZQ70MKC6buaL5WH96KrRPDk/NwuLbuC3+wMugJZIIqwCiARns8lwOmgTyL766he37t7FqomURKZYBABk8oXA8yCEhmbouqEQlRG+sry2WFnCGAtGG9dnr169dOx+OrkkOPN9H0KUkOURn3Sa48FgPBqMJ2N3PndmU9edU+o3Wg2Hs82d28z3eq1Gp9vvdnupsjMZT0bDIUIonckqqiaNMKJQfKjEeNQnw1EyU1xa26lTKrNYfyCLSKIgoiiKErpzezJpXF2M+u1pPnd6+Pr1y2d271pPZY1EsVRcWNy4ZaZyGgNGMsORcnR6Xv3heTKb3n/xtNfrJ9Kl6uquZuWwogMmZzTZQjWRK113u8+ePydG0ncdN3ChaupWEimYgpAKidpzgDDAZiJRKsoR43Qe9JpXrucFYeA5jtyOvEtO8TGRgR4hZFpJTVX6vd6wP1AUPZnKju1pb9g/PHzlzaa9VmvQ7fie69qj0PcpZ34YuowGQhA9VVt/sLy1LQJnagf1ZvfN6wMlkWs1GvZoYuhmMlvEqhlIwEFOzGV2fufREbEoYn8AohaX1lO5wmQ64qGvYKyqGpIDEz4a9t7sv+h1+8dvXonQe/Pi2WzsmoX11a07yUw5ncppySxSzJAHxfLyoHE1t8d//Oevsaa1W02kWqs7D6xsCeIITIsGrWa6XF27fXrgHB4eBX6gEUQ9P52vJDMFrMjxAJItY1IzMxN78urlK3vYDSmdzj1Xeocvx9chZYxx+b/E+jCSJSZGUFVVVVPnjuv7tFpbqy5tCUKOj14d7L88Oz4aD0ah42NVV4mqabpmWkkjkdYSiUw+mS2VFpaSyYRjj7PtycWbF68P3goBJtNxGHjl6rqezFEgR20gKrF/VOJ7lhIXgkIMFVNJ6blkEQpOIu4TRArnlFiF/sTrnh/s7x/Yk8n1dTNhFRY39xbWdxU9BSFhRIFYhwQmsws7e4/qJwezuc1d30zm8+VKvrKiWWkJ7UodylNUzVSptuF7s07zsn5VN1VspbLVlS0zmQVY9gIYEc1M5heWZ9Px6cVV/fyIxZYTA3uyHYvZXHFEutlITD5ACKtmslxZqW3czZSWtGSaAuI5E9/ztYxW3awkk7lEMmuapqobWLcQ0SHRMFERwRQKJamu7DzyvHDYOj96+0bT1VSpvLx9lySyDMmkGuGJHwyqYlhHdoMxFUlmHx6RVySUEZNaZOhRzJWtPR4G1JudXPWIklja3l5Y3TaShVDIBwRUJFxENDWRyVbXdCs17LaEEKlswbAySDM9KgAMI1KUpNBgjI1kZnn7drZQnI57kNFqbSmRW4SqIds+RmWzqurl5XVNVUada3vYVAEzMUGKpltJQrSoqEAYETl4j8qMiE/BAeeO56Uyhcrypp4uElU1E9ltI+/Mp4EfKKqmGUnNtBTJV5HcQTnKACgCseXwVhIzuEgVyrcefNxIJgDzFVUppZP5xXVspKjkAUklSq392//0X95lFQluy/FrFFAiAhyXNCAhcDSTgwhHXBkQhsFs1PNm0/Gon85m09mCnsoJqN0wQbAsVOQhIAAFpaEf+q6uaxLGxoQDGMpGDyrRgEGW+wRLhEmECAjXnUPOEmYC62YgoKLpfhBwKYUc5jJvHrgOCxxdUxBWOcKAaEC2sTIURpQpLpUoJ9gS0ZVHxAMAsaZbEiKWhDIg+SGUxiMiKoScdShq3HhE5DsRQQwSqJbGRCkWclopfGc6nSAFq4au6GmopkJJx5HhQ4mmLe/Jgjd+/Z5p947uGPGz4r94RJtDOJUrW+lsplxRlGiRiDsQceRifp48CcmlggjJaZMWEykjDtUNMTJKnTGFjEeVFeECKmbUQUmKjGQghjLIRSSZCCKHqqlhTcE5CBEHiEkB5fnGG45ZbTySkEuR5FcCccAhRXLaKEWSiyOhSKiYccAi+tWP9NF3qSHGE6SCkOS1IqSQZDZrppnsRiEDqoCYR4tFvFfpzh+wJd+l6Ji7eEODi3CeH1mU0rcBQFg3LAgkzU0yzm6ejdvwD3HfiGoVcVNisWTkj9rHd+bPJRUxXla+W94uJ2gxTUyuK6WM1CQNCWLJeJIeExE+YAzsRUqUBYe0DgGj1HLDiQESKYjIkdGBQUCBzOIx30MegnQ5LonC0RQqZjRFZxNZYpT+OIS+DEEEEhxxG6MB9U3Uk4ZBbriY70mtH/zEdNv3FFJZnkfcsfjMKeURfxBFlaWEdW9U986gY6JrzEF+T1aJpYz5InEpENVa8UxQyHgh802UEuRFWUPcMNakOgDglEuyWfR0ROKSL4nMQRqFYHGkB5LWhSDgkidyA6bGtDmZbWSQjfSDAGcS0r/xnki2mDz9nvWKpWPH7igjpoxtMeU03mnM7fx/3sSsBDRWCqgAAAAASUVORK5CYII=';
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
  const RECRUIT_TAB_TMPL_SRC = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAFwAAAAaCAIAAAC1jKx+AAAXgklEQVR4nC2ZWW8cWZqezxZ7Ru57kkwyuUvUvlWVunpUXVtPV0+NZ+keYGzAN4aXC9/6Bxi+tH+AYd8NxoDrwu2ZBqp7umqqq6QuqUSJEkWJpLhlcst9icyIjMzYzjlGsv0h4iKAACKA8y3P+37wP/ybK72eU284taq5uLDAOKud94e2kc1FgsBrNtrZ3MyHH37sOKP1Z4/7/WYhn8hlU5GIqqpEkBDnIAh44FMiEMA4BxgC1OtZR0enB3tnABKERIhERASEMACcc0ApdT2XYA5hIIi4NJ+/dHk6FhcQpjRAQSAdHVZfv9rzfICx4LoOxv5caXq2WPT9YGBalEKMCKUgCALG/nh5hKBIJBqJhlVV1PWQ6zqVynGlfDYc+s6Y2bZLMHnnnXcXlxYrlfLGi/VOewQA0HXlF7/8eSIefrn5fHt7t9v2GAMiQeTpk8NGfcwAXllZ+bf/7l9nc7GH3z3/4ov/s71zMhqBQl6+dm31s8/+hAhEFINf/eofNjZOUsnG/PzU6uV5gQuAw2ajVT1vmJbljFxKIUQCQaIfsFxu+vqNa8lkXJQlSZGJQCilQTC5e/1+4Pu+H7x5/abV6uULyZAuylikFHS7w5OTOkTiu+/eyhfyrWbjxYvNk+NOvxeMHccyLccJOAcAwD8Gpb4fcASBKBItpMZiobUrKwSjZsNuNMYQCAhJmiYlk5F37l+9d+9Wvb4QS8jrT1/4nj+/MPvRR+/n84mZYjyeCO3vn3pjzgJMuh2fMY0DDgATZZ7JqauXU5cuF/r9gevApaXc9RtLkZjY7RrD4QBhSVPR0Bo1Gr1icVpTVMdjQ4s2Gma/P6YUQQAA8BDyAAeXL6/81V/9PJWJ+9Rl3OeAo4vgnDMGACDNRm8w6D55clqvtdOZsCAgjEXLNM5Om/F49O6da9eur21vv+12jJcvt0fDrqJK8URSkWUAASGQYIIxZhxwBiBCvu9blmX0reNyjbLANEd3796+fftWPB7RQrIooFw+EY9rsdjM1PSf/8VffoIh4gDk82lREm7duV5amHNdHwSo3TbJ2uUr12/cw4IQ0kk0GvEcpzib+MUvP/vk4z8lRFE1lM1HMWHxRPzPPv/5u+/dH5rD3/3uqxcbL/f3j0RxqdezTs+qsUTm3r2lTC5DiDCyhi9fvN7c2uoZLdcbjsbEcceNZmNoDyORcCaTzmazgiCZA/e4clartUXhIpFEFQBIsCJgzbKgplJFVUK6JooiANAwRpGI9v77773/43vRWBhhBoCPIESYYCQGPuOQAwbevj36p98+PD075gxx7icS4du31vSICqCPEEMQc04xQeGILCtQEARZVjjnpjnggAsC0rQQo8w0TZLOZj746B1REhkNZElhHKpKYrYYCwqSKIqKSgNGOUcgCBKpeK5QaDU7kfUNx2WuHwAE+6Z1Vm1cuZq6d//Gyso8Y8HuduXg8IRzsrN79r+/+HVxLr26thgEXq/bEUWsqvLYGZXLxw+/W3/43fPj43oioScSMcp4q97pdexGfQQ5ppSzyXc5pdy0XN+DruvrYXl+MRfSdFHCmHicUUqFwCcIYVUTaMDbrb7r+kbPTMRTfoBOT7rlcpNxOhoZXmDourIwv5RIpdqtduWkjDEqzhSz2dz+wcHB4b7n+ZoStQb09LRF7NGo1aoiDA2jjxC8cvVyIqF1e8ZxuS6I6NLaLCbC8XFtb/8tpVwUlaE5Oq9VZVUPR+IeZSPHdzxg9G3GRQDFar22+3bv4KjsONQceo8fbxLp+trVpXQ+l0gkFFWCCJTLh7/+xy+///5VuxUgCIigU8ZGtttsdLZfl42+ByAPR5KYEEoDCDkEIByWiQBazeabN1sAwJmZ6emZ1KDf39o6Oj9rLy3N3717jTGwt7dfrdZ1PTQ3P12vt3Z3347scTqTfve9G+lURhA5xogGTJTVVDIDERdEmXOgh8NTU4XR2Ol1xodH569ebZNur7vzdocz2m63gyBIJmPhcLHX7bx6tSmIcGomFgpFKseV07OzaDQKIDaHw6HtQSghLI9s3xo6nMNez97ePmy1O3tvX58cn/YHPSKSaDwa0hVV0ygNQrqWyWYEgfi+ZxjGwOxHo1oqFXZGju97jXqn3x92Wqaq6fMLuXBYn5rKFgopRRFSqciDD24vLs4eH58dHZ12eo1kMvazn2nT05nqee/Z+s7hfhljcPvOldHYrVSOTXMwU8xOzyRkmRlGa3NzZ35++Lf/8l8UpsKebwGAXdd1nDGAnFI2GPRHo6EkyWtrawjjly/2njze7va6BMKLYRYOSZJUqRwPh1YQUMdxm82GrIqM8vHYMYxeKpW6fHktHI5tbuxwhn0P9rq2643toTtbLKbTWc9zOp06xGxxuZhMxhv1wdWr1/L5aCYXCkd0hBAhWBREGtCZmdkPP/yQUhYEaH+v/Gz9Za3axkRyHOfK2tLnf/5JLp+UZSGZjBERzc3nCtOZbmf8u99+/3d/9wU88T/+JBuPJ1yHlY9qO2/OggCkUinO+eHB4fHJCcYom4vF40SS9F43326eWUNXlmU9orebg063a1ojx3GJgAAAkwplLJlKxuMRgYjO2DV6PUlCRFW1qfzU/MLs7u5uo9HERGAMQAggZALBgqA4jmualiRLnPNms3l6dm4ObHs4LpfPZIUpsnb3R3fX1pbTmYgaElWFyBJ+s7Xzw9PXH318Z34hP7QNACBGGPDJFGWT2YNy2XypNMsBJgi/2nzTbndCWmRkjxgH2Vw2npA4pxww1xnb9tAwTKPru64f+CCdTty5+048nj47axwcnLYa/StXVy9fWnNdb29vr9VqSZIYjWiizADEyXRMUToIINu2OY1fTHDAOZNlSZQkzhjnTJTEUEiXJNnzeafda7d7iiKTer26v3/kus6rra1KpXL7zg0IIRGIFlIiFyfMweSxVquPx3/odvuVoyrjbiYXoWzc63Vdh2OMSwtz0RghYqBpYe4zP0CmOeIQEAkb1W6n3dP1cDabDYW0drv7dP25porzC7OKogztsT0aI4T0sOJ5dqPR2Nne9/y+H3jvvXcvGtFfv95+8vhlrzeunXdTGe3Tnz64desm5+Dli93nzzdDYXTl2nwkGrNtY2d7dzTyF+ZL2WwKQiZKEiaMEI/DkTXscT6thULdnoERhBAxnwI4OSZ37LqSyxkYD51Ws28NRomkTnQdHxy+aXVOzMFgbq6QSEQEAU9PFx48eF9V1Wg0Gk/g27dunZycMs4j0Wg2k1EVLazHK5XTr7/+tnre23i+FYkp8RRZWp5emI+UT6obL7aPT+rtjrHMphDGpmn6nh+JRKLRiCgImhqSJijMnbFrmqOx7SuymMsmBZGfn1X/5//4+/7Amp6JLy6saGr49LT13bdPTSvIpGL379/+9KcPwnr4yeONx3942etYH3zw7oMP3olGw5VK+e3eeeDBTCYWiWoA2q4X+C6VZEKp2273XIfZY79vmEZ/wBnEGAuCiC64KpVIUp9124bRHbhO0GoNyH/+L/8Jwgkhep6vqpquhymlokhKpSLCOAg85qOpqel0JosxxoQTzEUiMA6934w8N/A98GZ7f+wZP/n4+spqsd8frK+vP3z0CAEZAkAEIZ1MhZSQIIqKomCMtJB+9epNALxEPNnrWX3DdBw/ElH1sGLZuNf16/W2T0E8HrgOYEwUSEgPh6enY3/zy7++cnVZkoWdne3ffPnV8+fbrhuMHea6Tr15uv70RbPu+AEngs+4b/T65cP627fNdstmHLzY2FlauBRLaLOzS0uiwCizR7bnepRNAJwIcrdrVmvNft+ACEDOiKaFAup7nssBtyyz2+2NRrbnBYADz/ddx2cAUM4d14MQSDJRFSkeiwQ+q9VqjjMmBMiSdO3atdu37yQTycPDo52dnVp1PDWlEjJp9d1er3pWFyVhtjiLEKqeV7ffVJIpPZ2OjR3fdZ0gYIIoAEgxhloIh5EMIcpmUoRgSRYvrS7Cv/w8EU9evb4ai6tHRwff/P6r3f0tTZejMWIN2wf729lcemdnR5IQpQRPtAIaGOzsdDCymR7WIASV8vGXX36ZK8TX1pZLpTkAQLPVPDo8tIa2qoaUyYQMDfpmaX4mlYqLEiP/7b/+d4R4KpXQQhohUFUFXQ9rmi4KkiCqmspGrjMajzgPhsPRwUG9fHTsjBkAxOh1/cDHZCJDFhYWZ6bmohEtmRhNTxVy+beiCCjzg4C6ru95AcYkCBgASBSlSCQcCoUIQZ7rmableQxCVKvVTNO6fn3lwZ/8JBKV9bC6sjIT0vD8QrFQmB4Mht2uQQjX9dA7715bXl4UBR1PiBtkMilNif/Z5z+9dbP5q//7283Nw+HQsYe+qmQ/+qi4slq4UK5yWJdVDRcKBUmSPM9LpdKCIFA/QETARIiEI4Ocuby8IooyJh7556+eLa/MXblyfaaY9zxbkoimhVVFBQAjPKFoBpjjjTlgtu30uoN6tVer9SkFkSgsFmOei9qdce28dnaSEUgmFg7fvXuz1eqWj84xoYoiptMZTQkTjMPRsCTJsVhiblaWVQQAdCbDxRZFqCjqeGzX6oPizPKDD36shzEHniwjhJiqKJyBRvNs583Wu/dvzi/kNF1AUGCBElAgClyWZcDFu/duVwutb75ZP9g7SyaYaY4wxvF49M7dm7quSZKICaCB4/us22vLkqxp6mhkjylNp1OapgmCCBHs9yzGKAGQjMdUFLXV1eWlpcJ59bTd7hmG0ev2/YAGQeD7biikJdKRQiGfiGHAEKVY18VSKZHORGVZMwx3ND57+ni90Si/887lGzevlErFmzevj8deOCwDwAaDYb9nyLISjkZ9L6jXG+dn7cWlGcrocGhOypYBjEQiTJRuu9NpNhuYRF3PikVDkqyWKyevXh683Nw9P6/G4pGp6YSkCGenjU7Lt4eBqsrTM5lUKq5I8oUU4ESUICBB4A8G7XL58O1uQQsJq6vz6XSi1bJebW11Or1LK6vF2blOp/XNN98sLi6+99676XRGlkTTsg72D4Z2j0jShO0mHAFBv99/+3bPtsecwSBglHLPH4fCynXx8sJC0TJ9wzCHQzuZjJfmS4mUhiFitBcJK/t7p7XGaTQqFGcLiWRcVoRoVM9kEpTyh989PtjfvXLlqq6HZVne3NwqH1XzhTSlrNszPM+XZUXTQooqhTShelb7+quvEyklGtVv3boRi5G9t4e//vWXRwc1IgrNZjfwOcJs4/nms/VDa+Ck0sn7P7r90Uc/powdHBxYljXJrknwIPBr9fNKpby4WBw7ruv6zVarUqlAgCCezD6EMEKw0aw3mvVINIwxymRSRs8YmG3COfM9r983hsMQhEjTVFXVhYknJGAsYsyJCJPJJITAtAbtdmdgOIW8qCgq4IxDKEiCHwSCCOZmZ+ZLi+lU2nEd0xxIkiDLkmUNnz17+XrrKJ2a9jzo+97ZaevkpDkeBZyJnZY1GlEOJuSg6/rUdO6kUv/2u4d+ML5379bS0mVdJ93usN02B6YbjckjO6AUQ46OK7WnT7atIZ0tdpcWSxAS1x0dHhxapiVJodFoHNb11dXS8ursrZvXZufykkw4h7KkLi2uRKOxQmGaEGFurvT5539Bma8okjO2fZ8TIt26devmrTVCCGQs8ClTFLlYLIRCujhR8ZgzfGF8+BCzSFwDHFnmBJARhpIsQgjohYgd2+Ph0Mznsx9+9OGDD+5HImKr25QlOZ/Pe75nDz1V0SRR7nbtVrMfBF693m41OycntanpfK3ebreMIABDexB2I/n81MhmJ8eN0SgAAKtqCHDiugFjWBRkjMTJFxmkFExaqR3QiUonkqwCABzHrdUbjjsOhcKm2V9YmHv//R/fv38bIt7pNDACengyYq5dvSHJSuAH3e6kR2CM06lsOKJ6nvfy5cvqeXtp8dLy6hyhlDvuiFOIEB6N7er5WbtjMoomJmNAPd+JRkNrV1dQNt03hpZlCwLSQzIhmHPmuUGz1e4b7tJi9vq1K7lMBpOACCQWyzGK9DAWBfuTTz9OxFMXAqrDGLNt0zT7P/zwBGP/zesta+ioqmBZPcNgc3PzmUy+3bIgtFPJOCF85Axdx+v3rbHr4dHQ9z0iTko2pGuFqRDgwlxpOptNAOD7vmcOTEqZLE9YsdtrtdutTmewu7v16NHDqel8qTStqOLS0mKCiOfV2j9/9ejZ82eShP/2X/3NzRtXmo3Oo0dPv3/0slB48uAn7xFVg37gdzuG59F+33z+4oXRswUsISwQIl7oBQ4oIEhut3qe40oClGWRIEQnDZKEQ7oi45E9aDUblYrguSOfBuKkveuMihDgmzcvX748BwCHQGy1+p9++uHy8hkHwclpOZmKfvrpHU3TjV632a4fHZUhFB3HmZubu33nmqrBvmGNHQdBoKkcItc0zcAPiAB+/tmn169d4xzmctlcPoUJNwyj1TLQRHBMtVud8/Pzx48fn5ycbr162e0ZtXpjNBq9/+P7uh7p9rrffvv4t7/5ttMZXF5byqRzGJPnz7debx0ahmvblXanSRRF7Bv982oDQaFYnPvZn34GAQYQcgY5n/jSgoCLxRnG4Mnxea83iIQlXdcmcAIQQkI8Hp+bS56fn/2vv/8CAGBapiAKCENZkQr5/GxxZrY0XSrNxONhhLGiCqVSZmjbNPAp9SnlEJKz0/rXX3/b6/RIRo5GdYSA6wVBEAgCGVqdvmEyHhARBD5vt+uWZeZy+dClufmFKQC4IEqiQEb2+PCgPGklYTGe0NLpaBCMj8r7h4dlTVP++hefLa+UZmdnkol0q9l59OiH33+9fnLSzWRi9390t1SabjSquzv7nVY/nY7ncimIAqLr6mBg1OvtdtvUQkQSw94kXN8L/Al8cUmUTk4afaNfqZQBCJKpdEiTAJiITEJweOIwJtudwcnp6YUXf9H7wcTyPdo/29DfxOPRYnEql0um09FsNpYrZHLZHCE6B1yWFNMc7ezsNxpNz6eJRDwS0UURV8+rm5u7qWSqWm1XqyeaBvVIqFG3ur2+0TNbbZUxBwA4AQY/8Fy3Xm9vbGwB6JdKU5GIENajnjdPWXBy0kwktLW1pWvXVymlb/fePv7+2ZPHL6rnbUWFHNqm1axWqxsbL3Z23kLEL10uLa8UKXVIMhmtN/qvX7/5x3/4pyBwGo3eeDym1L9YHQDKGMZQkWXXdQ8OdyMRks3G0aQ3TzwAzqksCTPFQjgS8lxKKWQMAihcgKzT7rRr5/X9tnV+VhdEGItqiWRUC2nJRDyVSiWTiVw277j+s/WtarUZUvVUKhqLh+fmChsbBz98/yoaybZaDcNoSzKYmU5wyoze6Nvf//D993BoDfwg8LxJRnFObdsuH1UVWSgWc7IMBJFlc1HHmXYnLG6WyyeiIO4fHGxubm+/2XNcL5PVY3G1Vms+ebwuEm3jxUa3M5iZySwsZOIJYFkOSabiqZTRbLQfPvym1zMti/oeB4BijAiREOIQOQBwjAERUKGQCYdDNPDx/1/iTATVhSEUJQRgMikLAETGBEr51DC6UMr2B1a3Ywxt2xzYnaY1GlOMQTQaisVjqWQSIViu7EEQzJVKiURYVaXFxZlatVWrNjfWt7rdBuAsnYzk82lFim48K//w+IVlDUYjlwYTe4Zc+PkYs0gsNDubTyYjIU2BkMkizmbiZj9zeFh5/If11y8PKsfHRr8ry8LqylRpPkcEDsHo/Mx8+mSn0TxNpULLS7ORiMypQxCH//Hf/6jTGTTqXT9wDaOvaSFRkBmnYGIBCYRcOCqAi5KgKEIkElYnGxyML2wJ8sefYoBzevGad1E6iHMMIJrIhInO5vbQtayhaZq27YxG7sh2x47nOt5kMQEZRHRqOrO6spzJJAMaOGPv/LxVqVRVRRuPLUUVZorZcFgdj92Tk2bgUc+bpC8hE/MaQoZQEI6oydSk9CYqZ8LrOKDcdYJ2u3tcOW21Br43KfZIJFSYSieSeiIRAjCo1zpGbyyKmh9YyUQsnkjJCiY44ID9P121hoPQd/I/AAAAAElFTkSuQmCC'; // 0.5.62 重抠：2026-09-14 现场 1080p 流帧 (42,412) 92x26；720p 旧模板因流分辨率变化重采样抗锯齿不同，SAD 0→28.7 卡死阈值 25
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
  const SECRET_REALM_EXIT_BATTLE = [430, 500];   // 「退出战斗」左按钮（非目标秘境点这里）
  const SECRET_REALM_CONTINUE_BATTLE = [850, 500]; // 「继续战斗」右按钮（目标秘境点这里）
  const SECRET_REALM_CHALLENGE = [1165, 587];    // 匹配界面「系统匹配/挑战」按钮


// AUTO-GENERATED secret realm macros & templates (do not hand-edit)
const SECRET_REALM_NAV = [{"kind": "drag", "x1": 973, "y1": 299, "x2": 12, "y2": 299, "duration": 652, "dt": 0}, {"kind": "drag", "x1": 981, "y1": 312, "x2": 117, "y2": 296, "duration": 505, "dt": 1265}, {"kind": "tap", "x": 614, "y": 403, "dt": 1999}, {"kind": "tap", "x": 79, "y": 329, "dt": 3356}, {"kind": "tap", "x": 949, "y": 531, "dt": 3568}, {"kind": "tap", "x": 1165, "y": 587, "dt": 2946}];

const SECRET_REALM_MACROS = {"luoyan": [{"kind": "key", "key": "d", "hold": 1445, "dt": 0}, {"kind": "key", "key": "j", "hold": 0, "dt": 1477}, {"kind": "key", "key": "i", "hold": 0, "dt": 64}, {"kind": "key", "key": "i", "hold": 542, "dt": 553}, {"kind": "key", "key": "o", "hold": 797, "dt": 889}], "dufeng": [{"kind": "key", "key": "d", "hold": 0, "dt": 0}, {"kind": "key", "key": "w", "hold": 621, "dt": 77}, {"kind": "key", "key": "d", "hold": 0, "dt": 1853}, {"kind": "key", "key": "w", "hold": 61, "dt": 48}, {"kind": "key", "key": "d", "hold": 0, "dt": 767}, {"kind": "key", "key": "w", "hold": 107, "dt": 239}, {"kind": "key", "key": "j", "hold": 0, "dt": 1702}, {"kind": "key", "key": "i", "hold": 0, "dt": 66}, {"kind": "key", "key": "i", "hold": 328, "dt": 611}, {"kind": "key", "key": "o", "hold": 958, "dt": 722}, {"kind": "key", "key": "k", "hold": 1457, "dt": 5261}, {"kind": "key", "key": "j", "hold": 426, "dt": 1671}, {"kind": "key", "key": "i", "hold": 1086, "dt": 1253}, {"kind": "key", "key": "k", "hold": 6379, "dt": 1251}, {"kind": "key", "key": "d", "hold": 0, "dt": 32555}, {"kind": "key", "key": "w", "hold": 446, "dt": 557}, {"kind": "key", "key": "w", "hold": 123, "dt": 947}, {"kind": "key", "key": "j", "hold": 0, "dt": 2057}, {"kind": "key", "key": "i", "hold": 0, "dt": 76}, {"kind": "key", "key": "i", "hold": 263, "dt": 648}, {"kind": "key", "key": "o", "hold": 1379, "dt": 699}, {"kind": "key", "key": "i", "hold": 2113, "dt": 5361}, {"kind": "key", "key": "j", "hold": 861, "dt": 2230}, {"kind": "key", "key": "i", "hold": 2692, "dt": 1699}, {"kind": "key", "key": "d", "hold": 973, "dt": 6121}, {"kind": "key", "key": "k", "hold": 416, "dt": 997}, {"kind": "key", "key": "k", "hold": 389, "dt": 1394}, {"kind": "key", "key": "j", "hold": 268, "dt": 912}, {"kind": "key", "key": "i", "hold": 772, "dt": 1616}, {"kind": "key", "key": "o", "hold": 136, "dt": 1443}], "leiting": [{"kind": "key", "key": "d", "hold": 0, "dt": 0}, {"kind": "key", "key": "w", "hold": 130, "dt": 438}, {"kind": "key", "key": "j", "hold": 0, "dt": 3239}, {"kind": "key", "key": "i", "hold": 511, "dt": 60}, {"kind": "key", "key": "k", "hold": 3712, "dt": 1454}, {"kind": "key", "key": "j", "hold": 662, "dt": 3810}, {"kind": "key", "key": "i", "hold": 1070, "dt": 1600}, {"kind": "key", "key": "o", "hold": 1088, "dt": 1199}]};

const SECRET_REALM_NAME_TEMPLATES = {"luoyan": "data:image/jpeg;base64,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", "dufeng": "data:image/jpeg;base64,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", "leiting": "data:image/jpeg;base64,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"};

const SECRET_REALM_NAME_REGION = [0.25, 0.01, 0.5, 0.18];

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
    keepAliveMin: 3,             // ⚠ 0.5.81 起**不再使用**（面板内轻点/短滑实测仍被判「无操作」超时）
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
    keepAlivePt: [360, 672],     // 轻点落点：面板底部空白（避开左下「返回」x≤140 与右下「换一组」x≥1097）
    keepAliveDrag: [408, 672, 312, 672],  // 单向短滑起终点（偶次保活用，96px 小位移）
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
      const drag = async (y) => {
        await ctx.op.swipe(325, y, 1117, y, 532);
        await Utils.sleep(1600);
        await ctx.op.swipe(301, y, 1017, y, 692);
        await Utils.sleep(1600);
      };
      try {
        await drag(MISSION.swipeY);
        await ctx.op.clickNatural(MISSION.entry[0], MISSION.entry[1], null, '打开集会所');
      } catch (e) { Utils.log('warn', `    ⚠ 进面板操作异常：${(e && e.message) || e}`); }
      await Utils.sleep(1800);   // 面板开启动画
      if (this.inPanel(ctx)) return true;
      Utils.log('warn', `    ⚠ 拖动 y=${MISSION.swipeY} + 入口 (${MISSION.entry.join(',')}) 没打开面板 → ` +
        `回主界面后换备用拖动 y=${MISSION.swipeYAlt} + 备用落点 (${MISSION.entryAlt.join(',')})`);
      try {
        await ctx.nav.goHome();
        await Utils.sleep(800);
        await drag(MISSION.swipeYAlt);
        await ctx.op.clickNatural(MISSION.entryAlt[0], MISSION.entryAlt[1], null, '打开集会所(备用)');
      } catch (e) { /* ignore */ }
      await Utils.sleep(1800);
      return this.inPanel(ctx);
    },

    /** 面板内保活：防云游戏长时间无操作超时断连。
     *  奇数次轻点面板底部空白；偶数次单向短滑 96px —— 点击/滑动两种输入都覆盖，
     *  避免某种事件不被云游戏客户端认作「有效操作」。
     *  两者都是**单个**操作（不再「滑出再滑回」，否则两次滑之间会多出一个 <1s 间隔，
     *  违反「任何操作间隔 ≥1s」的口径）。
     *  落点 (360,672) 在面板底部空白处：左下「返回」在 x≤140，右下「换一组」在 x≥1097。 */
    async keepAlive(ctx, n) {
      try {
        if (n % 2 === 1) {
          await ctx.op.clickNatural(MISSION.keepAlivePt[0], MISSION.keepAlivePt[1], null, '集会所保活');
          Utils.log('debug', `    💤 保活 #${n}：轻点 (${MISSION.keepAlivePt.join(',')})`);
        } else {
          const x1 = MISSION.keepAliveDrag[0], y1 = MISSION.keepAliveDrag[1];
          const x2 = MISSION.keepAliveDrag[2], y2 = MISSION.keepAliveDrag[3];
          await ctx.op.swipe(x1, y1, x2, y2, 300);
          Utils.log('debug', `    💤 保活 #${n}：短滑 (${x1},${y1})→(${x2},${y2})`);
        }
      } catch (e) { Utils.log('warn', `    ⚠ 保活操作异常：${(e && e.message) || e}`); }
      await Utils.sleep(1000);
    },

    /** 面板丢失后的恢复：先收弹窗/浮层，仍不在面板就回主界面重开。返回是否已回到面板 */
    async recover(ctx) {
      await this.clearPopups(ctx);
      if (this.inPanel(ctx)) return true;
      return await this.openPanel(ctx);
    },

    /** 在集会所面板内挂机 totalMs：每 keepAliveMin 分钟做一次保活操作，顺带检查面板是否还在。
     *  0.5.77：**不回主界面** —— 用户口径「挂机可以直接在任务集会所界面挂机，到时间就可以直接识别」。
     *  但云游戏长时间无操作会超时断连，所以按固定节奏续期。
     *  ⚠ **0.5.81 起不再调用**：用户实测面板内的轻点/短滑**仍被判「无操作」超时** →
     *  改为 `sleepAtHome`（回主界面等待 + 下轮重新进场）。保留此方法仅为回滚方便。 */
    async sleepInPanel(ctx, totalMs) {
      const KA = MISSION.keepAliveMin * 60000;
      let left = totalMs, n = 0;
      while (left > 0) {
        const seg = Math.min(left, KA);
        await this.sleepInterruptible(seg);
        left -= seg;
        if (left <= 0) break;
        await Runtime.check();
        n++;
        // 动手前先确认真在面板：万一被弹窗/浮层盖住，先收干净再点，避免点在弹窗按钮上
        const acted = await this.clearPopups(ctx);
        if (this.inPanel(ctx)) {
          await this.keepAlive(ctx, n);
        } else {
          Utils.log('warn', `    ⚠ 挂机第 ${n} 次检查：已不在集会所面板${acted ? '（刚清过弹窗）' : ''} → 尝试恢复`);
          const back = await this.recover(ctx);
          if (!back) Utils.log('warn', '    ⚠ 面板恢复失败，本轮剩余时间不再折腾（下轮重来）');
        }
      }
      Utils.log('debug', `    ⏱ 面板内挂机结束（期间保活 ${n} 次）`);
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
        { kind: 'drag', title: '主场景拖到最左（第一次）', detail: '横向匀速拖动 x 173→1589，y=360（见 COORDS.collect.rankDrags）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最左（第二次）', detail: '横向匀速拖动 x 211→1196，y=360（见 COORDS.collect.rankDrags）', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开排行榜', detail: '点「排行榜」入口', coord: [COORDS.collect.rankEntry.x, COORDS.collect.rankEntry.y], color: '88,166,255' },
        { kind: 'tap', title: '点赞', detail: '点「点赞」按钮；与上一步间隔 ≥2s（等榜单加载）', coord: [COORDS.collect.rankLike.x, COORDS.collect.rankLike.y], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: 'goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        // 0.5.76（用户反馈）：拖动/开页后立刻进行下一步，遇到加载延迟会点错位置 → 每步之间都补足间隔。
        //   ctx.drag / ctx.go / ctx.tap 自身收尾已有 delay.click(≥1s)，这里再按步骤补一段显式等待。
        for (const d of COORDS.collect.rankDrags) {
          await ctx.drag([d.x1, 360, d.x2, 360], null, null, null, 600, '主场景拖到最左');
          await Utils.sleep(1000);   // 等镜头滑停落位，再拖下一次
        }
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
        { kind: 'drag', title: '主场景拖到最右（第一次）', detail: '横向匀速拖动 x 152→951，y≈280（2026-09-16 录制实测）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最右（第二次）', detail: '横向匀速拖动 x 205→967，y≈300', coord: null, color: '88,166,255' },
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

        await ctx.drag([152, 278, 951, 279], null, null, null, 591, '主场景拖到最右');
        await ctx.drag([205, 290, 967, 303], null, null, null, 717, '主场景拖到最右');
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
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  2026-09-11 桌面校准 JSON 实测坐标：先两次拖动把主场景拉到最右，再进丰饶之间挑战；
       *  校准里的战斗录制部分（点击+键盘 a/d）改用脚本原 fight() 自动战斗逻辑 */
      steps: [
        { kind: 'drag', title: '主场景拖到最右（第一次）', detail: '横向匀速拖动 x 997→254，y=360（校准 y≈280，统一取中值）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最右（第二次）', detail: '横向匀速拖动 x 1007→95，y=360', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开丰饶之间', detail: '点「丰饶之间」入口 (364,423)', coord: [364, 423], color: '88,166,255' },
        { kind: 'tap', title: '点挑战', detail: '点「挑战」按钮 (546,645)', coord: [546, 645], color: '126,231,135' },
        { kind: 'check', title: '打完并结算', detail: 'fight() 等战斗结束 → 清结算 → 回主界面（超时 300s（含战斗））', coord: null, color: '248,81,73' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.drag([997, 360, 254, 360], null, null, null, 413, '主场景拖到最右');
        await ctx.drag([1007, 360, 95, 360], null, null, null, 742, '主场景拖到最右');
        await ctx.go([364, 423], null, '打开丰饶之间');
        await ctx.tap([546, 645], null, '点挑战');
        await ctx.fight();

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

        // 本周（周一为起点）已打次数，仅用于日志 + 视觉不可用时的兜底
        const d = new Date();
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        const weekKey = monday.getFullYear() + '-' + (monday.getMonth() + 1) + '-' + monday.getDate();

        const enterFromHome = async () => {
          await ctx.drag([1089, 296, -22, 359], null, null, null, 506, '主场景拖到最左');
          await ctx.drag([1051, 326, 171, 356], null, null, null, 595, '主场景拖到最左');
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
          const reason = await ctx.fight({ noHome: true });

          // ——— 关结算：结算页「点击任意位置关闭界面」，录制实测点 (1041,166)。
          // 0.5.69 修正： fight 可能因静止/超时提前返回，此时结算屏还没出来；
          // 必须先等 BATTLE_END（squadVictory 等结算探针）真正出现，再点关闭，
          // 并且点完后等结算页消失，否则下一把「挑战」会点在结算页上。
          if (reason !== 'timeout') {
            const settleShown = await ctx.scenes.waitFor(SCENE.BATTLE_END, 3500);
            if (settleShown) {
              ctx.step('关闭战斗结算'); ctx.stepResult(true);
              await ctx.tap([1041, 166], null, '关闭战斗结算');
              // 等结算页消失，避免「挑战/退出」点错
              await waitSceneGone(SCENE.BATTLE_END, 3500);
            } else {
              Utils.log('warn', '⚔️ 结算屏未在 3.5s 内出现，不点关闭（避免在战斗/房间页乱点）');
            }
          } else {
            Utils.log('warn', '⚔️ 战斗超时，跳过结算关闭');
          }

          Store.set('na_squadRaid', { week: weekKey, count: weekCount + 1 });
          Utils.log('info', `⚔️ 小队突袭 第 ${round}/${rounds} 场完成（${reason}）`);
        }

        // 全部打完 → 用 ctx.home() 稳健回主界面。0.5.69 修正：
        // 固定红✕ (1215,32) 在房间页/匹配页会误点成「挑战/进入」，导致默认开第三把，
        // 改用 goHome 走场景识别 + 盲按返回，不再依赖单一坐标。
        const sc = ctx.scenes.detect(false).scene;
        if (sc !== SCENE.HOME) {
          ctx.step('退出小队突袭'); ctx.stepResult(true);
          await ctx.home();
        }
        Utils.log('info', `⚔️ 小队突袭全部完成（${rounds} 场）`);
      },
    },

    {
      key: 'squadAssist', name: '小队突袭助战', category: 'daily', timeout: 180000,
      /** 流程图步骤声明（画面流程图 + 预览用；与下方 run 动作一一对应）
       *  数据来源：2026-09-13 用户录制「小队突袭助战.json」+「小队突袭助战2.json」（两段相连：
       *  前段进页面并领取，后段关页面离队）。逐帧核对后的语义：
       *    主场景拖到最左 ×2（同 squadRaid，入口在主场景右半屏）
       *    → 小队突袭 → 组织助战（底部右侧拳套图标）
       *    → 我的助战（底部「我的助战」）→ 助战忍者页点「领取」（底部 681,587，金币色）
       *    → 关「助战忍者」红✕ → 关「小队突袭」红✕ → 弹窗「是否确定要离开队伍?」点「确定」
       *  注：录制里的两次主场景拖动（x861→244 / x1002→296）与 squadRaid 的
       *      「拖到最左」完全同向，这里直接复用 squadRaid 已实测的参数（863→181 / 877→231）。
       *      收尾的「确定」(649,448)：无弹窗时该点落在角色立绘上（实测 RGB 50,59,56），无害。 */
      steps: [
        { kind: 'drag', title: '主场景拖到最左（第一次）', detail: '横向匀速拖动 x 863→181，y=360', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最左（第二次）', detail: '横向匀速拖动 x 877→231，y=360', coord: null, color: '88,166,255' },
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
        await ctx.drag([863, 360, 181, 360], null, null, null, 406, '主场景拖到最左');
        await ctx.drag([877, 360, 231, 360], null, null, null, 462, '主场景拖到最左');
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
        { kind: 'drag', title: '主场景拖到最左（第一次）', detail: '横向匀速拖动 x 974→227，y=360', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最左（第二次）', detail: '横向匀速拖动 x 1013→246，y=360', coord: null, color: '88,166,255' },
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
        await ctx.drag([974, 360, 227, 360], null, null, null, 497, '主场景拖到最左');
        await Utils.sleep(1000);    // 录制间隔 1.34s（含拖拽时长，补足）
        await ctx.drag([1013, 360, 246, 360], null, null, null, 569, '主场景拖到最左');
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
        { kind: 'drag', title: '主场景拖到最右（第一次）', detail: '横向匀速拖动 x 423→1357，y=360（仅第一局前走一次）', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖到最右（第二次）', detail: '横向匀速拖动 x 263→1287，y=360', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '打开角斗场', detail: '点「忍术对战」入口 (974,357)', coord: [974, 357], color: '88,166,255' },
        { kind: 'tap', title: '选对手/挑战', detail: '点 (315,637)；未自动续局时才重复这一步', coord: [315, 637], color: '126,231,135' },
        { kind: 'tap', title: '开始对战', detail: '点 (1165,629)', coord: [1165, 629], color: '210,153,34' },
        { kind: 'check', title: '打完一小局（识别「胜负已分」）', detail: '按住普攻 + 5s 轮询技能；金色横幅单拍强命中 或 连续 2 拍 = 落判（横幅只显示 0.3~1s）', coord: null, color: '248,81,73' },
        { kind: 'check', title: '6s 观察窗：自动续局 or 真打完', detail: '0.5.78：横幅后黑屏过场走完画面重新动起来 = 自动续局 → 立刻接着连招（不再固定空等 10s）', coord: null, color: '188,140,255' },
        { kind: 'check', title: '续下一局（不回主界面）', detail: '0.5.78：观察窗内画面一直不动才判本局结束 → 点「选对手→开始对战」；已自动续局时这两下落在战斗画面，无害', coord: null, color: '188,140,255' },
        { kind: 'check', title: '点得动自检 + 解卡', detail: '0.5.79：点「选对手/挑战」后画面必须变化，没反应 = 不在这界面上 → 试点候选「确定(1136,306)/(645,660) / 关闭 / 返回」解卡；仍不行 → 回主界面重进角斗场；连续 5 次失败即停手报错', coord: null, color: '248,81,73' },
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

        // ── 0.5.79：进场 / 续局全部改成「点一下 → 看画面变没变」的自检式操作 ──────────
        // 详见本任务顶部注释：旧实现对着固定两点盲点，点不到也继续点，于是卡住 + 点到别的页面。
        const enterArena = async (why) => {
          await ctx.drag([423, 360, 1357, 360], null, null, null, 340, '主场景拖到最右');
          await ctx.drag([263, 360, 1287, 360], null, null, null, 390, '主场景拖到最右');
          await ctx.go([974, 357], null, '打开角斗场');
          await Utils.sleep(2000);   // 角斗场加载
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

        // 0.5.78：忍术对战专用结算识别参数 —— 详见 waitForEnd 顶部注释（每个都对应一条实测证据）
        const FIGHT_OPTS = {
          noHome: true,             // 不回主界面，续局由本任务决定
          noDefeat: true,           // 不认「失败」探针（在「双方登场」画面必然误报，trace 21 帧全中）
          vsConfirm: 2,             // 横幅只显示 0.3~1s：连续 2 拍即落判（默认 3 拍会漏）
          strongBanner: true,       // 金色横幅单拍强命中（d≤20）直接落判 —— 本次 trace 1020 帧零误报
          blackWindowMs: 4000,      // 黑屏序列确认窗口 12s → 4s（12s 会把开场加载黑屏算进来）
          staticEndAfterMs: 40000,  // 开局 40s 内「画面静止」不判结束（登场画面会静止 4.5s+）
          stableEndFrames: 8,       // 静止 8 拍（≈2.4s）才算真的不在战斗（默认 3 拍太快）
          bannerGraceMs: 6000,      // 横幅后观察窗：画面恢复动态=自动续局 → 继续连招
          bannerRecencyMs: 30000,   // 近 30s 有横幅 → 允许静止判结束（战绩/入口页都是静止的）
          assistMaxMs: 300000,      // 单场连招上限 5min（默认 150s 会把长局截断 → "不按键"）
          maxWaitMs: 360000,        // 单场等待上限 6min
          // 0.5.79：画面连续静止 ≥20s 无条件兜底结束本场。实测卡在战后任务面板时画面
          //   像素级冻结（连拍 diff 0.0000~0.0012，阈值 0.012），而 battleStarted 闸让
          //   「静止=打完」永远走不到 → 一局白等 360s。正常过场（匹配/登场）冻结上限约 4.5s。
          staticBailMs: 20000,
          // 0.5.81：整场结束快通道 —— 本场 ≥25s 后出现全屏黑（BR<12）即判整场打完。
          //   实测：战斗中 BR≥100 /「小局切换」暗帧 14.0~22.3 /「整场结束」暗帧 1.3~5.3。
          //   用户反馈的「7m32s~7m33s 战斗结束没识别到」= 那两拍 BR 5.3 / 1.3，本次直接落判（不再等 20s 兜底）。
          darkEndAfterMs: 25000,
        };
        for (let round = 1; round <= rounds; round++) {
          ctx.log(`—— 角斗场第 ${round}/${rounds} 局 ——`);
          ctx.op.releaseHold();

          // ①「选对手/挑战」必须真的点得动：没反应 = 画面根本不在角斗场房间页 → 解卡后重试
          let opened = false;
          for (let a = 0; a < 5 && !opened; a++) {
            if (await tapAndDiff(315, 637, '选对手/挑战', 2000, a === 0)) { opened = true; break; }
            await unstuck(`第 ${a + 1} 次点「选对手/挑战」画面没反应（多半不在角斗场房间页）`);
          }
          if (!opened) {
            Utils.log('warn', '    ✗ 连续 5 次都点不动「选对手/挑战」，结束本任务（不再盲点乱点）');
            break;
          }

          // ②「开始对战」同样自检
          if (!(await tapAndDiff(1165, 629, '开始对战', 2500, true))) {
            await unstuck('点「开始对战」画面没反应');
            continue;
          }

          const t0 = Date.now();
          const reason = await ctx.fight(FIGHT_OPTS);   // 横幅(含观察窗) / 静止 / 冻结兜底 / 超时
          Utils.log('info', `⚔️ 角斗场 第 ${round}/${rounds} 局打完（本局耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 结束原因 ${reason}）`);
          if (round >= rounds) break;

          // ③ 战后处置（0.5.81 改）
          //   · 'darkend'（整场黑屏过场）/ 'frozen'（静止兜底）/ 'timeout' 这三种都表示
          //     「本场不是靠胜负横幅正常收尾」—— 游戏一定在走「战绩 → 黑屏 → 奖励浮层 → 任务面板」
          //     那串页面，脚本并不知道自己停在哪一页。
          //     旧做法是让**下一轮**的「选对手」自检去发现（再逐个试 8 个解卡落点），
          //     但那些点击本身就可能把面板/别的页面点开。现在不猜：**直接回主界面，重新拖屏进场**。
          //   · 'settlement'（横幅+观察窗正常收尾）时角斗场通常停在房间页 → 保持原节奏，下一轮直接选对手。
          const churn = await ctx.waitQuiet(1200, 3);
          Utils.log('info', `    · 战后静默检查：期间画面重新变动 ${churn} 次`);
          if (reason !== 'settlement') {
            ctx.op.releaseHold();
            await Utils.sleep(1500);          // 让结算/奖励动画再走一会儿，别和它抢
            if (await ctx.nav.goHome()) {
              Utils.log('info', `    ↻ 结束原因 ${reason} → 已回主界面，重新进场`);
              await enterArena(`第 ${round} 局（${reason}）后重进`);
            } else {
              Utils.log('warn', '    ⚠ 回主界面未成功 → 交给下一轮的「点得动自检 + 解卡」处理（不在这里盲点）');
            }
          }
          await Utils.sleep(800);
        }
        await ctx.battle.clearSettlement();
        await ctx.home();
      }
    },

    {
      key: 'secretRealm', name: '秘境挑战', category: 'battle', timeout: 600000,
      /** 0.5.71：完全重制。流程：导航进入秘境匹配 → 点匹配 → 进战斗识别顶部秘境名
       *  → 非落岩/毒风/雷霆则点「退出战斗」重匹配 → 目标秘境点「继续战斗」→
       *  1:1 复刻对应录制战斗按键 → 等待战斗结束（单局总限时 2 分钟）→ 结算回主界面。
       *  超时未结束判定卡住，回主界面重来。 */
      steps: [
        { kind: 'check', title: '导航到秘境匹配', detail: '用 秘境探险.json 录制导航进入匹配界面', coord: null, color: '88,166,255' },
        { kind: 'check', title: '点匹配进战斗', detail: '点系统匹配/挑战，等待战斗入口', coord: [1165, 587], color: '126,231,135' },
        { kind: 'check', title: '识别秘境名称', detail: '顶部中央名称模板匹配：落岩/毒风/雷霆', coord: null, color: '188,140,255' },
        { kind: 'check', title: '非目标退出重匹', detail: '点「退出战斗」(430,500) 返回匹配界面', coord: [430, 500], color: '248,81,73' },
        { kind: 'check', title: '目标继续战斗', detail: '点「继续战斗」(850,500) 开始 1:1 按键回放', coord: [850, 500], color: '126,231,135' },
        { kind: 'check', title: '结算回主界面', detail: '等战斗结束 → 清结算 → 回主界面（单局 2 分钟超时）', coord: null, color: '210,153,34' },
      ],
      async run(ctx) {
        await ctx.flow(this);
        const MAX_OUTER = 5;
        const MAX_INNER = 12;
        const BATTLE_TIMEOUT = 120000;
        const EXIT_BATTLE = SECRET_REALM_EXIT_BATTLE;
        const CONTINUE_BATTLE = SECRET_REALM_CONTINUE_BATTLE;
        const CHALLENGE = SECRET_REALM_CHALLENGE;

        for (let outer = 0; outer < MAX_OUTER; outer++) {
          await Runtime.check();
          await ctx.home();
          Utils.log('info', `🌀 秘境挑战 外层 ${outer + 1}/${MAX_OUTER}：回主界面→导航`);
          await ctx.replaySeq(SECRET_REALM_NAV, { label: '进入秘境匹配' });

          for (let inner = 0; inner < MAX_INNER; inner++) {
            await Runtime.check();
            Utils.log('info', `  内层 ${inner + 1}/${MAX_INNER}：点匹配`);
            await ctx.op.tap(CHALLENGE[0], CHALLENGE[1]);
            await Utils.sleep(2500);

            const realm = await ctx.identifyRealmName();
            if (!realm) {
              Utils.log('warn', '  未识别秘境名，回主界面重新开始');
              break;
            }

            if (realm !== 'luoyan' && realm !== 'dufeng' && realm !== 'leiting') {
              Utils.log('info', `  非目标秘境 ${realm}，点退出战斗重匹配`);
              await ctx.op.tap(EXIT_BATTLE[0], EXIT_BATTLE[1]);
              await Utils.sleep(1500);
              continue;
            }

            Utils.log('info', `  ✅ 目标秘境 ${realm}，继续战斗`);
            await ctx.op.tap(CONTINUE_BATTLE[0], CONTINUE_BATTLE[1]);
            await Utils.sleep(1000);
            const macro = SECRET_REALM_MACROS[realm];
            const battleStart = Date.now();
            await ctx.replaySeq(macro, { label: `${realm} 战斗回放` });

            const elapsed = Date.now() - battleStart;
            const remaining = BATTLE_TIMEOUT - elapsed;
            let result = 'timeout';
            if (remaining > 3000) {
              const oldMax = ctx.cfg.num('battle.maxWait') || 180000;
              ctx.cfg.set('battle.maxWait', remaining);
              try {
                result = await ctx.battle.waitForEnd();
              } catch (e) {
                Utils.log('warn', `  waitForEnd 异常: ${e.message}`);
              } finally {
                ctx.cfg.set('battle.maxWait', oldMax);
              }
            }
            if (result === 'timeout') {
              Utils.log('warn', '  战斗未在 2 分钟内结束，判定卡住，回主界面重来');
              await ctx.home();
              break;
            }

            Utils.log('info', '  战斗结束，清理结算');
            await ctx.battle.clearSettlement();
            await ctx.home();
            return;
          }
        }
        throw new Error('秘境挑战超过最大重试次数');
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
        { kind: 'drag', title: '主场景拖动（第一次）', detail: '横向拖动 (300,290)→(1118,276)，271ms', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景拖动（第二次）', detail: '横向拖动 (275,293)→(1013,316)，290ms', coord: null, color: '88,166,255' },
        { kind: 'tap', title: '点「积分赛」入口', detail: '点首页「积分」入口 (548,166)；进入后段位奖励自动领取', coord: [548, 166], color: '126,231,135' },
        { kind: 'check', title: '回主界面', detail: '等自动领取完成 → goHome 每轮截图识别场景', coord: null, color: '188,140,255' },
      ],
      async run(ctx) {
        await ctx.flow(this);   // 展开画面流程图（读本任务 steps）
        await ctx.drag([300, 290, 1118, 276], null, null, null, 271, '主场景拖动（第一次）');
        await Utils.sleep(1000);   // 校准间隔 1.12s
        await ctx.drag([275, 293, 1013, 316], null, null, null, 290, '主场景拖动（第二次）');
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
        { kind: 'drag', title: '主场景向左拖（第一次）', detail: '横向拖动 1033,274 → 120,310', coord: null, color: '88,166,255' },
        { kind: 'drag', title: '主场景向左拖（第二次）', detail: '横向拖动 965,304 → 306,304', coord: null, color: '88,166,255' },
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
        await ctx.drag([1033, 274, 120, 310], null, null, null, 670, '主场景向左拖');
        await ctx.drag([965, 304, 306, 304], null, null, null, 600, '主场景向左拖');
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
        { kind: 'check', title: '确保在集会所面板', detail: '已在面板内就直接继续（不回主界面）；不在才 回主界面→两段拖动(325→1117 / 301→1017)→点入口 (545,466)，失败再试备用落点 (591,480)', coord: null, color: '188,140,255' },
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
      //  0.5.56 新增 battle（战斗）分类，排在周常之后：秘境/忍术对战单场耗时长（忍术 15 连最多 90 min），
      //   放最后，避免长战斗把前面的短任务挤掉。
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

          // 失败后强制回主界面，避免带错误状态进下一个任务
          try { await this.ctx.nav.goHome(); } catch (e) { /* ignore */ }
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
      this.logs = [];
      this.maxLogs = 80;
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
            <button class="btn" id="na-keychk">⌨ 键盘自检</button>
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
          <div class="sec"><div class="st">日志</div><div class="la" id="na-log"></div></div>
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

      // ⌨ 键盘自检：列通道 → 实发一次 k → **用画面差异客观判断生效与否**（不再靠肉眼数角色动没动）
      // 用法：进战斗后再点。主界面按 k 本来就没反应，测不出结论（脚本会提示你）
      p.querySelector('#na-keychk').onclick = async () => {
        try {
          const sdk = this.app && this.app.sdk;
          if (!sdk) { this.addLog('e', '键盘自检失败：SDK 未绑定'); return; }
          this.addLog('i', '⌨ 键盘自检开始…（约 1 秒出结果，期间别切窗口）');
          if (!sdk.ready) sdk.rescan();
          const info = sdk.keyChannels ? sdk.keyChannels() : { sdk: sdk.name, ready: sdk.ready, channels: [] };
          this.addLog('i', `⌨ SDK=${info.sdk || '无'} ready=${info.ready} 键盘通道=[${info.channels.join(', ') || '无'}]`);
          if ((info.extra || []).length) this.addLog('i', `⌨ SDK 上其它键盘方法=[${info.extra.join(', ')}]`);
          if (!info.channels.length) {
            this.addLog('w', '⌨ SDK 未暴露任何键盘方法 → 只能走 DOM 派发（云游戏基本无效）；请把这行日志发我，我加针对性通道');
          }
          // 场景提示：只有战斗中才看得出按键效果
          let sceneKey = '';
          try { const r = this.app.scenes.detect(false); sceneKey = r.scene; } catch (e) {}
          const inBattle = sceneKey === SCENE.BATTLE;
          this.addLog('i', `⌨ 当前场景=${SCENE_LABELS[sceneKey] || sceneKey || '未知'}` +
            (inBattle ? '' : '（非战斗：只有战斗中按键才看得出效果）'));
          // 发键前后对比画面差异 → 客观结论
          const REGION = [420, 160, 900, 560];
          const vis = this.app.vision;
          let diff = -1;
          try { vis.snapshot(REGION); } catch (e) {}
          const ok = sdk.key('k', null, 200, true);
          const ls = sdk.lastSend || {};
          this.addLog('i', `⌨ 已发 k：sent=${ok} tried=[${(ls.tried || []).join(' ')}]`);
          await Utils.sleep(1000);
          try { diff = vis.frameDiff(REGION); } catch (e) {}
          if (diff < 0) {
            this.addLog('i', '⌨ 画面差异取不到（视觉未启用）→ 只能自己看角色有没有出拳');
          } else {
            this.addLog('i', `⌨ 发键前后画面差异=${(diff * 100).toFixed(1)}%`);
            if (!inBattle) {
              this.addLog('w', '⌨ 当前不在战斗中 → 这个差异证明不了按键生效，请进战斗后再点一次');
            } else if (diff > 0.02) {
              this.addLog('i', '⌨ ✅ 画面有明显变化 → 按键大概率已生效');
            } else {
              this.addLog('w', '⌨ ⚠ 画面几乎没变化 → 按键大概率无效，把上面三行日志发我');
            }
          }
        } catch (e) { this.addLog('e', '键盘自检异常: ' + (e.message || e)); }
      };

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

    addLog(level, text) {
      const area = this.panel && this.panel.querySelector('#na-log');
      if (!area) return;
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const cls = level === 'error' ? 'e' : level === 'warn' ? 'w' : level === 'success' ? 's' : 'i';
      this.logs.push(`<span class="${cls}">[${ts}] ${text}</span>`);
      if (this.logs.length > this.maxLogs) this.logs.shift();
      area.innerHTML = this.logs.join('<br>');
      area.scrollTop = area.scrollHeight;
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
      this.nav = new Navigator(this.op, this.scenes, this.config);
      this.battle = new BattleFlow(this.op, this.scenes, this.nav, this.vision, this.config);
      this.progress = new Progress(this.config);
      this.calib = new Calibrator(this.vision, this.scenes);
      this.calib.bind(this);
      this.trace = AutoTrace;
      this.trace.bind(this);
      this.ctx = new TaskContext(this.op, this.config, this.nav, this.scenes, this.battle, this.progress, this.vision);
      this.scheduler = new TaskScheduler(this.ctx, this.config, this.progress);
      this.panel = new ControlPanel(this);
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
        probe() { const r = this.scenes.detect(true); console.log('场景:', r.scene, '亮度:', r.brightness); return r; },
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
