// @ts-check
// 面板用的 HTTP 路由，全部挂在 /goofish 前缀下。
//
// Web 服务不会替插件路由鉴权，所以每个请求都先走一遍 connection.requestRejection（Host/Origin + 登录凭证）。
// 拿不到鉴权服务时一律拒绝——宁可面板打不开，也不要开一个任何人可访问的账号管理接口。
//
// 账号写入只在这里暴露：模型没有对应工具（技术文档 §5.13）。

import { API_KEY_REF } from './runtime/manager.js'
import { asGoofishError } from './errors.js'

const MAX_BODY = 2 * 1024 * 1024

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function json(res, status, body) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * 写操作（非 GET）的同源检查：Origin 与 Host 对不上、或浏览器标明是跨站请求，一律拒绝。
 *
 * 这一步必须对**所有**写请求做，不能只在"有请求体"时做：面板里启动/停止服务、删除任务这些
 * 都是没有请求体的 POST/DELETE，它们没有 content-type 预检保护，更需要同源检查。
 * @param {import('node:http').IncomingMessage} req
 */
function assertSameOrigin(req) {
  const origin = req.headers.origin
  if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) {
    throw Object.assign(new Error('拒绝跨源请求'), { status: 403 })
  }
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') {
    throw Object.assign(new Error('拒绝跨站请求'), { status: 403 })
  }
}

/**
 * 读 JSON 请求体。限 2 MB。
 *
 * 没有请求体就返回 {}，不要求 content-type：面板的 call() 在没有 body 时不会发
 * content-type，先查类型再读 body 会让所有无体的写操作都 415。有请求体时才要求 application/json。
 * @param {import('node:http').IncomingMessage} req
 */
async function readJson(req) {
  assertSameOrigin(req)
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('请求体超过 2 MB'), { status: 413 })
    chunks.push(chunk)
  }
  if (!size) return {}
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') throw Object.assign(new Error('请求必须是 application/json'), { status: 415 })
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

/** 把 URL 查询参数收成普通对象，空值丢掉。 */
function query(url) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of url.searchParams) if (value !== '') out[key] = value
  return out
}

/**
 * 构造 /goofish 的请求处理器。
 * @param {object} options
 * @param {any} options.ctx
 * @param {import('./config.js').GoofishConfig} options.cfg
 * @param {import('./controller.js').Controller} options.controller
 * @param {(event: string, fields?: Record<string, unknown>) => void} [options.log]
 */
