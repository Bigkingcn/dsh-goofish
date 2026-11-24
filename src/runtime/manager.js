// @ts-check
// 运行时状态机：安装 / 启动 / 停止 / 崩溃重启 / 健康监测。
//
// 状态由事件驱动，但只有这里能改 state —— 面板、工具、HTTP 路由读到的永远是同一份快照。
// 所有操作过一把互斥锁：用户连点两次"启动"不应该拉起两个 uvicorn。

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GoofishError } from '../errors.js'
import { BASELINE_COMMIT } from '../upstream/contract.js'
import { applyEnvFile } from './envfile.js'
import { createInstaller, isInstalled } from './installer.js'
import { killProjectProcesses, portOwner, isOwnProcess } from './procs.js'
import { spawnManaged } from './run.js'

/** 凭据引用名。密钥只存在 DSH 凭据里，不进 .env、不进日志、不进工具参数。 */
export const API_KEY_REF = 'GOOFISH_OPENAI_API_KEY'

/** 健康监测间隔与容忍次数。 */
const HEALTH_INTERVAL_MS = 15_000
const HEALTH_FAILURES = 3

/** 启动后等待 /health 的总时长。冷启动要 import 一堆包，30 秒是实测够用的上限。 */
const START_TIMEOUT_MS = 30_000

/** 崩溃自动重启：10 分钟窗口内最多 3 次，间隔 2s / 10s / 30s。 */
const RESTART_WINDOW_MS = 10 * 60_000
const RESTART_DELAYS = [2_000, 10_000, 30_000]

/** 服务日志环形缓冲的行数。 */
const LOG_LINES = 400

/**
 * @typedef {'misconfigured'|'not_installed'|'installing'|'stopped'|'starting'|'online'|'stopping'|'crashed'|'port_conflict'|'contract_drift'} RuntimeState
 * @typedef {object} RuntimeStatus
 * @property {RuntimeState} state
 * @property {number} port
 * @property {number|null} pid
 * @property {string} since
 * @property {string} installedCommit
 * @property {string} message
 * @property {string} hint
 * @property {boolean} installed
 * @property {boolean} aiConfigured
 * @property {boolean} driftRisk
 * @property {{step: number, total: number, label: string, running: boolean, done: boolean, error: string}|null} installProgress
 */

/**
 * @param {object} options
 * @param {any} options.ctx Cordis 上下文（用 subprocess / interval / get('credentials')）
 * @param {import('../config.js').GoofishConfig} options.cfg
 * @param {import('./meta.js').MetaStore} options.meta
 * @param {import('../upstream/client.js').UpstreamClient} options.upstream
 * @param {any} options.configValidation validateConfig 的结果
 * @param {(event: string, fields?: Record<string, unknown>) => void} [options.log]
 */
