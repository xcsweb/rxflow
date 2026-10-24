// observer.test.js —— observe() 包装器测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of, throwError } from 'rxjs';
import { observe } from '../src/observer.js';
import { recorder } from '../src/recorder.js';
import { tagged } from '../src/tags.js';

test('observe 转发值且行为不变，事件进面板', async () => {
  recorder.reset();
  const out = [];
  observe(of(1, 2, 3), 's$').subscribe(v => out.push(v));
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(out, [1, 2, 3]);
  const s = recorder.getSources().find(x => x.name === 's$');
  assert.equal(s.nexts, 3);
  assert.equal(s.completes, 1);
});

test('错误事件带消息进面板', async () => {
  recorder.reset();
  const errs = [];
  observe(throwError(() => new Error('net 500')), 'err$')
    .subscribe({ error: e => errs.push(e) });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(errs.length, 1);
  const s = recorder.getSources().find(x => x.name === 'err$');
  assert.equal(s.errors, 1);
  assert.equal(s.events[0].value, 'net 500');
});

test('{ from } 选项登记拓扑边', () => {
  recorder.reset();
  observe(of(1), 'down$', { from: 'up$' }).subscribe(() => {});
  assert.deepEqual(recorder.getEdges(), [['up$', 'down$']]);
});

test('observe 返回的 Observable 打了 tag（autoTrack 依赖）', () => {
  const w = observe(of(1), 'tagged$');
  assert.ok(tagged.has(w));
});

test('非 Observable 抛 TypeError', () => {
  assert.throws(() => observe({ not: 'observable' }, 'x$'), TypeError);
});
