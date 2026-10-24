// canvas.js —— 面板流图
//   · 无拓扑边：所有节点竖排居中
//   · 有拓扑边（observe 的 { from } 声明）：按深度分层排布，贝塞尔连线，
//     next 事件发生时一个小数据包沿边飞行。
//
// 动画速度与单步模式（由 mount.js 传入）：
//   animSpeed  动画倍速（0.25~3），包飞行/脉冲时长 = 600ms / animSpeed
//   live       实时模式；false 时只显示 seq <= shownSeq 的事件（单步揭示）
//   revealAt   单步模式里最近一次「揭示」的时刻，包动画从揭示时刻起算
//
// 入参 { sources, edges, selectedName } 来自 recorder。

const BASE_MS = 600; // 1× 速度下包飞行/脉冲时长

export function drawFrame(ctx, W, H, opts) {
  const {
    sources, edges, selectedName,
    animSpeed = 1, live = true, shownSeq = Infinity, revealAt = 0,
  } = opts;
  ctx.clearRect(0, 0, W, H);

  // 点阵网格背景
  ctx.fillStyle = 'rgba(56,66,86,.22)';
  for (let x = 14; x < W; x += 26)
    for (let y = 14; y < H; y += 26)
      ctx.fillRect(x, y, 1.5, 1.5);

  if (!sources.length) {
    ctx.fillStyle = '#5b6475';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('用 RxFlow.observe(source$, "name") 或 RxFlow.autoTrack()', W / 2, H / 2);
    return;
  }

  const now = performance.now();
  const dur = BASE_MS / animSpeed;                       // 速度越慢动画越长
  const shown = (ev) => live || (ev.seq <= shownSeq);    // 单步模式的事件可见性
  const evTime = (ev) => (live ? ev.pt : Math.max(ev.pt, revealAt)); // 单步时包从揭示时刻起飞

  const byName = new Map(sources.map(s => [s.name, s]));
  const es = (edges || []).filter(([f, t]) => byName.has(f) && byName.has(t));

  const nodes = es.length ? layoutDag(sources, es, W, H) : layoutStack(sources, W, H);
  const posOf = new Map(nodes.map(n => [n.source.name, n]));

  // 连线（在节点下层画）
  es.forEach(([f, t]) => {
    const a = posOf.get(f), b = posOf.get(t);
    if (!a || !b) return;
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const dx = Math.max(30, (x2 - x1) * 0.5);
    const c1x = x1 + dx, c1y = y1, c2x = x2 - dx, c2y = y2;
    ctx.strokeStyle = 'rgba(90,104,130,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
    ctx.stroke();

    // 箭头
    ctx.fillStyle = 'rgba(90,104,130,.8)';
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 6, y2 - 3.5);
    ctx.lineTo(x2 - 6, y2 + 3.5);
    ctx.closePath();
    ctx.fill();

    // 数据包：from 节点最近发生的 next 事件沿边飞行
    const src = byName.get(f);
    let drawn = 0;
    for (let i = src.events.length - 1; i >= 0 && drawn < 3; i--) {
      const ev = src.events[i];
      if (ev.type !== 'next' || !shown(ev)) continue;
      const age = now - evTime(ev);
      if (age > dur) break;
      const p = age / dur;
      const pt = cubicAt(x1, y1, c1x, c1y, c2x, c2y, x2, y2, p);
      ctx.beginPath();
      ctx.fillStyle = src.color;
      ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // 拖尾
      const tail = cubicAt(x1, y1, c1x, c1y, c2x, c2y, x2, y2, Math.max(0, p - 0.08));
      ctx.strokeStyle = hexA(src.color, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      drawn++;
    }
  });

  // 节点
  nodes.forEach(n => drawNode(ctx, n, selectedName, { now, dur, shown, evTime, live }));
}

/* ---------- 布局 ---------- */

// 竖排单列（无拓扑边时）
function layoutStack(sources, W, H) {
  const n = sources.length;
  const nodeW = Math.min(220, Math.max(120, W - 60));
  const nodeH = 60, gapY = 18;
  const totalH = n * nodeH + (n - 1) * gapY;
  const startY = Math.max(10, (H - totalH) / 2);
  const x = W / 2 - nodeW / 2;
  return sources.map((s, i) => ({ source: s, x, y: startY + i * (nodeH + gapY), w: nodeW, h: nodeH }));
}

