// 由 scripts/build.mjs 生成，不要手改。改 client/*.js 后重新 npm run build。
window.__ModuleLoader__.load({
  id: "dsh-goofish",
  factory: (require) => {
    const __defs = {}
    const __cache = {}
    // './x.js' 走本地 registry，'react' 之类交给宿主的模块表
    function __require(id) {
      if (!id.startsWith('./')) return require(id)
      const name = id.slice(2)
      if (__cache[name]) return __cache[name].exports
      const def = __defs[name]
      if (!def) throw new Error('[dsh-goofish] 找不到模块 ' + id)
      const module = { exports: {} }
      __cache[name] = module
      def(module, module.exports, __require)
      return module.exports
    }

    __defs["i18n.js"] = function (module, exports, require) {
    // 文案字典。键是英文短标识，值是各语言文案。
    // 只放"界面上会出现的字"，不放日志和错误码——那些由 Host 返回。
    const ZH = {
      title: '闲鱼监控',
      tabOverview: '概览',
      tabTasks: '任务',
      tabResults: '结果',
      tabAccounts: '账号',
      tabRuntime: '运行',
      refresh: '刷新',
      save: '保存',
      cancel: '取消',
      confirm: '确认',
      delete: '删除',
      edit: '编辑',
      start: '启动',
      stop: '停止',
      restart: '重启',
      install: '安装',
      loading: '加载中…',
      empty: '暂无数据',
      service: '服务',
      state: '状态',
      port: '端口',
      pid: '进程号',
      commit: '版本',
      since: '起始时间',
      summary: '概览',
      enabledTasks: '启用任务',
      runningTasks: '运行中',
      resultFiles: '结果文件',
      recommended: '推荐',
      alerts: '异常',
      noAlerts: '一切正常',
      accounts: '账号',
      stale: '可能过期',
      updatedAt: '更新于',
      paused: '熔断暂停',
      ai: 'AI 接口',
      aiConfigured: '已配置',
      aiMissing: '未配置（只有关键词模式可用）',
      digest: '定时汇报',
      digestSet: '开启汇报',
      digestClear: '移除汇报',
      digestWindow: '统计窗口（小时）',
      digestUnavailable: '当前 profile 没有 schedule 服务，汇报不可用',
      taskName: '任务名',
      keyword: '关键词',
      mode: '模式',
      price: '价格',
      cron: '定时',
      nextRun: '下次运行',
      running: '运行中',
      stopped: '已停止',
      createTask: '新建任务',
      patchTask: '保存修改',
      description: '描述（AI 模式必填）',
      keywordRules: '关键词规则（逗号分隔）',
      minPrice: '最低价',
      maxPrice: '最高价',
      maxPages: '最多翻页',
      region: '地区',
      accountStrategy: '账号策略',
      accountName: '账号',
      analyzeImages: '分析图片',
      freeShipping: '只看包邮',
      personalOnly: '只看个人',
      selectTask: '选任务',
      sinceHours: '最近几小时',
      recommendedOnly: '只看推荐',
      includeHidden: '含已隐藏',
      sortBy: '排序',
      page: '页',
      itemTitle: '标题',
      itemPrice: '价格',
      itemSeller: '卖家',
      itemReason: 'AI 理由',
      itemCrawledAt: '爬取时间',
      itemActions: '操作',
      open: '打开',
      detail: '详情',
      hide: '隐藏',
      expire: '标记过期',
      importAccount: '导入/更新账号',
      accountHint: '粘贴上游 Chrome 扩展导出的 JSON 原文。内容只提交给本机服务，不写入日志。',
      removeAccount: '删除账号',
      accountWarning: '删除后这个账号绑定的任务需要重新指定账号。',
      runtimeTitle: '运行管理',
      installProgress: '安装进度',
      serviceLog: '服务日志',
      taskLog: '任务日志',
      settings: '设置',
      aiBaseUrl: '接口地址',
      aiModel: '模型',
      apiKey: 'API 密钥',
      apiKeySet: '已设置',
      apiKeyUnset: '未设置',
      apiKeySave: '保存密钥',
      apiKeyClear: '清除密钥',
      apiKeyHint: '密钥存在 DSH 凭据里，不写入上游 .env，也不会出现在对话里。',
      needsRestart: '改了端口或安装目录后需要重启插件才会生效。',
      confirmDeleteTask: '删除任务',
      confirmDeleteAccount: '删除账号',
      errorGeneric: '出错了',
    }

    const EN = {
      title: 'Goofish monitor',
      tabOverview: 'Overview',
      tabTasks: 'Tasks',
      tabResults: 'Results',
      tabAccounts: 'Accounts',
      tabRuntime: 'Runtime',
      refresh: 'Refresh',
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      delete: 'Delete',
      edit: 'Edit',
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      install: 'Install',
      loading: 'Loading…',
      empty: 'Nothing here yet',
      service: 'Service',
      state: 'State',
      port: 'Port',
      pid: 'PID',
      commit: 'Commit',
      since: 'Since',
      summary: 'Summary',
      enabledTasks: 'Enabled tasks',
      runningTasks: 'Running',
      resultFiles: 'Result files',
      recommended: 'Recommended',
      alerts: 'Alerts',
      noAlerts: 'All good',
      accounts: 'Accounts',
      stale: 'May be stale',
      updatedAt: 'Updated',
      paused: 'Paused by guard',
      ai: 'AI endpoint',
      aiConfigured: 'Configured',
      aiMissing: 'Not configured (keyword mode only)',
      digest: 'Scheduled digest',
      digestSet: 'Enable digest',
      digestClear: 'Remove digest',
      digestWindow: 'Window (hours)',
      digestUnavailable: 'No schedule service in this profile; digest unavailable',
      taskName: 'Name',
      keyword: 'Keyword',
      mode: 'Mode',
      price: 'Price',
      cron: 'Cron',
      nextRun: 'Next run',
      running: 'Running',
      stopped: 'Stopped',
      createTask: 'New task',
      patchTask: 'Save changes',
      description: 'Description (required for AI mode)',
      keywordRules: 'Keyword rules (comma separated)',
      minPrice: 'Min price',
      maxPrice: 'Max price',
      maxPages: 'Max pages',
      region: 'Region',
      accountStrategy: 'Account strategy',
      accountName: 'Account',
      analyzeImages: 'Analyze images',
      freeShipping: 'Free shipping only',
      personalOnly: 'Private sellers only',
      selectTask: 'Task',
      sinceHours: 'Last hours',
      recommendedOnly: 'Recommended only',
      includeHidden: 'Include hidden',
      sortBy: 'Sort',
      page: 'Page',
      itemTitle: 'Title',
      itemPrice: 'Price',
      itemSeller: 'Seller',
      itemReason: 'AI reason',
      itemCrawledAt: 'Crawled',
      itemActions: 'Actions',
      open: 'Open',
      detail: 'Details',
      hide: 'Hide',
      expire: 'Mark expired',
      importAccount: 'Import / update account',
      accountHint: 'Paste the JSON exported by the upstream Chrome extension. It goes to the local service only and is never logged.',
      removeAccount: 'Delete account',
      accountWarning: 'Tasks bound to this account will need another account after deletion.',
      runtimeTitle: 'Runtime',
      installProgress: 'Install progress',
      serviceLog: 'Service log',
      taskLog: 'Task log',
      settings: 'Settings',
      aiBaseUrl: 'Base URL',
      aiModel: 'Model',
      apiKey: 'API key',
      apiKeySet: 'Set',
      apiKeyUnset: 'Not set',
      apiKeySave: 'Save key',
      apiKeyClear: 'Clear key',
      apiKeyHint: 'The key lives in DSH credentials, never in the upstream .env and never in the conversation.',
      needsRestart: 'Changing the port or install directory takes effect after the plugin reloads.',
      confirmDeleteTask: 'Delete task',
      confirmDeleteAccount: 'Delete account',
      errorGeneric: 'Something went wrong',
    }

    /**
     * @param {string} locale
     * @returns {(key: keyof typeof ZH) => string}
     */
    function createT(locale) {
      const dict = locale && locale.toLowerCase().startsWith('zh') ? ZH : EN
      return (key) => dict[key] ?? String(key)
    }

    const DICTS = { zh: ZH, en: EN }

    module.exports = { createT, DICTS }


    }

    __defs["styles.js"] = function (module, exports, require) {
    // 面板样式。只用主题令牌（--dsw-alias-*），不写字面色值，
    // 这样明暗主题切换、品牌色调整都由 DSH 负责。
    const CSS = `
    .gf-root{display:flex;flex-direction:column;height:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px}
    .gf-tabs{display:flex;gap:4px;padding:10px 14px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
    .gf-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 12px;border-radius:8px 8px 0 0;cursor:pointer;font:inherit}
    .gf-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
    .gf-tab[data-active="true"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}
    .gf-body{flex:1;overflow:auto;padding:14px}
    .gf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .gf-row-between{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
    .gf-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px;margin-bottom:12px}
    .gf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
    .gf-kv{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px}
    .gf-kv dt{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:4px}
    .gf-kv dd{margin:0;font-size:16px;font-variant-numeric:tabular-nums}
    .gf-muted{color:var(--dsw-alias-label-tertiary)}
    .gf-small{font-size:11px}
    .gf-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
    .gf-badge[data-tone="ok"]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
    .gf-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
    .gf-badge[data-tone="error"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
    .gf-badge[data-tone="brand"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
    .gf-btn{appearance:none;font:inherit;cursor:pointer;padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
    .gf-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
    .gf-btn:disabled{opacity:.5;cursor:not-allowed}
    .gf-btn[data-tone="primary"]{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
    .gf-btn[data-tone="danger"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
    .gf-table{width:100%;border-collapse:collapse}
    .gf-table th,.gf-table td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}
    .gf-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;font-size:11px;white-space:nowrap}
    .gf-table tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
    .gf-num{font-variant-numeric:tabular-nums;white-space:nowrap}
    .gf-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
    .gf-link:hover{text-decoration:underline}
    .gf-input,.gf-select,.gf-textarea{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;min-width:0}
    .gf-textarea{width:100%;min-height:96px;resize:vertical;font-family:ui-monospace,monospace;font-size:12px}
    .gf-field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
    .gf-field>label{color:var(--dsw-alias-label-secondary);font-size:11px}
    .gf-notice{border-radius:8px;padding:8px 10px;margin-bottom:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
    .gf-notice[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
    .gf-notice[data-tone="warn"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
    .gf-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center;z-index:40}
    .gf-modal{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(560px,92vw);max-height:86vh;overflow:auto;box-shadow:0 12px 40px var(--dsw-alias-bg-mask-2)}
    .gf-modal h3{margin:0 0 10px;font-size:14px}
    .gf-pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);max-height:280px;overflow:auto;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px}
    .gf-untrusted{color:var(--dsw-alias-label-tertiary);font-size:11px}
    .gf-truncate{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    `

    module.exports = { CSS }


    }

    __defs["api.js"] = function (module, exports, require) {
    // 面板的 HTTP 封装。
    //
    // 所有业务都走 Host 的 /goofish/api：面板不直接连上游，也不碰 cookie 内容。
    // Host 返回 { ok, data } 或 { ok:false, code, message, hint }，这里统一成
    // "成功返回值 / 失败抛 Error(message；hint)"，页面只处理一种形状。

    const BASE = '/goofish/api'

    /**
     * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
     * @param {string} path
     * @param {any} [body]
     */
    async function call(method, path, body) {
      /** @type {RequestInit} */
      const options = { method, headers: {}, credentials: 'same-origin' }
      if (body !== undefined) {
        options.headers = { 'content-type': 'application/json' }
        options.body = JSON.stringify(body)
      }
      const response = await fetch(`${BASE}${path}`, options)
      /** @type {any} */
      let payload = null
      try {
        payload = await response.json()
      } catch {
        // 非 JSON（例如网关直接返回 502 页面）：保留状态码信息
        throw new Error(`HTTP ${response.status}`)
      }
      if (!payload || payload.ok !== true) {
        const message = payload?.message ?? payload?.error ?? `HTTP ${response.status}`
        const hint = payload?.hint ?? ''
        throw Object.assign(new Error(hint ? `${message}；${hint}` : message), { code: payload?.code, status: response.status })
      }
      return payload.data
    }

    /** @param {Record<string, any>} params */
    function qs(params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null || value === '' || value === false) continue
        search.set(key, value === true ? '1' : String(value))
      }
      const text = search.toString()
      return text ? `?${text}` : ''
    }

    const api = {
      status: () => call('GET', '/status'),
      alerts: () => call('GET', '/alerts'),
      runtimeLog: (from = 0) => call('GET', `/runtime/log?from=${from}`),
      installProgress: () => call('GET', '/runtime/install-progress'),
      runtimeAction: (action) => call('POST', `/runtime/${action}`),

      tasks: (params) => call('GET', `/tasks${qs(params)}`),
      task: (id) => call('GET', `/tasks/${encodeURIComponent(id)}`),
      taskLog: (id, lines = 200) => call('GET', `/tasks/${encodeURIComponent(id)}/log?lines=${lines}`),
      createTask: (body) => call('POST', '/tasks', body),
      patchTask: (id, patch) => call('PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
      startTask: (id) => call('POST', `/tasks/${encodeURIComponent(id)}/start`),
      stopTask: (id) => call('POST', `/tasks/${encodeURIComponent(id)}/stop`),
      removeTask: (id) => call('DELETE', `/tasks/${encodeURIComponent(id)}`),

      results: (params) => call('GET', `/results${qs(params)}`),
      resultDetail: (item, params) => call('GET', `/results/${encodeURIComponent(item)}${qs(params)}`),
      markResult: (item, status, params) => call('POST', `/results/${encodeURIComponent(item)}/status${qs(params)}`, { status }),

      accounts: () => call('GET', '/accounts'),
      upsertAccount: (name, content) => call('POST', '/accounts', { name, content }),
      removeAccount: (name) => call('DELETE', `/accounts/${encodeURIComponent(name)}`),

      digest: () => call('GET', '/digest'),
      setDigest: (body) => call('PUT', '/digest', body),
      clearDigest: () => call('DELETE', '/digest'),

      settings: () => call('GET', '/settings'),
      saveSettings: (body) => call('PUT', '/settings', body),
      saveSecret: (value) => call('PUT', '/settings/secret', { value }),
      clearSecret: () => call('DELETE', '/settings/secret'),
    }

    module.exports = { api }


    }

    __defs["ui.js"] = function (module, exports, require) {
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


    }

    __defs["pages.js"] = function (module, exports, require) {
    // 五个页面：概览 / 任务 / 结果 / 账号 / 运行。
    // 每页自己取数据、自己轮询，不共享全局大对象（文档 §6.2）。

    const React = require('react')
    const h = React.createElement
    const { api } = require('./api.js')
    const { Badge, Btn, Notice, Kpi, Table, Field, Input, Select, Check, Modal, useAsync, usePoll } = require('./ui.js')

    /** 状态 → 徽标语义。 */
    function toneOf(state) {
      if (state === 'online') return 'ok'
      if (state === 'starting' || state === 'installing' || state === 'stopping') return 'warn'
      if (state === 'stopped') return ''
      return 'error'
    }

    /** 把上游错误显示成一行。 */
    function errText(error) {
      return error?.message ?? String(error ?? '')
    }

    /* ------------------------------------------------------------------ 概览 */

    function Overview({ t }) {
      const status = useAsync(() => api.status(), [])
      usePoll(10_000, status.reload, true)
      const digest = status.data?.digest
      const [busy, setBusy] = React.useState(false)

      const setDigest = async () => {
        setBusy(true)
        try {
          await api.setDigest({ windowHours: Number(digest?.windowHours ?? 24) })
          status.reload()
        } catch (error) {
          alert(errText(error))
        } finally {
          setBusy(false)
        }
      }
      const clearDigest = async () => {
        setBusy(true)
        try {
          await api.clearDigest()
          status.reload()
        } catch (error) {
          alert(errText(error))
        } finally {
          setBusy(false)
        }
      }

      if (status.loading && !status.data) return h('div', { className: 'gf-muted' }, t('loading'))
      if (status.error) return h(Notice, { tone: 'error' }, status.error)
      const data = status.data
      const runtime = data.runtime
      const summary = data.summary

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'gf-row-between' },
          h('div', { className: 'gf-row' }, h(Badge, { tone: toneOf(runtime.state) }, runtime.state), h('span', { className: 'gf-muted gf-small' }, `127.0.0.1:${runtime.port}${runtime.pid ? ` · PID ${runtime.pid}` : ''}${runtime.installedCommit ? ` · ${runtime.installedCommit.slice(0, 8)}` : ''}`)),
          h(Btn, { onClick: status.reload }, t('refresh')),
        ),
        runtime.message ? h(Notice, { tone: runtime.state === 'online' ? '' : 'warn' }, runtime.message) : null,
        (data.alerts ?? []).filter((row) => row.level !== 'info').map((row, index) => h(Notice, { key: index, tone: row.level === 'error' ? 'error' : 'warn' }, row.text)),
        h(
          'div',
          { className: 'gf-grid' },
          h(Kpi, { label: t('enabledTasks'), value: summary?.enabledTasks ?? '—' }),
          h(Kpi, { label: t('runningTasks'), value: summary?.runningTasks ?? '—' }),
          h(Kpi, { label: t('resultFiles'), value: summary?.resultFiles ?? '—' }),
          h(Kpi, { label: t('recommended'), value: summary?.recommendedItems ?? '—' }),
        ),
        h(
          'div',
          { className: 'gf-card' },
          h('div', { className: 'gf-row-between' }, h('strong', null, t('digest')), h(Badge, { tone: digest?.scheduleId ? 'brand' : '' }, digest?.scheduleId ? 'on' : 'off')),
          !digest?.available
            ? h('div', { className: 'gf-muted gf-small' }, t('digestUnavailable'))
            : h(
                'div',
                { className: 'gf-row' },
                h(Btn, { tone: 'primary', disabled: busy, onClick: setDigest }, t('digestSet')),
                h(Btn, { disabled: busy || !digest?.scheduleId, onClick: clearDigest }, t('digestClear')),
                digest?.view?.scheduledAtLocal ? h('span', { className: 'gf-muted gf-small' }, `${digest.view.scheduledAtLocal}`) : null,
              ),
        ),
        h(
          'div',
          { className: 'gf-card' },
          h('strong', null, t('accounts')),
          h(Table, {
            empty: t('empty'),
            columns: [
              { key: 'name', title: t('accounts') },
              { key: 'updatedAt', title: t('updatedAt'), render: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—') },
              { key: 'stale', title: '', render: (row) => (row.stale ? h(Badge, { tone: 'warn' }, t('stale')) : h(Badge, { tone: 'ok' }, 'ok')) },
            ],
            rows: data.accounts ?? [],
            rowKey: (row) => row.name,
          }),
          h('div', { className: 'gf-row gf-small gf-muted', style: { marginTop: 8 } }, `${t('ai')}：${data.aiConfigured ? t('aiConfigured') : t('aiMissing')}`),
        ),
      )
    }

    /* ------------------------------------------------------------------ 任务 */

    const MODES = [
      { value: 'ai', label: 'ai' },
      { value: 'keyword', label: 'keyword' },
    ]

    function Tasks({ t }) {
      const list = useAsync(() => api.tasks({}), [])
      usePoll(10_000, list.reload, true)
      const [editing, setEditing] = React.useState(null)
      const [error, setError] = React.useState('')

      const run = async (fn) => {
        setError('')
        try {
          await fn()
          list.reload()
        } catch (problem) {
          setError(errText(problem))
        }
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'gf-row-between' },
          h('div', { className: 'gf-row' }, h(Badge, null, `${list.data?.total ?? 0}`)),
          h('div', { className: 'gf-row' }, h(Btn, { onClick: list.reload }, t('refresh')), h(Btn, { tone: 'primary', onClick: () => setEditing({}) }, t('createTask'))),
        ),
        error ? h(Notice, { tone: 'error' }, error) : null,
        h(Table, {
          empty: t('empty'),
          rowKey: (row) => row.id,
          columns: [
            { key: 'name', title: t('taskName'), render: (row) => h('div', null, h('div', null, row.name), h('div', { className: 'gf-muted gf-small' }, row.id)) },
            { key: 'keyword', title: t('keyword'), render: (row) => h('span', { className: 'gf-truncate' }, row.keyword) },
            { key: 'mode', title: t('mode') },
            { key: 'priceRange', title: t('price') },
            { key: 'cron', title: t('cron') },
            { key: 'nextRunAt', title: t('nextRun') },
            {
              key: 'state',
              title: t('state'),
              render: (row) =>
                h(
                  'div',
                  { className: 'gf-row' },
                  h(Badge, { tone: row.running ? 'ok' : '' }, row.running ? t('running') : t('stopped')),
                  row.pausedUntil ? h(Badge, { tone: 'warn' }, `${t('paused')} ${row.pausedUntil}`) : null,
                ),
            },
            {
              key: 'actions',
              title: t('itemActions'),
              render: (row) =>
                h(
                  'div',
                  { className: 'gf-row' },
                  row.running
                    ? h(Btn, { onClick: () => run(() => api.stopTask(row.id)) }, t('stop'))
                    : h(Btn, { onClick: () => run(() => api.startTask(row.id)) }, t('start')),
                  h(Btn, { onClick: () => setEditing(row) }, t('edit')),
                  h(Btn, {
                    tone: 'danger',
                    onClick: () => {
                      if (confirm(`${t('confirmDeleteTask')}「${row.name}」？`)) run(() => api.removeTask(row.id))
                    },
                  }, t('delete')),
                ),
            },
          ],
          rows: list.data?.items ?? [],
        }),
        editing ? h(TaskForm, { t, task: editing, onClose: () => setEditing(null), onSaved: () => { setEditing(null); list.reload() } }) : null,
      )
    }

    /** 新建/编辑任务的表单。字段与工具参数一致（文档要求两处入口字段相同）。 */
    /** 表单状态 → 接口参数（与工具参数同名）。 */
    function toPayload(form) {
      return {
        task_name: form.task_name,
        keyword: form.keyword,
        mode: form.mode,
        description: form.description || undefined,
        keyword_rules: form.keyword_rules ? form.keyword_rules.split(/[,，\s]+/).filter(Boolean) : undefined,
        min_price: form.min_price || undefined,
        max_price: form.max_price || undefined,
        cron: form.cron || undefined,
        region: form.region || undefined,
        max_pages: Number(form.max_pages) || undefined,
        account: form.account || undefined,
        // 选了账号就是"固定账号"；上游在只给了 account_state_file 而没给策略时也是这么推断的。
        // 写死 'auto' 会让绑定的账号不再生效
        account_strategy: form.account ? 'fixed' : form.account_strategy,
        analyze_images: form.analyze_images,
        free_shipping: form.free_shipping,
        personal_only: form.personal_only,
      }
    }

    function TaskForm({ t, task, onClose, onSaved }) {
      const isNew = !task.id
      // 初始值只算一次：编辑时用它和提交时的表单做差，只提交用户真正改过的字段
      const [initialForm] = React.useState(() => ({
        task_name: task.name ?? '',
        keyword: task.keyword ?? '',
        mode: task.mode ?? 'ai',
        // 用完整描述：task.description 在列表里被截断到 200 字，拿它改会把后半段弄丢
        description: task.descriptionFull ?? task.description ?? '',
        keyword_rules: '',
        min_price: '',
        max_price: '',
        cron: task.cron ?? '',
        region: '',
        max_pages: 3,
        account: task.account ?? '',
        account_strategy: task.accountStrategy || 'auto',
        analyze_images: true,
        free_shipping: true,
        personal_only: true,
      }))
      const [form, setForm] = React.useState(initialForm)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }))

      const submit = async () => {
        setBusy(true)
        setError('')
        try {
          const payload = toPayload(form)
          if (isNew) {
            await api.createTask(payload)
          } else {
            // 编辑只提交改过的字段。表单里的"包邮/个人/分析图片/最多翻页"没有从上游读回真实值，
            // 全量提交会把没动过的开关悄悄重置成默认值
            const base = toPayload(initialForm)
            const changed = {}
            for (const key of Object.keys(payload)) {
              if (JSON.stringify(payload[key]) !== JSON.stringify(base[key])) changed[key] = payload[key]
            }
            if (Object.keys(changed).length === 0) {
              onClose()
              return
            }
            await api.patchTask(task.id, changed)
          }
          onSaved()
        } catch (problem) {
          setError(errText(problem))
        } finally {
          setBusy(false)
        }
      }

      return h(
        Modal,
        {
          title: isNew ? t('createTask') : t('edit'),
          onClose,
          footer: [h(Btn, { key: 'c', onClick: onClose }, t('cancel')), h(Btn, { key: 's', tone: 'primary', disabled: busy, onClick: submit }, t('save'))],
        },
        error ? h(Notice, { tone: 'error' }, error) : null,
        h(Field, { label: t('taskName') }, h(Input, { value: form.task_name, onChange: set('task_name') })),
        h(Field, { label: t('keyword') }, h(Input, { value: form.keyword, onChange: set('keyword') })),
        h(Field, { label: t('mode') }, h(Select, { value: form.mode, onChange: set('mode'), options: MODES })),
        form.mode === 'ai' ? h(Field, { label: t('description') }, h(Input, { value: form.description, onChange: set('description') })) : null,
        form.mode === 'keyword' ? h(Field, { label: t('keywordRules') }, h(Input, { value: form.keyword_rules, onChange: set('keyword_rules') })) : null,
        h('div', { className: 'gf-row' },
          h(Field, { label: t('minPrice') }, h(Input, { value: form.min_price, onChange: set('min_price') })),
          h(Field, { label: t('maxPrice') }, h(Input, { value: form.max_price, onChange: set('max_price') })),
          h(Field, { label: t('maxPages') }, h(Input, { value: String(form.max_pages), onChange: set('max_pages') })),
        ),
        h('div', { className: 'gf-row' },
          h(Field, { label: t('cron') }, h(Input, { value: form.cron, onChange: set('cron') })),
          h(Field, { label: t('region') }, h(Input, { value: form.region, onChange: set('region') })),
          h(Field, { label: t('accountName') }, h(Input, { value: form.account, onChange: set('account') })),
        ),
        h('div', { className: 'gf-row' },
          h(Check, { checked: form.free_shipping, onChange: set('free_shipping'), label: t('freeShipping') }),
          h(Check, { checked: form.personal_only, onChange: set('personal_only'), label: t('personalOnly') }),
          h(Check, { checked: form.analyze_images, onChange: set('analyze_images'), label: t('analyzeImages') }),
        ),
      )
    }

    /* ------------------------------------------------------------------ 结果 */

    const SORTS = [
      { value: 'crawl_time', label: 'crawl_time' },
      { value: 'price', label: 'price' },
      { value: 'publish_time', label: 'publish_time' },
      { value: 'keyword_hit_count', label: 'keyword_hit_count' },
    ]

    function Results({ t }) {
      const tasks = useAsync(() => api.tasks({ limit: 100 }), [])
      const [filters, setFilters] = React.useState({ task: '', since_hours: 24, recommended_only: false, include_hidden: false, sort_by: 'crawl_time', sort_order: 'desc' })
      const [page, setPage] = React.useState(1)
      const [detail, setDetail] = React.useState(null)
      const list = useAsync(() => (filters.task ? api.results({ ...filters, page, limit: 20 }) : Promise.resolve(null)), [filters, page])
      const set = (key) => (value) => {
        setPage(1)
        setFilters((prev) => ({ ...prev, [key]: value }))
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'gf-row' },
          h(Field, { label: t('selectTask') }, h(Select, { value: filters.task, onChange: set('task'), options: [{ value: '', label: '—' }, ...((tasks.data?.items ?? []).map((row) => ({ value: row.id, label: row.name })))] })),
          h(Field, { label: t('sinceHours') }, h(Input, { value: String(filters.since_hours), onChange: (value) => set('since_hours')(Number(value) || undefined) })),
          h(Field, { label: t('sortBy') }, h(Select, { value: filters.sort_by, onChange: set('sort_by'), options: SORTS })),
          h(Field, { label: t('itemActions') }, h(Select, { value: filters.sort_order, onChange: set('sort_order'), options: [{ value: 'desc', label: 'desc' }, { value: 'asc', label: 'asc' }] })),
          h(Check, { checked: filters.recommended_only, onChange: set('recommended_only'), label: t('recommendedOnly') }),
          h(Check, { checked: filters.include_hidden, onChange: set('include_hidden'), label: t('includeHidden') }),
          h(Btn, { onClick: list.reload }, t('refresh')),
        ),
        list.error ? h(Notice, { tone: 'error' }, list.error) : null,
        !filters.task
          ? h('div', { className: 'gf-muted' }, t('selectTask'))
          : h(Table, {
              empty: t('empty'),
              rowKey: (row) => `${row.core.itemId}-${row.core.crawledAt}`,
              columns: [
                {
                  key: 'title',
                  title: t('itemTitle'),
                  render: (row) =>
                    h(
                      'div',
                      null,
                      h('div', { className: 'gf-truncate', title: row.untrusted.title }, row.untrusted.title || '—'),
                      h('div', { className: 'gf-untrusted gf-small' }, `${row.untrusted.seller || '—'}`),
                    ),
                },
                { key: 'price', title: t('itemPrice'), render: (row) => h('span', { className: 'gf-num' }, row.core.price ?? row.core.priceText ?? '—') },
                {
                  key: 'flags',
                  title: '',
                  render: (row) =>
                    h('div', { className: 'gf-row' }, row.core.recommended ? h(Badge, { tone: 'brand' }, t('recommended')) : null, row.core.hidden ? h(Badge, { tone: 'warn' }, 'hidden') : null),
                },
                { key: 'crawledAt', title: t('itemCrawledAt'), render: (row) => h('span', { className: 'gf-small gf-muted' }, row.core.crawledAt) },
                {
                  key: 'actions',
                  title: t('itemActions'),
                  render: (row) =>
                    h(
                      'div',
                      { className: 'gf-row' },
                      row.core.link ? h('a', { className: 'gf-link gf-small', href: row.core.link, target: '_blank', rel: 'noopener noreferrer' }, t('open')) : null,
                      h(Btn, { onClick: () => setDetail(row.core.itemId) }, t('detail')),
                      h(Btn, { onClick: () => api.markResult(row.core.itemId, 'hidden', { task: filters.task }).then(list.reload).catch((error) => alert(errText(error))) }, t('hide')),
                    ),
                },
              ],
              rows: list.data?.items ?? [],
            }),
        list.data && list.data.total > 0
          ? h('div', { className: 'gf-row', style: { marginTop: 10 } },
              h(Btn, { disabled: page <= 1, onClick: () => setPage(page - 1) }, '‹'),
              h('span', { className: 'gf-small gf-muted' }, `${t('page')} ${page} · ${list.data.total}`),
              h(Btn, { disabled: !list.data.hasMore || page >= 5, onClick: () => setPage(page + 1) }, '›'),
            )
          : null,
        detail ? h(ResultDetail, { t, item: detail, task: filters.task, onClose: () => setDetail(null) }) : null,
      )
    }

    function ResultDetail({ t, item, task, onClose }) {
      const detail = useAsync(() => api.resultDetail(item, { task }), [item, task])
      return h(
        Modal,
        { title: `${t('detail')} ${item}`, onClose, footer: h(Btn, { onClick: onClose }, t('cancel')) },
        detail.error ? h(Notice, { tone: 'error' }, detail.error) : null,
        detail.loading ? h('div', { className: 'gf-muted' }, t('loading')) : null,
        detail.data
          ? h(
              'div',
              null,
              h('dl', { className: 'gf-kv' }, h('dt', null, t('itemTitle')), h('dd', null, detail.data.item.untrusted.title || '—')),
              h('dl', { className: 'gf-kv' }, h('dt', null, t('itemPrice')), h('dd', null, String(detail.data.item.core.price ?? detail.data.item.core.priceText ?? '—'))),
              h(Notice, null, h('div', { className: 'gf-untrusted' }, `seller: ${detail.data.item.untrusted.seller || '—'} · ${detail.data.item.untrusted.sellerCredit || ''} ${detail.data.item.untrusted.sellerGoodRate || ''}`)),
              (detail.data.item.untrusted.riskTags ?? []).length
                ? h('div', { className: 'gf-row' }, detail.data.item.untrusted.riskTags.map((tag) => h(Badge, { key: tag, tone: 'warn' }, tag)))
                : null,
              h('div', { className: 'gf-pre' }, detail.data.item.untrusted.reason || '—'),
              (detail.data.item.untrusted.reviews ?? []).map((review, index) => h('div', { key: index, className: 'gf-untrusted gf-small' }, `评价 ${index + 1}：${review}`)),
              (detail.data.item.core.imageList ?? []).length
                ? h('div', { className: 'gf-row', style: { marginTop: 8 } }, detail.data.item.core.imageList.map((src) => h('img', { key: src, src, referrerPolicy: 'no-referrer', loading: 'lazy', style: { width: 72, height: 72, objectFit: 'cover', borderRadius: 8 } })))
                : null,
            )
          : null,
      )
    }

    /* ------------------------------------------------------------------ 账号 */

    function Accounts({ t }) {
      const list = useAsync(() => api.accounts(), [])
      const [form, setForm] = React.useState(null)
      const [error, setError] = React.useState('')

      const submit = async () => {
        setError('')
        try {
          await api.upsertAccount(form.name, form.content)
          setForm(null)
          list.reload()
        } catch (problem) {
          setError(errText(problem))
        }
      }

      return h(
        'div',
        null,
        h('div', { className: 'gf-row-between' },
          h('span', { className: 'gf-muted gf-small' }, `${list.data?.length ?? 0}`),
          h('div', { className: 'gf-row' },
            h(Btn, { onClick: list.reload }, t('refresh')),
            h(Btn, { tone: 'primary', onClick: () => setForm({ name: '', content: '' }) }, t('importAccount')),
          ),
        ),
        error ? h(Notice, { tone: 'error' }, error) : null,
        h(Table, {
          empty: t('empty'),
          rowKey: (row) => row.name,
          columns: [
            { key: 'name', title: t('accounts') },
            { key: 'updatedAt', title: t('updatedAt'), render: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—') },
            { key: 'stale', title: '', render: (row) => (row.stale ? h(Badge, { tone: 'warn' }, t('stale')) : h(Badge, { tone: 'ok' }, 'ok')) },
            {
              key: 'actions',
              title: t('itemActions'),
              render: (row) =>
                h('div', { className: 'gf-row' },
                  h(Btn, { onClick: () => setForm({ name: row.name, content: '' }) }, t('edit')),
                  h(Btn, {
                    tone: 'danger',
                    onClick: () => {
                      if (confirm(`${t('confirmDeleteAccount')}「${row.name}」？\n${t('accountWarning')}`)) api.removeAccount(row.name).then(list.reload).catch((problem) => setError(errText(problem)))
                    },
                  }, t('delete')),
                ),
            },
          ],
          rows: list.data ?? [],
        }),
        form
          ? h(
              Modal,
              {
                title: t('importAccount'),
                onClose: () => setForm(null),
                footer: [h(Btn, { key: 'c', onClick: () => setForm(null) }, t('cancel')), h(Btn, { key: 's', tone: 'primary', onClick: submit }, t('save'))],
              },
              h('div', { className: 'gf-muted gf-small', style: { marginBottom: 8 } }, t('accountHint')),
              h(Field, { label: t('accounts') }, h(Input, { value: form.name, onChange: (value) => setForm({ ...form, name: value }) })),
              // 内容用遮罩文本域：截图和肩窥都看不到 cookie
              h('textarea', {
                className: 'gf-textarea',
                style: { WebkitTextSecurity: 'disc' },
                value: form.content,
                onChange: (event) => setForm({ ...form, content: event.target.value }),
              }),
            )
          : null,
      )
    }

    /* ------------------------------------------------------------------ 运行 */

    function Runtime({ t }) {
      const status = useAsync(() => api.status(), [])
      const settings = useAsync(() => api.settings(), [])
      const [progress, setProgress] = React.useState(null)
      const [log, setLog] = React.useState('')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      // 安装中 1 秒拉一次进度和日志，其余 10 秒一次
      const installing = progress?.running || status.data?.runtime?.state === 'installing'
      usePoll(installing ? 1000 : 10_000, () => {
        status.reload()
        api.installProgress().then(setProgress).catch(() => {})
        api.runtimeLog(0).then((data) => setLog((data.lines ?? []).join('\n'))).catch(() => {})
      }, true)

      const act = async (action) => {
        setBusy(true)
        setError('')
        try {
          await api.runtimeAction(action)
          status.reload()
        } catch (problem) {
          setError(errText(problem))
        } finally {
          setBusy(false)
        }
      }

      const runtime = status.data?.runtime
      const config = settings.data

      return h(
        'div',
        null,
        error ? h(Notice, { tone: 'error' }, error) : null,
        h(
          'div',
          { className: 'gf-card' },
          h('div', { className: 'gf-row-between' },
            h('div', { className: 'gf-row' }, h('strong', null, t('runtimeTitle')), runtime ? h(Badge, { tone: toneOf(runtime.state) }, runtime.state) : null),
            h('div', { className: 'gf-row' },
              h(Btn, { disabled: busy || runtime?.state === 'online', onClick: () => act('start') }, t('start')),
              h(Btn, { disabled: busy || runtime?.state !== 'online', onClick: () => act('stop') }, t('stop')),
              h(Btn, { disabled: busy, onClick: () => act('restart') }, t('restart')),
              h(Btn, { tone: 'primary', disabled: busy, onClick: () => act('install') }, t('install')),
            ),
          ),
          runtime
            ? h('div', { className: 'gf-small gf-muted', style: { marginTop: 8 } },
                `${t('state')}：${runtime.state} · ${t('port')}：${runtime.port}${runtime.pid ? ` · ${t('pid')}：${runtime.pid}` : ''}${runtime.installedCommit ? ` · ${t('commit')}：${runtime.installedCommit.slice(0, 8)}` : ''}`,
              )
            : null,
          runtime?.message ? h(Notice, { tone: 'warn' }, runtime.message) : null,
          runtime?.driftRisk ? h(Notice, { tone: 'warn' }, `上游版本与基线不一致（${runtime.installedCommit.slice(0, 8)}），部分接口可能对不上。`) : null,
        ),
        progress
          ? h('div', { className: 'gf-card' },
              h('div', { className: 'gf-row-between' }, h('strong', null, t('installProgress')), h(Badge, { tone: progress.error ? 'error' : progress.done ? 'ok' : 'warn' }, `${progress.step}/${progress.total} ${progress.label}`)),
              progress.error ? h(Notice, { tone: 'error' }, progress.error) : null,
              h('pre', { className: 'gf-pre' }, (progress.log ?? []).slice(-20).join('\n') || '—'),
            )
          : null,
        h('div', { className: 'gf-card' }, h('strong', null, t('serviceLog')), h('pre', { className: 'gf-pre', style: { marginTop: 8 } }, log || '—')),
        config ? h(SettingsForm, { t, config, onSaved: settings.reload }) : null,
      )
    }

    /** 设置：AI 接口、端口相关只读、密钥单独存。 */
    function SettingsForm({ t, config, onSaved }) {
      const [form, setForm] = React.useState({
        aiBaseUrl: config.ai?.baseUrl ?? '',
        aiModel: config.ai?.model ?? '',
        timeZone: config.timeZone ?? 'Asia/Shanghai',
        staleDays: config.staleDays ?? 7,
        defaultLimit: config.defaultLimit ?? 10,
        digestWindow: config.digest?.windowHours ?? 24,
      })
      const [secret, setSecret] = React.useState('')
      const [message, setMessage] = React.useState('')
      const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }))

      const save = async () => {
        setMessage('')
        try {
          await api.saveSettings({
            ai: { baseUrl: form.aiBaseUrl, model: form.aiModel },
            timeZone: form.timeZone,
            staleDays: Number(form.staleDays),
            defaultLimit: Number(form.defaultLimit),
            digest: { windowHours: Number(form.digestWindow) },
          })
          setMessage('已保存')
          onSaved?.()
        } catch (error) {
          setMessage(errText(error))
        }
      }

      const saveSecret = async () => {
        setMessage('')
        try {
          await api.saveSecret(secret)
          setSecret('')
          setMessage(`${t('apiKey')}：${t('apiKeySet')}`)
          onSaved?.()
        } catch (error) {
          setMessage(errText(error))
        }
      }

      return h(
        'div',
        { className: 'gf-card' },
        h('strong', null, t('settings')),
        message ? h(Notice, null, message) : null,
        h('div', { className: 'gf-row' },
          h(Field, { label: t('aiBaseUrl') }, h(Input, { value: form.aiBaseUrl, onChange: set('aiBaseUrl'), placeholder: 'https://api.example.com/v1' })),
          h(Field, { label: t('aiModel') }, h(Input, { value: form.aiModel, onChange: set('aiModel'), placeholder: 'vision-model' })),
        ),
        h('div', { className: 'gf-row' },
          h(Field, { label: t('timeZone') }, h(Input, { value: form.timeZone, onChange: set('timeZone') })),
          h(Field, { label: 'staleDays' }, h(Input, { value: String(form.staleDays), onChange: set('staleDays') })),
          h(Field, { label: 'defaultLimit' }, h(Input, { value: String(form.defaultLimit), onChange: set('defaultLimit') })),
          h(Field, { label: t('digestWindow') }, h(Input, { value: String(form.digestWindow), onChange: set('digestWindow') })),
        ),
        h('div', { className: 'gf-row' },
          h(Field, { label: t('apiKey') }, h(Input, { value: secret, onChange: setSecret, type: 'password', placeholder: config.secretConfigured ? t('apiKeySet') : t('apiKeyUnset') })),
          h(Btn, { tone: 'primary', onClick: saveSecret, disabled: !secret }, t('apiKeySave')),
          h(Btn, { onClick: () => api.clearSecret().then(() => { setMessage(`${t('apiKey')}：${t('apiKeyUnset')}`); onSaved?.() }).catch((error) => setMessage(errText(error))), disabled: !config.secretConfigured }, t('apiKeyClear')),
        ),
        h('div', { className: 'gf-muted gf-small' }, t('apiKeyHint')),
        h('div', { className: 'gf-muted gf-small', style: { marginTop: 6 } }, t('needsRestart')),
        h('div', { className: 'gf-row', style: { marginTop: 8 } }, h(Btn, { tone: 'primary', onClick: save }, t('save'))),
      )
    }


    module.exports = { Overview, Tasks, Results, Accounts, Runtime }

    }

    __defs["index.js"] = function (module, exports, require) {
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

    }

    return __require("./index.js")
  },
})
