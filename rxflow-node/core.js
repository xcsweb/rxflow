"use strict";
/* =========================================================
 * rxflow-node · core.js
 * 纯 Node 无依赖的 RxJS 风格流观察器 / 录制器 / 分析器
 *
 * 解决问题：
 *   浏览器面板可视化的是"流图"，Node 端没法跑 Canvas。
 *   这里把业务函数包一层，记录每次调用的事件流，
 *   然后离线做行为分析、给出算子推荐、用录制数据重跑新实现。
 *
 * 能力：
 *   1. wrap(fn)            包装一个同步/Promise 函数，自动埋点
 *   2. recorder            事件录制（输入、输出、耗时、错误、丢弃）
 *   3. dump()              导出 JSON，可落盘
 *   4. report()            生成文本报告（次数/耗时分布/错误率/重复调用）
 *   5. recommend()         规则推荐：debounce / distinct / switchMap / cache / retry
 *   6. replay(newFn)       用录制的输入序列重跑 newFn，对比新旧输出
 *
 * 零依赖，CommonJS，Node >= 12。
 * ========================================================= */

const util = require('util');

/* ---------- 工具 ---------- */
function nowMs() { return Number(process.hrtime.bigint() / 1000000n); }

function safeStringify(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  try {
    if (v instanceof Error) return '[Error: ' + v.message + ']';
    return JSON.stringify(v, null, 0);
  } catch (e) {
    try { return String(v); } catch (_) { return '[object]'; }
  }
}

