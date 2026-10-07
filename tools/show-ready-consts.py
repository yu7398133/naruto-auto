import io
P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
# 用 add-arena-ready 里的常量区域，跑一个离线两态测量
# 素材：arena-tail-frames 里 a061（战斗中/结算附近）、a063-a066（结算）、其余战斗
import os, subprocess, json
print('区域常量:', [l for l in s.split('\n') if 'ARENA_READY_REGION' in l and 'const' in l])
print('阈值常量:', [l for l in s.split('\n') if 'ARENA_READY_BLUE_MIN' in l and 'const' in l])
print('轮询常量:', [l for l in s.split('\n') if 'ARENA_READY_POLL_MS' in l and 'const' in l])
