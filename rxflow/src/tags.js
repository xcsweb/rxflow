// tags.js —— observe() 与 autoTrack() 共享的标记表
// 被 observe() 命名过的 Observable 会加入 tagged，autoTrack 看到后跳过，
// 避免同一条流被两套机制重复记录。

/** @type {WeakSet<object>} 已被 observe() 显式命名的 Observable（其 tap 埋点已经上报事件） */
export const tagged = new WeakSet();