function summarize(v, maxLen) {
  let s = safeStringify(v);
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/* ---------- Observer ---------- */
function createObserver(options) {
  const opts = Object.assign({
    name: 'fn',
    // 判定"丢弃"的谓词：返回 true 视为该次调用被业务丢弃（空结果/无效输出）
    dropIf: (out) => {
      if (out === undefined || out === null) return true;
      if (Array.isArray(out) && out.length === 0) return true;
      // 常见业务包：{ items: [] } / { data: null } / { list: [] }
      if (typeof out === 'object') {
        if (Array.isArray(out.items) && out.items.length === 0) return true;
        if (Array.isArray(out.list)  && out.list.length  === 0) return true;
        if ('data' in out && (out.data === null || out.data === undefined)) return true;
      }
      return false;
    },
    maxEvents: 20000,
    silent: false,
  }, options || {});

  const recorder = [];       // 事件流
  let startedAt = nowMs();
  let callSeq = 0;

  function push(ev) {
    ev.t = nowMs() - startedAt;
    ev.seq = ++callSeq;
    recorder.push(ev);
    if (recorder.length > opts.maxEvents) recorder.shift();
  }

  /**
   * wrap(fn, label?) —— 包装函数
   * 支持 sync / async / 返回 Promise 的函数。
   */
  function wrap(fn, label) {
    if (typeof fn !== 'function') throw new TypeError('wrap 需要一个函数');
    const fnLabel = label || fn.name || opts.name;

    function wrapped(...args) {
      const t0 = nowMs();
      const call = {
        type: 'call',
        fn: fnLabel,
        input: args,
      };
      let result;
      try {
        result = fn.apply(this, args);
      } catch (err) {
        call.error = { message: err.message, stack: err.stack };
        call.duration = nowMs() - t0;
        call.stage = 'error';
        push(call);
        throw err;
      }
      // async / Promise
      if (result && typeof result.then === 'function') {
        return Promise.resolve(result).then(
          (out) => {
            call.output = out;
            call.duration = nowMs() - t0;
            call.stage = opts.dropIf(out) ? 'drop' : 'out';
            push(call);
            return out;
          },
          (err) => {
            call.error = { message: err && err.message, stack: err && err.stack };
            call.duration = nowMs() - t0;
            call.stage = 'error';
            push(call);
            throw err;
          }
        );
      }
      // sync
      call.output = result;
      call.duration = nowMs() - t0;
      call.stage = opts.dropIf(result) ? 'drop' : 'out';
      push(call);
      return result;
    }
    wrapped.__isObserved = true;
    return wrapped;
  }

  /* ---------- 统计 ---------- */
  function stats() {
    const calls = recorder.filter(e => e.type === 'call');
    const durations = calls.map(c => c.duration).sort((a, b) => a - b);
    const stages = { out: 0, drop: 0, error: 0 };
    calls.forEach(c => { stages[c.stage] = (stages[c.stage] || 0) + 1; });

    // 相邻调用间隔
    let intervals = [];
    for (let i = 1; i < calls.length; i++) intervals.push(calls[i].t - calls[i - 1].t);
    intervals.sort((a, b) => a - b);

    // 重复输入签名（同参数短时间连续调用）
    let dupRuns = 0;
    let lastSig = null, runLen = 0;
    calls.forEach(c => {
      const sig = JSON.stringify(c.input.map(i => safeStringify(i)));
      if (sig === lastSig) { runLen++; if (runLen === 1) dupRuns++; }
      else { lastSig = sig; runLen = 0; }
    });

    // 并发重叠（async 场景下未完成又被调用）
    let inFlight = 0, maxConcurrent = 0;
    const live = [];
    calls.forEach(c => {
      live.push({ start: c.t, end: c.t + c.duration });
    });
    // 简单扫描：把 start/end 打成事件线
    const timeline = [];
    calls.forEach(c => {
      timeline.push({ t: c.t, delta: 1 });
      timeline.push({ t: c.t + c.duration, delta: -1 });
    });
    timeline.sort((a, b) => a.t - b.t);
    let cur = 0;
    timeline.forEach(ev => { cur += ev.delta; if (cur > maxConcurrent) maxConcurrent = cur; });

    return {
      fn: opts.name,
      total: calls.length,
      out: stages.out || 0,
      drop: stages.drop || 0,
      error: stages.error || 0,
      dropRate: calls.length ? (stages.drop || 0) / calls.length : 0,
      errorRate: calls.length ? (stages.error || 0) / calls.length : 0,
      duration: {
        min: durations[0] || 0,
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        max: durations[durations.length - 1] || 0,
        avg: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      },
      interval: {
        min: intervals[0] || 0,
        p50: percentile(intervals, 50),
        p95: percentile(intervals, 95),
      },
      maxConcurrent,
      duplicateRuns: dupRuns,
      elapsed: nowMs() - startedAt,
    };
  }

  /* ---------- 导出 ---------- */
  function dump() {
    return {
      name: opts.name,
      startedAt: new Date(Date.now() - (nowMs() - startedAt)).toISOString(),
      stats: stats(),
      events: recorder,
    };
  }

  function dumpJSON() {
    return JSON.stringify(dump(), null, 2);
  }

  /* ---------- 文本报告 ---------- */
  function report() {
    const s = stats();
    if (s.total === 0) return `[rxflow] ${s.fn}：还没有任何调用记录。`;
    const lines = [];
    lines.push('─'.repeat(48));
    lines.push(`rxflow · ${s.fn} 行为报告`);
    lines.push('─'.repeat(48));
    lines.push(`调用总数   : ${s.total}`);
    lines.push(`  放行/丢弃/错误 : ${s.out} / ${s.drop} / ${s.error}`);
    lines.push(`  丢弃率    : ${(s.dropRate * 100).toFixed(1)}%`);
    lines.push(`  错误率    : ${(s.errorRate * 100).toFixed(1)}%`);
    lines.push(`耗时(ms)   : min=${s.duration.min}  p50=${s.duration.p50}  p95=${s.duration.p95}  max=${s.duration.max}  avg=${s.duration.avg}`);
    lines.push(`调用间隔(ms): min=${s.interval.min}  p50=${s.interval.p50}  p95=${s.interval.p95}`);
    lines.push(`最大并发   : ${s.maxConcurrent}`);
    lines.push(`重复输入串 : ${s.duplicateRuns} 处`);
    lines.push(`录制时长   : ${(s.elapsed / 1000).toFixed(1)}s`);

    // 最近 5 条调用
    lines.push('');
    lines.push('最近调用:');
    recorder.slice(-5).forEach(c => {
      const stageIcon = c.stage === 'out' ? '✓' : c.stage === 'drop' ? '↓' : '✗';
      lines.push(`  ${stageIcon} #${c.seq} ${c.fn}(${summarize(c.input, 40)}) → ${summarize(c.output, 40)}  ${c.duration}ms`);
    });

    if (!opts.silent) console.log(lines.join('\n'));
    return lines.join('\n');
  }

  /* ---------- 规则推荐 ---------- */
  function recommend() {
    const s = stats();
    const recs = [];
    if (s.total < 3) return recs;

    // 1. 高频短间隔 + 异步耗时 → debounceTime
    if (s.interval.p50 < 400 && s.duration.avg > 150) {
      recs.push({
        op: 'debounceTime(250~400)',
        reason: `调用间隔 p50=${s.interval.p50}ms 短于单次耗时 p50=${s.duration.p50}ms，${s.total} 次调用挤在 ${(s.elapsed/1000).toFixed(1)}s 内，典型输入抖动场景`,
        impact: '降低无效触发次数，减少后端压力',
      });
    }

    // 2. 重复输入串 → distinctUntilChanged
    if (s.duplicateRuns > 0) {
      recs.push({
        op: 'distinctUntilChanged()',
        reason: `检测到 ${s.duplicateRuns} 处连续相同输入，会重复触发同一次业务`,
        impact: `跳过未变化的输入，省掉 ${s.duplicateRuns} 次无效执行`,
      });
    }

    // 3. 异步 + 高并发（旧请求未回新请求已发）→ switchMap
    if (s.maxConcurrent > 1 && s.duration.p95 > 200) {
      recs.push({
        op: 'switchMap(x => fetchX(x))',
        reason: `最大并发 ${s.maxConcurrent}，p95 耗时 ${s.duration.p95}ms，旧响应可能覆盖新响应导致界面闪烁/错乱`,
        impact: '每次新输入取消上一次未完成的请求，保证结果永远对应当前输入',
      });
    }

    // 4. 丢弃率高 → filter / 调整上游
    if (s.dropRate > 0.3) {
      recs.push({
        op: "filter(x => x && x.items && x.items.length)",
        reason: `丢弃率 ${(s.dropRate*100).toFixed(1)}%（${s.drop}/${s.total}），大量调用产出空结果`,
        impact: '在靠近数据源处过滤，避免空结果穿透整条管道',
      });
    }

    // 5. 错误率高 → retry / catchError
    if (s.errorRate > 0.05) {
      recs.push({
        op: 'retry(2) / catchError(err => of(fallback))',
        reason: `错误率 ${(s.errorRate*100).toFixed(1)}%（${s.error}/${s.total}）`,
        impact: '瞬时抖动自动重试，最终失败有降级兜底',
      });
    }

    // 6. 单次慢但输入重复度高 → shareReplay / cache
    if (s.duration.p95 > 800 && s.duplicateRuns > 0) {
      recs.push({
        op: 'shareReplay(1) / 加 LRU 缓存',
        reason: `p95=${s.duration.p95}ms 偏慢，且存在重复输入`,
        impact: '同参数第二次调用直接命中缓存',
      });
    }

    return recs;
  }

  function printRecommend() {
    const recs = recommend();
    if (!recs.length) { console.log('[rxflow] 暂无明确算子推荐。'); return; }
    console.log('\n[rxflow] 算子推荐：');
    recs.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.op}`);
      console.log(`     原因: ${r.reason}`);
      console.log(`     收益: ${r.impact}`);
    });
  }

  /* ---------- Replay：用录制输入重跑新实现 ----------
   * options:
   *   verbose  打印每次对比
   *   compare  自定义对比函数 (oldOut, newOut, input) => boolean
   *            默认：JSON.stringify 严格相等；对含 ts/时间戳类字段的业务对象，
   *            建议传入一个忽略动态字段的 compare。
   */
  async function replay(newFn, options) {
    const opts2 = Object.assign({ verbose: true, compare: null }, options || {});
    const inputs = recorder.filter(e => e.type === 'call').map(c => c.input);
    if (!inputs.length) { console.log('[rxflow.replay] 无录制输入可重放。'); return []; }

    const results = [];
    let pass = 0, diff = 0, fail = 0;
    for (let i = 0; i < inputs.length; i++) {
      const old = recorder.filter(e => e.type === 'call')[i];
      let neo, err = null;
      try {
        neo = await newFn.apply(null, inputs[i]);
      } catch (e) { err = e; }
      const oldOut = old ? old.output : undefined;
      let match = false;
      if (err) { fail++; }
      else {
        try {
          match = opts2.compare ? !!opts2.compare(oldOut, neo, inputs[i])
                                : (safeStringify(neo) === safeStringify(oldOut));
        } catch (e) { match = false; }
        if (match) pass++; else diff++;
      }
      results.push({ input: inputs[i], old: oldOut, neo, err, match });
      if (opts2.verbose) {
        const icon = err ? '✗' : match ? '✓' : '≠';
        console.log(`  ${icon} #${i+1} input=${summarize(inputs[i],30)}  old=${summarize(oldOut,30)}  neo=${err ? '[err] '+err.message : summarize(neo,30)}`);
      }
    }
    console.log(`\n[rxflow.replay] 共 ${inputs.length} 次：一致 ${pass} / 差异 ${diff} / 新实现报错 ${fail}`);
    return results;
  }

  function reset() {
    recorder.length = 0;
    startedAt = nowMs();
    callSeq = 0;
  }

  return {
    wrap,
    recorder,
    stats,
    dump,
    dumpJSON,
    report,
    recommend,
    printRecommend,
    replay,
    reset,
  };
}

module.exports = { createObserver };
