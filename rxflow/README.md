# RxFlow（npm 包名 `rx-flow`）

RxJS 流调试控制台——**RxJS 之于 Redux DevTools**。

任何用了 RxJS 的前端项目，入口 import 一次，页面右下角出现悬浮球，
点开（或 `Ctrl+\``）就是一张实时流图：哪些流在发值、发了什么、错在哪一步、
管道上下游怎么连的，一眼看清。不用再 console.log 满天飞。

```bash
npm install rx-flow
# peer dep
npm install rxjs
```

## 30 秒接入（零埋点）

业务代码一行不用改——`autoTrack()` 会自动跟踪所有顶层订阅的 Observable：

```js
// main.js 入口
import { RxFlow } from 'rx-flow';
RxFlow.autoTrack();
```

打开页面 → 右下角 "Rx" 悬浮球 → `Ctrl+\`` 或点它展开面板 →
所有正在运行的流（`stream_1`、`subject_2`…）自动出现，发值时数据包沿图飞行。

## 推荐接入（命名关键流 + 管道拓扑）

给关心的流起名字、声明上下游，面板会画出管道拓扑连线：

```js
import { RxFlow } from 'rx-flow';
import { fromEvent, map, debounceTime, switchMap, catchError, of } from 'rxjs';

const input = document.querySelector('#kw');

const raw$ = fromEvent(input, 'input').pipe(map(e => e.target.value.trim()));

// 1. 命名流
const keyword$ = RxFlow.observe(raw$.pipe(debounceTime(300)), 'keyword$');

// 2. 下游用 { from } 声明拓扑，面板上 keyword$ → result$ 会连线
const result$ = RxFlow.observe(
  keyword$.pipe(
    switchMap(kw => fetch(`/api/search?q=${kw}`).then(r => r.json())),
    catchError(err => of({ error: err.message })),   // 错误也会出现在面板上
  ),
  'result$',
  { from: 'keyword$' }
);

result$.subscribe(render);
```

两种姿势可以混用：`observe()` 命名的流保持好名字，`autoTrack()` 不会重复记录它们。

## 面板功能

- **左侧流列表**：每个流一行——颜色点、名字、next 次数、错误徽标、最近值
- **中间流图**：无拓扑时竖排节点；声明了 `{ from }` 时按管道分层排布、
  贝塞尔连线，值到达时有数据包沿边飞行的动画；错误节点红色脉冲 + 计数徽标
- **播放控制**（画布左下角）：**速度滑杆 0.25×~3×** 调节动画播放速度
  （数据包飞行、脉冲），调慢了 0.25× 一个包要飞 2.4 秒，看得清清楚楚；
  **单步** 冻结画面、点一下揭示下一条事件（按钮上显示待显条数），**回实时** 一键追上最新
- **右侧事件日志**：选中流看最近 40 条事件——next/error/complete 三类，
  错误红色高亮；单步模式下只显示已揭示的事件，当前条高亮；
  **点击任意值展开 JSON 树检查器**（可折叠、循环引用安全）
- **暂停 / 继续**：随时冻结记录（不再写入新事件），流本身不受影响
- **底部统计**：流数量 / next 总数 / error 总数

## API

| 方法 | 说明 |
|---|---|
| `RxFlow.autoTrack()` | 零埋点：patch `Observable.prototype.subscribe`，自动跟踪所有顶层订阅。返回 `stopAutoTrack` |
| `RxFlow.stopAutoTrack()` | 还原原始 subscribe，停止自动跟踪 |
| `RxFlow.observe(source$, name, { from? })` | 包装 Observable 上报事件；`from` 声明上游流名用于画拓扑连线 |
| `RxFlow.open()` / `close()` / `toggle()` / `isOpen()` | 控制面板开关 |
| `RxFlow.setPaused(bool)` | 暂停/恢复记录 |
| `RxFlow.reset()` | 清空面板记录 |
| `RxFlow.mount()` / `unmount()` | 手动挂载/卸载悬浮球（import 时自动挂载，见下） |
| `RxFlow.recorder` | 底层事件总线（自定义 UI 时可用） |

## 打开控制台的方式

- 点右下角悬浮球
- 快捷键 `Ctrl+\``（macOS `Cmd+\``）开关、`Esc` 收起
- 代码里 `RxFlow.open()`（例如 `?debug` 参数时自动弹出）

## 在 Vite / Webpack 项目里

Vite 项目自动支持 ESM，无需额外配置。生产环境不想带调试面板：

```js
// main.js
if (import.meta.env.DEV) {
  import('rx-flow').then(({ RxFlow }) => RxFlow.autoTrack());  // 动态 import，生产包会被 tree-shake 掉
}
```

或者让面板常驻但默认挂起：

```js
import { RxFlow } from 'rx-flow';
RxFlow.autoTrack();
if (import.meta.env.PROD) RxFlow.setPaused(true);   // 悬浮球在，需要时再打开记录
```

## 本地开发

```bash
npm run demo        # 等价于 node _server.cjs
# 打开 http://localhost:5173/demo/
```

demo 页演示了两种接入：搜索链路（`keyword$ → result$`，带拓扑连线）
+ 一条必出错的流（看错误高亮）+ 独立的 autoTrack 流。

## 隐私与安全

- 纯本地：所有数据只进浏览器内存里的面板，**没有任何网络上报**
- 零依赖：rxjs 之外不引任何包，原生 ESM 源码直发（附手写 `.d.ts`）
- 每流最多保留最近 200 条事件，长跑不会撑爆内存

## 设计取舍

- **autoTrack 的边界**：自动跟踪只记录「顶层订阅」。`switchMap` 等高阶算子
  的内部订阅、管道中间hop不会被刷进面板；要精确看管道内部，用 `observe()`
  在关心的位置显式命名。
- **raw 值引用**：值检查器展示的是原始值（可展开 JSON 树），最近 200 条
  会持有对象引用——调试 DOM 流时注意别把已销毁的节点长期钉住（DevTools 同款取舍）。
