const SECRET_REALM_KEY_HOLD_MAX = 8000;
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

const cases = JSON.parse(process.argv[2]);
const out = [];
for (const c of cases) {
  const tl = buildKeyTimeline(c.seq, 60);
  // 逐事件模拟，检查配对与并发
  let live = 0, peak = 0, errs = [];
  const held = new Map();
  for (const ev of tl.events) {
    if (ev.act === 'down') {
      if (held.has(ev.key)) errs.push('重复按下 ' + ev.key + '@' + ev.at);
      held.set(ev.key, ev.at);
      live++;
      if (live > peak) peak = live;
    } else {
      if (!held.has(ev.key)) errs.push('无配对抬起 ' + ev.key + '@' + ev.at);
      else held.delete(ev.key);
      live--;
      if (live < 0) errs.push('并发为负 @' + ev.at);
    }
  }
  out.push({ name: c.name, keys: c.seq.length, events: tl.events.length,
             totalMs: tl.totalMs, peak, dropped: tl.dropped,
             leftover: [...held.keys()], errs });
}
console.log(JSON.stringify(out));
