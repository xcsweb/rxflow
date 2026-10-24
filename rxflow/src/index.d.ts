// 类型声明（手写，保持零构建链）
import type { Observable } from 'rxjs';

export interface RecorderEvent {
  type: 'next' | 'error' | 'complete';
  /** 摘要字符串（截断后的） */
  value: string;
  /** 原始值（仅 next 事件，供值检查器展开） */
  raw?: unknown;
  /** 墙钟时间 Date.now() */
  t: number;
  /** 单调时钟 performance.now()，动画用 */
  pt: number;
  /** 全局递增事件序号（面板单步模式按它逐条揭示） */
  seq: number;
}

export interface SourceInfo {
  name: string;
  color: string;
  events: RecorderEvent[];
  nexts: number;
  errors: number;
  completes: number;
  lastValue: string;
  createdAt: number;
}

export interface RecorderBusEvent {
  type: 'next' | 'error' | 'complete' | 'reset' | 'paused' | 'resumed';
  source?: string;
}

export declare const recorder: {
  sources: Map<string, SourceInfo>;
  edges: Array<[from: string, to: string]>;
  paused: boolean;
  next(name: string, value: unknown): void;
  error(name: string, err: unknown): void;
  complete(name: string): void;
  /** 声明拓扑边：to 流来自 from 流（面板画连线） */
  edge(from: string, to: string): void;
  getEdges(): Array<[from: string, to: string]>;
  setPaused(v: boolean): void;
  subscribe(fn: (ev: RecorderBusEvent) => void): () => void;
  getSources(): SourceInfo[];
  ensure(name: string): SourceInfo;
  reset(): void;
};

/** 包装一个 Observable，把 next/error/complete 送到面板 */
export declare function observe<T>(
  source$: Observable<T>,
  name: string,
  options?: { from?: string }
): Observable<T>;

/** 开启零埋点自动跟踪，返回 stopAutoTrack */
export declare function autoTrack(): () => void;
export declare function stopAutoTrack(): void;
export declare function isAutoTracking(): boolean;

export declare function mount(options?: object): void;
export declare function unmount(): void;
export declare function open(): void;
export declare function close(): void;
export declare function toggle(): void;
export declare function isOpen(): boolean;

export declare const RxFlow: {
  observe: typeof observe;
  autoTrack: typeof autoTrack;
  stopAutoTrack: typeof stopAutoTrack;
  isAutoTracking: typeof isAutoTracking;
  mount: typeof mount;
  unmount: typeof unmount;
  open: typeof open;
  close: typeof close;
  toggle: typeof toggle;
  isOpen: typeof isOpen;
  setPaused(v: boolean): void;
  reset(): void;
  recorder: typeof recorder;
};

declare const _default: typeof RxFlow;
export default _default;
