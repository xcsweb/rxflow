// recorder.test.js —— recorder 单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorder } from '../src/recorder.js';

test('next 记录事件、更新统计、时间戳正确', () => {
  recorder.reset();
  recorder.next('a$', { foo: 'bar' });
  const s = recorder.getSources().find(x => x.name === 'a$');
  assert.equal(s.nexts, 1);
  const ev = s.events[0];
  assert.equal(ev.type, 'next');
  assert.equal(ev.value, '{"foo":"bar"}');       // 摘要字符串
  assert.equal(ev.raw.foo, 'bar');               // 原始值保留给检查器
  // t 必须是墙钟时间（这是修掉的时间戳 bug：以前是 performance.now()）
  assert.ok(Math.abs(ev.t - Date.now()) < 1000, `ev.t=${ev.t} vs now=${Date.now()}`);
  // pt 是单调时钟，不晚于当前值
  assert.ok(ev.pt <= performance.now() + 1);
});

test('error / complete 记录与计数', () => {
  recorder.reset();
  recorder.error('b$', new Error('boom'));
  recorder.complete('b$');
  const s = recorder.getSources().find(x => x.name === 'b$');
  assert.equal(s.errors, 1);
  assert.equal(s.completes, 1);
  assert.equal(s.events[0].type, 'error');
  assert.equal(s.events[0].value, 'boom');
  assert.equal(s.events[1].type, 'complete');
});

test('环形缓冲：每流最多保留 200 条事件', () => {
  recorder.reset();
  for (let i = 0; i < 250; i++) recorder.next('ring$', i);
  const s = recorder.getSources().find(x => x.name === 'ring$');
  assert.equal(s.events.length, 200);
  assert.equal(s.nexts, 250);
  assert.equal(s.events[s.events.length - 1].raw, 249); // 最老的被裁掉
});

test('暂停：仍注册流但不记录，恢复后继续', () => {
  recorder.reset();
  recorder.setPaused(true);
  recorder.next('p$', 1);
  let s = recorder.getSources().find(x => x.name === 'p$');
  assert.ok(s, '暂停时流仍被注册');
  assert.equal(s.nexts, 0);
  assert.equal(s.events.length, 0);
  recorder.setPaused(false);
  recorder.next('p$', 2);
  s = recorder.getSources().find(x => x.name === 'p$');
  assert.equal(s.nexts, 1);
  assert.equal(s.events[0].raw, 2);
});

test('edge 拓扑去重', () => {
  recorder.reset();
  recorder.edge('a$', 'b$');
  recorder.edge('a$', 'b$');
  recorder.edge('a$', 'a$');   // 自环忽略
  recorder.edge('', 'b$');     // 空名忽略
  assert.deepEqual(recorder.getEdges(), [['a$', 'b$']]);
});

test('subscribe 监听器收到事件，退订后不再收', () => {
  recorder.reset();
  const seen = [];
  const off = recorder.subscribe(ev => seen.push(ev.type));
  recorder.next('l$', 1);
  off();
  recorder.next('l$', 2);
  assert.deepEqual(seen, ['next']);
});

test('事件带全局递增 seq，reset 归零', () => {
  recorder.reset();
  recorder.next('s1$', 1);
  recorder.next('s2$', 2);
  recorder.error('s1$', new Error('x'));
  const seqs = recorder.getSources().flatMap(s => s.events.map(e => e.seq)).sort((a, b) => a - b);
  assert.deepEqual(seqs, [1, 2, 3]);
  recorder.reset();
  recorder.next('s3$', 1);
  assert.equal(recorder.getSources()[0].events[0].seq, 1);
});

test('reset 清空全部', () => {
  recorder.reset();
  recorder.next('x$', 1);
  recorder.reset();
  assert.equal(recorder.getSources().length, 0);
  assert.equal(recorder.getEdges().length, 0);
});
