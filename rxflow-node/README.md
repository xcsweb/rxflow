# rxflow-node

纯 Node、零依赖的 RxJS 风格函数观察器 / 录制器 / 算子推荐器。
浏览器里有 Canvas 面板可视化流图；Node 端没法跑 Canvas，这个模块把业务函数包一层，
离线记录行为、生成报告、推荐该加什么 RxJS 算子，并用录制数据回放验证新实现。

## 安装

无需安装，拷贝 `core.js` 到你的项目即可。Node >= 12。

```js
const { createObserver } = require('./core');
```

## 快速上手

```js
const obs = createObserver({ name: 'searchApi' });

// 1. 包装你的业务函数（同步 / async / 返回 Promise 都支持）
const search = obs.wrap(async (keyword) => {
  const res = await fetch(`/api/search?q=${keyword}`);
  return res.json();
}, 'searchApi');

// 2. 正常调用
await search('手机');
await search('手机');   // 重复输入
await search('');        // 空结果会被记为 drop

// 3. 看报告
obs.report();

// 4. 拿算子推荐
obs.printRecommend();

// 5. 导出 JSON 落盘
require('fs').writeFileSync('./recording.json', obs.dumpJSON());
```

## API

| 方法 | 说明 |
|---|---|
| `wrap(fn, label?)` | 包装函数，自动埋点输入/输出/耗时/错误/丢弃 |
| `recorder` | 原始事件流数组 |
| `stats()` | 返回结构化统计：调用次数、耗时 p50/p95、错误率、丢弃率、最大并发、重复输入次数 |
| `report()` | 打印/返回文本报告 |
| `recommend()` | 返回推荐数组 `[{op, reason, impact}]` |
| `printRecommend()` | 打印推荐 |
| `dump()` / `dumpJSON()` | 导出完整录制数据（含事件流） |
| `replay(newFn, {compare?, verbose?})` | 用录制的输入序列重跑 `newFn`，对比新旧输出 |
| `reset()` | 清空录制 |

## 推荐规则（内置）

| 检测到的行为 | 推荐算子 |
|---|---|
| 调用间隔 p50 < 单次耗时 p50（输入抖动） | `debounceTime(250~400)` |
| 连续相同输入 | `distinctUntilChanged()` |
| 异步函数最大并发 > 1 且 p95 > 200ms | `switchMap(x => fetchX(x))` |
| 丢弃率 > 30%（空结果穿透） | `filter(x => x && x.items && x.items.length)` |
| 错误率 > 5% | `retry(2)` / `catchError(...)` |
| p95 > 800ms 且有重复输入 | `shareReplay(1)` / 加 LRU 缓存 |

## Replay：验证新实现

重构业务函数后，用之前录制的输入序列重跑，对比输出是否一致：

```js
async function newSearch(keyword) {
  if (!keyword) return { items: [], filtered: true };
  // ... 新实现
}

// 自定义对比：忽略动态字段（如 ts）
obs.replay(newSearch, {
  compare: (oldOut, neo) => {
    const a = { ...oldOut, ts: undefined };
    const b = { ...neo, ts: undefined };
    return JSON.stringify(a) === JSON.stringify(b);
  }
});
```

输出示例：
```
  ✓ #1 input=["a"]   old={"items":[...]}  neo={"items":[...]}
  ≠ #8 input=[""]    old={"items":[]}     neo={"items":[],"filtered":true}
[rxflow.replay] 共 10 次：一致 8 / 差异 2 / 新实现报错 0
```

差异项就是重构时行为发生变化的地方，需要人工确认是预期改动还是 bug。

## smoke test

```bash
node smoke.js
```

## 设计取舍

- **纯 Node 无依赖**：不引入 rxjs、lodash 等任何包，方便嵌入任何项目。
- **CommonJS**：直接 `require`，不用 ES Module 转译。
- **录制上限**：默认 20000 条事件，超出自动滚动丢弃最老记录，防止长跑内存爆炸。
- **dropIf 可自定义**：默认识别 `null/undefined/[]/{items:[]}/{data:null}`，可在 `createObserver({dropIf})` 里覆盖。
