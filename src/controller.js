// @ts-check
// 控制器：所有业务操作的唯一入口。
//
// 工具（模型）和 HTTP 路由（面板）都只调这里，各自只负责把结果渲染成自己的形状。
// 这样面板和对话看到的是同一份事实，不会出现"面板能删、工具说没有"这种事。
// 方法返回裸数据，出错抛 GoofishError（带 code/message/hint）。

import { classify } from './diagnose.js'
import { GoofishError } from './errors.js'
import { buildResultFilename, jobIdOf, jobOf, listOf } from './upstream/contract.js'
import { clean, clip, mapResultDetail, mapResultItem, mapSummary, mapTask } from './upstream/mapping.js'

/** 上游结果接口单页最多 100 条（limit 的 le=100），默认只有 20。 */
const UPSTREAM_PAGE = 100

/** 详情、按时间窗口取结果时最多翻这么多页。上游单文件动辄几千条，不能无限翻。 */
const DETAIL_MAX_PAGES = 10
const WINDOW_MAX_PAGES = 10

/** 结果文件按时间排序时间格式是 "2026-11-20 10:00:00"（本地时间），换成 ISO 再解析。 */
function parseCrawlTime(text) {
  return Date.parse(String(text ?? '').replace(' ', 'T'))
}

/**
 * @param {object} options
 * @param {import('./config.js').GoofishConfig} options.cfg
 * @param {import('./upstream/client.js').UpstreamClient} options.upstream
 * @param {import('./runtime/manager.js').Runtime} options.runtime
 * @param {import('./files.js').FilesApi} options.files
 * @param {import('./digest.js').Digest} options.digest
 * @param {import('./runtime/meta.js').MetaStore} options.meta
 * @param {(event: string, fields?: Record<string, unknown>) => void} [options.log]
 * @param {number} [options.pollMs] AI 建任务时轮询作业状态的起始间隔（默认 1500ms；测试里调小）
 */
