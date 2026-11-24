// @ts-check
// 回归测试：每一条都对应一个已经在代码审查里确认过的真实 BUG。
// 改动这些行为之前先读一下注释——测试名字后面写着它当时是怎么坏的。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createConfig } from '../src/config.js'
import { buildTaskBody, createController } from '../src/controller.js'
import { createDigest } from '../src/digest.js'
import { createHttpHandler } from '../src/http.js'
import { createRuntime } from '../src/runtime/manager.js'
import { createMeta } from '../src/runtime/meta.js'
import { isOwnProcess } from '../src/runtime/procs.js'
import { runToEnd } from '../src/runtime/run.js'
import { createTools } from '../src/tools.js'
import { buildResultFilename, jobOf, jobTaskOf } from '../src/upstream/contract.js'
import { accountNameOf, mapTask } from '../src/upstream/mapping.js'
import { createUpstreamClient } from '../src/upstream/client.js'

/* ------------------------------------------------------------------ 公共假件 */

/**
 * 假上游：按 (method, path) 回调返回值，同时记录每次调用。
 * @param {(method: string, path: string, options: any) => any} route
 */
function fakeUpstream(route) {
  /** @type {Array<{method: string, path: string, options: any}>} */
  const calls = []
  const make = (method) => async (path, options = {}) => {
    calls.push({ method, path, options })
    return route(method, path, options)
  }
  return { calls, get: make('GET'), post: make('POST'), patch: make('PATCH'), put: make('PUT'), del: make('DELETE') }
}

/**
 * 造一个控制器：运行时永远在线，其余依赖给最小桩。
 * @param {ReturnType<typeof fakeUpstream>} upstream
 */
function makeController(upstream) {
  const cfg = createConfig({ projectDir: 'F:\\tmp-goofish' })
  const runtime = { status: async () => ({ state: 'online', port: 8765, message: '', hint: '', installed: true, aiConfigured: true }) }
  const files = { readGuard: async () => [], pausedTasks: () => [], guardFor: () => null, accountFileTimes: async () => ({}), accountFileNames: async () => [] }
  const digest = { get: async () => null }
  const meta = { read: async () => ({}) }
  return createController({ cfg, upstream: /** @type {any} */ (upstream), runtime: /** @type {any} */ (runtime), files: /** @type {any} */ (files), digest: /** @type {any} */ (digest), meta: /** @type {any} */ (meta), pollMs: 5 })
}

/** 上游任务的最小形状（字段名与 src/domain/models/task.py 一致）。 */
const task = (over = {}) => ({ id: 7, task_name: 't', keyword: 'k', enabled: true, is_running: false, decision_mode: 'ai', ...over })

/** 结果文件里的时间格式："2026-11-20 10:00:00"（本地时间）。 */
function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 结果项。 */
const resultItem = (id, crawled) => ({
  '商品信息': { '商品ID': id, '当前售价': '¥100', '商品链接': `https://www.goofish.com/item?id=${id}` },
  爬取时间: stamp(crawled),
  ai_analysis: { is_recommended: false },
  price_insight: { current_price: 100 },
})

/* ------------------------------------------------------------------ 配置 */

test('BUG: autoStartOnLaunch=false 被无视（false 落进了 `: true` 分支）', () => {
  assert.equal(createConfig({ autoStartOnLaunch: false }).autoStartOnLaunch, false)
  assert.equal(createConfig({ autoStartOnLaunch: { get: () => false } }).autoStartOnLaunch, false)
  assert.equal(createConfig({ autoStartOnLaunch: true }).autoStartOnLaunch, true)
  // 没写时默认开
  assert.equal(createConfig({}).autoStartOnLaunch, true)
})

/* ------------------------------------------------------------------ 运行时 */

