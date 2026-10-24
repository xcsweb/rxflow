// observer.js —— observe(source$, name, { from })
// 用 tap 包装一个 RxJS Observable，把 next/error/complete 事件送到 recorder。
// 返回的是一个新的 Observable，订阅行为和原来完全一致。
//
// options:
//   from: 上游流名 —— 声明管道拓扑，面板会把两条流连线：
//     const result$ = RxFlow.observe(keyword$.pipe(...), 'result$', { from: 'keyword$' });

import { tap } from 'rxjs';
import { recorder } from './recorder.js';
import { tagged } from './tags.js';

/**
 * 观察一个 Observable，把它的值流接到调试面板。
 * @template T
 * @param {import('rxjs').Observable<T>} source$
 * @param {string} name  流名，面板上会显示
 * @param {{ from?: string }} [options]  from=上游流名，用于面板连线
 * @returns {import('rxjs').Observable<T>}
 */
export function observe(source$, name, options) {
  if (!source$ || typeof source$.subscribe !== 'function') {
    throw new TypeError('RxFlow.observe 需要传一个 RxJS Observable');
  }
  if (!name) name = 'unnamed$';
  if (options && options.from) recorder.edge(options.from, name);

  const wrapped$ = source$.pipe(
    tap({
      next: (v) => recorder.next(name, v),
      error: (err) => recorder.error(name, err),
      complete: () => recorder.complete(name),
    })
  );
  // 打 tag：autoTrack 看到这条流已命名，跳过，避免重复记录
  tagged.add(wrapped$);
  return wrapped$;
}
