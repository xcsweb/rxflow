// mount.js —— 把悬浮球 + 调试面板注入页面
// 自动创建 <style>、<div id="rxfw-root">，订阅 recorder 事件实时刷新。
//
// 性能策略：recorder.subscribe 只做「标脏」，所有 DOM 渲染合并到 rAF 帧里，
// 高频流（例如 20 值/秒）也只按帧率重绘一次。

import { recorder } from '../recorder.js';
import cssText from './panel.css.js';
import { drawFrame } from './canvas.js';
import { buildValueTree } from './inspector.js';

let mounted = false;
let rootEl = null;
let panelEl = null;
let fabEl = null;
let fabPulseEl = null;
let listEl = null;
let logEl = null;
let logHeadEl = null;
let inspEl = null;
let inspBodyEl = null;
let inspTitleEl = null;
let canvasEl = null;
let tagEl = null;
let pauseBtn = null;

let selectedName = null;
/** @type {Array} 当前日志渲染的快照（行 → 事件对象引用） */
let logSnapshot = [];
let selectedEvent = null;

let listDirty = true;
let logDirty = true;
let rafId = null;
let fallbackId = null;
let lastFrameAt = 0;

// 播放控制：动画倍速 + 单步模式（冻结画面逐条揭示新事件）
let animSpeed = 1;
let liveMode = true;
let shownSeq = 0;
let revealAt = 0;

export function mount(options = {}) {
  if (mounted) return;
  mounted = true;

  // 注入样式
  const style = document.createElement('style');
  style.id = 'rxfw-style';
  style.textContent = cssText;
  document.head.appendChild(style);

  // 根容器
  rootEl = document.createElement('div');
  rootEl.id = 'rxfw-root';
  rootEl.className = 'rxfw-root';
  rootEl.innerHTML = `
    <div class="rxfw-fab" title="RxFlow 调试面板 (Ctrl+\`)">
      <span class="rxfw-pulse"></span>
      Rx
    </div>
    <div class="rxfw-panel rxfw-hidden">
      <div class="rxfw-head">
        <div class="rxfw-logo">Rx</div>
        <b>RxFlow</b><span class="rxfw-tag">● 录制中</span>
        <div class="rxfw-spacer"></div>
        <button data-act="toggle-log" title="显示/隐藏值日志栏">日志</button>
        <button data-act="pause">暂停</button>
        <button data-act="clear">清空</button>
        <button data-act="close">收起</button>
      </div>
      <div class="rxfw-body">
        <div class="rxfw-list"></div>
        <div class="rxfw-stage">
          <canvas></canvas>
          <div class="rxfw-ctrl">
            <span>速度</span>
            <input type="range" min="0.25" max="3" step="0.25" value="1" data-act="speed" title="动画播放速度">
            <span class="rxfw-speed-val">1×</span>
            <button data-act="step" title="冻结画面，逐条揭示新事件">单步</button>
            <button data-act="golive" style="display:none">回实时</button>
          </div>
        </div>
        <div class="rxfw-logwrap">
          <div class="rxfw-log-head">
            <span>事件日志</span><span class="rxfw-log-tip">点击值看详情</span>
            <div class="rxfw-spacer" style="flex:1"></div>
          </div>
          <div class="rxfw-log"></div>
          <div class="rxfw-inspector" style="display:none">
            <div class="rxfw-insp-head">
              <span class="rxfw-insp-title">值</span>
              <button data-act="insp-back">← 返回</button>
            </div>
            <div class="rxfw-insp-body"></div>
          </div>
        </div>
      </div>
      <div class="rxfw-foot">
        <span>sources: <b class="rxfw-stat-sources">0</b></span>
        <span>next: <b class="rxfw-stat-next">0</b></span>
        <span>err: <b class="rxfw-stat-err">0</b></span>
        <span class="rxfw-foot-tip"><kbd>Ctrl+\`</kbd> 开关 <kbd>Esc</kbd> 收起</span>
      </div>
    </div>
  `;
  document.body.appendChild(rootEl);

  fabEl = rootEl.querySelector('.rxfw-fab');
  fabPulseEl = fabEl.querySelector('.rxfw-pulse');
  panelEl = rootEl.querySelector('.rxfw-panel');
  listEl = rootEl.querySelector('.rxfw-list');
  logEl = rootEl.querySelector('.rxfw-log');
  logHeadEl = rootEl.querySelector('.rxfw-log-head');
  inspEl = rootEl.querySelector('.rxfw-inspector');
  inspBodyEl = rootEl.querySelector('.rxfw-insp-body');
  inspTitleEl = rootEl.querySelector('.rxfw-insp-title');
  canvasEl = rootEl.querySelector('.rxfw-stage canvas');
  tagEl = rootEl.querySelector('.rxfw-tag');
  pauseBtn = rootEl.querySelector('[data-act="pause"]');

  // 交互
  fabEl.addEventListener('click', toggle);
  rootEl.querySelector('[data-act="close"]').addEventListener('click', close);
  rootEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
    recorder.reset();
    closeInspector();
    listDirty = logDirty = true;
  });
  pauseBtn.addEventListener('click', () => recorder.setPaused(!recorder.paused));
  rootEl.querySelector('[data-act="speed"]').addEventListener('input', (e) => {
    animSpeed = Number(e.target.value) || 1;
    rootEl.querySelector('.rxfw-speed-val').textContent = animSpeed + '×';
  });
  rootEl.querySelector('[data-act="step"]').addEventListener('click', () => {
    if (liveMode) {
      liveMode = false;
      shownSeq = recorder.seq;          // 冻结在当前状态，之后的 events 逐条揭示
    } else if (shownSeq < recorder.seq) {
      shownSeq++;
    }
    revealAt = performance.now();       // 单步揭示的数据包从点击时刻起飞
    logDirty = true;
    syncCtrlUi();
  });
  rootEl.querySelector('[data-act="golive"]').addEventListener('click', () => {
    liveMode = true;
    logDirty = true;
    syncCtrlUi();
  });
  rootEl.querySelector('[data-act="toggle-log"]').addEventListener('click', () => {
    rootEl.querySelector('.rxfw-body').classList.toggle('rxfw-log-off');
    resizeCanvas();
  });
  rootEl.querySelector('[data-act="insp-back"]').addEventListener('click', closeInspector);

  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.rxfw-item');
    if (!item) return;
    selectedName = item.dataset.name;
    closeInspector();
    listDirty = logDirty = true;
  });

  logEl.addEventListener('click', (e) => {
    const row = e.target.closest('.rxfw-row');
    if (!row) return;
    const ev = logSnapshot[Number(row.dataset.i)];
    if (ev) openInspector(ev);
  });

  // 键盘：Ctrl+` 开关，Esc 收起
  window.addEventListener('keydown', onKeydown);

  // 订阅 recorder：只标脏 + 悬浮球脉冲
  recorder.subscribe((ev) => {
    if (ev.type === 'paused' || ev.type === 'resumed') {
      syncCtrlUi();
      listDirty = true;
      return;
    }
    if (ev.type === 'reset') {
      selectedName = null;
      liveMode = true;
      shownSeq = 0;
      closeInspector();
      syncCtrlUi();
    }
    fabEl.classList.remove('rxfw-hit');
    void fabEl.offsetWidth; // 重触发动画
    fabEl.classList.add('rxfw-hit');
    fabPulseEl.classList.toggle('rxfw-pulse-err', ev.type === 'error');
    fabEl.classList.toggle('rxfw-err', ev.type === 'error');
    listDirty = true;
    if (selectedName && liveMode && !recorder.paused) logDirty = true;
    if (!liveMode) syncCtrlUi();          // 单步模式下刷新「待显 N」计数
  });

  // 渲染循环
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  startLoop();
}

