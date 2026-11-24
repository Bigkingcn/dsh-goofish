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
