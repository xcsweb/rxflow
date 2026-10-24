"use strict";
// smoke test：验证 core.js 的 wrap / report / recommend / replay 全链路
const { createObserver } = require('./core');

const obs = createObserver({ name: 'searchApi' });

// 模拟一个真实业务函数：防抖没做好的搜索接口
let callCount = 0;
async function realSearch(keyword) {
  callCount++;
  // 模拟 300ms 网络延迟
  await new Promise(r => setTimeout(r, 300 + Math.random() * 100));
  if (!keyword) return { items: [] };       // 空结果 → drop
  if (keyword === 'err') throw new Error('network 500');
  return { items: [{ name: keyword + '-手机', price: 1999 }], ts: Date.now() };
}

const observed = obs.wrap(realSearch, 'searchApi');

(async () => {
  // 模拟用户疯狂输入：同参数重复 + 高频
  const seq = ['a', 'a', 'ab', 'ab', 'abc', 'abc', 'abcd', '', 'err', 'xyz'];
  for (const kw of seq) {
    try { await observed(kw); } catch (e) { /* 吞掉，观察器记录错误 */ }
  }

  console.log('\n===== REPORT =====');
  obs.report();

  console.log('\n===== RECOMMEND =====');
  obs.printRecommend();

  console.log('\n===== REPLAY：新实现（加了空过滤），忽略 ts 字段 =====');
  function newSearch(keyword) {
    if (!keyword) return { items: [], filtered: true };
    return { items: [{ name: keyword + '-手机', price: 1999 }], ts: 0 };
  }
  // 自定义对比：剥离动态字段 ts 后比较 items
  function ignoreTs(oldOut, neo) {
    if (!oldOut || !neo) return oldOut === neo;
    const a = Object.assign({}, oldOut, { ts: undefined });
    const b = Object.assign({}, neo, { ts: undefined });
    return JSON.stringify(a) === JSON.stringify(b);
  }
  await obs.replay(newSearch, { compare: ignoreTs });

  console.log('\n===== DUMP 片段 =====');
  const d = obs.dump();
  console.log('events:', d.events.length, 'stats.total:', d.stats.total);
})();