export function createController({ cfg, upstream, runtime, files, digest, meta, log, pollMs = 1500 }) {
  /** 需要上游在线才能做的操作，先过这一关。 */
  async function ensureOnline() {
    const status = await runtime.status()
    if (status.state === 'online') return status
    const hint = status.state === 'not_installed'
      ? '打开侧栏「闲鱼监控」→「运行」→「安装」'
      : status.state === 'port_conflict'
        ? status.hint
        : '打开侧栏「闲鱼监控」→「运行」→「启动」'
    throw new GoofishError({
      code: status.state === 'not_installed' ? 'NOT_INSTALLED' : 'NOT_RUNNING',
      message: `闲鱼监控服务未运行（当前状态：${status.state}）`,
      hint,
    })
  }

  /**
   * 概览 + 运行状态 + 账号 + 熔断 + 告警。面板和 goofish_service 共用。
   */
  async function status() {
    const runtimeStatus = await runtime.status()
    /** @type {any} */
    const out = {
      runtime: runtimeStatus,
      online: runtimeStatus.state === 'online',
      summary: null,
      accounts: [],
      paused: [],
      digest: null,
      alerts: [],
      aiConfigured: runtimeStatus.aiConfigured,
    }

    if (runtimeStatus.state === 'online') {
      const [summaryRaw, accounts] = await Promise.all([
        upstream.get('/api/dashboard/summary', { timeoutMs: 8000 }).catch(() => null),
        accountsList().catch(() => []),
      ])
      out.summary = summaryRaw ? mapSummary(summaryRaw) : null
      out.accounts = accounts
    }

    const guard = await files.readGuard().catch(() => [])
    out.paused = files.pausedTasks(guard).map((entry) => ({
      key: entry.key,
      pausedUntil: entry.pausedUntil,
      consecutiveFailures: entry.consecutiveFailures,
      lastFailureReason: clip(clean(entry.lastFailureReason), 160),
    }))

    if (digest) out.digest = await digest.get().catch(() => null)

    out.alerts = buildAlerts(out)
    return out
  }

  /**
   * 侧栏图标用的轻量告警摘要。不做 dashboard 请求，0 成本的判断也能给出徽标。
   */
  async function alerts() {
    const runtimeStatus = await runtime.status()
    const guard = await files.readGuard().catch(() => [])
    const paused = files.pausedTasks(guard)
    const staleAccounts = runtimeStatus.state === 'online' ? (await accountsList().catch(() => [])).filter((row) => row.stale) : []
    const list = []
    if (runtimeStatus.state !== 'online') list.push({ kind: 'runtime', level: 'error', text: `服务未运行：${runtimeStatus.message || runtimeStatus.state}` })
    if (staleAccounts.length) list.push({ kind: 'account', level: 'warn', text: `${staleAccounts.length} 个账号登录态可能过期：${staleAccounts.map((row) => row.name).join('、')}` })
    if (paused.length) list.push({ kind: 'guard', level: 'warn', text: `${paused.length} 个任务被熔断暂停到 ${paused[0].pausedUntil}` })
    if (!runtimeStatus.aiConfigured) list.push({ kind: 'ai', level: 'info', text: 'AI 接口还没配置，只有关键词模式可用' })
    return { count: list.length, level: list.some((row) => row.level === 'error') ? 'error' : list.length ? 'warn' : 'ok', items: list }
  }

  /**
   * 上游账号列表 + 登录态文件时间。
   * 只调 GET /api/accounts（返回名字）；带 cookie 明文的 GET /api/accounts/{name} 永远不调。
   */
  async function accountsList() {
    /** @type {any[]} */
    let raw = []
    try {
      raw = listOf(await upstream.get('/api/accounts', { timeoutMs: 8000 }), 'accounts')
    } catch {
      // 上游接口不可用时退回文件名：至少能显示有几个账号
      const names = await files.accountFileNames().catch(() => [])
      raw = names.map((name) => ({ name }))
    }
    const names = raw.map((row) => String(row?.name ?? row)).filter(Boolean)
    const times = await files.accountFileTimes(names).catch(() => ({}))
    const limit = Date.now() - cfg.staleDays * 24 * 60 * 60 * 1000
    return names.map((name) => {
      const updatedAt = times[name] ?? ''
      const stamp = updatedAt ? Date.parse(updatedAt) : Number.NaN
      return {
        name,
        updatedAt,
        stale: Number.isFinite(stamp) ? stamp < limit : true,
      }
    })
  }

  /** 任务列表（英文键）+ 熔断状态。 */
  async function taskList({ keyword, limit } = {}) {
    await ensureOnline()
    const raw = listOf(await upstream.get('/api/tasks'), 'tasks')
    const guard = await files.readGuard().catch(() => [])
    const needle = keyword ? String(keyword).trim().toLowerCase() : ''
    const tasks = raw
      .map((row) => mapTask(row))
      .filter((task) => !needle || task.name.toLowerCase().includes(needle) || task.keyword.toLowerCase().includes(needle))
      .map((task) => {
        const entry = files.guardFor(guard, task)
        return {
          ...task,
          pausedUntil: entry?.pausedUntil ?? '',
          consecutiveFailures: entry?.consecutiveFailures ?? 0,
        }
      })
    const max = Math.min(Math.max(limit ?? cfg.defaultLimit, 1), 100)
    return { total: tasks.length, items: tasks.slice(0, max) }
  }

  /** 找任务：按 id 或名字，找不到时给出最接近的 3 个（编辑距离）。 */
  async function taskGet(taskRef) {
    await ensureOnline()
    const raw = listOf(await upstream.get('/api/tasks'), 'tasks').map((row) => mapTask(row))
    const wanted = String(taskRef ?? '').trim()
    const exact = raw.find((task) => task.id === wanted || task.name === wanted)
    if (exact) return { ...exact, raw: undefined }
    const closest = nearest(raw.map((task) => task.name), wanted, 3)
    throw new GoofishError({
      code: 'TASK_NOT_FOUND',
      message: closest.length ? `找不到任务「${wanted}」，最接近的是：${closest.join('、')}` : `找不到任务「${wanted}」，当前没有任何任务`,
      hint: '用 goofish_tasks 列出任务名，或用面板「任务」页确认',
    })
  }

  /**
   * 建任务：POST /api/tasks/generate → 轮询 job。
   * 上游是异步 AI 建任务，可能要几十秒，所以有 generateTimeoutMs 上限；超时返回 job_id 而不是报错。
   * @param {any} args
   */
  async function taskCreate(args) {
    await ensureOnline()
    // 绑定账号：工具里给的是账号名，上游要的是状态文件路径（account_state_file）
    const accountFile = args?.account ? await resolveAccountFile(args.account) : undefined
    const body = buildTaskBody(args, { accountFile })
    const created = await upstream.post('/api/tasks/generate', { body, timeoutMs: 20_000 })
    // 关键词模式没有异步作业：上游直接返回 200 {message, task}
    if (created?.task && !created?.job) return { task: mapTask(created.task), waited_ms: 0 }
    const jobId = jobIdOf(created)
    if (!jobId) {
      throw new GoofishError({ code: 'CONTRACT_DRIFT', message: '上游没有返回 job_id 也没有返回 task', hint: '看「运行」页的服务日志；插件可能需要更新' })
    }
    const startedAt = Date.now()
    const limit = cfg.generateTimeoutMs
    let delay = pollMs
    while (Date.now() - startedAt < limit) {
      await sleep(delay)
      // 轮询接口返回 {job:{status,task,error,...}}，状态在 job 里，不是顶层
      const polled = await upstream.get(`/api/tasks/generate-jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 8000 }).catch(() => null)
      const job = jobOf(polled)
      const state = String(job?.status ?? '')
      if (state === 'completed') {
        return { task: job?.task ? mapTask(job.task) : null, waited_ms: Date.now() - startedAt }
      }
      if (state === 'failed') {
        throw new GoofishError({
          code: 'UPSTREAM_HTTP',
          message: `上游建任务失败：${clean(job?.error ?? job?.message ?? '没有给出原因')}`,
          hint: '看面板「运行」页的日志；常见原因是 AI 接口没配好或额度用尽',
        })
      }
      // queued / running：继续等
      delay = Math.min(delay * 1.3, 4000)
    }
    return {
      task: null,
      job_id: jobId,
      waited_ms: Date.now() - startedAt,
      hint: `等太久了，任务可能还在生成；稍后用 goofish_tasks 查看，或到面板「任务」页看`
    }
  }

  /** 改任务：PATCH /api/tasks/{id}。只传白名单字段。 */
  async function taskUpdate(taskRef, patch) {
    await ensureOnline()
    const task = await taskGet(taskRef)
    const accountFile = patch?.account ? await resolveAccountFile(patch.account) : undefined
    const body = buildTaskBody(patch, { partial: true, accountFile })
    if (!Object.keys(body).length) {
      throw new GoofishError({ code: 'INTERNAL', message: '没有要改的字段', hint: '至少给一个可改字段，例如 keyword、cron、min_price' })
    }
    // 改了 AI 模式的 description 时，上游会在这次 PATCH 里同步调 AI 重新生成标准，
    // 可能要几十秒——用建任务同样的上限，别让默认 15 秒超时把它截断
    const updated = await upstream.patch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      body,
      timeoutMs: Math.max(cfg.generateTimeoutMs, 30_000),
    })
    // 上游返回 {message, task}：任务在 task 里，不是顶层
    const after = updated?.task ? mapTask(updated.task) : await taskGet(task.id)
    return { before: task, after }
  }

  async function taskStart(taskRef) {
    await ensureOnline()
    const task = await taskGet(taskRef)
    await upstream.post(`/api/tasks/start/${encodeURIComponent(task.id)}`, { timeoutMs: 20_000 })
    return { task: await taskGet(task.id) }
  }

  async function taskStop(taskRef) {
    await ensureOnline()
    const task = await taskGet(taskRef)
    await upstream.post(`/api/tasks/stop/${encodeURIComponent(task.id)}`, { timeoutMs: 20_000 })
    return { task: await taskGet(task.id) }
  }

  async function taskRemove(taskRef) {
    await ensureOnline()
    const task = await taskGet(taskRef)
    await upstream.del(`/api/tasks/${encodeURIComponent(task.id)}`)
    return { removed: task }
  }

  /**
   * 结果列表。两个入口（任务 / 关键词）共用同一条路径：先定位结果文件，再取它的条目。
   * @param {{task?: string, keyword?: string, sinceHours?: number, limit?: number, page?: number, recommendedOnly?: boolean, includeHidden?: boolean, sortBy?: string, sortOrder?: 'asc'|'desc'}} params
   */
  async function resultsList(params) {
    await ensureOnline()
    const located = await locateResultFile(params)
    const page = Math.max(1, Number(params.page) || 1)
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50)

    // 没有时间窗口：筛选、排序、分页全部交给上游（它是服务端分页，默认一页只有 20 条）。
    // 不能只取一页再在本地筛——total 和 recommended_only 都会是错的。
    if (!params.sinceHours) {
      const data = await fetchResultPage(located.file, {
        page,
        limit,
        recommendedOnly: params.recommendedOnly,
        includeHidden: params.includeHidden,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      })
      const total = Number(data?.total_items) || 0
      return {
        file: located.file,
        total,
        page,
        limit,
        hasMore: page * limit < total,
        // 翻到第 5 页就不再往下：再深的分页没人看
        truncated: page >= 5 && page * limit < total ? true : undefined,
        items: listOf(data, 'items').map(mapResultItem),
      }
    }

    // 有时间窗口：上游没有这个参数，只能按爬取时间倒序从新往旧翻，翻到窗口外就停。
    const cutoff = Date.now() - Number(params.sinceHours) * 3600_000
    /** @type {any[]} */
    const windowRows = []
    let capped = false
    for (let pageNo = 1; pageNo <= WINDOW_MAX_PAGES; pageNo += 1) {
      const data = await fetchResultPage(located.file, {
        page: pageNo,
        limit: UPSTREAM_PAGE,
        recommendedOnly: params.recommendedOnly,
        includeHidden: params.includeHidden,
        sortBy: 'crawl_time',
        sortOrder: 'desc',
      })
      const rows = listOf(data, 'items')
      const total = Number(data?.total_items) || 0
      let reachedOld = false
      for (const raw of rows) {
        const at = parseCrawlTime(mapResultItem(raw).core.crawledAt)
        // 时间解析不出来的保留：宁多给一条，不要悄悄丢结果
        if (Number.isFinite(at) && at < cutoff) reachedOld = true
        else windowRows.push(raw)
      }
      if (reachedOld || rows.length < UPSTREAM_PAGE || pageNo * UPSTREAM_PAGE >= total) break
      if (pageNo === WINDOW_MAX_PAGES) capped = true
    }
    // 窗口里的数据再按调用方要的排序/分页（selectResults 只做本地筛选与排序）
    const items = selectResults(windowRows, params)
    return {
      file: located.file,
      total: items.length,
      page,
      limit,
      hasMore: page * limit < items.length,
      truncated: capped || (page >= 5 && page * limit < items.length) ? true : undefined,
      items: items.slice((page - 1) * limit, page * limit),
    }
  }

  /**
   * 取结果文件的一页。参数名与上游 GET /api/results/{filename} 一致。
   * @param {string} file
   * @param {{page: number, limit: number, recommendedOnly?: boolean, includeHidden?: boolean, sortBy?: string, sortOrder?: string}} options
   */
  function fetchResultPage(file, options) {
    return upstream.get(`/api/results/${encodeURIComponent(file)}`, {
      timeoutMs: 20_000,
      query: {
        page: options.page,
        limit: Math.min(options.limit, UPSTREAM_PAGE),
        recommended_only: options.recommendedOnly ? 'true' : undefined,
        include_hidden: options.includeHidden ? 'true' : undefined,
        sort_by: options.sortBy,
        sort_order: options.sortOrder,
      },
    })
  }

  /**
   * 单条详情：按页扫结果文件，命中即返回；最多扫 DETAIL_MAX_PAGES 页（每页 100 条）。
   */
  async function resultDetail(itemId, params) {
    await ensureOnline()
    const wanted = String(itemId ?? '').trim()
    if (!wanted) throw new GoofishError({ code: 'INTERNAL', message: '缺少 item_id', hint: '从 goofish_results 的结果里复制 item_id' })
    const located = await locateResultFile(params)
    let scanned = 0
    for (let pageNo = 1; pageNo <= DETAIL_MAX_PAGES; pageNo += 1) {
      const data = await fetchResultPage(located.file, {
        page: pageNo,
        limit: UPSTREAM_PAGE,
        includeHidden: params.includeHidden === true,
        sortBy: 'crawl_time',
        sortOrder: 'desc',
      })
      const rows = listOf(data, 'items')
      const match = rows.find((row) => mapResultItem(row).core.itemId === wanted)
      if (match) return { file: located.file, item: mapResultDetail(match) }
      scanned += rows.length
      if (rows.length < UPSTREAM_PAGE || pageNo * UPSTREAM_PAGE >= (Number(data?.total_items) || 0)) break
    }
    throw new GoofishError({
      code: 'NO_RESULTS_YET',
      message: `在结果文件 ${located.file} 最新的 ${scanned} 条里没有找到商品 ${wanted}`,
      hint: '先用 goofish_results 确认 item_id；更早的商品要加 include_hidden 或到面板「结果」页翻页',
    })
  }

  /** 标记隐藏/过期。 */
  async function resultMark(itemId, status, params) {
    await ensureOnline()
    const located = await locateResultFile(params)
    await upstream.patch(`/api/results/${encodeURIComponent(located.file)}/items/${encodeURIComponent(String(itemId))}/status`, { body: { status } })
    return { itemId, status, file: located.file }
  }

  /**
   * 定位结果文件：任务优先，其次关键词。
   * @param {{task?: string, keyword?: string}} params
   */
  async function locateResultFile(params) {
    const taskRef = String(params.task ?? '').trim()
    const keyword = String(params.keyword ?? '').trim()
    if (!taskRef && !keyword) {
      throw new GoofishError({ code: 'INTERNAL', message: 'task_id 和 keyword 至少给一个', hint: '先用 goofish_tasks 看有哪些任务' })
    }
    let task = null
    if (taskRef) task = await taskGet(taskRef)
    const filesRaw = await upstream.get('/api/results/files', { timeoutMs: 15_000 })
    const candidates = normalizeFiles(filesRaw)
    const wantedKeyword = (keyword || task?.keyword || '').trim()
    const none = () =>
      new GoofishError({
        code: 'NO_RESULTS_YET',
        message: `「${wantedKeyword || taskRef}」还没有结果文件`,
        hint: '该任务还没跑过：先用 goofish_task_edit 启动一次，等它跑完第一轮',
      })
    if (!candidates.length || !wantedKeyword) throw none()

    // 上游的命名规则是确定的（空格→下划线 + _full_data.jsonl），精确匹配，不靠猜
    const exact = buildResultFilename(wantedKeyword)
    const hit = candidates.find((entry) => entry.file === exact)
    if (hit) return hit

    // 兜底：关键词里有上游会清洗掉的字符时，退而求其次按"文件名包含关键词"找。
    // 找不到就如实报没有——绝不能退回"随便拿一个文件"，那会把别的任务的结果当成这个任务的。
    const slug = exact.replace('_full_data.jsonl', '').toLowerCase()
    const fuzzy = candidates.filter((entry) => entry.file.toLowerCase().includes(slug))
    if (fuzzy.length) return fuzzy.sort((a, b) => a.file.length - b.file.length)[0]
    throw none()
  }

  /** 诊断：拉 200 行任务日志再分类。 */
  async function diagnose(taskRef) {
    if (!taskRef) throw new GoofishError({ code: 'INTERNAL', message: 'diagnose 需要 task_id', hint: '用 goofish_tasks 找到任务，再传它的 id' })
    await ensureOnline()
    const task = await taskGet(taskRef)
    const data = await upstream.get('/api/logs/tail', { query: { task_id: task.id, limit_lines: 200 }, timeoutMs: 15_000 })
    const text = typeof data?.content === 'string' ? data.content : ''
    const result = classify(text)
    return { task: { id: task.id, name: task.name }, ...result }
  }

  /**
   * 导入/更新账号。**只给面板路由用，不注册成模型工具**（决策 4 的安全边界）。
   * 请求体和响应体都不进日志；这里只校验结构，不读 cookie 的内容。
   * @param {string} name
   * @param {unknown} content
   */
  async function accountUpsert(name, content) {
    await ensureOnline()
    const account = String(name ?? '').trim()
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(account)) {
      throw new GoofishError({ code: 'INTERNAL', message: '账号名只能用字母、数字、下划线和短横线（1–50 个字符）', hint: '换一个账号名再试' })
    }
    /** @type {any} */
    let parsed
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content
    } catch {
      throw new GoofishError({ code: 'INTERNAL', message: '粘贴的内容不是有效的 JSON', hint: '用上游 Chrome 扩展导出的 JSON 原文，不要手改' })
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
      throw new GoofishError({ code: 'INTERNAL', message: '导入的内容里没有 cookies 数组', hint: '用上游 Chrome 扩展导出的 JSON 原文粘贴进来' })
    }
    // 上游的 content 是 **JSON 文本（字符串）**，不是对象；传对象会 422
    const text = typeof content === 'string' ? content : JSON.stringify(parsed)
    // 上游：POST 新建（已存在返回 409），PUT 更新（不存在返回 404）——所以要先看有没有
    const rows = listOf(await upstream.get('/api/accounts', { timeoutMs: 8000 }), 'accounts')
    const exists = rows.some((row) => String(row?.name ?? '') === account)
    if (exists) await upstream.put(`/api/accounts/${encodeURIComponent(account)}`, { body: { content: text } })
    else await upstream.post('/api/accounts', { body: { name: account, content: text } })
    log?.('account.upsert', { state: exists ? 'updated' : 'created' })
    return { name: account, created: !exists }
  }

  /**
   * 账号名 → 上游任务要的 account_state_file（状态文件路径）。
   * 只调列表接口（返回 name 和 path，不含 cookie 内容）。
   * @param {string} name
   */
  async function resolveAccountFile(name) {
    const wanted = String(name ?? '').trim()
    const rows = listOf(await upstream.get('/api/accounts', { timeoutMs: 8000 }), 'accounts')
    const hit = rows.find((row) => String(row?.name ?? '') === wanted)
    if (!hit) {
      const names = rows.map((row) => String(row?.name ?? '')).filter(Boolean)
      throw new GoofishError({
        code: 'ACCOUNT_NOT_FOUND',
        message: names.length ? `没有账号「${wanted}」，现有账号：${names.join('、')}` : `没有账号「${wanted}」，当前一个账号都没有`,
        hint: '先到面板「账号」页导入账号',
      })
    }
    return String(hit.path || `state/${wanted}.json`)
  }

  /**
   * 删除账号。上游的 DELETE 不需要 cookie 内容，安全。
   * @param {string} name
   */
  async function accountRemove(name) {
    await ensureOnline()
    const account = String(name ?? '').trim()
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(account)) {
      throw new GoofishError({ code: 'INTERNAL', message: '账号名不合法', hint: '刷新列表后重试' })
    }
    await upstream.del(`/api/accounts/${encodeURIComponent(account)}`)
    log?.('account.remove', { state: 'ok' })
    return { name: account }
  }

  /** 任务日志尾部（面板展示原始文本）。 */
  async function taskLog(taskRef, lines = 200) {
    await ensureOnline()
    const task = await taskGet(taskRef)
    const data = await upstream.get('/api/logs/tail', {
      query: { task_id: task.id, limit_lines: Math.min(Math.max(Number(lines) || 200, 1), 1000) },
      timeoutMs: 15_000,
    })
    return {
      task: { id: task.id, name: task.name },
      content: typeof data?.content === 'string' ? data.content : '',
      hasMore: data?.has_more === true,
    }
  }

  return {
    status,
    alerts,
    ensureOnline,
    tasks: { list: taskList, get: taskGet, create: taskCreate, update: taskUpdate, start: taskStart, stop: taskStop, remove: taskRemove, log: taskLog },
    results: { list: resultsList, detail: resultDetail, mark: resultMark },
    accounts: { list: accountsList, upsert: accountUpsert, remove: accountRemove },
    runtime,
    digest: {
      get: () => digest.get(),
      set: (options) => digest.set(options),
      clear: () => digest.clear(),
    },
    diagnose,
    meta,
  }
}

/**
 * 上游结果文件列表的归一：既接受字符串数组，也接受对象数组。
 * @param {unknown} data
 */
export function normalizeFiles(data) {
  return listOf(data, 'files')
    .map((row, index) => {
      const file = typeof row === 'string' ? row : String(row?.filename ?? row?.name ?? row?.file ?? '')
      if (!file) return null
      const keyword = typeof row === 'object' && row ? String(row.keyword ?? row.task_name ?? '') : ''
      return { file, keyword, needle: `${file} ${keyword}`.toLowerCase(), index }
    })
    .filter(Boolean)
    .map((entry) => /** @type {{file: string, keyword: string, needle: string, index: number}} */ (entry))
}

/**
 * 结果的筛选与排序。返回**已映射**的条目（core/untrusted），调用方直接分页即可。
 *
 * 先映射再筛选：文件可能有几千条，映射一次比每条筛/排时反复解析中文键便宜得多。
 * @param {any[]} rawItems
 * @param {{sinceHours?: number, recommendedOnly?: boolean, includeHidden?: boolean, sortBy?: string, sortOrder?: 'asc'|'desc'}} params
 */
export function selectResults(rawItems, params = {}) {
  const since = params.sinceHours ? Date.now() - Number(params.sinceHours) * 3600_000 : null

  /** @type {Array<{item: ReturnType<typeof mapResultItem>, raw: any}>} */
  const rows = []
  for (const raw of rawItems) {
    const item = mapResultItem(raw)
    if (!params.includeHidden && item.core.hidden) continue
    if (params.recommendedOnly && !item.core.recommended) continue
    if (since !== null) {
      const at = Date.parse(item.core.crawledAt.replace(' ', 'T'))
      // 时间解析不出来时不筛：宁多给一条，不要悄悄丢结果
      if (Number.isFinite(at) && at < since) continue
    }
    rows.push({ item, raw })
  }

  const by = params.sortBy ?? 'crawl_time'
  const sign = params.sortOrder === 'asc' ? 1 : -1
  const keyOf = (row) => {
    if (by === 'price') return row.item.core.price ?? Number.POSITIVE_INFINITY
    if (by === 'keyword_hit_count') return Number(row.raw?.meta?.keyword_hit_count ?? 0)
    // publish_time 上游没给单独字段时退回爬取时间：至少还是时间序
    return row.item.core.crawledAt
  }
  rows.sort((left, right) => {
    const a = keyOf(left)
    const b = keyOf(right)
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign
    return String(a).localeCompare(String(b)) * sign
  })
  return rows.map((row) => row.item)
}

/**
 * 把工具的参数翻成上游任务接口要的字段。只做白名单，避免把任意键透传过去。
 *
 * 上游模型是 `extra="ignore"`：写错的字段名**不会报错，只会被静默丢弃**。
 * 所以字段名必须与上游 TaskGenerateRequest / TaskUpdate 逐个对上：
 *   工具的 mode    → 上游的 decision_mode（ai | keyword）
 *   工具的 account → 上游的 account_state_file（状态文件路径，由调用方先解析好传进 options.accountFile）
 * @param {any} args
 * @param {{partial?: boolean, accountFile?: string}} [options]
 */
export function buildTaskBody(args, options = {}) {
  /** @type {Record<string, unknown>} */
  const body = {}
  for (const key of ['task_name', 'keyword', 'description', 'region', 'cron']) {
    if (args?.[key] !== undefined && args[key] !== '') body[key] = args[key]
  }
  // 价格上游是字符串（Optional[str]）；工具允许传数字，统一转字符串
  for (const key of ['min_price', 'max_price']) {
    if (args?.[key] !== undefined && args[key] !== '') body[key] = String(args[key])
  }
  // max_pages 上游是 int
  if (args?.max_pages !== undefined && args.max_pages !== '') body.max_pages = Number(args.max_pages)
  if (Array.isArray(args?.keyword_rules)) body.keyword_rules = args.keyword_rules.map((rule) => String(rule))
  if (args?.free_shipping !== undefined) body.free_shipping = Boolean(args.free_shipping)
  if (args?.personal_only !== undefined) body.personal_only = Boolean(args.personal_only)
  if (args?.analyze_images !== undefined) body.analyze_images = Boolean(args.analyze_images)
  if (args?.account_strategy !== undefined) body.account_strategy = String(args.account_strategy)
  if (args?.mode !== undefined) body.decision_mode = String(args.mode)
  if (options.accountFile) body.account_state_file = options.accountFile
  if (!options.partial) {
    // 新建时补齐上游要求但工具里可省的字段（与上游默认值一致）
    body.free_shipping ??= true
    body.personal_only ??= true
    body.max_pages ??= 3
    body.analyze_images ??= true
    body.account_strategy ??= 'auto'
  }
  return body
}

/**
 * 编辑距离最小的 n 个候选（任务名提示用）。用最朴素的 Levenshtein，
 * 任务数量是小几十条，没必要上 BK 树。
 * @param {string[]} names
 * @param {string} wanted
 * @param {number} n
 */
export function nearest(names, wanted, n = 3) {
  const target = String(wanted)
  const distance = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
      }
    }
    return dp[a.length][b.length]
  }
  return names
    .map((name) => ({ name, d: distance(name, target) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((row) => row.name)
}

/**
 * 告警摘要：所有"用户该处理一下"的事。
 * @param {any} status
 */
export function buildAlerts(status) {
  /** @type {Array<{kind: string, level: 'error'|'warn'|'info', text: string}>} */
  const alerts = []
  if (!status.online) {
    alerts.push({ kind: 'runtime', level: 'error', text: `服务未运行：${status.runtime.message || status.runtime.state}` })
  }
  for (const account of status.accounts ?? []) {
    if (account.stale) alerts.push({ kind: 'account', level: 'warn', text: `账号「${account.name}」的登录态可能过期，去「账号」页更新` })
  }
  for (const entry of status.paused ?? []) {
    alerts.push({ kind: 'guard', level: 'warn', text: `任务「${entry.key}」被熔断暂停到 ${entry.pausedUntil}${entry.lastFailureReason ? `：${entry.lastFailureReason}` : ''}` })
  }
  if (!status.aiConfigured) {
    alerts.push({ kind: 'ai', level: 'info', text: 'AI 接口还没配置，只有关键词模式可用（「运行」页填写接口和密钥）' })
  }
  return alerts
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @typedef {ReturnType<typeof createController>} Controller */
