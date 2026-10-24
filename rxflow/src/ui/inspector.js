// inspector.js —— 值检查器：把任意值渲染成可折叠的 JSON 树
// 用 DOM API 构建（不拼 innerHTML），字符串一律走 textContent，避免业务值注入页面。

function typeTag(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undef';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function text(cls, s) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = s;
  return el;
}

function preview(v) {
  const t = typeTag(v);
  if (t === 'null') return 'null';
  if (t === 'undef') return 'undefined';
  if (t === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 59) + '…' : v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
  if (t === 'symbol') return v.toString();
  if (t === 'array') return `[${v.length}]`;
  if (t === 'object') {
    const keys = Object.keys(v);
    return keys.length ? `{${keys.length}}` : '{}';
  }
  return String(v);
}

const valCls = {
  string: 'rxfw-v-str', number: 'rxfw-v-num', bigint: 'rxfw-v-num', boolean: 'rxfw-v-bool',
  null: 'rxfw-v-null', undef: 'rxfw-v-undef', function: 'rxfw-v-fn', symbol: 'rxfw-v-fn',
};

/**
 * 把 value 渲染成树。返回 <ul class="rxfw-tree">。
 * @param {any} value
 * @param {{expandDepth?: number}} [opts]
 */
export function buildValueTree(value, opts = {}) {
  const expandDepth = opts.expandDepth ?? 2;
  const root = document.createElement('ul');
  root.className = 'rxfw-tree';
  root.appendChild(buildNode(null, value, 0, expandDepth, new Set()));
  return root;
}

function buildNode(key, value, depth, expandDepth, seen) {
  const li = document.createElement('li');
  li.className = 'rxfw-n';
  const t = typeTag(value);
  const expandable = t === 'object' || t === 'array';

  if (expandable) {
    if (seen.has(value)) {
      // 循环引用：只显示预览，不可展开
      if (key !== null) li.appendChild(text('rxfw-k', key + ': '));
      li.appendChild(text('rxfw-meta', '[Circular]'));
      return li;
    }
    seen.add(value);

    const chevron = text('rxfw-chevron', '▸');
    li.appendChild(chevron);
    if (key !== null) li.appendChild(text('rxfw-k', key + ': '));
    li.appendChild(text('rxfw-meta', t === 'array' ? `Array(${value.length})` : `{${Object.keys(value).length}}`));

    const children = document.createElement('ul');
    children.style.display = expandDepth > depth ? '' : 'none';
    let keys = Object.keys(value); // 数组的 Object.keys 就是下标
    const frag = document.createDocumentFragment();
    keys.slice(0, 200).forEach(k => frag.appendChild(buildNode(k, value[k], depth + 1, expandDepth, seen)));
    if (keys.length > 200) {
      const more = document.createElement('li');
      more.className = 'rxfw-n';
      more.appendChild(text('rxfw-meta', `…共 ${keys.length} 项，仅展示前 200`));
      frag.appendChild(more);
    }
    children.appendChild(frag);
    li.appendChild(children);

    li.classList.toggle('rxfw-open', expandDepth > depth);
    const toggle = () => {
      const open = children.style.display === 'none';
      children.style.display = open ? '' : 'none';
      li.classList.toggle('rxfw-open', open);
    };
    chevron.addEventListener('click', toggle);
    // 点击文字也可以展开/收起
    li.addEventListener('click', (e) => { if (e.target === li) toggle(); });
    return li;
  }

  // 原始值 / 函数
  if (key !== null) li.appendChild(text('rxfw-k', key + ': '));
  li.appendChild(text(valCls[t] || 'rxfw-meta', preview(value)));
  return li;
}
