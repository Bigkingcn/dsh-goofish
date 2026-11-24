// 面板入口：注册 main 页面和侧栏图标，提供五个标签页。
// 与 dsh-media-desk / dsh-guizang-design 的产物形态一致：window.__ModuleLoader__.load + require('react')。

const React = require('react')
const h = React.createElement
const { createT } = require('./i18n.js')
const { CSS } = require('./styles.js')
const pages = require('./pages.js')

const TABS = [
  { key: 'overview', label: 'tabOverview', page: pages.Overview },
  { key: 'tasks', label: 'tabTasks', page: pages.Tasks },
  { key: 'results', label: 'tabResults', page: pages.Results },
  { key: 'accounts', label: 'tabAccounts', page: pages.Accounts },
  { key: 'runtime', label: 'tabRuntime', page: pages.Runtime },
]

/** 当前语言：优先用 DSH 的 locale 服务（拿不到就跟随浏览器）。 */
function detectLocale(ctx) {
  try {
    const locale = ctx.get?.('locale')
    const current = locale?.current?.() ?? locale?.language ?? locale?.locale
    if (typeof current === 'string' && current) return current
    if (typeof current === 'object' && typeof current?.language === 'string') return current.language
  } catch {
    // locale 服务不存在或接口不同：退回浏览器语言
  }
  return typeof navigator !== 'undefined' ? navigator.language : 'en'
}

/** 样式随组件挂载：一个 <style> 元素，卸载时移除。 */
function useStyles() {
  React.useEffect(() => {
    const element = document.createElement('style')
    element.dataset.dshGoofish = 'styles'
    element.textContent = CSS
    document.head.appendChild(element)
    return () => element.remove()
  }, [])
}

/**
 * 面板。每次切页面都重新挂载，这样离开的页面会停掉自己的轮询。
 */
function Panel() {
  const [tab, setTab] = React.useState('overview')
  const [alerts, setAlerts] = React.useState(0)
  const t = createT(getLocale())
  useStyles()

  // 侧栏徽标用同一份告警摘要；面板打开时 60 秒刷一次
  React.useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/goofish/api/alerts', { credentials: 'same-origin' })
        .then((response) => response.json())
        .then((payload) => alive && payload?.ok && setAlerts(payload.data?.count ?? 0))
        .catch(() => {})
    }
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const current = TABS.find((row) => row.key === tab) ?? TABS[0]
  const Page = current.page

  return h(
    'div',
    { className: 'gf-root' },
    h(
      'div',
      { className: 'gf-tabs', role: 'tablist' },
      TABS.map((row) =>
        h('button', {
          key: row.key,
          type: 'button',
          role: 'tab',
          className: 'gf-tab',
          'data-active': row.key === tab ? 'true' : 'false',
          'aria-selected': row.key === tab,
          onClick: () => setTab(row.key),
        }, t(row.label)),
      ),
      alerts > 0 ? h('span', { className: 'gf-badge', 'data-tone': 'warn', style: { marginLeft: 'auto', alignSelf: 'center' } }, `! ${alerts}`) : null,
    ),
    h('div', { className: 'gf-body' }, h(Page, { key: current.key, t })),
  )
}

/** 侧栏图标：一只带放大镜的鱼；有告警时右上角加圆点。 */
function SidebarIcon(props) {
  const size = (props && props.size) || 18
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round', 'aria-hidden': 'true' },
    h('path', { d: 'M3 11c2-3 4.4-4.4 7-4.4S15 8 17 11c-2 3-4.4 4.4-7 4.4S5 14 3 11Z' }),
    h('path', { d: 'M3 11 1 14v-6l2 3Z', fill: 'currentColor' }),
    h('circle', { cx: '16.5', cy: '16', r: '3.4' }),
    h('path', { d: 'M19 18.6 21.4 21', strokeLinecap: 'round' }),
  )
}

/** 模块级保存当前语言，React 组件里直接读；语言变化时由 DSH 重新挂载面板。 */
let currentLocale = ''

function getLocale() {
  if (!currentLocale && typeof navigator !== 'undefined') currentLocale = navigator.language
  return currentLocale
}

function apply(ctx) {
  currentLocale = detectLocale(ctx)
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'goofish', order: 7, label: () => createT(getLocale())('title') }, SidebarIcon),
  )
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'goofish' }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