export function unmount() {
  if (!mounted) return;
  mounted = false;
  cancelAnimationFrame(rafId);
  clearInterval(fallbackId);
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('keydown', onKeydown);
  rootEl && rootEl.remove();
  document.getElementById('rxfw-style')?.remove();
  rootEl = fabEl = fabPulseEl = panelEl = listEl = logEl = logHeadEl = null;
  inspEl = inspBodyEl = inspTitleEl = canvasEl = tagEl = pauseBtn = null;
  selectedName = null;
  selectedEvent = null;
}

export function isOpen() {
  return !!panelEl && !panelEl.classList.contains('rxfw-hidden');
}

export function open() {
  if (!mounted) mount();
  if (!panelEl || isOpen()) return;
  panelEl.classList.remove('rxfw-hidden');
  resizeCanvas();
  listDirty = logDirty = true;
}

export function close() {
  if (!panelEl) return;
  panelEl.classList.add('rxfw-hidden');
}

export function toggle() {
  isOpen() ? close() : open();
}

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen()) { close(); return; }
  if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    toggle();
  }
}

function syncCtrlUi() {
  if (!pauseBtn || !tagEl) return;
  // 暂停按钮
  if (recorder.paused) {
    pauseBtn.textContent = '继续';
    pauseBtn.classList.add('rxfw-warn');
  } else {
    pauseBtn.textContent = '暂停';
    pauseBtn.classList.remove('rxfw-warn');
  }
  // 状态 tag：暂停 > 单步 > 录制中
  tagEl.classList.toggle('rxfw-paused', recorder.paused || !liveMode);
  if (recorder.paused) tagEl.textContent = '⏸ 已暂停';
  else if (!liveMode) tagEl.textContent = `⏭ 单步 · 待显 ${recorder.seq - shownSeq}`;
  else tagEl.textContent = '● 录制中';
  // 单步 / 回实时按钮
  const stepBtn = rootEl && rootEl.querySelector('[data-act="step"]');
  const liveBtn = rootEl && rootEl.querySelector('[data-act="golive"]');
  if (stepBtn && liveBtn) {
    stepBtn.textContent = liveMode ? '单步' : `单步(+${recorder.seq - shownSeq})`;
    liveBtn.style.display = liveMode ? 'none' : '';
  }
}

