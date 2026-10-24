// recorder.js —— 事件总线（单例）
// 所有被 observe() 包装或 autoTrack() 捕获的 Observable 产生的 next/error/complete
// 都推到这里，UI 层订阅这里实时渲染。
//
// 时间约定：
//   ev.t  = Date.now()          墙钟时间，日志里展示用
//   ev.pt = performance.now()   单调时钟，Canvas 动画插值用（不受系统时间跳变影响）

const MAX_EVENTS = 200; // 每个流保留的最近事件数（环形裁剪）

class Recorder {
  constructor() {
    /** @type {Map<string, {name: string, color: string, events: Array, nexts: number, errors: number, completes: number, lastValue: string, createdAt: number}>} */
    this.sources = new Map();
    /** @type {Array<[string, string]>} 拓扑边 [from, to] */
    this.edges = [];
    /** @type {Set<(events: any) => void>} */
    this.listeners = new Set();
    this.colorPool = ['#4da3ff', '#3dd68c', '#f2b04a', '#e8594f', '#9b7cf2', '#36c5d9', '#f279c7'];
    this.colorIdx = 0;
    /** 全局事件序号：面板单步模式靠它逐条揭示 */
    this.seq = 0;
    /** 暂停后不再记录事件（但流仍会注册，恢复后继续） */
    this.paused = false;
  }

  next(sourceName, value) {
    if (this.paused) { this._ensure(sourceName); return; }
    const src = this._ensure(sourceName);
    src.nexts++;
    src.lastValue = this._summarize(value);
    this._push(src, { type: 'next', value: src.lastValue, raw: value });
    this._emit({ type: 'next', source: sourceName });
  }

  error(sourceName, err) {
    if (this.paused) { this._ensure(sourceName); return; }
    const src = this._ensure(sourceName);
    src.errors++;
    const msg = err && err.message ? err.message : String(err);
    this._push(src, { type: 'error', value: msg });
    this._emit({ type: 'error', source: sourceName });
  }

  complete(sourceName) {
    if (this.paused) { this._ensure(sourceName); return; }
    const src = this._ensure(sourceName);
    src.completes++;
    this._push(src, { type: 'complete', value: 'complete' });
    this._emit({ type: 'complete', source: sourceName });
  }

  /** 注册一个流（不记录事件），供 autoTrack 在订阅时刻先占位 */
  ensure(name) {
    return this._ensure(name);
  }

  /** 声明拓扑边：to 流来自 from 流（面板上画连线） */
  edge(from, to) {
    if (!from || !to || from === to) return;
    if (!this.edges.some(([f, t]) => f === from && t === to)) this.edges.push([from, to]);
  }

  getEdges() {
    return this.edges;
  }

  setPaused(v) {
    this.paused = !!v;
    this._emit({ type: this.paused ? 'paused' : 'resumed' });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getSources() {
    return Array.from(this.sources.values());
  }

  reset() {
    this.sources.clear();
    this.edges.length = 0;
    this.seq = 0;
    this._emit({ type: 'reset' });
  }

  _ensure(name) {
    if (!this.sources.has(name)) {
      this.sources.set(name, {
        name,
        color: this.colorPool[this.colorIdx++ % this.colorPool.length],
        events: [],        // 最近事件（含 next/error/complete）
        nexts: 0,
        errors: 0,
        completes: 0,
        lastValue: '—',
        createdAt: Date.now(),
      });
    }
    return this.sources.get(name);
  }

  _push(src, ev) {
    ev.t = Date.now();
    ev.pt = performance.now();
    ev.seq = ++this.seq;
    src.events.push(ev);
    if (src.events.length > MAX_EVENTS) src.events.shift();
  }

  _summarize(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return v.length > 40 ? v.slice(0, 39) + '…' : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
    try {
      const s = JSON.stringify(v);
      return s && s.length > 80 ? s.slice(0, 79) + '…' : s;
    } catch { return String(v); }
  }

  _emit(ev) {
    this.listeners.forEach(fn => { try { fn(ev); } catch (e) { /* 吞掉监听器异常 */ } });
  }
}

export const recorder = new Recorder();