test('BUG: restart() 在锁里又去排队 start()/stop()，永远等自己 → 死锁', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-rt-'))
  try {
    const cfg = createConfig({ projectDir: dir })
    const runtime = createRuntime({
      ctx: { get: () => undefined, subprocess: {} },
      cfg,
      meta: createMeta(dir),
      upstream: createUpstreamClient({ port: () => 8765, timeoutMs: () => 300 }),
      configValidation: { ok: true, errors: [] },
    })
    const outcome = await Promise.race([
      runtime.restart().then(() => 'resolved', (error) => error.code),
      new Promise((resolve) => setTimeout(() => resolve('DEADLOCK'), 1500)),
    ])
    // 目录里没有 .venv：应该很快以 NOT_INSTALLED 失败，而不是挂住
    assert.equal(outcome, 'NOT_INSTALLED')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BUG: 没装 Python 时 install() 抛的是底层 spawn 错误；应给出"找不到 Python"的提示，且不死锁', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-rt-'))
  try {
    const runtime = createRuntime({
      // spawn 直接抛，模拟找不到可执行文件
      ctx: { get: () => undefined, subprocess: { spawn: () => { throw new Error('spawn python ENOENT') } } },
      cfg: createConfig({ projectDir: dir }),
      meta: createMeta(dir),
      upstream: createUpstreamClient({ port: () => 8765, timeoutMs: () => 300 }),
      configValidation: { ok: true, errors: [] },
    })
    const outcome = await Promise.race([
      runtime.install().then(() => ({ code: 'resolved', message: '' }), (error) => ({ code: error.code, message: error.message })),
      new Promise((resolve) => setTimeout(() => resolve({ code: 'DEADLOCK', message: '' }), 1500)),
    ])
    assert.equal(outcome.code, 'INSTALL_FAILED')
    assert.match(outcome.message, /Python/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BUG: runToEnd 在 spawn 失败时抛异常，调用方拿不到 ok:false', async () => {
  const result = await runToEnd({ subprocess: { spawn: () => { throw new Error('boom') } } }, { argv: ['C:\\x.exe'], cwd: 'C:\\' })
  assert.equal(result.ok, false)
  assert.match(result.stderr, /boom/)
})

test('BUG: 端口监听者是 venv 启动器拉起的基础解释器时被误判成"别人的进程"', () => {
  const dir = 'D:\\goofish\\ai-goofish-monitor'
  // 真正监听端口的是 C:\Python311\python.exe，它的父进程才是 .venv 里的启动器
  const owner = {
    executablePath: 'C:\\Python311\\python.exe',
    parentExecutablePath: `${dir}\\.venv\\Scripts\\python.exe`,
  }
  assert.equal(isOwnProcess(owner, dir), true)
  assert.equal(isOwnProcess({ executablePath: 'C:\\Python311\\python.exe', parentExecutablePath: 'C:\\Windows\\explorer.exe' }, dir), false)
  assert.equal(isOwnProcess(null, dir), false)
})

/* ------------------------------------------------------------------ HTTP */

/**
 * 发一个假请求给处理器。
 * @param {Function} handler
 * @param {string} method
 * @param {string} url
 * @param {{headers?: Record<string, string>, body?: string}} [options]
 */
async function hit(handler, method, url, options = {}) {
  const chunks = options.body === undefined ? [] : [Buffer.from(options.body)]
  const req = Object.assign(Readable.from(chunks), { method, url, headers: { host: '127.0.0.1:52884', ...options.headers } })
  let status = 0
  let body = ''
  const res = { headersSent: false, setHeader() {}, set statusCode(value) { status = value }, end(text) { body = text ?? '' } }
  await handler(req, res)
  return { status, body }
}

function makeHttp() {
  /** @type {string[]} */
  const calls = []
  const controller = {
    tasks: {
      remove: async (id) => (calls.push(`task.remove ${id}`), { removed: { name: id } }),
      start: async (id) => (calls.push(`task.start ${id}`), {}),
    },
    runtime: { start: async () => (calls.push('runtime.start'), {}) },
    digest: { clear: async () => (calls.push('digest.clear'), { removed: true }), set: async (o) => (calls.push(`digest.set ${JSON.stringify(o)}`), {}) },
    accounts: { remove: async (name) => (calls.push(`account.remove ${name}`), { name }) },
    results: { mark: async (item, status) => (calls.push(`mark ${item} ${status}`), {}) },
  }
  const ctx = { get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined), fiber: {} }
  return { calls, handler: createHttpHandler({ ctx, cfg: createConfig({}), controller: /** @type {any} */ (controller) }) }
}

