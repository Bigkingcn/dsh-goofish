// 小控件集合。全部基于 require('react')，不引任何 UI 库：
// 文档明确说不要引用 dsh-client-ui-primitives 这类 Client 内部包。

const React = require('react')
const h = React.createElement

/** 状态/告警标记。 */
function Badge({ tone, children }) {
  return h('span', { className: 'gf-badge', 'data-tone': tone }, children)
}

/** 按钮。 */
function Btn({ onClick, disabled, tone, children, title }) {
  return h('button', { className: 'gf-btn', 'data-tone': tone, onClick, disabled, title, type: 'button' }, children)
}

/** 提示条。 */
function Notice({ tone, children }) {
  if (!children) return null
  return h('div', { className: 'gf-notice', 'data-tone': tone }, children)
}

/** 指标卡。 */
function Kpi({ label, value }) {
  return h('dl', { className: 'gf-kv' }, h('dt', null, label), h('dd', null, value))
}

/**
 * 表格。columns: [{key, title, render?}]，rows: 任意对象数组。
 */
function Table({ columns, rows, empty, rowKey }) {
  if (!rows || rows.length === 0) return h('div', { className: 'gf-muted' }, empty ?? '—')
  return h(
    'table',
    { className: 'gf-table' },
    h('thead', null, h('tr', null, columns.map((col) => h('th', { key: col.key }, col.title)))),
    h(
      'tbody',
      null,
      rows.map((row, index) =>
        h(
          'tr',
          { key: rowKey ? rowKey(row, index) : index },
          columns.map((col) => h('td', { key: col.key }, col.render ? col.render(row) : String(row[col.key] ?? ''))),
        ),
      ),
    ),
  )
}

/** 表单字段。 */
function Field({ label, children }) {
  return h('div', { className: 'gf-field' }, h('label', null, label), children)
}

/** 输入框（受控）。 */
function Input({ value, onChange, placeholder, type, disabled }) {
  return h('input', {
    className: 'gf-input',
    type: type ?? 'text',
    value: value ?? '',
    placeholder,
    disabled,
    onChange: (event) => onChange(event.target.value),
  })
}

/** 下拉框。 */
function Select({ value, onChange, options }) {
  return h(
    'select',
    { className: 'gf-select', value: value ?? '', onChange: (event) => onChange(event.target.value) },
    options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
  )
}

/** 勾选框。 */
function Check({ checked, onChange, label }) {
  return h(
    'label',
    { className: 'gf-row gf-small' },
    h('input', { type: 'checkbox', checked: Boolean(checked), onChange: (event) => onChange(event.target.checked) }),
    h('span', null, label),
  )
}

/**
 * 弹窗。自己实现焦点陷阱和 Esc 关闭：Client 内部包不能引，量也不大。
 */
function Modal({ title, onClose, children, footer }) {
  const ref = React.useRef(null)
  // onClose 在父组件里通常是内联箭头函数，每次父组件渲染都是新引用。
  // 如果把它放进 effect 的依赖，父组件每次因输入而重渲染（比如在 cookie 文本框里敲一个字符），
  // effect 就会重跑：重新抢一次焦点，把光标从文本框拽回第一个输入框——根本没法输入。
  // 所以用 ref 持有最新的 onClose，effect 只在挂载时跑一次。
  const closeRef = React.useRef(onClose)
  closeRef.current = onClose
  React.useEffect(() => {
    const handle = (event) => {
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab' || !ref.current) return
      const focusable = ref.current.querySelectorAll('button,input,select,textarea,a[href]')
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handle)
    // 打开时把焦点放到第一个可交互元素，键盘用户不用先 Tab 一遍
    const timer = setTimeout(() => ref.current?.querySelector('button,input,select,textarea')?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', handle)
      clearTimeout(timer)
    }
  }, [])
  return h(
    'div',
    { className: 'gf-mask', onMouseDown: (event) => event.target === event.currentTarget && closeRef.current() },
    h('div', { className: 'gf-modal', ref, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', null, title), children, h('div', { className: 'gf-row', style: { justifyContent: 'flex-end', marginTop: 12 } }, footer)),
  )
}

/**
 * 取数据的钩子：把"加载/错误/数据"三态和取消收在一处。
 * @param {() => Promise<any>} run
 * @param {any[]} deps
 */
function useAsync(run, deps) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null })
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    let alive = true
    setState((prev) => ({ ...prev, loading: true }))
    run().then(
      (data) => alive && setState({ loading: false, error: '', data }),
      (error) => alive && setState({ loading: false, error: error?.message ?? String(error), data: null }),
    )
    return () => {
      alive = false
    }
    // run 每次渲染都是新函数，依赖由调用方用自己的 deps 表达
  }, [...(deps ?? []), tick])
  return { ...state, reload: () => setTick((value) => value + 1) }
}

/**
 * 轮询钩子：页面不可见时暂停（文档 §6.2），卸载时清理。
 * @param {number} ms
 * @param {() => void} tick
 * @param {boolean} enabled
 */
function usePoll(ms, tick, enabled = true) {
  const saved = React.useRef(tick)
  saved.current = tick
  React.useEffect(() => {
    if (!enabled || !ms) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') saved.current()
    }, ms)
    return () => clearInterval(timer)
  }, [ms, enabled])
}

module.exports = { Badge, Btn, Notice, Kpi, Table, Field, Input, Select, Check, Modal, useAsync, usePoll }

