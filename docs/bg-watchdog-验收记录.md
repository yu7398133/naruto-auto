# v0.6.38 后台挂机视觉保活 — 验收记录

日期: 2026-09-28

## 问题
窗口最小化后 Chromium 冻结标签页，把云游戏 <video> 置为 paused，
画面冻在最后一帧。脚本基于 drawImage(video) 的场景判定会永远返回
同一结果 → 照着过期画面狂点坐标，全程无感知。日志表现为：
坐标整体错位（如 (1515,30) 变 (229,14)）、场景恒为 other、
长时间静默后报「长时间未操作已退出游戏」。

## 实测证据（修改前）
tools/bg-sampler.js 最小化状态下 8 次采样：
  ct 卡死 2.21、hash 8 次完全相同 → 确认陈帧

## 修改
1. naruto-auto.user.js 新增 _watchBackground()（L10507）
   - 最小化时检测 paused → 主动 play() 唤醒
   - readyState===0（重连中）不插手，避免打断恢复
   - 附带陈帧检测：连续 4 次画面不变则告警
   - config: vision.backgroundWatch（默认 true）
2. naruto-bg-watchdog.user.js 独立看门狗（可单独安装）
3. 版本 0.6.36 → 0.6.38

## 验收结果（修改后，全程最小化）
  hidden 采样 14/15
  ct 推进 65.5s / 实际 65s (101%)  ✅
  帧 hash 去重 14/14               ✅ 每帧都不同
  paused 冻结次数 0                ✅
  场景识别稳定 home                ✅
  末尾 ct 归零为播放器自身重连，非冻结

## 备份
  backups/naruto-auto.v0.6.36.20260928-145436.user.js  (改前基线)
  backups/Cent Browser.lnk.bak                          (快捷方式原始参数)
  backups/config-before-reinstall.json                  (重装前配置)

## 桌面快捷方式附加参数
  --disable-background-timer-throttling
  --disable-backgrounding-occluded-windows
  --disable-renderer-backgrounding
  --disable-background-media-suspend
  --disable-features=CalculateNativeWinOcclusion
（保留原有 --remote-debugging-port=9222 --remote-allow-origins=*）

## 仍待处理
  - nav.blindBack 仍为 false（日志中反复建议开启）
  - 锁屏/息屏仍会导致合成器停摆，看门狗无法挽救
