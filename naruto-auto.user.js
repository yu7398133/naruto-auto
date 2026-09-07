// ==UserScript==
// @name         火影忍者云游戏自动化
// @namespace    https://github.com/yu7398133/naruto-auto
// @version      0.2.0
// @description  基于TCGSDK的火影忍者手游云游戏自动化脚本
// @author       naruto-auto
// @match        https://start.qq.com/*
// @match        https://gamer.qq.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_log
// @grant        GM_cookie
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  //  常量
  // ============================================================
  const VERSION = '0.2.0';
  const BASE_W = 1280;
  const BASE_H = 720;
  const STORAGE_PREFIX = 'naruto_auto_';

  // ============================================================
  //  Utils — 工具函数
  // ============================================================
  const Utils = {
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    random(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randomDelay(min, max) {
      return this.sleep(this.random(min, max));
    },

    log(level, ...args) {
      const ts = new Date().toLocaleTimeString();
      const prefix = `[NarutoAuto][${ts}]`;
      const fn = level === 'error' ? console.error :
                 level === 'warn' ? console.warn : console.log;
      fn(prefix, ...args);
      // 推送到 UI 日志
      if (window.__narutoAuto?.panel) {
        window.__narutoAuto.panel.addLog(level, args.join(' '));
      }
    },

    async waitFor(fn, timeout = 10000, interval = 500) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const result = fn();
          if (result) return result;
        } catch (e) { /* ignore */ }
        await this.sleep(interval);
      }
      throw new Error(`waitFor timeout (${timeout}ms)`);
    },

    formatDuration(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}分${s % 60}秒`;
    },

    clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }
  };

  // ============================================================
  //  Config — 配置管理
  // ============================================================
  const DEFAULT_CONFIG = {
    version: VERSION,
    baseResolution: { width: BASE_W, height: BASE_H },
    delay: {
      click:     { min: 400, max: 800 },
      pageLoad:  { min: 2000, max: 4000 },
      battle:    { min: 30000, max: 120000 },
      short:     { min: 600, max: 1200 },
      long:      { min: 3000, max: 6000 },
      popup:     { min: 800, max: 1500 },
    },
    retry: { maxAttempts: 3, interval: 2000 },
    sceneTimeout: 15000,    // 场景切换超时
    autoDismissPopup: true, // 自动关闭弹窗
    taskSwitches: {
      // 每日收获
      collectGold: true, collectMail: true, collectSign: true,
      shareDaily: true, sendStamina: true, collectIntel: true,
      collectRank: true, collectActive: true, collectNinjutsu: true,
      recruit: true,
      // 每日任务
      squadRaid: true, abundanceRoom: true, orgBlessing: true,
      survivalTrial: true, equipSweep: true, missionHall: true,
      secretRealm: true, shopBuy: true,
      // 周常
      roadOfPractice: false, chaseAkatsuki: false, rebelNinja: false,
      orgFortress: false, heavenEarth: false,
    },
    debug: false,
  };

  class Config {
    constructor() {
      this.data = this._load();
    }

    _load() {
      try {
        const saved = GM_getValue(STORAGE_PREFIX + 'config', null);
        if (saved) return this._merge(structuredClone(DEFAULT_CONFIG), JSON.parse(saved));
      } catch (e) {
        Utils.log('warn', '配置加载失败，使用默认值', e);
      }
      return structuredClone(DEFAULT_CONFIG);
    }

    save() {
      GM_setValue(STORAGE_PREFIX + 'config', JSON.stringify(this.data));
    }

    _merge(base, over) {
      for (const k of Object.keys(over)) {
        if (over[k] !== undefined && over[k] !== null) {
          if (typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k]) {
            this._merge(base[k], over[k]);
          } else {
            base[k] = over[k];
          }
        }
      }
      return base;
    }

    get(path) {
      return path.split('.').reduce((o, k) => o?.[k], this.data);
    }

    set(path, value) {
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((o, k) => o[k], this.data);
      target[last] = value;
      this.save();
    }

    reset() {
      this.data = structuredClone(DEFAULT_CONFIG);
      this.save();
    }
  }

  // ============================================================
  //  CookieManager — 登录态管理
  // ============================================================
  class CookieManager {
    constructor() {
      this.loginChecked = false;
      this.isLoggedIn = false;
    }

    /**
     * 检查是否已登录（通过检测页面特征）
     */
    checkLoginState() {
      // 检测常见登录态标志
      const hasCookie = document.cookie.includes('uin') ||
                        document.cookie.includes('skey') ||
                        document.cookie.includes('pskey');

      // 检测页面是否有游戏入口（而非登录按钮）
      const hasLoginBtn = document.querySelector('[class*="login"]') ||
                          document.querySelector('[class*="Login"]') ||
                          document.querySelector('button')?.textContent?.includes('登录');

      this.isLoggedIn = hasCookie && !hasLoginBtn;
      this.loginChecked = true;

      Utils.log('info', `登录态检测: ${this.isLoggedIn ? '已登录' : '未登录'} (Cookie: ${hasCookie}, 登录按钮: ${!!hasLoginBtn})`);
      return this.isLoggedIn;
    }

    /**
     * 显示登录提醒
     */
    showLoginAlert() {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;
        background:rgba(0,0,0,0.8);z-index:999998;
        display:flex;align-items:center;justify-content:center;
      `;
      overlay.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #e94560;border-radius:16px;padding:40px;text-align:center;max-width:400px">
          <h2 style="color:#e94560;margin-bottom:16px">⚠️ 需要登录</h2>
          <p style="color:#ccc;margin-bottom:20px;font-size:14px">
            检测到未登录状态，请先手动登录云游戏平台。
            <br>登录后刷新页面即可自动运行。
          </p>
          <button onclick="location.reload()" style="
            padding:10px 30px;background:#e94560;color:#fff;
            border:none;border-radius:8px;cursor:pointer;font-size:14px
          ">🔄 刷新页面</button>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    /**
     * 等待登录完成
     */
    async waitForLogin(maxWait = 120000) {
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        if (this.checkLoginState()) return true;
        await Utils.sleep(3000);
      }
      return false;
    }
  }

  // ============================================================
  //  SceneDetector — 场景检测
  // ============================================================
  const SCENES = {
    UNKNOWN:    'unknown',
    LOADING:    'loading',
    HOME:       'home',        // 主界面
    ADVENTURE:  'adventure',   // 冒险界面
    BATTLE:     'battle',      // 战斗中
    BATTLE_END: 'battle_end',  // 战斗结束
    POPUP:      'popup',       // 弹窗
    SHOP:       'shop',        // 商店
    RESULT:     'result',      // 结算界面
  };

  class SceneDetector {
    constructor() {
      this.currentScene = SCENES.UNKNOWN;
      this.lastCheck = 0;
      this.checkInterval = 2000; // 每 2s 检测一次
    }

    /**
     * 检测当前场景
     * 基于 TCGSDK 截图 + 像素特征判断
     * 注意：需要 TCGSDK 支持截图 API，否则降级为延时判断
     */
    async detect(operator) {
      const now = Date.now();
      if (now - this.lastCheck < this.checkInterval) return this.currentScene;
      this.lastCheck = now;

      // 如果 SDK 不支持截图，返回 UNKNOWN
      if (!operator.sdk) return SCENES.UNKNOWN;

      try {
        // 尝试通过 SDK 获取画面信息
        // TCGSDK 部分版本支持 getVideoFrame / screenshot
        const sdk = operator.sdk;

        // 降级方案：根据操作结果推断场景
        // 这里先返回 UNKNOWN，由具体任务自己判断
        return SCENES.UNKNOWN;
      } catch (e) {
        return SCENES.UNKNOWN;
      }
    }

    /**
     * 等待进入指定场景
     */
    async waitForScene(targetScene, operator, timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const scene = await this.detect(operator);
        if (scene === targetScene) return true;
        await Utils.sleep(1000);
      }
      return false;
    }

    /**
     * 判断是否在主界面（通过检测特定 UI 元素位置的像素颜色）
     */
    isHomeScreen() {
      // 降级：总是返回 true，由任务流程保证
      return true;
    }
  }

  // ============================================================
  //  PopupHandler — 弹窗处理
  // ============================================================
  class PopupHandler {
    constructor(operator, config) {
      this.op = operator;
      this.config = config;
      this.knownPopups = [
        // 已知弹窗的关闭按钮坐标 (基于 1280x720)
        { name: '活动弹窗', close: { x: 1200, y: 80 } },
        { name: '公告弹窗', close: { x: 960, y: 100 } },
        { name: '签到弹窗', close: { x: 640, y: 550 } },
        { name: '奖励弹窗', close: { x: 640, y: 500 } },
        { name: '通用关闭', close: { x: 1230, y: 40 } },
        { name: '通用确认', close: { x: 640, y: 500 } },
      ];
    }

    /**
     * 尝试关闭所有可能的弹窗
     */
    async dismissAll() {
      if (!this.config.get('autoDismissPopup')) return;

      Utils.log('debug', '尝试关闭弹窗...');
      for (const popup of this.knownPopups) {
        await this.op.clickNatural(popup.close.x, popup.close.y, 8);
        await Utils.randomDelay(
          this.config.get('delay.popup.min'),
          this.config.get('delay.popup.max')
        );
      }
    }

    /**
     * 快速关闭（只点最关键的几个位置）
     */
    async dismissQuick() {
      await this.op.clickNatural(1230, 40, 5);   // 右上角 X
      await Utils.sleep(300);
      await this.op.clickNatural(640, 500, 5);   // 中央确认
      await Utils.sleep(300);
    }
  }

  // ============================================================
  //  CoordRecorder — 坐标录制器
  // ============================================================
  class CoordRecorder {
    constructor() {
      this.recording = false;
      this.recorded = [];
      this.overlay = null;
    }

    start() {
      this.recording = true;
      this.recorded = [];
      this._createOverlay();
      this._bindClick();
      Utils.log('info', '🎯 坐标录制模式已开启 - 点击画面记录坐标');
    }

    stop() {
      this.recording = false;
      this._removeOverlay();
      this._unbindClick();
      Utils.log('info', `🎯 坐标录制结束，共记录 ${this.recorded.length} 个点`);
      return this.recorded;
    }

    _createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.style.cssText = `
        position:fixed;top:10px;left:50%;transform:translateX(-50%);
        background:rgba(233,69,96,0.9);color:#fff;padding:8px 20px;
        border-radius:20px;font-size:13px;z-index:999999;
        font-family:'Microsoft YaHei',sans-serif;pointer-events:none;
      `;
      this.overlay.textContent = '🎯 录制中... 点击画面记录坐标 | Esc 退出';
      document.body.appendChild(this.overlay);
    }

    _removeOverlay() {
      this.overlay?.remove();
      this.overlay = null;
    }

    _onCanvasClick = (e) => {
      if (!this.recording) return;
      // 获取相对于游戏画面的坐标
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * BASE_W / rect.width);
      const y = Math.round((e.clientY - rect.top) * BASE_H / rect.height);

      const name = prompt(`记录坐标 (${x}, ${y})\n请输入名称 (如: main.adventure):`, `point_${this.recorded.length}`);
      if (name) {
        this.recorded.push({ name, x, y });
        Utils.log('info', `  📍 ${name}: (${x}, ${y})`);
      }
    }

    _onKeyDown = (e) => {
      if (e.key === 'Escape' && this.recording) {
        this.stop();
      }
    }

    _bindClick() {
      document.addEventListener('click', this._onCanvasClick, true);
      document.addEventListener('keydown', this._onKeyDown);
    }

    _unbindClick() {
      document.removeEventListener('click', this._onCanvasClick, true);
      document.removeEventListener('keydown', this._onKeyDown);
    }

    /**
     * 导出为 JS 代码
     */
    exportJS() {
      if (this.recorded.length === 0) return '// 没有录制到坐标';
      const groups = {};
      this.recorded.forEach(m => {
        const parts = m.name.split('.');
        const g = parts.length > 1 ? parts[0] : 'misc';
        const k = parts.length > 1 ? parts.slice(1).join('.') : parts[0];
        if (!groups[g]) groups[g] = [];
        groups[g].push({ key: k, x: m.x, y: m.y });
      });
      let code = '// === 录制的坐标 ===\n';
      for (const [g, items] of Object.entries(groups)) {
        code += `COORDS.${g} = {\n`;
        items.forEach(i => { code += `  ${i.key}: { x: ${i.x}, y: ${i.y} },\n`; });
        code += '};\n';
      }
      return code;
    }
  }

  // ============================================================
  //  GameOperator — TCGSDK 操作封装
  // ============================================================
  class GameOperator {
    constructor() {
      this.sdk = null;
      this.ready = false;
    }

    /**
     * 初始化 TCGSDK（多路径检测）
     */
    async init() {
      Utils.log('info', '正在初始化 TCGSDK...');

      // 尝试多种方式获取 SDK
      const attempts = [
        () => window.TCGSDK,
        () => window.top?.TCGSDK,
        () => window.frames[0]?.TCGSDK,
        () => document.querySelector('iframe')?.contentWindow?.TCGSDK,
      ];

      // 等待 SDK 加载（最多 30s）
      try {
        const sdk = await Utils.waitFor(() => {
          for (const get of attempts) {
            try {
              const s = get();
              if (s && typeof s.sendMouseEvent === 'function') return s;
            } catch (e) { /* cross-origin */ }
          }
          return null;
        }, 30000, 1000);

        this.sdk = sdk;
        this.ready = true;
        Utils.log('info', '✓ TCGSDK 初始化成功');
        return true;
      } catch (e) {
        Utils.log('error', '✗ TCGSDK 未找到，30s 超时');
        Utils.log('info', '提示：请确认已进入云游戏页面（游戏画面可见）');
        return false;
      }
    }

    assertReady() {
      if (!this.ready || !this.sdk) throw new Error('TCGSDK 未初始化');
    }

    /**
     * 获取 canvas 当前尺寸
     */
    _getCanvasSize() {
      const canvas = document.querySelector('canvas');
      return {
        w: canvas?.width || window.innerWidth,
        h: canvas?.height || window.innerHeight,
      };
    }

    /**
     * 坐标缩放
     */
    _scale(x, y) {
      const { w, h } = this._getCanvasSize();
      return {
        x: Math.round(x * w / BASE_W),
        y: Math.round(y * h / BASE_H),
      };
    }

    /**
     * 点击
     */
    async click(x, y, button = 'left') {
      this.assertReady();
      const s = this._scale(x, y);
      const btn = button === 'right' ? 2 : 0;

      this.sdk.sendMouseEvent({ type: 'mousedown', x: s.x, y: s.y, button: btn });
      await Utils.sleep(Utils.random(30, 80));
      this.sdk.sendMouseEvent({ type: 'mouseup', x: s.x, y: s.y, button: btn });

      Utils.log('debug', `click(${x},${y}) → (${s.x},${s.y})`);
    }

    /**
     * 自然点击（带随机偏移）
     */
    async clickNatural(x, y, radius = 5) {
      const ox = x + Utils.random(-radius, radius);
      const oy = y + Utils.random(-radius, radius);
      await this.click(Math.round(ox), Math.round(oy));
    }

    /**
     * 连续点击
     */
    async clickMultiple(x, y, count = 2, interval = 300) {
      for (let i = 0; i < count; i++) {
        await this.clickNatural(x, y);
        if (i < count - 1) await Utils.sleep(interval);
      }
    }

    /**
     * 滑动
     */
    async swipe(x1, y1, x2, y2, duration = 500) {
      this.assertReady();
      const s1 = this._scale(x1, y1);
      const s2 = this._scale(x2, y2);
      const steps = Math.max(5, Math.floor(duration / 30));
      const dx = (s2.x - s1.x) / steps;
      const dy = (s2.y - s1.y) / steps;

      this.sdk.sendRawEvent({
        type: 'touchstart',
        touches: [{ identifier: 0, x: s1.x, y: s1.y }],
      });

      for (let i = 1; i <= steps; i++) {
        await Utils.sleep(duration / steps);
        this.sdk.sendRawEvent({
          type: 'touchmove',
          touches: [{ identifier: 0, x: Math.round(s1.x + dx * i), y: Math.round(s1.y + dy * i) }],
        });
      }

      this.sdk.sendRawEvent({
        type: 'touchend',
        changedTouches: [{ identifier: 0, x: s2.x, y: s2.y }],
      });

      Utils.log('debug', `swipe(${x1},${y1})→(${x2},${y2})`);
    }

    /**
     * 按键
     */
    async keyPress(key) {
      this.assertReady();
      this.sdk.sendKeyboardEvent({ type: 'keydown', key });
      await Utils.sleep(50);
      this.sdk.sendKeyboardEvent({ type: 'keyup', key });
    }

    /**
     * 长按
     */
    async longPress(x, y, duration = 1000) {
      this.assertReady();
      const s = this._scale(x, y);
      this.sdk.sendMouseEvent({ type: 'mousedown', x: s.x, y: s.y, button: 0 });
      await Utils.sleep(duration);
      this.sdk.sendMouseEvent({ type: 'mouseup', x: s.x, y: s.y, button: 0 });
    }
  }

  // ============================================================
  //  TaskScheduler — 任务调度器
  // ============================================================
  class TaskScheduler {
    constructor(operator, config, popupHandler) {
      this.op = operator;
      this.config = config;
      this.popupHandler = popupHandler;
      this.queue = [];
      this.running = false;
      this.paused = false;
      this.current = null;
      this.history = [];
      this.listeners = {};
    }

    on(event, fn) {
      (this.listeners[event] ??= []).push(fn);
    }

    emit(event, data) {
      (this.listeners[event] || []).forEach(fn => {
        try { fn(data); } catch (e) { Utils.log('error', 'event cb error:', e); }
      });
    }

    addTask(task) {
      this.queue.push(task);
      this.emit('taskAdded', task);
    }

    addTasks(tasks) {
      tasks.forEach(t => this.addTask(t));
    }

    async start() {
      if (this.running) return;
      this.running = true;
      this.paused = false;
      this.emit('start', { total: this.queue.length });
      Utils.log('info', `▶ 开始执行，共 ${this.queue.length} 个任务`);

      while (this.queue.length > 0 && this.running) {
        if (this.paused) { await Utils.sleep(1000); continue; }

        const task = this.queue.shift();
        this.current = task;
        this.emit('taskStart', task);

        try {
          task.status = 'running';
          task.startTime = Date.now();
          Utils.log('info', `▶ [${task.name}] 开始`);

          await this._execWithRetry(task);

          task.status = 'done';
          task.endTime = Date.now();
          this.history.push({ ...task, result: 'success' });
          this.emit('taskDone', task);
          Utils.log('info', `✓ [${task.name}] 完成 (${Utils.formatDuration(task.endTime - task.startTime)})`);

        } catch (err) {
          task.status = 'failed';
          task.error = err.message;
          task.endTime = Date.now();
          this.history.push({ ...task, result: 'failed' });
          this.emit('taskFailed', { task, error: err });
          Utils.log('error', `✗ [${task.name}] 失败: ${err.message}`);
        }

        this.current = null;

        // 任务间延时 + 自动关闭弹窗
        if (this.queue.length > 0) {
          await this.popupHandler.dismissQuick();
          await Utils.randomDelay(
            this.config.get('delay.short.min'),
            this.config.get('delay.short.max')
          );
        }
      }

      this.running = false;
      const success = this.history.filter(h => h.result === 'success').length;
      const failed = this.history.filter(h => h.result === 'failed').length;
      this.emit('complete', { total: this.history.length, success, failed });
      Utils.log('info', `🏁 全部完成！成功 ${success}，失败 ${failed}`);
    }

    async _execWithRetry(task) {
      const max = this.config.get('retry.maxAttempts') || 3;
      const interval = this.config.get('retry.interval') || 2000;

      for (let i = 1; i <= max; i++) {
        try {
          await task.execute(this.op, this.config, this.popupHandler);
          return;
        } catch (err) {
          if (i < max) {
            Utils.log('warn', `  [${task.name}] 第${i}次失败，${interval}ms 后重试...`);
            await Utils.sleep(interval);
            // 重试前先关闭弹窗回到主界面
            await this.popupHandler.dismissAll();
          } else {
            throw err;
          }
        }
      }
    }

    pause()  { this.paused = true;  this.emit('pause', {}); }
    resume() { this.paused = false; this.emit('resume', {}); }
    stop()   { this.running = false; this.paused = false; this.queue = []; this.emit('stop', {}); }

    getStatus() {
      return {
        running: this.running,
        paused: this.paused,
        current: this.current?.name || null,
        queueLen: this.queue.length,
        done: this.history.filter(h => h.result === 'success').length,
        failed: this.history.filter(h => h.result === 'failed').length,
      };
    }
  }

  // ============================================================
  //  COORDS — 坐标定义 (基于 1280x720)
  // ============================================================
  const COORDS = {
    main: {
      adventure:  { x: 150, y: 650 },
      shop:       { x: 400, y: 650 },
      team:       { x: 650, y: 650 },
      event:      { x: 900, y: 650 },
      home:       { x: 1100, y: 650 },
    },
    common: {
      back:       { x: 50,  y: 40 },
      close:      { x: 1230, y: 40 },
      confirm:    { x: 640, y: 500 },
      confirmOk:  { x: 540, y: 450 },
      cancel:     { x: 740, y: 450 },
      challenge:  { x: 1100, y: 600 },
      sweep:      { x: 1000, y: 600 },
      startBattle:{ x: 1100, y: 650 },
      skip:       { x: 1200, y: 50 },
      reward:     { x: 640, y: 550 },
      tapAny:     { x: 640, y: 400 },
    },
    collect: {
      goldCoin:      { x: 150, y: 300 },
      goldClaim:     { x: 640, y: 450 },
      mailIcon:      { x: 1200, y: 100 },
      mailAll:       { x: 1100, y: 650 },
      signBtn:       { x: 640, y: 400 },
      shareBtn:      { x: 640, y: 350 },
      shareConfirm:  { x: 640, y: 500 },
      staminaSend:   { x: 640, y: 400 },
      intelBtn:      { x: 300, y: 300 },
      rankLike:      { x: 1000, y: 300 },
      activeBox1:    { x: 300, y: 550 },
      activeBox2:    { x: 500, y: 550 },
      activeBox3:    { x: 700, y: 550 },
      activeBox4:    { x: 900, y: 550 },
      ninjutsuClaim: { x: 640, y: 500 },
      recruitFree:   { x: 640, y: 450 },
      recruitConfirm:{ x: 640, y: 500 },
    },
    daily: {
      abundanceEntry:    { x: 300, y: 300 },
      abundanceChallenge:{ x: 1100, y: 600 },
      squadEntry:        { x: 500, y: 300 },
      squadChallenge:    { x: 1100, y: 600 },
      survivalEntry:     { x: 700, y: 300 },
      equipEntry:        { x: 300, y: 450 },
      missionEntry:      { x: 500, y: 450 },
      missionDispatch:   { x: 640, y: 500 },
      secretEntry:       { x: 700, y: 450 },
      orgBlessEntry:     { x: 900, y: 300 },
      orgBlessBtn:       { x: 640, y: 500 },
      shopItem1:         { x: 300, y: 350 },
      shopBuyBtn:        { x: 1000, y: 500 },
      shopConfirm:       { x: 540, y: 450 },
    },
    weekly: {
      practiceEntry: { x: 200, y: 200 },
      practiceStart: { x: 1100, y: 600 },
      akatsukiEntry: { x: 400, y: 200 },
      rebelEntry:    { x: 600, y: 200 },
      fortressEntry: { x: 800, y: 200 },
      heavenEntry:   { x: 1000, y: 200 },
    },
    battle: {
      autoFight: { x: 1200, y: 360 },
      speedUp:   { x: 1200, y: 300 },
      ultSkill:  { x: 1100, y: 500 },
      battleEnd: { x: 640, y: 550 },
    },
  };

  // ============================================================
  //  Tasks — 任务定义
  // ============================================================
  class BaseTask {
    constructor(name, category) {
      this.name = name;
      this.category = category;
      this.status = 'pending';
      this.startTime = null;
      this.endTime = null;
      this.error = null;
    }

    async back(op) {
      await op.clickNatural(COORDS.common.back.x, COORDS.common.back.y);
      await Utils.randomDelay(800, 1500);
    }

    async backToHome(op, times = 3) {
      for (let i = 0; i < times; i++) {
        await op.clickNatural(COORDS.common.back.x, COORDS.common.back.y);
        await Utils.randomDelay(400, 800);
      }
    }

    async confirm(op) {
      await op.clickNatural(COORDS.common.confirm.x, COORDS.common.confirm.y);
      await Utils.randomDelay(400, 800);
    }

    async tapAny(op) {
      await op.clickNatural(COORDS.common.tapAny.x, COORDS.common.tapAny.y);
      await Utils.randomDelay(400, 800);
    }

    async closePopup(op) {
      await op.clickNatural(COORDS.common.close.x, COORDS.common.close.y);
      await Utils.randomDelay(300, 600);
    }

    async navigateTo(op, coord, cfg) {
      await op.clickNatural(coord.x, coord.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
    }

    async waitForBattle(op, cfg, maxMs) {
      const wait = maxMs || cfg.get('delay.battle.max') || 120000;
      Utils.log('info', `    ⏳ 等待战斗 (${Math.round(wait/1000)}s)...`);
      await Utils.sleep(wait);
      // 战斗结束后点击
      await op.clickNatural(COORDS.battle.battleEnd.x, COORDS.battle.battleEnd.y);
      await Utils.randomDelay(1000, 2000);
      await this.confirm(op);
      await this.tapAny(op);
    }

    async goAdventure(op, cfg) {
      await this.navigateTo(op, COORDS.main.adventure, cfg);
    }
  }

  // --- 收获类 ---

  class CollectGoldTask extends BaseTask {
    constructor() { super('招财', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.goldCoin.x, COORDS.collect.goldCoin.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.goldClaim.x, COORDS.collect.goldClaim.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
      await this.back(op);
    }
  }

  class CollectMailTask extends BaseTask {
    constructor() { super('邮件领取', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.mailIcon.x, COORDS.collect.mailIcon.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.mailAll.x, COORDS.collect.mailAll.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
      await this.back(op);
    }
  }

  class CollectSignTask extends BaseTask {
    constructor() { super('每日签到', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.signBtn.x, COORDS.collect.signBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
    }
  }

  class ShareDailyTask extends BaseTask {
    constructor() { super('每日分享', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.shareBtn.x, COORDS.collect.shareBtn.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.shareConfirm.x, COORDS.collect.shareConfirm.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.back(op);
    }
  }

  class SendStaminaTask extends BaseTask {
    constructor() { super('赠送体力', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.staminaSend.x, COORDS.collect.staminaSend.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
    }
  }

  class CollectIntelTask extends BaseTask {
    constructor() { super('情报社', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.intelBtn.x, COORDS.collect.intelBtn.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      for (let i = 0; i < 3; i++) {
        await op.clickNatural(COORDS.collect.intelBtn.x, COORDS.collect.intelBtn.y + i * 80);
        await Utils.randomDelay(cfg.get('delay.click.min'), cfg.get('delay.click.max'));
      }
      await this.back(op);
    }
  }

  class CollectRankTask extends BaseTask {
    constructor() { super('排行榜点赞', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.rankLike.x, COORDS.collect.rankLike.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.back(op);
    }
  }

  class CollectActiveTask extends BaseTask {
    constructor() { super('活跃度宝箱', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      const boxes = [COORDS.collect.activeBox1, COORDS.collect.activeBox2,
                     COORDS.collect.activeBox3, COORDS.collect.activeBox4];
      for (const b of boxes) {
        await op.clickNatural(b.x, b.y);
        await Utils.randomDelay(cfg.get('delay.click.min'), cfg.get('delay.click.max'));
        await this.confirm(op);
      }
    }
  }

  class CollectNinjutsuTask extends BaseTask {
    constructor() { super('忍法帖', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.ninjutsuClaim.x, COORDS.collect.ninjutsuClaim.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
    }
  }

  class RecruitTask extends BaseTask {
    constructor() { super('免费招募', 'collect'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await op.clickNatural(COORDS.collect.recruitFree.x, COORDS.collect.recruitFree.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.recruitConfirm.x, COORDS.collect.recruitConfirm.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapAny(op);
      await this.back(op);
    }
  }

  // --- 日常任务 ---

  class OrgBlessingTask extends BaseTask {
    constructor() { super('组织祈福', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.daily.orgBlessEntry, cfg);
      await op.clickNatural(COORDS.daily.orgBlessBtn.x, COORDS.daily.orgBlessBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
      await this.back(op);
    }
  }

  class AbundanceRoomTask extends BaseTask {
    constructor() { super('丰饶之间', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.goAdventure(op, cfg);
      await this.navigateTo(op, COORDS.daily.abundanceEntry, cfg);
      await this.navigateTo(op, COORDS.daily.abundanceChallenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class SquadRaidTask extends BaseTask {
    constructor() { super('小队突袭', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.goAdventure(op, cfg);
      await this.navigateTo(op, COORDS.daily.squadEntry, cfg);
      await this.navigateTo(op, COORDS.daily.squadChallenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class SurvivalTrialTask extends BaseTask {
    constructor() { super('生存试炼', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.goAdventure(op, cfg);
      await this.navigateTo(op, COORDS.daily.survivalEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class EquipSweepTask extends BaseTask {
    constructor() { super('装备扫荡', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.goAdventure(op, cfg);
      await this.navigateTo(op, COORDS.daily.equipEntry, cfg);
      await op.clickNatural(COORDS.common.sweep.x, COORDS.common.sweep.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.confirm(op);
      await this.back(op);
    }
  }

  class MissionHallTask extends BaseTask {
    constructor() { super('任务集会所', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.daily.missionEntry, cfg);
      for (let i = 0; i < 3; i++) {
        await op.clickNatural(COORDS.daily.missionDispatch.x, COORDS.daily.missionDispatch.y + i * 60);
        await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
        await this.confirm(op);
      }
      await this.back(op);
    }
  }

  class SecretRealmTask extends BaseTask {
    constructor() { super('秘境挑战', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.goAdventure(op, cfg);
      await this.navigateTo(op, COORDS.daily.secretEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class ShopBuyTask extends BaseTask {
    constructor() { super('商店购买', 'daily'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.main.shop, cfg);
      await op.clickNatural(COORDS.daily.shopItem1.x, COORDS.daily.shopItem1.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await op.clickNatural(COORDS.daily.shopBuyBtn.x, COORDS.daily.shopBuyBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await op.clickNatural(COORDS.daily.shopConfirm.x, COORDS.daily.shopConfirm.y);
      await this.back(op);
    }
  }

  // --- 周常 ---

  class RoadOfPracticeTask extends BaseTask {
    constructor() { super('修行之路', 'weekly'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.weekly.practiceEntry, cfg);
      await this.navigateTo(op, COORDS.weekly.practiceStart, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class ChaseAkatsukiTask extends BaseTask {
    constructor() { super('追击晓组织', 'weekly'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.weekly.akatsukiEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class RebelNinjaTask extends BaseTask {
    constructor() { super('叛忍来袭', 'weekly'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.weekly.rebelEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class OrgFortressTask extends BaseTask {
    constructor() { super('组织要塞', 'weekly'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.weekly.fortressEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  class HeavenEarthTask extends BaseTask {
    constructor() { super('天地战场', 'weekly'); }
    async execute(op, cfg, popup) {
      await popup.dismissQuick();
      await this.navigateTo(op, COORDS.weekly.heavenEntry, cfg);
      await this.navigateTo(op, COORDS.common.challenge, cfg);
      await this.waitForBattle(op, cfg);
      await this.back(op);
    }
  }

  // 任务工厂
  const TaskFactory = {
    _map: {
      collectGold: CollectGoldTask, collectMail: CollectMailTask,
      collectSign: CollectSignTask, shareDaily: ShareDailyTask,
      sendStamina: SendStaminaTask, collectIntel: CollectIntelTask,
      collectRank: CollectRankTask, collectActive: CollectActiveTask,
      collectNinjutsu: CollectNinjutsuTask, recruit: RecruitTask,
      orgBlessing: OrgBlessingTask, abundanceRoom: AbundanceRoomTask,
      squadRaid: SquadRaidTask, survivalTrial: SurvivalTrialTask,
      equipSweep: EquipSweepTask, missionHall: MissionHallTask,
      secretRealm: SecretRealmTask, shopBuy: ShopBuyTask,
      roadOfPractice: RoadOfPracticeTask, chaseAkatsuki: ChaseAkatsukiTask,
      rebelNinja: RebelNinjaTask, orgFortress: OrgFortressTask,
      heavenEarth: HeavenEarthTask,
    },

    createAll(config) {
      const sw = config.get('taskSwitches');
      return Object.entries(this._map)
        .filter(([key]) => sw[key])
        .map(([, Cls]) => new Cls());
    },

    createSingle(name) {
      const Cls = this._map[name];
      return Cls ? new Cls() : null;
    },

    getByCategory(cat) {
      return Object.entries(this._map)
        .filter(([, Cls]) => new Cls().category === cat)
        .map(([, Cls]) => new Cls());
    }
  };

  // ============================================================
  //  UI — 控制面板
  // ============================================================
  const UI_CSS = `
    #na-panel{position:fixed;top:10px;right:10px;width:320px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #e94560;border-radius:12px;color:#eee;font-family:'Microsoft YaHei',sans-serif;font-size:13px;z-index:999999;box-shadow:0 4px 20px rgba(233,69,96,.3);user-select:none;overflow:hidden}
    #na-panel .hd{background:linear-gradient(90deg,#e94560,#0f3460);padding:10px 15px;display:flex;justify-content:space-between;align-items:center;cursor:move}
    #na-panel .hd h3{margin:0;font-size:14px;color:#fff}
    #na-panel .hd .x{cursor:pointer;font-size:18px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s}
    #na-panel .hd .x:hover{background:rgba(255,255,255,.2)}
    #na-panel .bd{padding:12px 15px;max-height:520px;overflow-y:auto}
    #na-panel .sec{margin-bottom:10px}
    #na-panel .st{font-size:11px;color:#e94560;margin-bottom:5px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
    #na-panel .br{display:flex;gap:6px;margin-bottom:6px}
    #na-panel .btn{flex:1;padding:7px 10px;border:1px solid #e94560;background:0 0;color:#e94560;border-radius:6px;cursor:pointer;font-size:11px;transition:all .2s;text-align:center}
    #na-panel .btn:hover{background:#e94560;color:#fff}
    #na-panel .btn.pri{background:#e94560;color:#fff}
    #na-panel .btn.pri:hover{background:#c73650}
    #na-panel .btn:disabled{opacity:.4;cursor:not-allowed}
    #na-panel .sb{background:rgba(0,0,0,.3);padding:7px 10px;border-radius:6px;margin-bottom:6px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px 12px}
    #na-panel .sb .l{color:#888}#na-panel .sb .v{color:#3498db;font-weight:700}
    #na-panel .tl{max-height:160px;overflow-y:auto}
    #na-panel .ti{display:flex;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    #na-panel .ti .dot{width:8px;height:8px;border-radius:50%;margin-right:6px;flex-shrink:0}
    #na-panel .ti .dot.pending{background:#555}#na-panel .ti .dot.running{background:#f39c12;animation:pulse 1s infinite}
    #na-panel .ti .dot.done{background:#2ecc71}#na-panel .ti .dot.failed{background:#e74c3c}
    #na-panel .ti .nm{flex:1;font-size:11px}#na-panel .ti .tm{font-size:10px;color:#888}
    #na-panel .la{background:rgba(0,0,0,.4);padding:6px;border-radius:6px;max-height:110px;overflow-y:auto;font-family:monospace;font-size:10px;line-height:1.5;color:#aaa}
    #na-panel .la .i{color:#3498db}#na-panel .la .w{color:#f39c12}#na-panel .la .e{color:#e74c3c}#na-panel .la .s{color:#2ecc71}
    #na-panel .cg{display:grid;grid-template-columns:1fr 1fr;gap:3px}
    #na-panel .ci{display:flex;align-items:center;gap:3px;font-size:10px}
    #na-panel .ci input{accent-color:#e94560}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  `;

  class ControlPanel {
    constructor(scheduler, config, coordRecorder) {
      this.scheduler = scheduler;
      this.config = config;
      this.recorder = coordRecorder;
      this.panel = null;
      this.logs = [];
      this.maxLogs = 60;
    }

    create() {
      GM_addStyle(UI_CSS);
      this.panel = document.createElement('div');
      this.panel.id = 'na-panel';
      this.panel.innerHTML = this._html();
      document.body.appendChild(this.panel);
      this._bindEvents();
      this._bindScheduler();
    }

    _html() {
      const sw = this.config.get('taskSwitches');
      const labels = {
        collectGold:'招财',collectMail:'邮件',collectSign:'签到',shareDaily:'分享',
        sendStamina:'赠体力',collectIntel:'情报社',collectRank:'排行榜',
        collectActive:'活跃度',collectNinjutsu:'忍法帖',recruit:'招募',
        orgBlessing:'组织祈福',abundanceRoom:'丰饶之间',squadRaid:'小队突袭',
        survivalTrial:'生存试炼',equipSweep:'装备扫荡',missionHall:'集会所',
        secretRealm:'秘境',shopBuy:'商店',roadOfPractice:'修行之路',
        chaseAkatsuki:'追击晓',rebelNinja:'叛忍来袭',orgFortress:'组织要塞',
        heavenEarth:'天地战场',
      };
      return `
        <div class="hd" id="na-drag"><h3>🍥 火影忍者自动化 v${VERSION}</h3><span class="x" id="na-x">×</span></div>
        <div class="bd">
          <div class="sb" id="na-status">
            <span><span class="l">状态:</span><span class="v" id="na-st">就绪</span></span>
            <span><span class="l">队列:</span><span class="v" id="na-qc">0</span></span>
            <span><span class="l">完成:</span><span class="v" id="na-dc">0</span></span>
            <span><span class="l">失败:</span><span class="v" id="na-fc">0</span></span>
          </div>
          <div class="br">
            <button class="btn pri" id="na-start">▶ 开始</button>
            <button class="btn" id="na-pause" disabled>⏸</button>
            <button class="btn" id="na-stop" disabled>⏹</button>
          </div>
          <div class="sec">
            <div class="st">快捷操作</div>
            <div class="br"><button class="btn" id="na-collect">🎁 收获</button><button class="btn" id="na-daily">⚔ 日常</button><button class="btn" id="na-weekly">📅 周常</button></div>
            <div class="br"><button class="btn" id="na-record">🎯 录制</button><button class="btn" id="na-cfg">⚙</button><button class="btn" id="na-home">🏠</button></div>
          </div>
          <div class="sec" id="na-cfg-panel" style="display:none">
            <div class="st">任务开关</div>
            <div class="cg">${Object.entries(sw).map(([k,v])=>`<label class="ci"><input type="checkbox" data-t="${k}" ${v?'checked':''}>${labels[k]||k}</label>`).join('')}</div>
            <div class="br" style="margin-top:6px"><button class="btn" id="na-save">保存</button><button class="btn" id="na-reset">重置</button></div>
          </div>
          <div class="sec"><div class="st">任务</div><div class="tl" id="na-tl"></div></div>
          <div class="sec"><div class="st">日志</div><div class="la" id="na-log"></div></div>
        </div>`;
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
      document.addEventListener('mouseup', () => drag = false);

      // 关闭
      p.querySelector('#na-x').onclick = () => p.style.display = 'none';

      // 开始
      p.querySelector('#na-start').onclick = async () => {
        const tasks = TaskFactory.createAll(this.config);
        if (!tasks.length) { this.addLog('w', '没有启用的任务'); return; }
        this.scheduler.queue = [];
        this.scheduler.addTasks(tasks);
        this._renderTasks(tasks);
        this._setBtns(true);
        await this.scheduler.start();
        this._setBtns(false);
      };

      // 暂停/恢复
      p.querySelector('#na-pause').onclick = () => {
        if (this.scheduler.paused) {
          this.scheduler.resume();
          p.querySelector('#na-pause').textContent = '⏸';
        } else {
          this.scheduler.pause();
          p.querySelector('#na-pause').textContent = '▶';
        }
      };

      // 停止
      p.querySelector('#na-stop').onclick = () => {
        this.scheduler.stop();
        this._setBtns(false);
        p.querySelector('#na-pause').textContent = '⏸';
      };

      // 快捷
      p.querySelector('#na-collect').onclick = () => this._runCategory('collect');
      p.querySelector('#na-daily').onclick = () => this._runCategory('daily');
      p.querySelector('#na-weekly').onclick = () => this._runCategory('weekly');

      // 录制
      p.querySelector('#na-record').onclick = () => {
        if (this.recorder.recording) {
          const coords = this.recorder.stop();
          p.querySelector('#na-record').textContent = '🎯 录制';
          this.addLog('s', `录制结束，${coords.length} 个坐标`);
        } else {
          this.recorder.start();
          p.querySelector('#na-record').textContent = '⏹ 停止录制';
        }
      };

      // 回到主界面
      p.querySelector('#na-home').onclick = async () => {
        for (let i = 0; i < 5; i++) {
          await this.scheduler.op.clickNatural(COORDS.common.back.x, COORDS.common.back.y);
          await Utils.sleep(500);
        }
        this.addLog('i', '已尝试返回主界面');
      };

      // 配置
      p.querySelector('#na-cfg').onclick = () => {
        const el = p.querySelector('#na-cfg-panel');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      };

      p.querySelector('#na-save').onclick = () => {
        p.querySelectorAll('#na-cfg-panel input[type=checkbox]').forEach(cb => {
          this.config.set(`taskSwitches.${cb.dataset.t}`, cb.checked);
        });
        this.config.save();
        this.addLog('s', '配置已保存');
      };

      p.querySelector('#na-reset').onclick = () => {
        if (confirm('确定重置所有配置？')) { this.config.reset(); location.reload(); }
      };
    }

    _bindScheduler() {
      const s = this.scheduler;
      s.on('start', d => { this.addLog('i', `开始，共 ${d.total} 个任务`); this._setStatus('运行中'); });
      s.on('taskStart', t => { this.addLog('i', `▶ ${t.name}`); this._setTaskStatus(t, 'running'); });
      s.on('taskDone', t => {
        this.addLog('s', `✓ ${t.name} (${Utils.formatDuration(t.endTime - t.startTime)})`);
        this._setTaskStatus(t, 'done');
        document.getElementById('na-dc').textContent = s.history.filter(h => h.result === 'success').length;
      });
      s.on('taskFailed', ({ task, error }) => {
        this.addLog('e', `✗ ${task.name}: ${error.message}`);
        this._setTaskStatus(task, 'failed');
        document.getElementById('na-fc').textContent = s.history.filter(h => h.result === 'failed').length;
      });
      s.on('pause', () => { this._setStatus('已暂停'); this.addLog('w', '已暂停'); });
      s.on('resume', () => { this._setStatus('运行中'); this.addLog('i', '已恢复'); });
      s.on('stop', () => { this._setStatus('已停止'); this.addLog('w', '已停止'); });
      s.on('complete', d => {
        this._setStatus('完成');
        this.addLog('s', `🏁 完成！成功 ${d.success}，失败 ${d.failed}`);
      });
    }

    async _runCategory(cat) {
      const tasks = TaskFactory.getByCategory(cat);
      if (!tasks.length) return;
      this.scheduler.queue = [];
      this.scheduler.addTasks(tasks);
      this._renderTasks(tasks);
      this._setBtns(true);
      await this.scheduler.start();
      this._setBtns(false);
    }

    _setBtns(running) {
      const $ = id => document.getElementById(id);
      $('na-start').disabled = running;
      $('na-pause').disabled = !running;
      $('na-stop').disabled = !running;
    }

    _setStatus(text) {
      const el = document.getElementById('na-st');
      if (el) el.textContent = text;
    }

    _renderTasks(tasks) {
      const el = document.getElementById('na-tl');
      if (!el) return;
      el.innerHTML = tasks.map(t =>
        `<div class="ti" data-n="${t.name}"><span class="dot ${t.status}"></span><span class="nm">${t.name}</span><span class="tm"></span></div>`
      ).join('');
    }

    _setTaskStatus(task, status) {
      const el = document.querySelector(`.ti[data-n="${task.name}"]`);
      if (!el) return;
      el.querySelector('.dot').className = `dot ${status}`;
      if (task.endTime && task.startTime) {
        el.querySelector('.tm').textContent = Utils.formatDuration(task.endTime - task.startTime);
      }
    }

    addLog(level, text) {
      const area = document.getElementById('na-log');
      if (!area) return;
      const ts = new Date().toLocaleTimeString();
      const cls = level === 'e' ? 'e' : level === 'w' ? 'w' : level === 's' ? 's' : 'i';
      this.logs.push(`<span class="${cls}">[${ts}] ${text}</span>`);
      if (this.logs.length > this.maxLogs) this.logs.shift();
      area.innerHTML = this.logs.join('<br>');
      area.scrollTop = area.scrollHeight;
    }
  }

  // ============================================================
  //  NarutoAuto — 主入口
  // ============================================================
  class NarutoAuto {
    constructor() {
      this.config = new Config();
      this.operator = new GameOperator();
      this.cookieMgr = new CookieManager();
      this.sceneDetector = new SceneDetector();
      this.popupHandler = new PopupHandler(this.operator, this.config);
      this.scheduler = new TaskScheduler(this.operator, this.config, this.popupHandler);
      this.coordRecorder = new CoordRecorder();
      this.panel = new ControlPanel(this.scheduler, this.config, this.coordRecorder);
    }

    async init() {
      Utils.log('info', '========================================');
      Utils.log('info', `  火影忍者云游戏自动化 v${VERSION}`);
      Utils.log('info', '========================================');

      // 检查页面
      const url = location.href;
      if (!url.includes('start.qq.com') && !url.includes('gamer.qq.com')) {
        Utils.log('info', '非云游戏页面，脚本不启动');
        return;
      }

      // 检查登录态
      if (!this.cookieMgr.checkLoginState()) {
        Utils.log('warn', '未检测到登录态');
        // 等一下再检查，页面可能还在加载
        await Utils.sleep(3000);
        if (!this.cookieMgr.checkLoginState()) {
          this.cookieMgr.showLoginAlert();
          return;
        }
      }

      // 初始化 TCGSDK
      const ok = await this.operator.init();
      if (!ok) {
        Utils.log('warn', 'TCGSDK 未就绪，面板仍会显示');
      }

      // 创建 UI
      this.panel.create();

      // 全局调试引用
      window.__narutoAuto = {
        config: this.config,
        operator: this.operator,
        scheduler: this.scheduler,
        panel: this.panel,
        coords: COORDS,
        recorder: this.coordRecorder,
      };

      Utils.log('info', '✓ 初始化完成，等待操作...');
    }
  }

  // 启动
  new NarutoAuto().init().catch(err => {
    console.error('[NarutoAuto] 初始化失败:', err);
  });

})();