export function createRuntime({ ctx, cfg, meta, upstream, configValidation, log }) {
  /** @type {RuntimeStatus['state']} */
  let state = 'stopped'
  let since = new Date().toISOString()
  let message = ''
  let hint = ''
  let pid = null
  let aiConfigured = false
  /** @type {{terminate: () => void, waitForExit: (ms: number) => Promise<boolean>, flush: () => void, handle?: any}|null} */
  let child = null
  let stopping = false
  let healthStop = null
  let healthFailures = 0
  /** @type {number[]} */
  let restartTimes = []
  let restartTimer = null

  /** 服务日志：行 + 递增偏移。面板按偏移增量拉取。 */
  const logLines = []
  let logOffset = 0

  const installer = createInstaller({
    cfg,
    subprocess: ctx.subprocess,
    interval: typeof ctx.interval === 'function' ? ctx.interval.bind(ctx) : undefined,
    log,
  })

  /** 单飞锁：同一时刻只允许一个运行管理操作。 */
  let lock = Promise.resolve()
  /**
   * @template T
   * @param {() => Promise<T>} run
   * @returns {Promise<T>}
   */
  function exclusive(run) {
    const next = lock.then(run, run)
    // 锁本身不能因为一次失败而卡住；错误由调用方从自己的 Promise 拿到
    lock = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  function pushLog(text) {
    if (!text) return
    for (const line of String(text).split(/\r?\n/)) {
      if (!line) continue
      logLines.push(line.length > 2000 ? line.slice(0, 2000) + '…' : line)
      logOffset += 1
    }
    if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES)
  }

  /** @param {RuntimeStatus['state']} next @param {{message?: string, hint?: string}} [extra] */
  function setState(next, extra = {}) {
    if (state !== next) since = new Date().toISOString()
    state = next
    message = extra.message ?? ''
    hint = extra.hint ?? ''
    log?.('runtime.state', { state: next })
  }

  /** 读取 AI 密钥。缺失不是错误：只影响 AI 功能，服务照样能跑关键词模式。 */
  async function resolveApiKey() {
    const credentials = ctx.get('credentials')
    if (!credentials || typeof credentials.resolve !== 'function') return null
    try {
      const hit = await credentials.resolve(API_KEY_REF)
      return hit?.value ?? null
    } catch {
      return null
    }
  }

  /** 生成 .env 区块。密钥不写入，这里只写地址、模型和端口。 */
  async function syncEnvFile() {
    const current = await meta.read()
    const password = current.webPassword || randomPassword()
    if (!current.webPassword) await meta.update({ webPassword: password })
    const ai = cfg.ai
    await applyEnvFile(join(cfg.projectDir, '.env'), {
      port: cfg.port,
      aiBaseUrl: ai.baseUrl,
      aiModel: ai.model,
      webPassword: password,
    })
  }

  /** 等待 /health 通过：0.5s 起步指数退避，总 START_TIMEOUT_MS。 */
  async function waitHealthy() {
    const deadline = Date.now() + START_TIMEOUT_MS
    let delay = 500
    while (Date.now() < deadline) {
      if (stopping) return false
      // 进程已经退出了就没必要再等满 30 秒（onExit 会把 child 置空）
      if (!child) return false
      if (await upstream.ping()) return true
      await sleep(delay)
      delay = Math.min(delay * 1.6, 4000)
    }
    return false
  }

  function startHealthMonitor() {
    stopHealthMonitor()
    if (typeof ctx.interval !== 'function') return
    healthFailures = 0
    healthStop = ctx.interval(async () => {
      if (state !== 'online') return
      if (await upstream.ping()) {
        healthFailures = 0
        return
      }
      healthFailures += 1
      if (healthFailures < HEALTH_FAILURES) return
      // 进程还在但连续不健康：当作崩溃处理，走重启节流
      setState('crashed', { message: `连续 ${HEALTH_FAILURES} 次健康检查失败`, hint: '看「运行」页的服务日志；也可能是端口被别的程序抢走了' })
      scheduleRestart()
    }, HEALTH_INTERVAL_MS)
  }

  function stopHealthMonitor() {
    if (healthStop) {
      try {
        healthStop()
      } catch {
        // 卸载过程中句柄可能已失效
      }
      healthStop = null
    }
  }

  /** 崩溃后的自动重启，带上节流。 */
  function scheduleRestart() {
    if (stopping) return
    const now = Date.now()
    restartTimes = restartTimes.filter((at) => now - at < RESTART_WINDOW_MS)
    if (restartTimes.length >= RESTART_DELAYS.length) {
      setState('crashed', { message: message || '服务反复崩溃，已停止自动重启', hint: '看「运行」页的服务日志，修好后手动点启动' })
      return
    }
    const delay = RESTART_DELAYS[restartTimes.length]
    restartTimes.push(now)
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      restartTimer = null
      void start({ automatic: true }).catch((error) => {
        log?.('runtime.restart.failed', { code: /** @type {any} */ (error)?.code })
      })
    }, delay)
    // 不要因为一个待触发的重启定时器拖住进程退出；插件卸载时 shutdown() 会清掉它。
    // （这里不能再调 ctx.effect：它是异步回调里调的，不在装配阶段，卸载后调用会抛错）
    restartTimer.unref?.()
  }

  /** 安装期间不排队：启动/停止会排在安装的锁后面挂几分钟，面板按钮看起来像卡死，直接说清楚。 */
  function refuseWhileInstalling() {
    if (state === 'installing' || installer.busy) {
      throw new GoofishError({ code: 'INSTALL_FAILED', message: '正在安装，现在不能启动或停止服务', hint: '等安装结束（看「运行」页的进度）' })
    }
  }

  /**
   * 启动（对外）。
   * @param {{automatic?: boolean}} [options]
   */
  function start(options = {}) {
    refuseWhileInstalling()
    return exclusive(() => startLocked(options))
  }

  /**
   * 启动（内部，**调用方必须已经持有锁**）。
   *
   * 为什么拆成两层：exclusive 是不可重入的单飞锁，restart()/install() 已经在锁里，
   * 再去调会排队的 start()/stop() 会永远等自己——死锁。持锁的流程只能调这些 *Locked 版本。
   * @param {{automatic?: boolean}} [options]
   */
  async function startLocked(options = {}) {
    // eslint-disable-next-line no-lone-blocks -- 保留原缩进，避免整段重排造成无意义的 diff
    {
      if (state === 'online' || state === 'starting') return status()

      if (!configValidation.ok) {
        setState('misconfigured', { message: configValidation.errors.join('；'), hint: '改插件配置里的 projectDir / port' })
        throw new GoofishError({ code: 'MISCONFIGURED', message: configValidation.errors.join('；'), hint: '改插件配置里的 projectDir / port' })
      }
      if (!(await isInstalled(cfg.projectDir))) {
        setState('not_installed', { message: '还没有安装上游', hint: '打开侧栏「闲鱼监控」→「运行」→「安装」' })
        throw new GoofishError({ code: 'NOT_INSTALLED', message: '还没有安装上游服务', hint: '打开侧栏「闲鱼监控」→「运行」→「安装」' })
      }

      stopping = false
      setState('starting', { message: options.automatic ? '崩溃后自动重启中' : '正在启动' })

      // 0. 上一个子进程还挂着（例如"连续健康检查失败"进入 crashed 时进程其实还活着）：先让它退出。
      // 置空 child 之后，它迟到的 onExit 会因为身份对不上被忽略（见下面的 self 判断）。
      if (child) {
        child.terminate()
        child = null
      }

      // 1. 残留清理：上次 DSH 异常退出会留下 uvicorn / Chromium
      const killed = await killProjectProcesses(cfg.projectDir, { log }).catch(() => [])
      if (killed.length) pushLog(`清理残留进程 ${killed.length} 个`)

      // 2. 端口：占用者不是我们的进程就报冲突，绝不结束别人的进程
      const owner = await portOwner(cfg.port).catch(() => null)
      if (owner && !isOwnProcess(owner, cfg.projectDir)) {
        const commandLine = owner.commandLine.length > 120 ? owner.commandLine.slice(0, 120) + '…' : owner.commandLine
        const text = `端口 ${cfg.port} 被 ${owner.name}（PID ${owner.pid}）占用：${commandLine}`
        setState('port_conflict', { message: text, hint: '在插件配置里换一个 port，或自己关掉那个程序' })
        throw new GoofishError({ code: 'PORT_CONFLICT', message: text, hint: '在插件配置里换一个 port，或自己关掉那个程序' })
      }
      if (owner && isOwnProcess(owner, cfg.projectDir)) {
        // 自己上次留下的进程：上面已经清理过，这里再确认一次
        await killProjectProcesses(cfg.projectDir, { log }).catch(() => [])
      }

      // 3. .env 区块
      await syncEnvFile()

      // 4. 密钥（可缺）
      const apiKey = await resolveApiKey()
      aiConfigured = Boolean(apiKey) || Boolean(cfg.ai.baseUrl && cfg.ai.model)

      // 5. 拉起 uvicorn：只监听 127.0.0.1，不用上游自带的 python -m src.app（它监听 0.0.0.0）
      const env = {
        PLAYWRIGHT_BROWSERS_PATH: join(cfg.projectDir, '.ms-playwright'),
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        NO_PROXY: '127.0.0.1,localhost',
        ...(apiKey ? { OPENAI_API_KEY: apiKey } : {}),
      }
      const isWin = process.platform === 'win32'
      const pythonExe = isWin ? join(cfg.projectDir, '.venv', 'Scripts', 'python.exe') : join(cfg.projectDir, '.venv', 'bin', 'python')
      if (!existsSync(pythonExe)) {
        setState('not_installed', { message: '虚拟环境不见了', hint: '重新安装一次' })
        throw new GoofishError({ code: 'NOT_INSTALLED', message: '虚拟环境不见了（.venv 里没有 python）', hint: '打开「运行」页重新安装' })
      }

      /** @type {typeof child} */
      let self = null
      self = spawnManaged(ctx, {
        argv: [pythonExe, '-m', 'uvicorn', 'src.app:app', '--host', '127.0.0.1', '--port', String(cfg.port)],
        cwd: cfg.projectDir,
        env,
        maxBytes: 256 * 1024,
        onData: (_stream, text) => pushLog(text),
        onExit: (outcome) => {
          // 只处理"当前这个"子进程的退出。重启时旧进程的 onExit 会晚到，
          // 如果不比对身份，它会把新进程的 child 清空、并把刚启动好的状态改回 crashed。
          if (child !== self) return
          child = null
          if (stopping) {
            setState('stopped', { message: '已停止' })
            return
          }
          void meta.update({ lastExit: { at: new Date().toISOString(), code: outcome.code, reason: message || '进程退出' } }).catch(() => {})
          const wasStarting = state === 'starting'
          setState('crashed', {
            message: `服务进程退出（退出码 ${outcome.code ?? '无'}）`,
            hint: '看「运行」页的服务日志最后 20 行',
          })
          stopHealthMonitor()
          // 启动过程中退出：由 startLocked 在等健康失败后统一安排重启，这里再排一次会重复
          if (!wasStarting) scheduleRestart()
        },
      })
      child = self

      // 6. 等健康
      const healthy = await waitHealthy()
      if (!healthy) {
        if (stopping) return status()
        child?.terminate()
        child = null
        // 进程在启动途中自己退出时，onExit 已经写了带退出码的说明，别拿"启动超时"覆盖掉它
        if (state !== 'crashed') {
          setState('crashed', {
            message: `启动超时：${START_TIMEOUT_MS / 1000} 秒内 /health 没有通过`,
            hint: '看「运行」页的服务日志最后 20 行；常见原因是端口被占、依赖没装全、或上游启动报错',
          })
        }
        scheduleRestart()
        return status()
      }

      const currentOwner = await portOwner(cfg.port).catch(() => null)
      pid = currentOwner?.pid ?? null
      setState('online', { message: '' })
      startHealthMonitor()
      restartTimes = []
      return status()
    }
  }

  /**
   * 停止（对外）。
   * @param {string} [reason]
   */
  function stop(reason = 'user') {
    refuseWhileInstalling()
    return exclusive(() => stopLocked(reason))
  }

  /**
   * 停止（内部，**调用方必须已经持有锁**）。先把正在跑的任务停掉，再 terminate，最后按路径兜底清理。
   * @param {string} [reason]
   */
  async function stopLocked(reason = 'user') {
    {
      if (state === 'stopped' || state === 'not_installed') {
        setState('stopped', { message: '已停止' })
        return status()
      }
      stopping = true
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      stopHealthMonitor()
      setState('stopping', { message: '正在停止' })

      // 1. 让上游先停掉正在跑的任务，否则 terminate 会让任务挂在"运行中"
      if (state === 'online' || child) {
        try {
          const tasks = await upstream.get('/api/tasks', { timeoutMs: 5000 })
          const list = Array.isArray(tasks) ? tasks : tasks?.tasks ?? []
          const running = list.filter((task) => task?.is_running)
          for (const task of running.slice(0, 20)) {
            await upstream.post(`/api/tasks/stop/${encodeURIComponent(String(task.id))}`, { timeoutMs: 5000 }).catch(() => {})
          }
        } catch {
          // 上游已经不可达：反正要停了
        }
      }

      // 2. terminate + 等退出（8 秒上限）
      child?.terminate()
      const exited = child ? await child.waitForExit(8000) : true
      child = null
      if (!exited) pushLog('进程没有在 8 秒内退出，按路径兜底清理')

      // 3. 兜底：受管范围外逃出去的 Chromium 之类
      await killProjectProcesses(cfg.projectDir, { log }).catch(() => [])

      pid = null
      stopping = false
      setState('stopped', { message: '已停止' })
      log?.('runtime.stop', { state: 'stopped', code: reason })
      return status()
    }
  }

  /** 插件加载：按配置决定是否自动拉起。 */
  async function boot() {
    if (!configValidation.ok) {
      setState('misconfigured', { message: configValidation.errors.join('；'), hint: '改插件配置里的 projectDir / port' })
      return status()
    }
    const installed = await isInstalled(cfg.projectDir)
    if (!installed) {
      setState('not_installed', { message: '还没有安装上游', hint: '打开侧栏「闲鱼监控」→「运行」→「安装」' })
      return status()
    }
    if (!cfg.autoStartOnLaunch) {
      // 用户选了手动：如果端口上已经有我们自己的服务（比如上次 DSH 被强杀留下的），认领它
      const owner = await portOwner(cfg.port).catch(() => null)
      if (owner && isOwnProcess(owner, cfg.projectDir) && (await upstream.ping())) {
        pid = owner.pid
        setState('online', { message: '' })
        startHealthMonitor()
        return status()
      }
      setState('stopped', { message: '按配置不自动启动' })
      return status()
    }
    // 自动启动失败不抛：插件加载不该因为服务起不来就失败
    return start({ automatic: true }).catch(() => status())
  }

  /** 安装：装完顺手把服务拉起来（用户点安装的意图就是要跑）。 */
  function install() {
    return exclusive(async () => {
      if (installer.busy) throw new GoofishError({ code: 'INSTALL_FAILED', message: '安装已在进行中', hint: '等这次装完' })
      if (!configValidation.ok) {
        throw new GoofishError({ code: 'MISCONFIGURED', message: configValidation.errors.join('；'), hint: '先改配置' })
      }
      // 服务在跑时重装：Windows 上 pip 覆盖正在使用的 .pyd/.dll 会失败，还可能把环境写坏。
      // 不替用户悄悄停服务（会中断正在抓取的任务），让他自己决定。
      if (state === 'online' || state === 'starting' || child) {
        throw new GoofishError({ code: 'INSTALL_FAILED', message: '服务正在运行，不能在运行中重新安装', hint: '先在「运行」页停止服务，再点安装' })
      }
      setState('installing', { message: '正在安装' })
      try {
        await installer.run({ meta, onConfigured: async () => { await syncEnvFile() } })
      } catch (error) {
        setState('not_installed', {
          message: error instanceof Error ? error.message : String(error),
          hint: '看安装输出的最后 20 行，修好后重新点安装会从失败的那一步继续',
        })
        throw error
      }
      await meta.update({ installedCommit: BASELINE_COMMIT, installedAt: new Date().toISOString() })
      setState('stopped', { message: '安装完成' })
      // 已经在锁里：只能调 startLocked。调会排队的 start() 会等自己释放锁——死锁
      return startLocked().catch(() => status())
    })
  }

  function restart() {
    refuseWhileInstalling()
    return exclusive(async () => {
      await stopLocked('restart')
      return startLocked()
    })
  }

  /** @returns {Promise<RuntimeStatus>} */
  async function status() {
    const stored = await meta.read().catch(() => null)
    const installedCommit = stored?.installedCommit || ''
    return {
      state,
      port: cfg.port,
      pid: state === 'online' ? pid : null,
      since,
      installedCommit,
      message,
      hint,
      installed: await isInstalled(cfg.projectDir).catch(() => false),
      aiConfigured,
      driftRisk: Boolean(installedCommit && installedCommit !== BASELINE_COMMIT),
      installProgress: state === 'installing' || installer.busy ? summarizeProgress(installer.progress()) : null,
    }
  }

  /** 服务日志增量。 */
  function logTail(from = 0) {
    const start = Math.max(0, Math.min(from, logLines.length))
    return { lines: logLines.slice(start), nextOffset: logLines.length, offset: start, dropped: start > 0 ? 0 : Math.max(0, logOffset - logLines.length) }
  }

  /** 插件卸载 / DSH 退出：停服务并清理进程。重复调用无副作用。 */
  async function shutdown() {
    stopping = true
    stopHealthMonitor()
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    // 8 秒上限；超时定时器要清掉，否则它会再拖住进程退出 8 秒
    let timer
    try {
      await Promise.race([
        exclusive(() => stopLocked('plugin-dispose')),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 8000)
        }),
      ])
    } catch {
      // 卸载时不再报错
    } finally {
      clearTimeout(timer)
    }
    // 同步兜底：异步流程超时或插件被强卸，按路径再杀一遍
    await killProjectProcesses(cfg.projectDir, { log }).catch(() => [])
    child = null
  }

  return { boot, install, start, stop, restart, shutdown, status, logTail, installer }
}

/** 安装进度只给摘要，面板要日志时单独拉接口。 */
function summarizeProgress(progress) {
  return { step: progress.step, total: progress.total, label: progress.label, running: progress.running, done: progress.done, error: progress.error }
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @returns {string} */
function randomPassword() {
  const bytes = new Uint8Array(18)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** @typedef {ReturnType<typeof createRuntime>} Runtime */
