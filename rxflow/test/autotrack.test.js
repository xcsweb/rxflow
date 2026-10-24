// autotrack.test.js —— 零埋点自动跟踪的关键不变量
//
// 核心：只记录「用户发起的顶层订阅」，算子内部转发不刷屏。
// 两层过滤：① 同步抑制（链路订阅同步自顶向下）② Subscriber 实例识别
// （switchMap 等高阶算子的异步内部订阅传入带 destination 的 Subscriber）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  interval, timer, of, range, throwError, Subject, combineLatest,
  take, map, switchMap,
} from 'rxjs';
import { autoTrack, stopAutoTrack, isAutoTracking } from '../src/autotrack.js';
import { observe } from '../src/observer.js';
import { recorder } from '../src/recorder.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function autoNamed() {
  return recorder.getSources().filter(s => /^stream_\d+$/.test(s.name));
}
function freshTrack() {
  recorder.reset();
  stopAutoTrack();
  autoTrack();
}

test('顶层订阅记录为一条流，管道内部 hop 不刷屏', async () => {
  freshTrack();
  const seen = [];
  interval(5).pipe(take(3), map(x => x * 2)).subscribe(v => seen.push(v));
  await sleep(150);
  assert.deepEqual(seen, [0, 2, 4]);
  // 只有外层管道一条流；interval 源、take、map 都没有单独出现
  assert.equal(autoNamed().length, 1, `应只有 1 条自动流，实际 ${autoNamed().length}: ${autoNamed().map(s => s.name)}`);
  assert.ok(autoNamed()[0].nexts >= 3);
  assert.ok(autoNamed()[0].completes >= 1);   // take(3) 完成
});

test('switchMap 的异步内部订阅不进面板（Subscriber 识别路径）', async () => {
  freshTrack();
  let got = null;
  timer(10).pipe(switchMap(() => of('inner-val'))).subscribe(v => { got = v; });
  await sleep(150);
  assert.equal(got, 'inner-val');
  // timer(10) 外层算一条；of('inner-val') 的内部订阅（异步时刻发生）不能算
  assert.equal(autoNamed().length, 1, `应只有 1 条自动流，实际: ${autoNamed().map(s => s.name)}`);
});

test('observe() 命名的流不被 autoTrack 重复记录', async () => {
  freshTrack();
  const out = [];
  observe(interval(5).pipe(take(2)), 'named$').subscribe(v => out.push(v));
  await sleep(100);
  assert.deepEqual(out, [0, 1]);
  assert.ok(recorder.getSources().some(s => s.name === 'named$'));
  assert.equal(autoNamed().length, 0, '同一条订阅不应再生成 stream_N');
});

test('同一 Observable 重复订阅复用同一流名', async () => {
  freshTrack();
  const src = of('x', 'y');
  src.subscribe(() => {});
  src.subscribe(() => {});
  await sleep(20);
  const auto = autoNamed();
  assert.equal(auto.length, 1);
  assert.equal(auto[0].nexts, 4);   // 两次订阅 × 2 个值
});

test('Subject：三函数签名与 observer 对象签名都被记录（同流名合并）', async () => {
  freshTrack();
  const s = new Subject();
  s.subscribe(() => {}, () => {}, () => {});      // 三函数签名
  const seen = [];
  s.subscribe({ next: v => seen.push(v) });       // observer 对象签名
  s.next(1); s.next(2); s.complete();
  await sleep(20);
  const subs = recorder.getSources().filter(x => /^subject_\d+$/.test(x.name));
  assert.equal(subs.length, 1, `同一 Subject 复用一条流名，实际: ${subs.map(x => x.name)}`);
  assert.equal(subs[0].nexts, 4);                 // 两次订阅 × 2 个值
  assert.equal(subs[0].completes, 2);
  assert.deepEqual(seen, [1, 2]);
});

test('错误通过 autoTrack 被记录', async () => {
  freshTrack();
  const errs = [];
  throwError(() => new Error('auto-err')).subscribe({ error: e => errs.push(e) });
  await sleep(20);
  assert.equal(errs.length, 1);
  const s = autoNamed()[0];
  assert.equal(s.errors, 1);
  assert.equal(s.events[0].value, 'auto-err');
});

test('高频流：1000 个同步值快速通过且全部记录', () => {
  freshTrack();
  const out = [];
  const t0 = Date.now();
  range(0, 1000).subscribe(v => out.push(v));
  const dt = Date.now() - t0;
  assert.equal(out.length, 1000);
  assert.ok(dt < 1000, `1000 值耗时 ${dt}ms，应 < 1000ms`);
  assert.equal(autoNamed()[0].nexts, 1000);
});

test('stopAutoTrack 还原原始 subscribe，不再跟踪', async () => {
  freshTrack();
  assert.equal(isAutoTracking(), true);
  stopAutoTrack();
  assert.equal(isAutoTracking(), false);
  const before = recorder.getSources().length;
  of(1).subscribe(() => {});
  await sleep(20);
  assert.equal(recorder.getSources().length, before, '停止后不应新增流');
});

test('组合场景（demo 同款）：命名流 + combineLatest + 手动拓扑边', async () => {
  freshTrack();
  const kw$ = observe(timer(1).pipe(map(() => 'kw')), 'keyword$');
  const pr$ = observe(timer(2).pipe(map(() => ({ min: 0, max: 0 }))), 'priceRange$');
  const q$ = observe(
    combineLatest([kw$, pr$]).pipe(switchMap(([k]) => of({ kw: k }))),
    'query$'
  );
  recorder.edge('keyword$', 'query$');
  recorder.edge('priceRange$', 'query$');
  q$.subscribe(() => {});
  await sleep(120);
  // 三条命名流都在，combineLatest 内部订阅 keyword$/priceRange$ 不会生成 stream_N
  for (const n of ['keyword$', 'priceRange$', 'query$']) {
    assert.ok(recorder.getSources().some(s => s.name === n), `缺少 ${n}`);
  }
  assert.equal(autoNamed().length, 0, `不应有自动流: ${autoNamed().map(s => s.name)}`);
  assert.equal(recorder.getSources().find(s => s.name === 'query$').nexts >= 1, true);
  assert.equal(recorder.getEdges().length, 2);
});
