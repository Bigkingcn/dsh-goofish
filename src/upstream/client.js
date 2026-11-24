// @ts-check
// 上游 HTTP 客户端。
//
// 边界只有三条，但都是硬规则：
// 1. 只连 127.0.0.1:<port>。端口来自配置，主机名不接受配置——上游没有鉴权。
// 2. 日志只记 {method, path, status, ms}。上游响应里有 cookie 明文的接口，
//    哪怕我们从不调用它，也不能让"顺手打一行"的习惯把秘密写进日志。
// 3. 错误归一到三类，调用方按 code 分支，不再看原始异常。

import { GoofishError } from '../errors.js'
import { assertShape } from './contract.js'

/**
 * @typedef {object} UpstreamOptions
 * @property {() => number} port 端口（volatile 配置，每次请求现读）
 * @property {() => number} timeoutMs 普通请求超时
 * @property {(event: string, fields?: Record<string, unknown>) => void} [log]
 */

/**
 * @param {UpstreamOptions} options
 */
export function createUpstreamClient({ port, timeoutMs, log }) {
  const base = () => `http://127.0.0.1:${port()}`

  /**
   * 一次请求。307 由 fetch 自己跟随（POST 的 JSON 体会重放）；
   * 我们统一用无尾斜杠路径，所以正常情况下不会触发。
   * @param {'GET'|'POST'|'PATCH'|'PUT'|'DELETE'} method
   * @param {string} path
   * @param {{query?: Record<string, string|number|boolean|undefined|null>, body?: unknown, timeoutMs?: number, allow404?: boolean}} [options]
   * @returns {Promise<any>}
   */
  async function call(method, path, options = {}) {
    const url = new URL(path, base())
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
    const limit = options.timeoutMs ?? timeoutMs()
    const startedAt = Date.now()
    /** @type {Response} */
    let response
    try {
      response = await fetch(url, {
        method,
        headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(limit),
        redirect: 'follow',
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log?.('upstream.unreachable', { endpoint: path, ms: Date.now() - startedAt, code: 'UPSTREAM_UNREACHABLE' })
      throw new GoofishError({
        code: 'UPSTREAM_UNREACHABLE',
        message: `连不上闲鱼监控服务（127.0.0.1:${port()}）：${reason}`,
        hint: '打开侧栏「闲鱼监控」→「运行」看服务状态，没启动就点启动；正在安装的话等它装完',
        cause: error,
      })
    }

    const ms = Date.now() - startedAt
    log?.('upstream.request', { method, endpoint: path, status: response.status, ms })

    if (response.status === 404 && options.allow404) return null

    const text = await response.text()
    /** @type {any} */
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (!response.ok) {
      // FastAPI 的错误在 detail 里；原样带出去，别改写上游的话
      const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : data
      throw new GoofishError({
        code: 'UPSTREAM_HTTP',
        message: `上游返回 ${response.status}：${typeof detail === 'string' ? detail : JSON.stringify(detail ?? '')}`,
        hint: response.status === 401 || response.status === 403
          ? '上游拒绝了请求，确认面板「运行」页的接口地址和密钥'
          : '稍后重试；持续失败请在面板「运行」页看服务日志',
      })
    }
    return data
  }

  return {
    get: (path, options) => call('GET', path, options),
    post: (path, options) => call('POST', path, options),
    patch: (path, options) => call('PATCH', path, options),
    put: (path, options) => call('PUT', path, options),
    del: (path, options) => call('DELETE', path, options),
    base,

    /**
     * 确认端口上的服务确实是本项目。
     *
     * 为什么不能只看 /health：本机 8000 端口上还跑着别的项目，它对 /health 返回 404。
     * 只靠 health 无法区分"是我们的服务但出故障"和"根本不是我们的服务"。
     * @param {{timeoutMs?: number}} [options]
     * @returns {Promise<boolean>}
     */
    async identity(options = {}) {
      const spec = await call('GET', '/openapi.json', { ...options, allow404: true })
      if (!spec || typeof spec !== 'object') return false
      const title = spec.info?.title
      return typeof title === 'string' && title.trim() === '闲鱼智能监控机器人'
    },

    /**
     * 在线 = /health 返回 healthy 且 identity 通过。两者都成功才算 online，
     * 避免把端口上的其他服务误判成我们的服务。
     * @returns {Promise<boolean>}
     */
    async ping() {
      try {
        const health = assertShape('health', await call('GET', '/health', { timeoutMs: Math.min(5000, timeoutMs()) }))
        if (health?.status !== 'healthy') return false
      } catch {
        return false
      }
      try {
        return await this.identity({ timeoutMs: Math.min(5000, timeoutMs()) })
      } catch {
        return false
      }
    },
  }
}

/** @typedef {ReturnType<typeof createUpstreamClient>} UpstreamClient */