test('BUG: 面板所有不带请求体的写操作都被 415 拒绝（先查 content-type 再读 body）', async () => {
  const { calls, handler } = makeHttp()
  // 面板的 call() 没有 body 时不会发 content-type
  for (const [method, url] of /** @type {const} */ ([
    ['DELETE', '/goofish/api/tasks/t1'],
    ['POST', '/goofish/api/runtime/start'],
    ['POST', '/goofish/api/tasks/t1/start'],
    ['DELETE', '/goofish/api/digest'],
    ['DELETE', '/goofish/api/' + 'accounts/alice'],
  ])) {
    const { status } = await hit(handler, method, url)
    assert.equal(status, 200, `${method} ${url}`)
  }
  assert.deepEqual(calls, ['task.remove t1', 'runtime.start', 'task.start t1', 'digest.clear', 'account.remove alice'])
})

test('写操作的同源检查：跨源、跨站一律 403，且对无请求体的请求同样生效', async () => {
  const { calls, handler } = makeHttp()
  assert.equal((await hit(handler, 'POST', '/goofish/api/runtime/start', { headers: { origin: 'https://evil.example' } })).status, 403)
  assert.equal((await hit(handler, 'DELETE', '/goofish/api/tasks/t1', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.deepEqual(calls, [], '被拒绝的请求不应该碰到控制器')
  // 同源的正常请求
  assert.equal((await hit(handler, 'POST', '/goofish/api/runtime/start', { headers: { origin: 'http://127.0.0.1:52884', 'sec-fetch-site': 'same-origin' } })).status, 200)
})

test('有请求体时仍要求 application/json，且 JSON 必须合法', async () => {
  const { handler } = makeHttp()
  assert.equal((await hit(handler, 'PUT', '/goofish/api/digest', { body: '{"windowHours":6}', headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await hit(handler, 'PUT', '/goofish/api/digest', { body: '{oops', headers: { 'content-type': 'application/json' } })).status, 400)
  assert.equal((await hit(handler, 'PUT', '/goofish/api/digest', { body: '{"windowHours":6}', headers: { 'content-type': 'application/json' } })).status, 200)
})

test('BUG: 标记结果状态用了上游不认的 "visible"（枚举是 active/hidden/expired）', async () => {
  const { calls, handler } = makeHttp()
  const json = { 'content-type': 'application/json' }
  assert.equal((await hit(handler, 'POST', '/goofish/api/results/i1/status?task=t', { body: '{"status":"visible"}', headers: json })).status, 400)
  assert.equal((await hit(handler, 'POST', '/goofish/api/results/i1/status?task=t', { body: '{"status":"active"}', headers: json })).status, 200)
  assert.deepEqual(calls, ['mark i1 active'])
})

/* ------------------------------------------------------------------ 工具 */

test('BUG: 价格参数说明写"数字或字符串"，却把数字当类型错误拒绝', async () => {
  /** @type {any} */
  let seen = null
  const controller = {
    tasks: {
      create: async (args) => {
        seen = args
        return { task: { id: '1', name: 'n', keyword: 'k', mode: 'keyword', priceRange: '', cron: '', account: '', running: false, enabled: true } }
      },
    },
  }
  const create = createTools(/** @type {any} */ (controller), createConfig({})).find((tool) => tool.name === 'goofish_task_create')
  const base = { task_name: 'n', keyword: 'k', mode: 'keyword', keyword_rules: ['x'] }
  await create.execute({ ...base, min_price: 100, max_price: 6000 })
  assert.equal(seen.min_price, 100)
  // 其他字符串参数仍然严格
  await assert.rejects(() => create.execute({ ...base, region: 12 }), /region 应该是字符串/)
})

/* ------------------------------------------------------------------ 上游契约：任务 */

test('BUG: 工具的 mode / account 被发给上游，而上游只认 decision_mode / account_state_file（extra=ignore → 静默丢弃）', () => {
  const body = buildTaskBody({ task_name: 't', keyword: 'k', mode: 'keyword', keyword_rules: ['a'], account: 'alice' }, { accountFile: 'state\\alice.json' })
  assert.equal(body.decision_mode, 'keyword')
  assert.equal(body.account_state_file, 'state\\alice.json')
  assert.equal('mode' in body, false)
  assert.equal('account' in body, false)
})

test('mapTask 按上游字段读 decision_mode / account_state_file，账号对外是名字', () => {
  const mapped = mapTask(task({ decision_mode: 'keyword', account_state_file: 'state\\alice.json', account_strategy: 'fixed', description: 'x'.repeat(500) }))
  assert.equal(mapped.mode, 'keyword')
  assert.equal(mapped.account, 'alice')
  assert.equal(mapped.accountFile, 'state\\alice.json')
  assert.equal(mapped.accountStrategy, 'fixed')
  // 列表/工具里描述被截断，编辑表单用完整的
  assert.ok(mapped.description.length < 500)
  assert.equal(mapped.descriptionFull.length, 500)
  // 没有 decision_mode 时默认 ai，而不是因为"有 keyword"就猜成 keyword 模式
  assert.equal(mapTask({ id: 1, task_name: 'a', keyword: 'k' }).mode, 'ai')
  assert.equal(accountNameOf('state/bob.json'), 'bob')
  assert.equal(accountNameOf(''), '')
})

test('BUG: 轮询建任务读的是顶层 status，实际在 job 里 → 永远读不到完成态，一直等到超时', async () => {
  let polls = 0
  const upstream = fakeUpstream((method, path) => {
    if (method === 'POST' && path === '/api/tasks/generate') return { message: 'started', job: { job_id: 'j1', status: 'queued' } }
    if (method === 'GET' && path === '/api/tasks/generate-jobs/j1') {
      polls += 1
      return polls < 2 ? { job: { job_id: 'j1', status: 'running' } } : { job: { job_id: 'j1', status: 'completed', task: task({ id: 7, task_name: 'new' }) } }
    }
    throw new Error(`未预期的调用 ${method} ${path}`)
  })
  const result = await makeController(upstream).tasks.create({ task_name: 'new', keyword: 'k', mode: 'ai', description: 'd' })
  assert.equal(result.task?.id, '7')
  assert.equal(polls, 2)
  const posted = upstream.calls.find((call) => call.method === 'POST')
  assert.equal(posted?.options.body.decision_mode, 'ai')
})

test('失败的生成作业用 job.error 报错', async () => {
  const upstream = fakeUpstream((method, path) => {
    if (method === 'POST') return { job: { job_id: 'j1', status: 'queued' } }
    return { job: { job_id: 'j1', status: 'failed', error: 'AI quota exceeded' } }
  })
  await assert.rejects(() => makeController(upstream).tasks.create({ task_name: 'n', keyword: 'k', mode: 'ai', description: 'd' }), /AI quota exceeded/)
})

test('关键词模式上游同步返回 {task}，不应该去轮询', async () => {
  const upstream = fakeUpstream((method, path) => {
    if (method === 'POST' && path === '/api/tasks/generate') return { message: 'ok', task: task({ decision_mode: 'keyword' }) }
    throw new Error(`不应该调用 ${method} ${path}`)
  })
  const result = await makeController(upstream).tasks.create({ task_name: 't', keyword: 'k', mode: 'keyword', keyword_rules: ['a'] })
  assert.equal(result.task?.mode, 'keyword')
  assert.equal(upstream.calls.length, 1)
})

test('建任务指定账号：账号名翻成上游要的状态文件路径；账号不存在时列出现有账号', async () => {
  const upstream = fakeUpstream((method, path) => {
    if (method === 'GET' && path === '/api/accounts') return [{ name: 'alice', path: 'state\\alice.json' }]
    if (method === 'POST' && path === '/api/tasks/generate') return { task: task({ account_state_file: 'state\\alice.json' }) }
    throw new Error(`未预期的调用 ${method} ${path}`)
  })
  const controller = makeController(upstream)
  const ok = await controller.tasks.create({ task_name: 't', keyword: 'k', mode: 'keyword', keyword_rules: ['a'], account_strategy: 'fixed', account: 'alice' })
  assert.equal(ok.task?.account, 'alice')
  const posted = upstream.calls.find((call) => call.method === 'POST')
  assert.equal(posted?.options.body.account_state_file, 'state\\alice.json')
  await assert.rejects(
    () => controller.tasks.create({ task_name: 't', keyword: 'k', mode: 'keyword', keyword_rules: ['a'], account: 'nobody' }),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, 'ACCOUNT_NOT_FOUND')
      assert.match(/** @type {any} */ (error).message, /alice/)
      return true
    },
  )
})

test('BUG: PATCH 返回 {message, task}，却把整个包装对象当任务映射 → 改后显示成空任务', async () => {
  const upstream = fakeUpstream((method, path) => {
    if (method === 'GET' && path === '/api/tasks') return [task()]
    if (method === 'PATCH' && path === '/api/tasks/7') return { message: '任务更新成功', task: task({ keyword: 'new-keyword' }) }
    throw new Error(`未预期的调用 ${method} ${path}`)
  })
  const { before, after } = await makeController(upstream).tasks.update('t', { keyword: 'new-keyword' })
  assert.equal(before.keyword, 'k')
  assert.equal(after.keyword, 'new-keyword')
  assert.equal(after.id, '7')
  // 改描述时上游会在这次 PATCH 里同步调 AI，超时要放宽，不能用默认的 15 秒
  const patch = upstream.calls.find((call) => call.method === 'PATCH')
  assert.ok(patch?.options.timeoutMs >= 30_000)
})

/* ------------------------------------------------------------------ 上游契约：结果 */

test('结果文件名规则与上游 build_result_filename 一致', () => {
  assert.equal(buildResultFilename('rtx 4090'), 'rtx_4090_full_data.jsonl')
  assert.equal(buildResultFilename('switch'), 'switch_full_data.jsonl')
  assert.equal(buildResultFilename(''), '_full_data.jsonl')
})

test('jobOf / jobTaskOf 认 {job:{...}} 这一层', () => {
  assert.equal(jobOf({ job: { status: 'completed' } }).status, 'completed')
  assert.deepEqual(jobTaskOf({ job: { task: { id: 1 } } }), { id: 1 })
})

/**
 * 结果相关接口的假上游：一个任务（关键词 "rtx 4090"）+ 它的结果文件。
 * @param {(page: number, query: any) => any} resultsPage 返回 GET /api/results/{file} 的响应
 */
function resultsUpstream(resultsPage, files = ['rtx_4090_full_data.jsonl', 'other_full_data.jsonl']) {
  return fakeUpstream((method, path, options) => {
    if (path === '/api/tasks') return [task({ id: 1, task_name: 'gpu', keyword: 'rtx 4090' })]
    if (path === '/api/results/files') return { files }
    if (path.startsWith('/api/results/')) return resultsPage(Number(options.query?.page ?? 1), options.query ?? {})
    throw new Error(`未预期的调用 ${method} ${path}`)
  })
}

test('BUG: 结果接口服务端分页（默认 20 条），只取一页就在本地筛选 → total 和 recommended_only 都是错的', async () => {
  const now = new Date()
  const upstream = resultsUpstream((page) => ({ total_items: 250, page, limit: 10, items: Array.from({ length: 10 }, (_, i) => resultItem(`p${page}-${i}`, now)) }))
  const result = await makeController(upstream).results.list({ task: 'gpu', page: 2, limit: 10, recommendedOnly: true, sortBy: 'price', sortOrder: 'asc' })
  // 总数来自上游的 total_items，而不是"这一页里筛出来的条数"
  assert.equal(result.total, 250)
  assert.equal(result.hasMore, true)
  assert.equal(result.items.length, 10)
  // 筛选、排序、分页参数交给上游
  const call = upstream.calls.find((c) => c.path.startsWith('/api/results/rtx'))
  assert.equal(call?.path, '/api/results/rtx_4090_full_data.jsonl')
  assert.equal(call?.options.query.page, 2)
  assert.equal(call?.options.query.limit, 10)
  assert.equal(call?.options.query.recommended_only, 'true')
  assert.equal(call?.options.query.sort_by, 'price')
  assert.equal(call?.options.query.sort_order, 'asc')
})

test('BUG: since_hours 只在第一页（20 条）里筛 → 按爬取时间倒序往下翻，翻到窗口外就停', async () => {
  const now = Date.now()
  const recent = new Date(now - 3600_000)
  const old = new Date(now - 48 * 3600_000)
  /** @type {number[]} */
  const pagesRequested = []
  const upstream = resultsUpstream((page) => {
    pagesRequested.push(page)
    if (page === 1) return { total_items: 300, items: Array.from({ length: 100 }, (_, i) => resultItem(`a${i}`, recent)) }
    if (page === 2) return { total_items: 300, items: [...Array.from({ length: 50 }, (_, i) => resultItem(`b${i}`, recent)), ...Array.from({ length: 50 }, (_, i) => resultItem(`c${i}`, old))] }
    throw new Error('已经翻到窗口外了，不该再请求下一页')
  })
  const result = await makeController(upstream).results.list({ task: 'gpu', sinceHours: 24, limit: 50 })
  assert.deepEqual(pagesRequested, [1, 2])
  assert.equal(result.total, 150)
  assert.equal(result.items.length, 50)
  assert.equal(result.hasMore, true)
  // 窗口内的时间序请求用 crawl_time 倒序，才有"遇到旧的就停"的前提
  const first = upstream.calls.find((c) => c.path.startsWith('/api/results/rtx'))
  assert.equal(first?.options.query.sort_by, 'crawl_time')
  assert.equal(first?.options.query.sort_order, 'desc')
})

test('BUG: 详情只在第一页里找，第二页以后的商品永远 "没有找到"', async () => {
  const now = new Date()
  const upstream = resultsUpstream((page) => {
    if (page === 1) return { total_items: 150, items: Array.from({ length: 100 }, (_, i) => resultItem(`a${i}`, now)) }
    return { total_items: 150, items: [...Array.from({ length: 49 }, (_, i) => resultItem(`b${i}`, now)), resultItem('target', now)] }
  })
  const controller = makeController(upstream)
  const found = await controller.results.detail('target', { task: 'gpu' })
  assert.equal(found.item.core.itemId, 'target')
  await assert.rejects(() => controller.results.detail('does-not-exist', { task: 'gpu' }), (error) => /** @type {any} */ (error).code === 'NO_RESULTS_YET')
})

test('BUG: 任务还没有结果文件时，退回"随便拿一个文件" → 把别的任务的结果当成它的', async () => {
  // 只有 other_full_data.jsonl，没有 rtx_4090_full_data.jsonl
  const upstream = resultsUpstream(() => ({ total_items: 1, items: [resultItem('x', new Date())] }), ['other_full_data.jsonl'])
  await assert.rejects(
    () => makeController(upstream).results.list({ task: 'gpu' }),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, 'NO_RESULTS_YET')
      return true
    },
  )
  // 没有发出读取结果内容的请求
  assert.equal(upstream.calls.some((c) => c.path.startsWith('/api/results/other')), false)
})

/* ------------------------------------------------------------------ 上游契约：账号 */

test('BUG: 账号 content 要的是 JSON 文本（字符串），传对象会 422；且 POST 对已存在账号是 409，应改用 PUT', async () => {
  const upstream = fakeUpstream((method, path) => {
    if (method === 'GET' && path === '/api/accounts') return [{ name: 'alice', path: 'state\\alice.json' }]
    return { message: 'ok' }
  })
  const controller = makeController(upstream)
  const cookies = JSON.stringify({ cookies: [{ name: 'a', value: 'b' }] })

  const updated = await controller.accounts.upsert('alice', cookies)
  assert.equal(updated.created, false)
  const put = upstream.calls.find((c) => c.method === 'PUT')
  assert.equal(put?.path, '/api/accounts/alice')
  assert.equal(typeof put?.options.body.content, 'string')
  assert.equal(put?.options.body.content, cookies)

  // 传对象进来也要转成文本；新账号走 POST
  const created = await controller.accounts.upsert('bob', { cookies: [{ name: 'a', value: 'b' }] })
  assert.equal(created.created, true)
  const post = upstream.calls.find((c) => c.method === 'POST')
  assert.equal(post?.path, '/api/accounts')
  assert.equal(post?.options.body.name, 'bob')
  assert.equal(typeof post?.options.body.content, 'string')

  // 内容不是合法 JSON：明确报错，而不是抛出 SyntaxError
  await assert.rejects(() => controller.accounts.upsert('eve', '{oops'), /不是有效的 JSON/)
})

/* ------------------------------------------------------------------ 汇报 */

/** 可配置的假 schedule。 */
function scriptedSchedule(over = {}) {
  /** @type {any[]} */
  const created = []
  /** @type {any[]} */
  const edits = []
  const service = {
    created,
    edits,
    create: async (request) => {
      created.push(request)
      return { id: `schedule-${created.length}` }
    },
    edit: async (request) => {
      edits.push(request)
      return {}
    },
    view: async ({ id }) => ({ id, updatedAt: 'v1' }),
    ...over,
  }
  return service
}

/** @returns {Promise<{dir: string, meta: any, cfg: any}>} */
async function digestEnv() {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-dg-'))
  return { dir, meta: createMeta(dir), cfg: createConfig({ projectDir: dir }) }
}

test('BUG: 更新汇报失败时被当成"不存在"去新建 → 旧的还在跑、又多一条，每天汇报两次', async () => {
  const { dir, meta, cfg } = await digestEnv()
  try {
    const schedule = scriptedSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({})
    assert.equal(schedule.created.length, 1)

    // 更新时 edit 抛错：必须如实抛出，不能新建
    schedule.edit = async () => {
      throw new Error('boom')
    }
    await assert.rejects(() => digest.set({ windowHours: 6 }), /boom/)
    assert.equal(schedule.created.length, 1, '失败的更新不应该再建一条')

    // 冲突不抛异常，而是返回 { code }
    schedule.edit = async () => ({ code: 'schedule_conflict' })
    await assert.rejects(() => digest.set({ windowHours: 6 }), /schedule_conflict/)
    assert.equal(schedule.created.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('只有确认定时任务已被删掉（view 失败）才重新建', async () => {
  const { dir, meta, cfg } = await digestEnv()
  try {
    const schedule = scriptedSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({})
    schedule.view = async () => {
      throw new Error('not found')
    }
    await digest.set({})
    assert.equal(schedule.created.length, 2)
    assert.equal((await meta.read()).digest.scheduleId, 'schedule-2')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BUG: 再点一次"开启汇报"会把用户在定时任务页里改过的时间重置成 9:30', async () => {
  const { dir, meta, cfg } = await digestEnv()
  try {
    const schedule = scriptedSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({ times: ['08:00'] })
    await digest.set({ windowHours: 12 })
    assert.equal('timing' in schedule.edits[0].patch, false, '没给 times 就不要动 timing')
    assert.ok(schedule.edits[0].patch.prompt.includes('12'))
    // 明确给了才改
    await digest.set({ times: ['07:15'] })
    assert.equal(schedule.edits[1].patch.timing.cron.expression, '15 7 * * *')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BUG: 09:30 + 18:45 写成 BYHOUR×BYMINUTE 会变成 4 个时间点（笛卡尔积）→ 分钟不同时明确拒绝', async () => {
  const { dir, meta, cfg } = await digestEnv()
  try {
    const digest = createDigest({ cfg, meta, schedule: scriptedSchedule() })
    await assert.rejects(() => digest.set({ times: ['09:30', '18:45'] }), /分钟必须相同/)
    // 非法时间不再被悄悄丢掉后落回默认 9:30
    await assert.rejects(() => digest.set({ times: ['25:99'] }), /不合法/)
    await assert.rejects(() => digest.set({ times: ['abc'] }), /不合法/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BUG: 加载时缓存 schedule 服务；它晚一步上线后汇报一直显示"不可用"', async () => {
  const { dir, meta, cfg } = await digestEnv()
  try {
    /** @type {{value: any}} */
    const holder = { value: undefined }
    const digest = createDigest({ cfg, meta, schedule: () => holder.value })
    assert.equal((await digest.get()).available, false)
    holder.value = scriptedSchedule()
    assert.equal((await digest.get()).available, true)
    assert.equal(digest.available, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
