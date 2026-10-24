// index.js —— RxFlow 入口
//
// 最简接入（零埋点）：入口文件两行，页面所有顶层订阅的流自动出现在面板
//   import { RxFlow } from '@xcsweb/rx-flow';
//   RxFlow.autoTrack();
//
// 推荐接入（命名关键流，可画管道拓扑）：
//   const keyword$ = RxFlow.observe(raw$, 'keyword$');
//   const result$  = RxFlow.observe(keyword$.pipe(switchMap(fetch)), 'result$', { from: 'keyword$' });
//
// import 后右下角自动出现悬浮球（dev 模式）；快捷键 Ctrl+` 开关面板。

import { observe } from './observer.js';
import { mount, unmount, open, close, toggle, isOpen } from './ui/mount.js';
import { recorder } from './recorder.js';
import { autoTrack, stopAutoTrack, isAutoTracking } from './autotrack.js';

/**
 * 自动挂载策略：
 * - 显式 import.meta.env.DEV === false / PROD === true 时不挂
 * - 否则挂载（浏览器/打包工具里默认都挂，方便开发）
 * 用户可调用 RxFlow.unmount() 手动移除。
 */
function shouldAutoMount() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.DEV === false) return false;
      if (import.meta.env.PROD === true) return false;
    }
  } catch (e) { /* 非 ESM 环境忽略 */ }
  return true;
}

export const RxFlow = {
  observe,
  autoTrack,
  stopAutoTrack,
  isAutoTracking,
  mount,
  unmount,
  open,
  close,
  toggle,
  isOpen,
  setPaused: (v) => recorder.setPaused(v),
  reset: () => recorder.reset(),
  recorder,
};

export { observe, autoTrack, stopAutoTrack, isAutoTracking };
export { mount, unmount, open, close, toggle, isOpen };
export { recorder };

export default RxFlow;

// 自动挂载悬浮球（浏览器环境）
if (typeof window !== 'undefined' && typeof document !== 'undefined' && shouldAutoMount()) {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => mount());
  } else {
    mount();
  }
}
