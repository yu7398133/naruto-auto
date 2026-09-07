// ============================================================
//  坐标预设 - 常用 UI 元素坐标参考
//  基准分辨率: 1280 × 720
//
//  使用方法:
//  1. 用坐标标定工具校准实际坐标
//  2. 将校准结果更新到 naruto-auto.user.js 的 COORDS 对象中
//
//  注意: 以下坐标为估算值，仅供参考！
// ============================================================

const COORD_PRESETS = {
  // === 底部导航栏 ===
  // 游戏主界面底部的5个导航按钮
  bottomNav: {
    y: 650,  // 所有底部按钮的 Y 坐标
    buttons: {
      adventure:  { x: 150, label: '冒险' },
      shop:       { x: 400, label: '商店' },
      team:       { x: 650, label: '小队' },
      event:      { x: 900, label: '活动' },
      home:       { x: 1100, label: '主页' },
    }
  },

  // === 通用按钮位置 ===
  common: {
    // 返回按钮 (左上角箭头)
    back: { x: 50, y: 40, label: '返回' },
    // 关闭按钮 (右上角 X)
    close: { x: 1230, y: 40, label: '关闭' },
    // 通用确认按钮 (画面中央偏下)
    confirmCenter: { x: 640, y: 500, label: '确认(中央)' },
    // 弹窗确认按钮 (偏左)
    confirmLeft: { x: 540, y: 450, label: '确认(左)' },
    // 弹窗取消按钮 (偏右)
    confirmRight: { x: 740, y: 450, label: '取消(右)' },
    // 挑战按钮 (右下)
    challenge: { x: 1100, y: 600, label: '挑战' },
    // 扫荡按钮
    sweep: { x: 1000, y: 600, label: '扫荡' },
    // 开始战斗 (右下角)
    startBattle: { x: 1100, y: 650, label: '开始战斗' },
    // 跳过按钮 (右上)
    skip: { x: 1200, y: 50, label: '跳过' },
    // 点击任意位置继续
    tapAny: { x: 640, y: 400, label: '点击继续' },
  },

  // === 冒险子菜单 ===
  // 点击"冒险"后出现的子菜单
  adventureMenu: {
    // 第一行 (y=300)
    row1: {
      y: 300,
      items: {
        abundance:  { x: 300, label: '丰饶之间' },
        squad:      { x: 500, label: '小队突袭' },
        survival:   { x: 700, label: '生存试炼' },
        orgBless:   { x: 900, label: '组织祈福' },
      }
    },
    // 第二行 (y=450)
    row2: {
      y: 450,
      items: {
        equip:      { x: 300, label: '装备扫荡' },
        mission:    { x: 500, label: '任务集会所' },
        secret:     { x: 700, label: '秘境挑战' },
      }
    }
  },

  // === 战斗界面 ===
  battle: {
    // 自动战斗开关 (右侧中间)
    autoFight: { x: 1200, y: 360, label: '自动战斗' },
    // 加速按钮
    speedUp: { x: 1200, y: 300, label: '加速' },
    // 大招按钮
    ultSkill: { x: 1100, y: 500, label: '大招' },
    // 战斗结束确认 (中央)
    battleEnd: { x: 640, y: 550, label: '战斗结束确认' },
  },

  // === 活跃度宝箱 ===
  activeBoxes: [
    { x: 300, y: 550, label: '活跃度宝箱1' },
    { x: 500, y: 550, label: '活跃度宝箱2' },
    { x: 700, y: 550, label: '活跃度宝箱3' },
    { x: 900, y: 550, label: '活跃度宝箱4' },
  ],

  // === 商店 ===
  shop: {
    // 第一个商品位置
    item1: { x: 300, y: 350, label: '商品1' },
    // 购买按钮
    buyBtn: { x: 1000, y: 500, label: '购买' },
    // 确认购买
    confirm: { x: 540, y: 450, label: '确认购买' },
  },
};

// 导出到全局（调试用）
if (typeof window !== 'undefined') {
  window.__coordPresets = COORD_PRESETS;
}

// Node.js 导出
if (typeof module !== 'undefined') {
  module.exports = COORD_PRESETS;
}