// 分层 DAG：depth = 最长路径；同一 depth 一列，列内竖排居中
function layoutDag(sources, es, W, H) {
  const depth = new Map(sources.map(s => [s.name, 0]));
  let changed = true, guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    es.forEach(([f, t]) => {
      const d = depth.get(f) + 1;
      if (d > depth.get(t)) { depth.set(t, d); changed = true; }
    });
  }
  const cols = new Map();
  sources.forEach(s => {
    const d = depth.get(s.name);
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d).push(s);
  });
  const order = Array.from(cols.keys()).sort((a, b) => a - b);
  const nCols = order.length;
  const colGap = 34;
  const nodeW = Math.max(120, Math.min(190, (W - 24 - (nCols - 1) * colGap) / nCols));
  const nodeH = 58, gapY = 16;

  return order.map((d, ci) => {
    const list = cols.get(d);
    const totalH = list.length * nodeH + (list.length - 1) * gapY;
    const startY = Math.max(10, (H - totalH) / 2);
    const x = 12 + ci * (nodeW + colGap);
    return list.map((s, ri) => ({ source: s, x, y: startY + ri * (nodeH + gapY), w: nodeW, h: nodeH }));
  }).flat();
}

/* ---------- 绘制 ---------- */

function drawNode(ctx, n, selectedName, env) {
  const s = n.source;
  const { x, y, w, h } = n;
  const { now, dur, shown, evTime, live } = env;
  const active = s.name === selectedName;

  // 单步模式下「当前可见的最近事件」决定了值文本与脉冲
  let lastVisible = null;
  for (let i = s.events.length - 1; i >= 0; i--) {
    if (shown(s.events[i])) { lastVisible = s.events[i]; break; }
  }
  let displayValue = '—';
  for (let i = s.events.length - 1; i >= 0; i--) {
    const ev = s.events[i];
    if (ev.type === 'next' && shown(ev)) { displayValue = ev.value; break; }
  }

  // 脉冲环：最近可见事件（next 流色 / error 红）
  if (lastVisible) {
    const age = now - evTime(lastVisible);
    if (age >= 0 && age < dur) {
      const p = age / dur;
      const isErr = lastVisible.type === 'error';
      ctx.strokeStyle = isErr ? `rgba(232,89,79,${0.65 * (1 - p)})` : hexA(s.color, 0.6 * (1 - p));
      ctx.lineWidth = 2;
      roundRect(ctx, x - 3 - p * 6, y - 3 - p * 6, w + 6 + p * 12, h + 6 + p * 12, 11);
      ctx.stroke();
    }
  }

  ctx.fillStyle = active ? '#1e2636' : '#181d27';
  ctx.strokeStyle = active ? '#4da3ff' : s.color;
  ctx.lineWidth = active ? 2.2 : 1.4;
  roundRect(ctx, x, y, w, h, 9); ctx.fill(); ctx.stroke();

  // 左色条
  ctx.fillStyle = s.color;
  roundRect(ctx, x + 1, y + 8, 3, h - 16, 2); ctx.fill();

  // 流名（右侧避让 next 计数徽标）
  const countStr = String(s.nexts);
  const nameAvail = w - 26 - (countStr.length * 7 + 10);
  ctx.fillStyle = '#eef2f9';
  ctx.font = '600 12px monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(shorten(s.name, Math.max(4, Math.floor(nameAvail / 7.2))), x + 13, y + 17);

  // 最近值（右侧避让 ✕ 错误徽标，避免文字被盖住）
  const valAvail = w - 26 - (s.errors > 0 ? 46 : 0);
  ctx.fillStyle = '#8a94a6';
  ctx.font = '10.5px monospace';
  ctx.fillText(shorten(String(displayValue), Math.max(4, Math.floor(valAvail / 6.2))), x + 13, y + 38);

  // next 计数
  ctx.fillStyle = s.color;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(countStr, x + w - 10, y + 17);
  ctx.textAlign = 'left';

  // error 徽标
  if (s.errors > 0) {
    ctx.fillStyle = '#3a1412';
    roundRect(ctx, x + w - 44, y + 30, 34, 15, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(232,89,79,.7)'; ctx.lineWidth = 1;
    roundRect(ctx, x + w - 44, y + 30, 34, 15, 7); ctx.stroke();
    ctx.fillStyle = '#e8594f';
    ctx.font = '600 9.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('✕' + s.errors, x + w - 27, y + 38);
    ctx.textAlign = 'left';
  }
}

/* ---------- 工具 ---------- */

function cubicAt(x1, y1, c1x, c1y, c2x, c2y, x2, y2, t) {
  const u = 1 - t;
  return {
    x: u*u*u*x1 + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*x2,
    y: u*u*u*y1 + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*y2,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hexA(hex, a) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
