# RxFlow · RxJS 流调试控制台

把 RxJS 异步时序的黑箱变成可回放的因果链——**RxJS 之于 Redux DevTools**。

npm 包 [`@xcsweb/rx-flow`](https://www.npmjs.com/package/@xcsweb/rx-flow)：任何用了 RxJS 的前端项目，入口 import 一次，右下角出现悬浮球，点开（或 `Ctrl+\``）就是一张实时流图——哪些流在发值、发了什么、错在哪一步、管道上下游怎么连的，一眼看清。

## 项目结构

```
rxjs/
├── rxflow/          📦 npm 包 @xcsweb/rx-flow（浏览器调试面板，可发布）
│   ├── src/             源码：零埋点 autoTrack / observe 埋点 / 面板 UI / Canvas 流图
│   ├── demo/            演示页（拓扑连线、错误路径、JSON 检查器、单步模式）
│   ├── test/            Node 测试（node --test，22 个用例）
│   └── README.md        包文档：接入姿势 / API / 设计取舍
├── rxflow-node/     🛠 Node 端观察器：wrap 业务函数 → 录制 → 行为报告 → 算子推荐 → replay 对比
└── prototypes/      🎨 设计原型（5 个可交互 HTML，产品探索过程）
    ├── rxflow产品价值页.html            产品定位与 Roadmap
    ├── rxjs流调试面板原型.html          面板 v0.1（单链场景）
    ├── rxjs流调试面板_多源DAG.html      面板 v0.2（多源 DAG + 录制回放 + DOM 双向）
    ├── rxflow可替换算子演示.html        「看，还能改」：面板内替换算子对比输出
    └── rxflow算子推荐演示.html          智能诊断：行为特征 → 算子推荐
```

## 快速开始

### 浏览器调试面板（npm 包）

```bash
npm install @xcsweb/rx-flow rxjs
```

```js
import { RxFlow } from '@xcsweb/rx-flow';
RxFlow.autoTrack();          // 零埋点：所有顶层订阅的流自动出现在面板
```

或对关键流命名并声明管道拓扑：

```js
const keyword$ = RxFlow.observe(raw$, 'keyword$');
const result$  = RxFlow.observe(keyword$.pipe(switchMap(fetch)), 'result$', { from: 'keyword$' });
```

本地跑 demo：

```bash
cd rxflow
node _server.cjs              # 或 PORT=5175 node _server.cjs
# 打开 http://localhost:5173/demo/
```

### Node 端分析器

```bash
cd rxflow-node
node smoke.js                 # wrap → report → recommend → replay 全链路演示
```

### 设计原型

`prototypes/` 下的 HTML 无外部依赖（除 v0.2 引 CDN RxJS），直接双击用浏览器打开即可交互。

## 开发

```bash
cd rxflow
npm install        # 安装 dev 依赖（rxjs，用于 Node 测试）
npm test           # 22 个用例：recorder / observe / autoTrack 不变量
```

## 文档

- 包的完整文档（API、接入姿势、隐私与取舍）：[`rxflow/README.md`](./rxflow/README.md)
- Node 端 API：[`rxflow-node/README.md`](./rxflow-node/README.md)

## License

MIT
