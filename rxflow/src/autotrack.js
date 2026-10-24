// autotrack.js —— 零埋点自动跟踪（可选能力）
//
// patch Observable.prototype.subscribe，让所有「用户发起的顶层订阅」自动出现在面板上，
// 业务代码一行不用改：import 后调用一次 RxFlow.autoTrack() 即可。
//
// 只记顶层、不刷屏的两层过滤（基于 rxjs 7 的 subscribe 实现，见 internal/Observable.ts）：
//   1. 同步抑制：链路订阅是同步自顶向下传播的，patch 调用期间再进来的 subscribe
//      都是算子内部转发，直接放行原始方法；
//   2. Subscriber 识别：switchMap 等高阶算子的内部订阅发生在异步时刻（外层 next 时），
//      但它们传入的是带 destination 的 Subscriber 实例，而用户调用传的是回调函数
//      或普通 observer 对象，据此区分。
//
// 与 observe() 的关系：observe() 返回的 Observable 打了 tag（tags.js），autoTrack 跳过，
// 命名的流走 tap 埋点、保持好名字，不会重复记录。

import { Observable, Subject } from 'rxjs';
import { recorder } from './recorder.js';
import { tagged } from './tags.js';

let patched = false;
let origSubscribe = null;
let inside = 0;      // 同步抑制标志：>0 表示正在顶层 subscribe 的同步传播中
let autoSeq = 0;
/** @type {WeakMap<object, string>} 同一个 Observable 重复订阅复用同一个流名 */
const names = new WeakMap();

/** rxjs Subscriber 实例（内部转发用）vs 用户传入的回调/普通 observer 对象 */
function isInternalSubscriber(x) {
  return !!x && typeof x === 'object'
    && typeof x.unsubscribe === 'function'
    && typeof x.add === 'function'
    && (x.destination !== null && x.destination !== undefined || x._parentage != null);
}

/** 把用户的订阅参数包一层记录（不改订阅行为，只旁路记录） */
function recordingArgs(name, args) {
  const first = args[0], errCb = args[1], completeCb = args[2];
  const rec = {
    next: (v) => recorder.next(name, v),
    error: (e) => recorder.error(name, e),
    complete: () => recorder.complete(name),
  };
  // subscribe(nextFn, errorFn?, completeFn?) —— 旧式三函数签名
  if (typeof first === 'function') {
    return [function (v) { rec.next(v); first(v); },
            function (e) { rec.error(e); if (errCb) errCb(e); },
            function () { rec.complete(); if (completeCb) completeCb(); }];
  }
  // subscribe({ next, error, complete }) —— 普通 observer 对象
  if (first && typeof first === 'object') {
    const obs = Object.assign({}, first);
    if (first.next) obs.next = (v) => { rec.next(v); first.next(v); };
    if (first.error) obs.error = (e) => { rec.error(e); first.error(e); };
    else obs.error = (e) => { rec.error(e); };  // 补上，让错误至少进面板
    if (first.complete) obs.complete = () => { rec.complete(); first.complete(); };
    else obs.complete = () => { rec.complete(); };
    return [obs];
  }
  // subscribe() 无参 —— 只记录
  return [rec];
}

function nameFor(obs) {
  let name = names.get(obs);
  if (!name) {
    // 不用 constructor.name —— CDN/打包产物的 rxjs 类名是压缩过的（Subject → t）
    const base = obs instanceof Subject ? 'subject' : 'stream';
    name = `${base}_${++autoSeq}`;
    names.set(obs, name);
  }
  return name;
}

/**
 * 开启零埋点自动跟踪。之后所有顶层订阅的 Observable 都会自动出现在面板。
 * @returns {() => void} stopAutoTrack —— 调用后还原原始 subscribe
 */
export function autoTrack() {
  if (patched) return stopAutoTrack;
  origSubscribe = Observable.prototype.subscribe;

  Observable.prototype.subscribe = function (...args) {
    if (inside > 0 || isInternalSubscriber(args[0]) || tagged.has(this)) {
      return origSubscribe.apply(this, args);
    }
    const name = nameFor(this);
    recorder.ensure(name); // 先注册流，面板立刻可见（哪怕还没发值）
    const wrapped = recordingArgs(name, args);
    inside++;
    try {
      return origSubscribe.apply(this, wrapped);
    } finally {
      inside--;
    }
  };

  patched = true;
  return stopAutoTrack;
}

export function stopAutoTrack() {
  if (!patched) return;
  Observable.prototype.subscribe = origSubscribe;
  patched = false;
}

export function isAutoTracking() {
  return patched;
}
