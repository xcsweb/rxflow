// panel.css.js —— 把 CSS 文本作为 JS 字符串导出，避免打包工具对 raw css import 的依赖
export default `
.rxfw-root, .rxfw-root * { box-sizing: border-box; margin: 0; padding: 0; }
.rxfw-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483600;
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #1a1d24, #2a3040);
  color: #e8ecf3; border: 1px solid #3a4356;
  font: 600 13px/1 -apple-system, sans-serif;
  cursor: pointer; user-select: none;
  box-shadow: 0 6px 20px rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s;
}
.rxfw-fab:hover { transform: scale(1.06); }
.rxfw-fab.rxfw-err { border-color: #e8594f; }
.rxfw-fab .rxfw-pulse {
  position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid #4da3ff; opacity: 0; pointer-events: none;
}
.rxfw-fab .rxfw-pulse.rxfw-pulse-err { border-color: #e8594f; }
.rxfw-fab.rxfw-hit .rxfw-pulse { animation: rxfw-pulse .6s ease-out; }
@keyframes rxfw-pulse {
  0% { opacity: .8; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.3); }
}
.rxfw-panel {
  position: fixed; right: 20px; bottom: 84px; z-index: 2147483601;
  width: 880px; height: 520px; max-width: calc(100vw - 40px); max-height: calc(100vh - 120px);
  background: #0f1115; color: #e8ecf3;
  border: 1px solid #262d3b; border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column; overflow: hidden;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.rxfw-panel.rxfw-hidden { display: none; }
.rxfw-head {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; background: #161a22; border-bottom: 1px solid #262d3b;
}
.rxfw-head .rxfw-logo {
  width: 22px; height: 22px; border-radius: 6px;
  background: #1a1d24; display: flex; align-items: center; justify-content: center;
  color: #e8594f; font: 700 12px/1 monospace;
}
.rxfw-head b { font-size: 13px; }
.rxfw-head .rxfw-tag { font: 10px monospace; color: #3dd68c; }
.rxfw-head .rxfw-tag.rxfw-paused { color: #f2b04a; }
.rxfw-head .rxfw-hint { font: 10px monospace; color: #5b6475; }
.rxfw-head .rxfw-spacer { flex: 1; }
.rxfw-head button {
  background: #1c212c; color: #e8ecf3; border: 1px solid #262d3b;
  border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;
}
.rxfw-head button:hover { border-color: #4da3ff; }
.rxfw-head button.rxfw-warn { color: #f2b04a; border-color: #4a3d22; }
.rxfw-body { flex: 1; display: flex; min-height: 0; }
.rxfw-list {
  width: 216px; border-right: 1px solid #262d3b; overflow-y: auto;
  background: #12151c; flex: none;
}
.rxfw-list .rxfw-item {
  padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #1c212c;
}
.rxfw-list .rxfw-item:hover { background: #1a1f2b; }
.rxfw-list .rxfw-item.rxfw-active { background: #1e2636; border-left: 2px solid #4da3ff; }
.rxfw-list .rxfw-item .rxfw-name {
  font: 600 11.5px monospace; display: flex; align-items: center; gap: 6px;
}
.rxfw-list .rxfw-item .rxfw-err-badge {
  margin-left: auto; background: #3a1412; color: #e8594f;
  font: 600 9px monospace; border-radius: 8px; padding: 1px 6px;
}
.rxfw-list .rxfw-item .rxfw-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.rxfw-list .rxfw-item .rxfw-meta {
  font-size: 10px; color: #8a94a6; margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rxfw-list .rxfw-empty { padding: 30px 14px; text-align: center; color: #5b6475; font-size: 11px; }
.rxfw-stage { flex: 1; position: relative; background: #0b0e13; min-width: 0; }
.rxfw-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.rxfw-ctrl {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  display: flex; align-items: center; gap: 8px;
  background: rgba(15,17,21,.92); border: 1px solid #262d3b; border-radius: 8px;
  padding: 5px 10px; font: 10px monospace; color: #8a94a6;
}
.rxfw-ctrl input[type=range] { width: 90px; accent-color: #4da3ff; }
.rxfw-ctrl .rxfw-speed-val { color: #4da3ff; min-width: 30px; text-align: right; }
.rxfw-ctrl button {
  background: #1c212c; color: #e8ecf3; border: 1px solid #262d3b;
  border-radius: 5px; padding: 2px 8px; cursor: pointer; font: 10.5px sans-serif;
}
.rxfw-ctrl button:hover { border-color: #4da3ff; }
.rxfw-ctrl .rxfw-golive { color: #3dd68c; border-color: #1e4034; }
.rxfw-logwrap {
  width: 292px; border-left: 1px solid #262d3b; background: #0d1015;
  display: flex; flex-direction: column; min-height: 0; flex: none;
}
.rxfw-body.rxfw-log-off .rxfw-logwrap { display: none; }
.rxfw-log-head {
  padding: 5px 10px; border-bottom: 1px solid #1c212c; background: #12151c;
  font: 10px monospace; color: #8a94a6; display: flex; align-items: center; gap: 8px; flex: none;
}
.rxfw-log-head button {
  background: none; border: none; color: #5b6475; cursor: pointer; font: 11px sans-serif;
}
.rxfw-log-head button:hover { color: #e8ecf3; }
.rxfw-log { flex: 1; overflow-y: auto; padding: 6px; font: 10.5px/1.5 monospace; }
.rxfw-log .rxfw-row {
  padding: 4px 6px; border-bottom: 1px dashed #1c212c; word-break: break-all;
  cursor: pointer; display: flex; gap: 6px; align-items: baseline;
}
.rxfw-log .rxfw-row:hover { background: #161b26; }
.rxfw-log .rxfw-row .rxfw-t { color: #5b6475; flex: none; }
.rxfw-log .rxfw-row .rxfw-badge { flex: none; font-weight: 700; }
.rxfw-log .rxfw-row.rxfw-ev-next .rxfw-badge { color: #4da3ff; }
.rxfw-log .rxfw-row.rxfw-ev-error { background: rgba(232,89,79,.09); }
.rxfw-log .rxfw-row.rxfw-ev-error .rxfw-badge { color: #e8594f; }
.rxfw-log .rxfw-row.rxfw-ev-error .rxfw-val { color: #e8594f; }
.rxfw-log .rxfw-row.rxfw-ev-complete .rxfw-badge { color: #5b6475; }
.rxfw-log .rxfw-row.rxfw-ev-complete .rxfw-val { color: #8a94a6; font-style: italic; }
.rxfw-log .rxfw-row.rxfw-cur { background: #1e2636; box-shadow: inset 2px 0 0 #4da3ff; }
.rxfw-log .rxfw-empty { color: #5b6475; text-align: center; padding: 20px; }
.rxfw-inspector { border-top: 1px solid #262d3b; background: #10131a; max-height: 46%; display: flex; flex-direction: column; }
.rxfw-inspector .rxfw-insp-head {
  padding: 6px 10px; font: 10px monospace; color: #8a94a6;
  display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #1c212c; flex: none;
}
.rxfw-inspector .rxfw-insp-head button {
  background: none; border: 1px solid #262d3b; color: #8a94a6;
  border-radius: 5px; padding: 2px 8px; cursor: pointer; font: 10px sans-serif;
}
.rxfw-inspector .rxfw-insp-head button:hover { color: #e8ecf3; border-color: #4da3ff; }
.rxfw-insp-body { overflow: auto; padding: 8px 10px; font: 11px/1.6 monospace; }
.rxfw-tree { list-style: none; }
.rxfw-tree ul { list-style: none; padding-left: 14px; border-left: 1px dotted #2c3547; }
.rxfw-tree .rxfw-n { padding: 1px 0; }
.rxfw-tree .rxfw-chevron {
  display: inline-block; width: 12px; color: #5b6475; cursor: pointer; user-select: none;
  transition: transform .1s;
}
.rxfw-tree .rxfw-open > .rxfw-chevron { transform: rotate(90deg); }
.rxfw-tree .rxfw-k { color: #9b7cf2; }
.rxfw-tree .rxfw-meta { color: #5b6475; font-size: 10px; }
.rxfw-tree .rxfw-v-str { color: #3dd68c; }
.rxfw-tree .rxfw-v-num { color: #f2b04a; }
.rxfw-tree .rxfw-v-bool { color: #f2b04a; }
.rxfw-tree .rxfw-v-null { color: #e8594f; }
.rxfw-tree .rxfw-v-undef { color: #5b6475; }
.rxfw-tree .rxfw-v-fn { color: #36c5d9; font-style: italic; }
.rxfw-foot {
  padding: 6px 14px; background: #161a22; border-top: 1px solid #262d3b;
  font: 10px monospace; color: #8a94a6; display: flex; gap: 14px; align-items: center;
}
.rxfw-foot .rxfw-foot-tip { margin-left: auto; color: #5b6475; }
.rxfw-foot .rxfw-foot-tip kbd {
  background: #1c212c; border: 1px solid #262d3b; border-radius: 4px;
  padding: 0 5px; font: 9px monospace; color: #8a94a6;
}
@media (max-width: 920px) {
  .rxfw-panel { width: calc(100vw - 20px); right: 10px; bottom: 80px; height: 60vh; }
  .rxfw-logwrap { display: none; }
  .rxfw-list { width: 170px; }
}
`;
