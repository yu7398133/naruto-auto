// ==UserScript==
// @name         火影忍者云游戏自动化
// @namespace    https://github.com/naruto-auto
// @version      0.1.0
// @description  基于TCGSDK的火影忍者手游云游戏自动化脚本
// @author       naruto-auto
// @match        https://start.qq.com/*
// @match        https://gamer.qq.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_log
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  //  utils.js — 工具函数
  // ============================================================
  const Utils = {
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    randomDelay(min, max) {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      return this.sleep(delay);
    },

    log(level, ...args) {
      const ts = new Date().toLocaleTimeString();
      const prefix = `[NarutoAuto][${ts}]`;
      if (level === 'error') console.error(prefix, ...args);
      else if (level === 'warn') console.warn(prefix, ...args);
      else console.log(prefix, ...args);
    },

    waitForCondition(fn, timeout = 10000, interval = 500) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          try {
            const result = fn();
            if (result) return resolve(result);
          } catch (e) { /* ignore */ }
          if (Date.now() - start > timeout) return reject(new Error('waitForCondition timeout'));
          setTimeout(check, interval);
        };
        check();
      });
    },

    getTimestamp() {
      return new Date().toISOString().replace('T', ' ').slice(0, 19);
    },

    formatDuration(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}分${sec}秒`;
    }
  };

  // ============================================================
  //  config.js — 配置管理
  // ============================================================
  const DEFAULT_CONFIG = {
    version: '0.1.0',
    // 基准分辨率
    baseResolution: { width: 1280, height: 720 },
    // 操作延时范围 (ms)
    delay: {
      click: { min: 300, max: 600 },       // 点击后等待
      pageLoad: { min: 1500, max: 3000 },   // 页面加载
      battle: { min: 30000, max: 90000 },   // 战斗等待
      short: { min: 500, max: 1000 },       // 短等待
      long: { min: 3000, max: 5000 },       // 长等待
    },
    // 重试配置
    retry: {
      maxAttempts: 3,
      interval: 2000,
    },
    // 任务开关（默认全部开启）
    taskSwitches: {
      // 每日收获
      collectGold: true,       // 招财
      collectMail: true,       // 邮件
      collectSign: true,       // 签到
      shareDaily: true,        // 每日分享
      sendStamina: true,       // 赠送体力
      collectIntel: true,      // 情报社
      collectRank: true,       // 排行榜
      collectActive: true,     // 活跃度宝箱
      collectNinjutsu: true,   // 忍法帖
      recruit: true,           // 招募
      // 每日任务
      squadRaid: true,         // 小队突袭
      abundanceRoom: true,     // 丰饶之间
      orgBlessing: true,       // 组织祈福
      survivalTrial: true,     // 生存试炼
      equipSweep: true,        // 装备扫荡
      missionHall: true,       // 任务集会所
      secretRealm: true,       // 秘境挑战
      shopBuy: true,           // 商店购买
      // 周常
      roadOfPractice: false,   // 修行之路
      chaseAkatsuki: false,    // 追击晓组织
      rebelNinja: false,       // 叛忍来袭
      orgFortress: false,      // 组织要塞
      heavenEarth: false,      // 天地战场
    },
    // 运行模式
    mode: 'auto', // auto | manual
    debug: false,
  };

  class Config {
    constructor() {
      this.data = this.load();
    }

    load() {
      try {
        const saved = GM_getValue('naruto_config', null);
        if (saved) {
          return this.merge(DEFAULT_CONFIG, JSON.parse(saved));
        }
      } catch (e) {
        Utils.log('warn', '配置加载失败，使用默认配置', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    save() {
      GM_setValue('naruto_config', JSON.stringify(this.data));
    }

    merge(defaults, overrides) {
      const result = JSON.parse(JSON.stringify(defaults));
      for (const key of Object.keys(overrides)) {
        if (overrides[key] !== undefined && overrides[key] !== null) {
          if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) && result[key]) {
            result[key] = this.merge(result[key], overrides[key]);
          } else {
            result[key] = overrides[key];
          }
        }
      }
      return result;
    }

    get(path) {
      return path.split('.').reduce((o, k) => o && o[k], this.data);
    }

    set(path, value) {
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((o, k) => o[k], this.data);
      target[last] = value;
      this.save();
    }

    reset() {
      this.data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      this.save();
    }
  }

  // ============================================================
  //  operator.js — TCGSDK 操作封装层
  // ============================================================
  class GameOperator {
    constructor() {
      this.sdk = null;
      this.resolution = { width: 1280, height: 720 };
      this.ready = false;
    }

    /**
     * 初始化：获取 TCGSDK 实例
     */
    async init() {
      Utils.log('info', '正在初始化 TCGSDK...');

      // 等待 TCGSDK 加载
      try {
        await Utils.waitForCondition(() => {
          return window.TCGSDK || (window.top && window.top.TCGSDK);
        }, 30000, 1000);
      } catch (e) {
        Utils.log('error', 'TCGSDK 未找到，请确认已进入云游戏页面');
        return false;
      }

      this.sdk = window.TCGSDK || window.top.TCGSDK;
      this.ready = true;
      Utils.log('info', 'TCGSDK 初始化成功');
      return true;
    }

    /**
     * 检查 SDK 是否就绪
     */
    assertReady() {
      if (!this.ready || !this.sdk) {
        throw new Error('TCGSDK 未初始化，请先调用 init()');
      }
    }

    /**
     * 点击指定坐标
     * @param {number} x - X 坐标 (基于 1280x720)
     * @param {number} y - Y 坐标
     * @param {string} button - 'left' | 'right'
     */
    async click(x, y, button = 'left') {
      this.assertReady();
      const scaled = this.scaleCoord(x, y);

      // mousedown
      this.sdk.sendMouseEvent({
        type: 'mousedown',
        x: scaled.x,
        y: scaled.y,
        button: button === 'right' ? 2 : 0,
      });

      await Utils.sleep(50 + Math.random() * 50);

      // mouseup
      this.sdk.sendMouseEvent({
        type: 'mouseup',
        x: scaled.x,
        y: scaled.y,
        button: button === 'right' ? 2 : 0,
      });

      Utils.log('debug', `点击 (${x},${y}) → 缩放 (${scaled.x},${scaled.y})`);
    }

    /**
     * 连续点击（用于确认等场景）
     */
    async clickMultiple(x, y, count = 2, interval = 300) {
      for (let i = 0; i < count; i++) {
        await this.click(x, y);
        if (i < count - 1) await Utils.sleep(interval);
      }
    }

    /**
     * 滑动操作
     * @param {number} x1 - 起点 X
     * @param {number} y1 - 起点 Y
     * @param {number} x2 - 终点 X
     * @param {number} y2 - 终点 Y
     * @param {number} duration - 滑动时长 (ms)
     */
    async swipe(x1, y1, x2, y2, duration = 500) {
      this.assertReady();
      const start = this.scaleCoord(x1, y1);
      const end = this.scaleCoord(x2, y2);

      const steps = Math.max(5, Math.floor(duration / 30));
      const dx = (end.x - start.x) / steps;
      const dy = (end.y - start.y) / steps;

      // touchstart
      this.sdk.sendRawEvent({
        type: 'touchstart',
        touches: [{ identifier: 0, x: start.x, y: start.y }],
      });

      for (let i = 1; i <= steps; i++) {
        await Utils.sleep(duration / steps);
        this.sdk.sendRawEvent({
          type: 'touchmove',
          touches: [{
            identifier: 0,
            x: Math.round(start.x + dx * i),
            y: Math.round(start.y + dy * i),
          }],
        });
      }

      // touchend
      this.sdk.sendRawEvent({
        type: 'touchend',
        changedTouches: [{ identifier: 0, x: end.x, y: end.y }],
      });

      Utils.log('debug', `滑动 (${x1},${y1}) → (${x2},${y2})`);
    }

    /**
     * 键盘按键
     */
    async keyPress(key) {
      this.assertReady();
      this.sdk.sendKeyboardEvent({ type: 'keydown', key });
      await Utils.sleep(50);
      this.sdk.sendKeyboardEvent({ type: 'keyup', key });
      Utils.log('debug', `按键: ${key}`);
    }

    /**
     * 坐标缩放（适配不同分辨率）
     */
    scaleCoord(x, y) {
      // 当前页面尺寸
      const canvas = document.querySelector('canvas');
      const currentW = canvas ? canvas.width : window.innerWidth;
      const currentH = canvas ? canvas.height : window.innerHeight;

      return {
        x: Math.round(x * currentW / this.resolution.width),
        y: Math.round(y * currentH / this.resolution.height),
      };
    }

    /**
     * 带随机偏移的点击（更自然）
     */
    async clickNatural(x, y, radius = 5) {
      const offsetX = x + (Math.random() * radius * 2 - radius);
      const offsetY = y + (Math.random() * radius * 2 - radius);
      await this.click(Math.round(offsetX), Math.round(offsetY));
    }

    /**
     * 长按
     */
    async longPress(x, y, duration = 1000) {
      this.assertReady();
      const scaled = this.scaleCoord(x, y);

      this.sdk.sendMouseEvent({
        type: 'mousedown',
        x: scaled.x,
        y: scaled.y,
        button: 0,
      });

      await Utils.sleep(duration);

      this.sdk.sendMouseEvent({
        type: 'mouseup',
        x: scaled.x,
        y: scaled.y,
        button: 0,
      });
    }
  }

  // ============================================================
  //  scheduler.js — 任务调度器
  // ============================================================
  class TaskScheduler {
    constructor(operator, config) {
      this.operator = operator;
      this.config = config;
      this.taskQueue = [];
      this.running = false;
      this.paused = false;
      this.currentTask = null;
      this.history = [];
      this.listeners = {};
    }

    /**
     * 事件监听
     */
    on(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    }

    emit(event, data) {
      (this.listeners[event] || []).forEach(cb => {
        try { cb(data); } catch (e) { Utils.log('error', 'Event callback error:', e); }
      });
    }

    /**
     * 添加任务
     */
    addTask(task) {
      this.taskQueue.push(task);
      this.emit('taskAdded', task);
      Utils.log('info', `任务已加入队列: ${task.name}`);
    }

    /**
     * 批量添加任务
     */
    addTasks(tasks) {
      tasks.forEach(t => this.addTask(t));
    }

    /**
     * 开始执行
     */
    async start() {
      if (this.running) {
        Utils.log('warn', '调度器已在运行');
        return;
      }

      this.running = true;
      this.paused = false;
      this.emit('start', { total: this.taskQueue.length });
      Utils.log('info', `开始执行，共 ${this.taskQueue.length} 个任务`);

      while (this.taskQueue.length > 0 && this.running) {
        if (this.paused) {
          await Utils.sleep(1000);
          continue;
        }

        const task = this.taskQueue.shift();
        this.currentTask = task;
        this.emit('taskStart', task);

        try {
          task.status = 'running';
          Utils.log('info', `▶ 开始任务: ${task.name}`);

          await this.executeWithRetry(task);

          task.status = 'done';
          task.endTime = Date.now();
          this.history.push({ ...task, result: 'success' });
          this.emit('taskDone', task);
          Utils.log('info', `✓ 任务完成: ${task.name}`);

        } catch (error) {
          task.status = 'failed';
          task.error = error.message;
          task.endTime = Date.now();
          this.history.push({ ...task, result: 'failed' });
          this.emit('taskFailed', { task, error });
          Utils.log('error', `✗ 任务失败: ${task.name}`, error.message);
        }

        this.currentTask = null;

        // 任务间间隔
        if (this.taskQueue.length > 0) {
          await this.operator.constructor.prototype.constructor === Object ? Utils.sleep(1000) :
            Utils.randomDelay(this.config.get('delay.short.min'), this.config.get('delay.short.max'));
        }
      }

      this.running = false;
      this.emit('complete', {
        total: this.history.length,
        success: this.history.filter(h => h.result === 'success').length,
        failed: this.history.filter(h => h.result === 'failed').length,
      });
      Utils.log('info', '所有任务执行完毕');
    }

    /**
     * 带重试的执行
     */
    async executeWithRetry(task) {
      const maxRetry = this.config.get('retry.maxAttempts') || 3;
      const retryInterval = this.config.get('retry.interval') || 2000;

      for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
          await task.execute(this.operator, this.config);
          return;
        } catch (error) {
          if (attempt < maxRetry) {
            Utils.log('warn', `任务 ${task.name} 第 ${attempt} 次失败，${retryInterval}ms 后重试...`);
            await Utils.sleep(retryInterval);
          } else {
            throw error;
          }
        }
      }
    }

    /**
     * 暂停
     */
    pause() {
      this.paused = true;
      this.emit('pause', {});
      Utils.log('info', '调度器已暂停');
    }

    /**
     * 恢复
     */
    resume() {
      this.paused = false;
      this.emit('resume', {});
      Utils.log('info', '调度器已恢复');
    }

    /**
     * 停止
     */
    stop() {
      this.running = false;
      this.paused = false;
      this.taskQueue = [];
      this.emit('stop', {});
      Utils.log('info', '调度器已停止');
    }

    /**
     * 获取状态
     */
    getStatus() {
      return {
        running: this.running,
        paused: this.paused,
        currentTask: this.currentTask ? this.currentTask.name : null,
        queueLength: this.taskQueue.length,
        historyCount: this.history.length,
      };
    }
  }

  // ============================================================
  //  coords.js — 坐标定义 (基于 1280x720)
  // ============================================================
  const COORDS = {
    // === 主界面 ===
    main: {
      adventure:    { x: 150, y: 650 },   // 冒险
      shop:         { x: 400, y: 650 },   // 商店
      team:         { x: 650, y: 650 },   // 小队
      event:        { x: 900, y: 650 },   // 活动
      home:         { x: 1100, y: 650 },  // 主页
    },

    // === 通用按钮 ===
    common: {
      back:         { x: 50,  y: 40 },    // 返回按钮 (左上)
      close:        { x: 1230, y: 40 },   // 关闭按钮 (右上)
      confirm:      { x: 640, y: 500 },   // 确认按钮 (中央偏下)
      confirmOk:    { x: 540, y: 450 },   // 弹窗确认 (偏左)
      cancel:       { x: 740, y: 450 },   // 弹窗取消 (偏右)
      challenge:    { x: 1100, y: 600 },  // 挑战按钮
      sweep:        { x: 1000, y: 600 },  // 扫荡按钮
      startBattle:  { x: 1100, y: 650 },  // 开始战斗
      skipBtn:      { x: 1200, y: 50 },   // 跳过按钮
      rewardClaim:  { x: 640, y: 550 },   // 领取奖励
      tapAnywhere:  { x: 640, y: 400 },   // 点击任意位置继续
    },

    // === 收获相关 ===
    collect: {
      // 招财
      goldCoin:     { x: 150, y: 300 },
      goldClaim:    { x: 640, y: 450 },
      // 邮件
      mailIcon:     { x: 1200, y: 100 },
      mailCollectAll: { x: 1100, y: 650 },
      // 签到
      signBtn:      { x: 640, y: 400 },
      // 每日分享
      shareBtn:     { x: 640, y: 350 },
      shareConfirm: { x: 640, y: 500 },
      // 赠送体力
      staminaSend:  { x: 640, y: 400 },
      // 情报社
      intelBtn:     { x: 300, y: 300 },
      // 排行榜
      rankLike:     { x: 1000, y: 300 },
      // 活跃度宝箱
      activeBox1:   { x: 300, y: 550 },
      activeBox2:   { x: 500, y: 550 },
      activeBox3:   { x: 700, y: 550 },
      activeBox4:   { x: 900, y: 550 },
      // 忍法帖
      ninjutsuClaim: { x: 640, y: 500 },
      // 招募
      recruitFree:  { x: 640, y: 450 },
      recruitConfirm: { x: 640, y: 500 },
    },

    // === 日常任务 ===
    daily: {
      // 丰饶之间
      abundanceEntry:  { x: 300, y: 300 },
      abundanceChallenge: { x: 1100, y: 600 },
      // 小队突袭
      squadEntry:      { x: 500, y: 300 },
      squadChallenge:  { x: 1100, y: 600 },
      // 生存试炼
      survivalEntry:   { x: 700, y: 300 },
      // 装备扫荡
      equipEntry:      { x: 300, y: 450 },
      // 任务集会所
      missionEntry:    { x: 500, y: 450 },
      missionDispatch: { x: 640, y: 500 },
      // 秘境挑战
      secretEntry:     { x: 700, y: 450 },
      // 组织祈福
      orgBlessEntry:   { x: 900, y: 300 },
      orgBlessBtn:     { x: 640, y: 500 },
      // 商店
      shopItem1:       { x: 300, y: 350 },
      shopBuyBtn:      { x: 1000, y: 500 },
      shopConfirm:     { x: 540, y: 450 },
    },

    // === 周常 ===
    weekly: {
      // 修行之路
      practiceEntry:   { x: 200, y: 200 },
      practiceStart:   { x: 1100, y: 600 },
      // 追击晓组织
      akatsukiEntry:   { x: 400, y: 200 },
      // 叛忍来袭
      rebelEntry:      { x: 600, y: 200 },
      // 组织要塞
      fortressEntry:   { x: 800, y: 200 },
      // 天地战场
      heavenEntry:     { x: 1000, y: 200 },
    },

    // === 战斗相关 ===
    battle: {
      autoFight:       { x: 1200, y: 360 },  // 自动战斗开关
      speedUp:         { x: 1200, y: 300 },   // 加速
      ultSkill:        { x: 1100, y: 500 },   // 大招
      battleEnd:       { x: 640, y: 550 },    // 战斗结束确认
    },
  };

  // ============================================================
  //  tasks.js — 任务定义
  // ============================================================

  /**
   * 基础任务类
   */
  class BaseTask {
    constructor(name, category) {
      this.name = name;
      this.category = category; // 'daily' | 'collect' | 'weekly'
      this.status = 'pending';  // pending | running | done | failed
      this.startTime = null;
      this.endTime = null;
      this.error = null;
    }

    async goBack(operator) {
      await operator.clickNatural(COORDS.common.back.x, COORDS.common.back.y);
      await Utils.randomDelay(1000, 2000);
    }

    async goHome(operator) {
      // 多次返回确保回到主界面
      for (let i = 0; i < 3; i++) {
        await operator.clickNatural(COORDS.common.back.x, COORDS.common.back.y);
        await Utils.randomDelay(500, 1000);
      }
    }

    async tapConfirm(operator) {
      await operator.clickNatural(COORDS.common.confirm.x, COORDS.common.confirm.y);
      await Utils.randomDelay(500, 1000);
    }

    async tapAnywhere(operator) {
      await operator.clickNatural(COORDS.common.tapAnywhere.x, COORDS.common.tapAnywhere.y);
      await Utils.randomDelay(500, 1000);
    }

    async waitForBattle(operator, maxWait = 120000) {
      Utils.log('info', '  等待战斗结束...');
      // 简单等待策略：等固定时间后尝试点击
      await Utils.sleep(maxWait);
      // 尝试点击战斗结束区域
      await operator.clickNatural(COORDS.battle.battleEnd.x, COORDS.battle.battleEnd.y);
      await Utils.randomDelay(1000, 2000);
      await this.tapConfirm(operator);
    }
  }

  // --- 收获类任务 ---

  class CollectGoldTask extends BaseTask {
    constructor() { super('招财', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [招财] 执行中...');
      // TODO: 进入招财界面的导航路径需根据实际 UI 调整
      await op.clickNatural(COORDS.collect.goldCoin.x, COORDS.collect.goldCoin.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.goldClaim.x, COORDS.collect.goldClaim.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
      await this.goBack(op);
    }
  }

  class CollectMailTask extends BaseTask {
    constructor() { super('邮件领取', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [邮件] 执行中...');
      await op.clickNatural(COORDS.collect.mailIcon.x, COORDS.collect.mailIcon.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.mailCollectAll.x, COORDS.collect.mailCollectAll.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
      await this.goBack(op);
    }
  }

  class CollectSignTask extends BaseTask {
    constructor() { super('每日签到', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [签到] 执行中...');
      await op.clickNatural(COORDS.collect.signBtn.x, COORDS.collect.signBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
    }
  }

  class ShareDailyTask extends BaseTask {
    constructor() { super('每日分享', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [分享] 执行中...');
      await op.clickNatural(COORDS.collect.shareBtn.x, COORDS.collect.shareBtn.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.shareConfirm.x, COORDS.collect.shareConfirm.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.goBack(op);
    }
  }

  class SendStaminaTask extends BaseTask {
    constructor() { super('赠送体力', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [赠送体力] 执行中...');
      await op.clickNatural(COORDS.collect.staminaSend.x, COORDS.collect.staminaSend.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
    }
  }

  class CollectIntelTask extends BaseTask {
    constructor() { super('情报社', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [情报社] 执行中...');
      await op.clickNatural(COORDS.collect.intelBtn.x, COORDS.collect.intelBtn.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      // 情报社可能需要多次点击领取
      for (let i = 0; i < 3; i++) {
        await op.clickNatural(COORDS.collect.intelBtn.x, COORDS.collect.intelBtn.y + i * 80);
        await Utils.randomDelay(cfg.get('delay.click.min'), cfg.get('delay.click.max'));
      }
      await this.goBack(op);
    }
  }

  class CollectRankTask extends BaseTask {
    constructor() { super('排行榜点赞', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [排行榜] 执行中...');
      await op.clickNatural(COORDS.collect.rankLike.x, COORDS.collect.rankLike.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.goBack(op);
    }
  }

  class CollectActiveTask extends BaseTask {
    constructor() { super('活跃度宝箱', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [活跃度] 执行中...');
      const boxes = [COORDS.collect.activeBox1, COORDS.collect.activeBox2,
                     COORDS.collect.activeBox3, COORDS.collect.activeBox4];
      for (const box of boxes) {
        await op.clickNatural(box.x, box.y);
        await Utils.randomDelay(cfg.get('delay.click.min'), cfg.get('delay.click.max'));
        await this.tapConfirm(op);
      }
    }
  }

  class CollectNinjutsuTask extends BaseTask {
    constructor() { super('忍法帖', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [忍法帖] 执行中...');
      await op.clickNatural(COORDS.collect.ninjutsuClaim.x, COORDS.collect.ninjutsuClaim.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
    }
  }

  class RecruitTask extends BaseTask {
    constructor() { super('免费招募', 'collect'); }
    async execute(op, cfg) {
      Utils.log('info', '  [招募] 执行中...');
      await op.clickNatural(COORDS.collect.recruitFree.x, COORDS.collect.recruitFree.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.collect.recruitConfirm.x, COORDS.collect.recruitConfirm.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapAnywhere(op);
      await this.goBack(op);
    }
  }

  // --- 日常任务 ---

  class OrgBlessingTask extends BaseTask {
    constructor() { super('组织祈福', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [组织祈福] 执行中...');
      // 进入组织 → 祈福
      await op.clickNatural(COORDS.daily.orgBlessEntry.x, COORDS.daily.orgBlessEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.orgBlessBtn.x, COORDS.daily.orgBlessBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
      await this.goBack(op);
    }
  }

  class AbundanceRoomTask extends BaseTask {
    constructor() { super('丰饶之间', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [丰饶之间] 执行中...');
      // 进入冒险 → 丰饶之间
      await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.abundanceEntry.x, COORDS.daily.abundanceEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      // 挑战
      await op.clickNatural(COORDS.daily.abundanceChallenge.x, COORDS.daily.abundanceChallenge.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      // 等待战斗
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class SquadRaidTask extends BaseTask {
    constructor() { super('小队突袭', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [小队突袭] 执行中...');
      await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.squadEntry.x, COORDS.daily.squadEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.squadChallenge.x, COORDS.daily.squadChallenge.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class SurvivalTrialTask extends BaseTask {
    constructor() { super('生存试炼', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [生存试炼] 执行中...');
      await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.survivalEntry.x, COORDS.daily.survivalEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class EquipSweepTask extends BaseTask {
    constructor() { super('装备扫荡', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [装备扫荡] 执行中...');
      await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.equipEntry.x, COORDS.daily.equipEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.sweep.x, COORDS.common.sweep.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await this.tapConfirm(op);
      await this.goBack(op);
    }
  }

  class MissionHallTask extends BaseTask {
    constructor() { super('任务集会所', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [任务集会所] 执行中...');
      await op.clickNatural(COORDS.daily.missionEntry.x, COORDS.daily.missionEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      // 派遣任务
      for (let i = 0; i < 3; i++) {
        await op.clickNatural(COORDS.daily.missionDispatch.x, COORDS.daily.missionDispatch.y + i * 60);
        await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
        await this.tapConfirm(op);
      }
      await this.goBack(op);
    }
  }

  class SecretRealmTask extends BaseTask {
    constructor() { super('秘境挑战', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [秘境挑战] 执行中...');
      await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.daily.secretEntry.x, COORDS.daily.secretEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class ShopBuyTask extends BaseTask {
    constructor() { super('商店购买', 'daily'); }
    async execute(op, cfg) {
      Utils.log('info', '  [商店购买] 执行中...');
      await op.clickNatural(COORDS.main.shop.x, COORDS.main.shop.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      // 购买第一个推荐物品
      await op.clickNatural(COORDS.daily.shopItem1.x, COORDS.daily.shopItem1.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await op.clickNatural(COORDS.daily.shopBuyBtn.x, COORDS.daily.shopBuyBtn.y);
      await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));
      await op.clickNatural(COORDS.daily.shopConfirm.x, COORDS.daily.shopConfirm.y);
      await this.goBack(op);
    }
  }

  // --- 周常任务 ---

  class RoadOfPracticeTask extends BaseTask {
    constructor() { super('修行之路', 'weekly'); }
    async execute(op, cfg) {
      Utils.log('info', '  [修行之路] 执行中...');
      await op.clickNatural(COORDS.weekly.practiceEntry.x, COORDS.weekly.practiceEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.weekly.practiceStart.x, COORDS.weekly.practiceStart.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class ChaseAkatsukiTask extends BaseTask {
    constructor() { super('追击晓组织', 'weekly'); }
    async execute(op, cfg) {
      Utils.log('info', '  [追击晓组织] 执行中...');
      await op.clickNatural(COORDS.weekly.akatsukiEntry.x, COORDS.weekly.akatsukiEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class RebelNinjaTask extends BaseTask {
    constructor() { super('叛忍来袭', 'weekly'); }
    async execute(op, cfg) {
      Utils.log('info', '  [叛忍来袭] 执行中...');
      await op.clickNatural(COORDS.weekly.rebelEntry.x, COORDS.weekly.rebelEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class OrgFortressTask extends BaseTask {
    constructor() { super('组织要塞', 'weekly'); }
    async execute(op, cfg) {
      Utils.log('info', '  [组织要塞] 执行中...');
      await op.clickNatural(COORDS.weekly.fortressEntry.x, COORDS.weekly.fortressEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  class HeavenEarthTask extends BaseTask {
    constructor() { super('天地战场', 'weekly'); }
    async execute(op, cfg) {
      Utils.log('info', '  [天地战场] 执行中...');
      await op.clickNatural(COORDS.weekly.heavenEntry.x, COORDS.weekly.heavenEntry.y);
      await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));
      await op.clickNatural(COORDS.common.challenge.x, COORDS.common.challenge.y);
      await this.waitForBattle(op, cfg.get('delay.battle.max') || 90000);
      await this.goBack(op);
    }
  }

  // 任务工厂
  const TaskFactory = {
    createAll(config) {
      const tasks = [];
      const sw = config.get('taskSwitches');

      // 收获类
      if (sw.collectGold) tasks.push(new CollectGoldTask());
      if (sw.collectMail) tasks.push(new CollectMailTask());
      if (sw.collectSign) tasks.push(new CollectSignTask());
      if (sw.shareDaily) tasks.push(new ShareDailyTask());
      if (sw.sendStamina) tasks.push(new SendStaminaTask());
      if (sw.collectIntel) tasks.push(new CollectIntelTask());
      if (sw.collectRank) tasks.push(new CollectRankTask());
      if (sw.collectActive) tasks.push(new CollectActiveTask());
      if (sw.collectNinjutsu) tasks.push(new CollectNinjutsuTask());
      if (sw.recruit) tasks.push(new RecruitTask());

      // 日常
      if (sw.orgBlessing) tasks.push(new OrgBlessingTask());
      if (sw.abundanceRoom) tasks.push(new AbundanceRoomTask());
      if (sw.squadRaid) tasks.push(new SquadRaidTask());
      if (sw.survivalTrial) tasks.push(new SurvivalTrialTask());
      if (sw.equipSweep) tasks.push(new EquipSweepTask());
      if (sw.missionHall) tasks.push(new MissionHallTask());
      if (sw.secretRealm) tasks.push(new SecretRealmTask());
      if (sw.shopBuy) tasks.push(new ShopBuyTask());

      // 周常
      if (sw.roadOfPractice) tasks.push(new RoadOfPracticeTask());
      if (sw.chaseAkatsuki) tasks.push(new ChaseAkatsukiTask());
      if (sw.rebelNinja) tasks.push(new RebelNinjaTask());
      if (sw.orgFortress) tasks.push(new OrgFortressTask());
      if (sw.heavenEarth) tasks.push(new HeavenEarthTask());

      return tasks;
    },

    createSingle(taskName) {
      const map = {
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
      };
      const TaskClass = map[taskName];
      return TaskClass ? new TaskClass() : null;
    }
  };

  // ============================================================
  //  ui.js — 控制面板
  // ============================================================
  const UI_STYLES = `
    #naruto-auto-panel {
      position: fixed;
      top: 10px;
      right: 10px;
      width: 320px;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border: 1px solid #e94560;
      border-radius: 12px;
      color: #eee;
      font-family: 'Microsoft YaHei', sans-serif;
      font-size: 13px;
      z-index: 999999;
      box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
      user-select: none;
      overflow: hidden;
    }
    #naruto-auto-panel .panel-header {
      background: linear-gradient(90deg, #e94560, #0f3460);
      padding: 10px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    }
    #naruto-auto-panel .panel-header h3 {
      margin: 0;
      font-size: 14px;
      color: #fff;
    }
    #naruto-auto-panel .panel-header .close-btn {
      cursor: pointer;
      color: #fff;
      font-size: 18px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }
    #naruto-auto-panel .panel-header .close-btn:hover {
      background: rgba(255,255,255,0.2);
    }
    #naruto-auto-panel .panel-body {
      padding: 12px 15px;
      max-height: 500px;
      overflow-y: auto;
    }
    #naruto-auto-panel .section {
      margin-bottom: 12px;
    }
    #naruto-auto-panel .section-title {
      font-size: 12px;
      color: #e94560;
      margin-bottom: 6px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    #naruto-auto-panel .btn-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    #naruto-auto-panel .btn {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e94560;
      background: transparent;
      color: #e94560;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
      text-align: center;
    }
    #naruto-auto-panel .btn:hover {
      background: #e94560;
      color: #fff;
    }
    #naruto-auto-panel .btn.primary {
      background: #e94560;
      color: #fff;
    }
    #naruto-auto-panel .btn.primary:hover {
      background: #c73650;
    }
    #naruto-auto-panel .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #naruto-auto-panel .status-bar {
      background: rgba(0,0,0,0.3);
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 11px;
    }
    #naruto-auto-panel .status-bar .label {
      color: #888;
    }
    #naruto-auto-panel .status-bar .value {
      color: #0f3460;
      font-weight: bold;
    }
    #naruto-auto-panel .task-list {
      max-height: 200px;
      overflow-y: auto;
    }
    #naruto-auto-panel .task-item {
      display: flex;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    #naruto-auto-panel .task-item .task-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      flex-shrink: 0;
    }
    #naruto-auto-panel .task-item .task-status.pending { background: #555; }
    #naruto-auto-panel .task-item .task-status.running { background: #f39c12; animation: pulse 1s infinite; }
    #naruto-auto-panel .task-item .task-status.done { background: #2ecc71; }
    #naruto-auto-panel .task-item .task-status.failed { background: #e74c3c; }
    #naruto-auto-panel .task-item .task-name {
      flex: 1;
      font-size: 12px;
    }
    #naruto-auto-panel .task-item .task-time {
      font-size: 10px;
      color: #888;
    }
    #naruto-auto-panel .log-area {
      background: rgba(0,0,0,0.4);
      padding: 8px;
      border-radius: 6px;
      max-height: 120px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.6;
      color: #aaa;
    }
    #naruto-auto-panel .log-area .log-info { color: #3498db; }
    #naruto-auto-panel .log-area .log-warn { color: #f39c12; }
    #naruto-auto-panel .log-area .log-error { color: #e74c3c; }
    #naruto-auto-panel .log-area .log-success { color: #2ecc71; }
    #naruto-auto-panel .checkbox-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    #naruto-auto-panel .checkbox-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
    }
    #naruto-auto-panel .checkbox-item input {
      accent-color: #e94560;
    }
    #naruto-auto-panel .minimize-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 30px;
      height: 30px;
      background: #e94560;
      border: none;
      border-radius: 50%;
      color: #fff;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      z-index: 1000000;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  class ControlPanel {
    constructor(scheduler, config) {
      this.scheduler = scheduler;
      this.config = config;
      this.panel = null;
      this.logBuffer = [];
      this.maxLogLines = 50;
      this.dragState = { dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 };
    }

    create() {
      // 注入样式
      GM_addStyle(UI_STYLES);

      // 创建面板
      this.panel = document.createElement('div');
      this.panel.id = 'naruto-auto-panel';
      this.panel.innerHTML = this.getHTML();
      document.body.appendChild(this.panel);

      // 绑定事件
      this.bindEvents();

      // 监听调度器事件
      this.bindSchedulerEvents();

      Utils.log('info', '控制面板已创建');
    }

    getHTML() {
      const sw = this.config.get('taskSwitches');
      return `
        <div class="panel-header" id="na-drag-handle">
          <h3>🍥 火影忍者自动化</h3>
          <span class="close-btn" id="na-close">×</span>
        </div>
        <div class="panel-body" id="na-panel-body">
          <!-- 状态栏 -->
          <div class="status-bar" id="na-status">
            <span class="label">状态：</span><span class="value" id="na-status-text">就绪</span>
            <span class="label" style="margin-left:10px">队列：</span><span class="value" id="na-queue-count">0</span>
            <span class="label" style="margin-left:10px">完成：</span><span class="value" id="na-done-count">0</span>
          </div>

          <!-- 控制按钮 -->
          <div class="btn-row">
            <button class="btn primary" id="na-btn-start">▶ 开始执行</button>
            <button class="btn" id="na-btn-pause" disabled>⏸ 暂停</button>
            <button class="btn" id="na-btn-stop" disabled>⏹ 停止</button>
          </div>

          <!-- 快捷操作 -->
          <div class="section">
            <div class="section-title">快捷操作</div>
            <div class="btn-row">
              <button class="btn" id="na-btn-collect">🎁 一键收获</button>
              <button class="btn" id="na-btn-daily">⚔ 日常任务</button>
            </div>
            <div class="btn-row">
              <button class="btn" id="na-btn-weekly">📅 周常任务</button>
              <button class="btn" id="na-btn-config">⚙ 配置</button>
            </div>
          </div>

          <!-- 任务开关 -->
          <div class="section" id="na-task-switches" style="display:none">
            <div class="section-title">任务开关</div>
            <div class="checkbox-group">
              ${this.generateCheckboxes(sw)}
            </div>
            <div class="btn-row" style="margin-top:8px">
              <button class="btn" id="na-btn-save-config">保存</button>
              <button class="btn" id="na-btn-reset-config">重置</button>
            </div>
          </div>

          <!-- 任务列表 -->
          <div class="section">
            <div class="section-title">任务列表</div>
            <div class="task-list" id="na-task-list"></div>
          </div>

          <!-- 日志 -->
          <div class="section">
            <div class="section-title">运行日志</div>
            <div class="log-area" id="na-log-area"></div>
          </div>
        </div>
      `;
    }

    generateCheckboxes(sw) {
      const labels = {
        collectGold: '招财', collectMail: '邮件', collectSign: '签到',
        shareDaily: '分享', sendStamina: '赠体力', collectIntel: '情报社',
        collectRank: '排行榜', collectActive: '活跃度', collectNinjutsu: '忍法帖',
        recruit: '招募', orgBlessing: '组织祈福', abundanceRoom: '丰饶之间',
        squadRaid: '小队突袭', survivalTrial: '生存试炼', equipSweep: '装备扫荡',
        missionHall: '集会所', secretRealm: '秘境', shopBuy: '商店',
        roadOfPractice: '修行之路', chaseAkatsuki: '追击晓', rebelNinja: '叛忍来袭',
        orgFortress: '组织要塞', heavenEarth: '天地战场',
      };
      return Object.entries(sw).map(([key, val]) =>
        `<label class="checkbox-item">
          <input type="checkbox" data-task="${key}" ${val ? 'checked' : ''}>
          ${labels[key] || key}
        </label>`
      ).join('');
    }

    bindEvents() {
      // 拖拽
      const handle = document.getElementById('na-drag-handle');
      handle.addEventListener('mousedown', (e) => {
        this.dragState.dragging = true;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;
        const rect = this.panel.getBoundingClientRect();
        this.dragState.origX = rect.left;
        this.dragState.origY = rect.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!this.dragState.dragging) return;
        const dx = e.clientX - this.dragState.startX;
        const dy = e.clientY - this.dragState.startY;
        this.panel.style.left = (this.dragState.origX + dx) + 'px';
        this.panel.style.top = (this.dragState.origY + dy) + 'px';
        this.panel.style.right = 'auto';
      });
      document.addEventListener('mouseup', () => {
        this.dragState.dragging = false;
      });

      // 关闭
      document.getElementById('na-close').addEventListener('click', () => {
        this.panel.style.display = 'none';
      });

      // 开始
      document.getElementById('na-btn-start').addEventListener('click', async () => {
        const tasks = TaskFactory.createAll(this.config);
        if (tasks.length === 0) {
          this.addLog('warn', '没有启用的任务');
          return;
        }
        this.scheduler.taskQueue = [];
        this.scheduler.addTasks(tasks);
        this.updateTaskList(tasks);
        document.getElementById('na-btn-start').disabled = true;
        document.getElementById('na-btn-pause').disabled = false;
        document.getElementById('na-btn-stop').disabled = false;
        await this.scheduler.start();
        document.getElementById('na-btn-start').disabled = false;
        document.getElementById('na-btn-pause').disabled = true;
        document.getElementById('na-btn-stop').disabled = true;
      });

      // 暂停/恢复
      document.getElementById('na-btn-pause').addEventListener('click', () => {
        if (this.scheduler.paused) {
          this.scheduler.resume();
          document.getElementById('na-btn-pause').textContent = '⏸ 暂停';
        } else {
          this.scheduler.pause();
          document.getElementById('na-btn-pause').textContent = '▶ 恢复';
        }
      });

      // 停止
      document.getElementById('na-btn-stop').addEventListener('click', () => {
        this.scheduler.stop();
        document.getElementById('na-btn-start').disabled = false;
        document.getElementById('na-btn-pause').disabled = true;
        document.getElementById('na-btn-stop').disabled = true;
        document.getElementById('na-btn-pause').textContent = '⏸ 暂停';
      });

      // 一键收获
      document.getElementById('na-btn-collect').addEventListener('click', async () => {
        const collectKeys = ['collectGold','collectMail','collectSign','shareDaily',
          'sendStamina','collectIntel','collectRank','collectActive','collectNinjutsu','recruit'];
        const tasks = collectKeys.map(k => TaskFactory.createSingle(k)).filter(Boolean);
        this.scheduler.taskQueue = [];
        this.scheduler.addTasks(tasks);
        this.updateTaskList(tasks);
        await this.scheduler.start();
      });

      // 日常任务
      document.getElementById('na-btn-daily').addEventListener('click', async () => {
        const dailyKeys = ['orgBlessing','abundanceRoom','squadRaid','survivalTrial',
          'equipSweep','missionHall','secretRealm','shopBuy'];
        const tasks = dailyKeys.map(k => TaskFactory.createSingle(k)).filter(Boolean);
        this.scheduler.taskQueue = [];
        this.scheduler.addTasks(tasks);
        this.updateTaskList(tasks);
        await this.scheduler.start();
      });

      // 周常任务
      document.getElementById('na-btn-weekly').addEventListener('click', async () => {
        const weeklyKeys = ['roadOfPractice','chaseAkatsuki','rebelNinja','orgFortress','heavenEarth'];
        const tasks = weeklyKeys.map(k => TaskFactory.createSingle(k)).filter(Boolean);
        this.scheduler.taskQueue = [];
        this.scheduler.addTasks(tasks);
        this.updateTaskList(tasks);
        await this.scheduler.start();
      });

      // 配置面板
      document.getElementById('na-btn-config').addEventListener('click', () => {
        const el = document.getElementById('na-task-switches');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      });

      // 保存配置
      document.getElementById('na-btn-save-config').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#na-task-switches input[type="checkbox"]');
        checkboxes.forEach(cb => {
          this.config.set(`taskSwitches.${cb.dataset.task}`, cb.checked);
        });
        this.config.save();
        this.addLog('success', '配置已保存');
      });

      // 重置配置
      document.getElementById('na-btn-reset-config').addEventListener('click', () => {
        this.config.reset();
        this.addLog('info', '配置已重置为默认值');
        location.reload();
      });
    }

    bindSchedulerEvents() {
      this.scheduler.on('start', (data) => {
        this.addLog('info', `开始执行，共 ${data.total} 个任务`);
        document.getElementById('na-status-text').textContent = '运行中';
      });

      this.scheduler.on('taskStart', (task) => {
        this.addLog('info', `▶ ${task.name}`);
        this.updateTaskStatus(task, 'running');
      });

      this.scheduler.on('taskDone', (task) => {
        this.addLog('success', `✓ ${task.name} 完成`);
        this.updateTaskStatus(task, 'done');
        const done = this.scheduler.history.filter(h => h.result === 'success').length;
        document.getElementById('na-done-count').textContent = done;
      });

      this.scheduler.on('taskFailed', ({ task, error }) => {
        this.addLog('error', `✗ ${task.name} 失败: ${error.message}`);
        this.updateTaskStatus(task, 'failed');
      });

      this.scheduler.on('pause', () => {
        document.getElementById('na-status-text').textContent = '已暂停';
        this.addLog('warn', '已暂停');
      });

      this.scheduler.on('resume', () => {
        document.getElementById('na-status-text').textContent = '运行中';
        this.addLog('info', '已恢复');
      });

      this.scheduler.on('stop', () => {
        document.getElementById('na-status-text').textContent = '已停止';
        this.addLog('warn', '已停止');
      });

      this.scheduler.on('complete', (data) => {
        document.getElementById('na-status-text').textContent = '完成';
        this.addLog('success', `全部完成！成功 ${data.success}，失败 ${data.failed}`);
      });
    }

    updateTaskList(tasks) {
      const list = document.getElementById('na-task-list');
      list.innerHTML = tasks.map(t =>
        `<div class="task-item" data-task-name="${t.name}">
          <span class="task-status ${t.status}"></span>
          <span class="task-name">${t.name}</span>
          <span class="task-time"></span>
        </div>`
      ).join('');
    }

    updateTaskStatus(task, status) {
      const item = document.querySelector(`.task-item[data-task-name="${task.name}"]`);
      if (item) {
        const dot = item.querySelector('.task-status');
        dot.className = `task-status ${status}`;
        if (status === 'done' || status === 'failed') {
          const time = item.querySelector('.task-time');
          time.textContent = Utils.formatDuration(task.endTime - task.startTime);
        }
      }
    }

    addLog(level, text) {
      const area = document.getElementById('na-log-area');
      if (!area) return;
      const ts = new Date().toLocaleTimeString();
      const cls = level === 'error' ? 'log-error' :
                  level === 'warn' ? 'log-warn' :
                  level === 'success' ? 'log-success' : 'log-info';
      this.logBuffer.push(`<span class="${cls}">[${ts}] ${text}</span>`);
      if (this.logBuffer.length > this.maxLogLines) this.logBuffer.shift();
      area.innerHTML = this.logBuffer.join('<br>');
      area.scrollTop = area.scrollHeight;
    }
  }

  // ============================================================
  //  main.js — 主入口
  // ============================================================
  class NarutoAuto {
    constructor() {
      this.config = new Config();
      this.operator = new GameOperator();
      this.scheduler = new TaskScheduler(this.operator, this.config);
      this.panel = null;
    }

    async init() {
      Utils.log('info', '========================================');
      Utils.log('info', '  火影忍者云游戏自动化 v0.1.0');
      Utils.log('info', '========================================');

      // 检查是否在云游戏页面
      const isCloudGame = window.location.href.includes('start.qq.com') ||
                          window.location.href.includes('gamer.qq.com');

      if (!isCloudGame) {
        Utils.log('warn', '当前不在云游戏页面，脚本不启动');
        return;
      }

      // 初始化 TCGSDK
      const sdkReady = await this.operator.init();
      if (!sdkReady) {
        Utils.log('warn', 'TCGSDK 未就绪，面板仍会显示（可手动重试）');
      }

      // 创建控制面板
      this.panel = new ControlPanel(this.scheduler, this.config);
      this.panel.create();

      // 全局引用（调试用）
      window.__narutoAuto = {
        config: this.config,
        operator: this.operator,
        scheduler: this.scheduler,
        panel: this.panel,
        coords: COORDS,
      };

      Utils.log('info', '初始化完成，等待操作...');
    }
  }

  // 启动
  const app = new NarutoAuto();
  app.init().catch(err => {
    console.error('[NarutoAuto] 初始化失败:', err);
  });

})();