function resizeCanvas() {
  if (!canvasEl) return;
  const rect = canvasEl.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasEl.width = Math.max(1, rect.width * dpr);
  canvasEl.height = Math.max(1, rect.height * dpr);
  canvasEl.style.width = rect.width + 'px';
  canvasEl.style.height = rect.height + 'px';
  canvasEl.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderList() {
  const sources = recorder.getSources();
  const stats = rootEl.querySelector('.rxfw-stat-sources');
  let totalNext = 0, totalErr = 0;
  sources.forEach(s => { totalNext += s.nexts; totalErr += s.errors; });
  if (stats) stats.textContent = String(sources.length);
  const statNext = rootEl.querySelector('.rxfw-stat-next');
  const statErr = rootEl.querySelector('.rxfw-stat-err');
  if (statNext) statNext.textContent = String(totalNext);
  if (statErr) statErr.textContent = String(totalErr);

  if (!sources.length) {
    listEl.innerHTML = '<div class="rxfw-empty">还没有流被记录<br><br>用 RxFlow.observe(source$, "name")<br>或 RxFlow.autoTrack()</div>';
    return;
  }
  listEl.innerHTML = sources.map(s => `
    <div class="rxfw-item ${s.name === selectedName ? 'rxfw-active' : ''}" data-name="${escapeHtml(s.name)}">
      <div class="rxfw-name"><span class="rxfw-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}
        ${s.errors ? `<span class="rxfw-err-badge" title="${s.errors} 次错误">✕${s.errors}</span>` : ''}
      </div>
      <div class="rxfw-meta">next ${s.nexts} · ${s.nexts ? 'last: ' + escapeHtml(s.lastValue) : '—'}</div>
    </div>
  `).join('');
}

function renderLog() {
  if (!selectedName) { logEl.innerHTML = '<div class="rxfw-empty">点左侧流名看事件流</div>'; return; }
  const src = recorder.sources.get(selectedName);
  if (!src) { logEl.innerHTML = '<div class="rxfw-empty">流已清空</div>'; return; }

  let events = src.events.slice(-40);
  if (!liveMode) events = events.filter(ev => ev.seq <= shownSeq);
  logSnapshot = events;
  const rows = events.map((ev, i) => {
    const t = formatTime(ev.t);
    const badge = ev.type === 'next' ? '▸' : ev.type === 'error' ? '✕' : '■';
    const cur = !liveMode && ev.seq === shownSeq ? ' rxfw-cur' : '';
    return `<div class="rxfw-row rxfw-ev-${ev.type}${cur}" data-i="${i}">
      <span class="rxfw-t">${t}</span><span class="rxfw-badge">${badge}</span>
      <span class="rxfw-val">${escapeHtml(ev.value)}</span>
    </div>`;
  }).join('');
  logEl.innerHTML = rows || '<div class="rxfw-empty">暂无事件</div>';
  logEl.scrollTop = logEl.scrollHeight;
  if (logHeadEl) {
    logHeadEl.querySelector('.rxfw-log-tip')?.remove();
    const tip = document.createElement('span');
    tip.className = 'rxfw-log-tip';
    tip.textContent = `${src.nexts} next · ${src.errors} err`;
    logHeadEl.appendChild(tip);
  }
}

function openInspector(ev) {
  selectedEvent = ev;
  inspTitleEl.textContent = `${ev.type} @ ${formatTime(ev.t)}`;
  inspBodyEl.innerHTML = '';
  const value = ev.type === 'next' && ev.raw !== undefined ? ev.raw : ev.value;
  inspBodyEl.appendChild(buildValueTree(value));
  inspEl.style.display = '';
}

function closeInspector() {
  selectedEvent = null;
  if (inspEl) inspEl.style.display = 'none';
}

// 渲染调度：rAF 优先（流畅动画）；rAF 被浏览器节流/暂停时
// （后台标签页、遮挡窗口、部分 webview），用 250ms 定时器兜底，面板不僵死。
function startLoop() {
  lastFrameAt = performance.now();
  tick();
  fallbackId = setInterval(() => {
    if (performance.now() - lastFrameAt > 500) renderFrame();
  }, 250);
}

function tick() {
  rafId = requestAnimationFrame(tick);
  lastFrameAt = performance.now();
  renderFrame();
}

function renderFrame() {
  if (!canvasEl || !panelEl || panelEl.classList.contains('rxfw-hidden')) return;
  if (listDirty) { renderList(); listDirty = false; }
  if (logDirty) { renderLog(); logDirty = false; }
  const ctx = canvasEl.getContext('2d');
  const rect = canvasEl.parentElement.getBoundingClientRect();
  drawFrame(ctx, rect.width, rect.height, {
    sources: recorder.getSources(),
    edges: recorder.getEdges(),
    selectedName,
    animSpeed,
    live: liveMode,
    shownSeq,
    revealAt,
  });
}

function formatTime(t) {
  const d = new Date(t);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