export function createHttpHandler({ ctx, cfg, controller, log }) {
  /** 可选服务，缺了就返回 501 而不是崩。 */
  const credentials = () => ctx.get('credentials')
  const configEditor = () => ctx.get('configEditor')

  /**
   * 面板「设置」的读。密钥只回 configured，不回值。
   */
  async function settingsGet() {
    const credentialsService = credentials()
    let configured = false
    if (credentialsService && typeof credentialsService.describe === 'function') {
      try {
        const info = await credentialsService.describe(API_KEY_REF)
        configured = Boolean(info?.configured)
      } catch {
        configured = false
      }
    }
    return {
      projectDir: cfg.projectDir,
      pythonPath: cfg.pythonPath,
      gitPath: cfg.gitPath,
      port: cfg.port,
      autoStartOnLaunch: cfg.autoStartOnLaunch,
      pipIndexUrl: cfg.pipIndexUrl,
      ai: cfg.ai,
      timeZone: cfg.timeZone,
      staleDays: cfg.staleDays,
      defaultLimit: cfg.defaultLimit,
      requestTimeoutMs: cfg.requestTimeoutMs,
      generateTimeoutMs: cfg.generateTimeoutMs,
      digest: { windowHours: cfg.digestWindowHours },
      secretConfigured: configured,
      configEditable: Boolean(configEditor()),
    }
  }

  /** 只允许改这些字段：其余（例如 projectDir）改了会让服务换个地方跑，必须走配置文件。 */
  const EDITABLE = new Set(['pythonPath', 'gitPath', 'port', 'autoStartOnLaunch', 'pipIndexUrl', 'ai', 'timeZone', 'staleDays', 'defaultLimit', 'requestTimeoutMs', 'generateTimeoutMs', 'digest'])

  /**
   * 保存设置：走 configEditor，让改动落进用户自己的 cordis.patch.yml。
   * 失败要把原因原样告诉用户，不假装保存成功。
   * @param {any} body
   */
  async function settingsSave(body) {
    const editor = configEditor()
    if (!editor || typeof editor.edit !== 'function') {
      const error = asGoofishError(new Error('当前 profile 没有 configEditor 服务'), 'INTERNAL')
      error.hint = '直接编辑 profile 的 cordis.patch.yml 里 id: goofish 的 config'
      throw error
    }
    /** @type {Record<string, unknown>} */
    const patch = {}
    for (const key of Object.keys(body ?? {})) {
      if (!EDITABLE.has(key)) continue
      patch[key] = body[key]
    }
    if (!Object.keys(patch).length) throw Object.assign(new Error('没有可保存的字段'), { status: 400 })
    await editor.edit(ctx.fiber.entry, (current) => ({ ...current, ...patch }))
    log?.('settings.save', { state: 'ok' })
    return settingsGet()
  }

  /** 保存/清除密钥。值只进凭据存储，不回显、不写日志。 */
  async function secretSave(body) {
    const service = credentials()
    if (!service || typeof service.set !== 'function') {
      throw Object.assign(new Error('当前 profile 没有 credentials 服务'), { status: 501 })
    }
    const value = typeof body?.value === 'string' ? body.value.trim() : ''
    if (!value) throw Object.assign(new Error('缺少 value'), { status: 400 })
    await service.set(API_KEY_REF, value)
    log?.('settings.secret', { state: 'set' })
    return { configured: true }
  }

  async function secretClear() {
    const service = credentials()
    if (!service || typeof service.unset !== 'function') {
      throw Object.assign(new Error('当前 profile 没有 credentials 服务'), { status: 501 })
    }
    await service.unset(API_KEY_REF)
    log?.('settings.secret', { state: 'unset' })
    return { configured: false }
  }

  /**
   * 处理一个请求。
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const connection = ctx.get('connection')
    const rejection = typeof connection?.requestRejection === 'function'
      ? connection.requestRejection({ headers: req.headers })
      : 403
    if (rejection) {
      json(res, rejection, { ok: false, code: 'UNAUTHORIZED', message: '未授权的请求', hint: '在 DSH 的 Web 界面里打开面板' })
      return
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.replace(/^\/goofish\/?/, '').replace(/\/$/, '') || 'api/status'
    const method = (req.method ?? 'GET').toUpperCase()

    // 只读分支：先把 GET 全部处理完，避免下面的写分支被无关方法干扰
    if (method === 'GET') {
      if (path === 'api/status') return json(res, 200, { ok: true, data: await controller.status() })
      if (path === 'api/alerts') return json(res, 200, { ok: true, data: await controller.alerts() })
      if (path === 'api/runtime/log') {
        const from = Number(query(url).from) || 0
        return json(res, 200, { ok: true, data: controller.runtime.logTail(from) })
      }
      if (path === 'api/runtime/install-progress') {
        return json(res, 200, { ok: true, data: controller.runtime.installer.progress() })
      }
      if (path === 'api/tasks') return json(res, 200, { ok: true, data: await controller.tasks.list({ keyword: query(url).keyword, limit: Number(query(url).limit) || undefined }) })
      if (/^api\/tasks\/[^/]+\/log$/.test(path)) {
        const id = decodeURIComponent(path.split('/')[2] ?? '')
        const lines = Math.min(Number(query(url).lines) || 200, 1000)
        return json(res, 200, { ok: true, data: await controller.tasks.log(id, lines) })
      }
      if (/^api\/tasks\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split('/')[1] ?? '')
        return json(res, 200, { ok: true, data: await controller.tasks.get(id) })
      }
      if (path === 'api/results') {
        const params = query(url)
        return json(res, 200, {
          ok: true,
          data: await controller.results.list({
            task: params.task,
            keyword: params.keyword,
            sinceHours: Number(params.since_hours) || undefined,
            limit: Number(params.limit) || undefined,
            page: Number(params.page) || undefined,
            recommendedOnly: params.recommended_only === '1' || params.recommended_only === 'true',
            includeHidden: params.include_hidden === '1' || params.include_hidden === 'true',
            sortBy: params.sort_by,
            sortOrder: params.sort_order === 'asc' ? 'asc' : params.sort_order === 'desc' ? 'desc' : undefined,
          }),
        })
      }
      if (/^api\/results\/[^/]+$/.test(path)) {
        const item = decodeURIComponent(path.split('/')[2] ?? '')
        const params = query(url)
        return json(res, 200, { ok: true, data: await controller.results.detail(item, { task: params.task, keyword: params.keyword, includeHidden: params.include_hidden === '1' }) })
      }
      if (path === 'api/accounts') return json(res, 200, { ok: true, data: await controller.accounts.list() })
      if (path === 'api/digest') return json(res, 200, { ok: true, data: await controller.digest.get() })
      if (path === 'api/settings') return json(res, 200, { ok: true, data: await settingsGet() })
      throw Object.assign(new Error('接口不存在'), { status: 404 })
    }

    const body = method === 'GET' || method === 'HEAD' ? {} : await readJson(req)

    if (method === 'POST' && /^api\/runtime\/(install|start|stop|restart)$/.test(path)) {
      const action = path.split('/')[2]
      if (action === 'install') return json(res, 200, { ok: true, data: await controller.runtime.install() })
      if (action === 'start') return json(res, 200, { ok: true, data: await controller.runtime.start() })
      if (action === 'stop') return json(res, 200, { ok: true, data: await controller.runtime.stop('panel') })
      return json(res, 200, { ok: true, data: await controller.runtime.restart() })
    }
    if (method === 'POST' && path === 'api/tasks') {
      return json(res, 200, { ok: true, data: await controller.tasks.create(body) })
    }
    if (method === 'POST' && /^api\/tasks\/[^/]+\/(start|stop)$/.test(path)) {
      const [, , id, action] = path.split('/')
      const ref = decodeURIComponent(id ?? '')
      return json(res, 200, { ok: true, data: action === 'start' ? await controller.tasks.start(ref) : await controller.tasks.stop(ref) })
    }
    if (method === 'PATCH' && /^api\/tasks\/[^/]+$/.test(path)) {
      const ref = decodeURIComponent(path.split('/')[2] ?? '')
      return json(res, 200, { ok: true, data: await controller.tasks.update(ref, body) })
    }
    if (method === 'DELETE' && /^api\/tasks\/[^/]+$/.test(path)) {
      const ref = decodeURIComponent(path.split('/')[2] ?? '')
      return json(res, 200, { ok: true, data: await controller.tasks.remove(ref) })
    }
    if (method === 'POST' && /^api\/results\/[^/]+\/status$/.test(path)) {
      const item = decodeURIComponent(path.split('/')[2] ?? '')
      const params = query(url)
      const status = String(body?.status ?? '')
      // 上游枚举是 active / hidden / expired（"visible"会被 422 拒绝）
      if (!['active', 'hidden', 'expired'].includes(status)) throw Object.assign(new Error('status 只能是 active / hidden / expired'), { status: 400 })
      return json(res, 200, { ok: true, data: await controller.results.mark(item, status, { task: params.task, keyword: params.keyword }) })
    }
    if (method === 'POST' && path === 'api/accounts') {
      return json(res, 200, { ok: true, data: await controller.accounts.upsert(body?.name, body?.content) })
    }
    if (method === 'PUT' && /^api\/accounts\/[^/]+$/.test(path)) {
      const name = decodeURIComponent(path.split('/')[2] ?? '')
      return json(res, 200, { ok: true, data: await controller.accounts.upsert(name, body?.content) })
    }
    if (method === 'DELETE' && /^api\/accounts\/[^/]+$/.test(path)) {
      const name = decodeURIComponent(path.split('/')[2] ?? '')
      return json(res, 200, { ok: true, data: await controller.accounts.remove(name) })
    }
    if (method === 'PUT' && path === 'api/digest') {
      return json(res, 200, { ok: true, data: await controller.digest.set({ times: body?.times, windowHours: body?.windowHours }) })
    }
    if (method === 'DELETE' && path === 'api/digest') {
      return json(res, 200, { ok: true, data: await controller.digest.clear() })
    }
    if (method === 'PUT' && path === 'api/settings') {
      return json(res, 200, { ok: true, data: await settingsSave(body) })
    }
    if (method === 'PUT' && path === 'api/settings/secret') {
      return json(res, 200, { ok: true, data: await secretSave(body) })
    }
    if (method === 'DELETE' && path === 'api/settings/secret') {
      return json(res, 200, { ok: true, data: await secretClear() })
    }
    throw Object.assign(new Error('接口不存在'), { status: 404 })
  }

  return async (req, res) => {
    try {
      await handle(req, res)
    } catch (error) {
      const wrapped = asGoofishError(error, 'INTERNAL')
      const status = /** @type {any} */ (error)?.status ?? 500
      log?.('http.error', { route: (req.url ?? '').slice(0, 80), status })
      json(res, status, wrapped.toResult())
    }
  }
}
