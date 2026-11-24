// @ts-check
// 起一个受管子进程并把它的输出尾部流式读出来。
//
// 用 ctx.subprocess 而不是 node:child_process：受管进程在 DSH 卸载、退出时由服务统一收尾，
// 而且 collected 是"带界尾部缓冲 + 偏移读取"，正好满足"日志只留最后 N 行"的需求。
// 注意 handle 没有 pid —— 需要 pid 时从端口占用者那里取（见 runtime/procs.js）。

/**
 * @typedef {object} RunSpec
 * @property {string[]} argv
 * @property {string} cwd
 * @property {Record<string, string|undefined>} [env]
 * @property {number} [maxBytes] 每个流保留的字节数
 * @property {number} [graceMs]
 * @property {(stream: 'stdout'|'stderr', text: string) => void} [onData] 增量回调（每 pollMs 一次）
 * @property {number} [pollMs]
 */

/**
 * 把 `python` / `git` 这样的裸命令名解析成绝对路径。
 * subprocess 文档的示例是"先 resolveExecutable，再把结果放进 argv[0]"，不依赖 spawn 自己去查 PATH。
 * 已经是绝对路径的原样返回；服务没有 resolveExecutable 时也原样返回（交给 spawn 报错）。
 * @param {any} subprocess
 * @param {string} program
 */
async function resolveProgram(subprocess, program) {
  if (/^[A-Za-z]:[\\/]/.test(program) || program.startsWith('/')) return program
  if (typeof subprocess?.resolveExecutable !== 'function') return program
  return subprocess.resolveExecutable(program)
}

/**
 * 跑一个进程，等它结束。
 * @param {{subprocess: any}} ctx 需要 ctx.subprocess
 * @param {RunSpec} spec
 * @returns {Promise<{code: number|null, signal: string|null, stdout: string, stderr: string, ok: boolean}>}
 */
export async function runToEnd(ctx, spec) {
  const maxBytes = spec.maxBytes ?? 256 * 1024

  // 找不到可执行文件（没装 Python / Git）是**预期内的失败**：调用方要拿到一个 ok:false 的结果，
  // 才能给出"装 Python 3.10 以上"这样的提示；直接抛异常的话，上层只会看到一句底层报错。
  let argv = spec.argv
  /** @type {any} */
  let handle
  try {
    argv = [await resolveProgram(ctx.subprocess, spec.argv[0]), ...spec.argv.slice(1)]
    handle = ctx.subprocess.spawn({
      argv,
      cwd: spec.cwd,
      stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } },
      graceMs: spec.graceMs ?? 5000,
      ...(spec.env ? { env: spec.env } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spec.onData?.('stderr', `${message}\n`)
    return { code: null, signal: null, stdout: '', stderr: message, ok: false }
  }

  const offsets = { stdout: 0, stderr: 0 }
  /** @type {{stdout: string, stderr: string}} */
  const tails = { stdout: '', stderr: '' }

  const flush = () => {
    for (const stream of /** @type {const} */ (['stdout', 'stderr'])) {
      const collected = handle.collected?.[stream]
      if (!collected || typeof collected.readFrom !== 'function') continue
      const chunk = collected.readFrom(offsets[stream])
      if (!chunk || !chunk.text) continue
      offsets[stream] = chunk.nextOffset
      tails[stream] += chunk.text
      spec.onData?.(stream, chunk.text)
    }
  }

  // 轮询增量：ctx.interval 的句柄绑在当前 fiber 上，卸载时会一起清掉
  const pollMs = spec.pollMs ?? 400
  const stopPoll = typeof ctx.interval === 'function' ? ctx.interval(flush, pollMs) : () => {}
  try {
    const outcome = await handle.done
    flush()
    return {
      code: outcome?.exitCode ?? null,
      signal: outcome?.signal ?? null,
      stdout: tails.stdout,
      stderr: tails.stderr,
      ok: (outcome?.exitCode ?? null) === 0,
    }
  } catch (error) {
    // done 在 spawn/provider 失败时会 reject，同样按"没跑成"返回
    const message = error instanceof Error ? error.message : String(error)
    flush()
    return { code: null, signal: null, stdout: tails.stdout, stderr: tails.stderr + message, ok: false }
  } finally {
    try {
      stopPoll()
    } catch {
      // 卸载过程中 interval 句柄可能已经失效，忽略
    }
  }
}

/**
 * 起一个常驻进程，返回句柄和读取日志的方法。管理器用它跑 uvicorn。
 * @param {{subprocess: any, interval: (cb: () => void, ms: number) => () => void}} ctx
 * @param {RunSpec & {onExit: (outcome: {code: number|null, signal: string|null}) => void}} spec
 */
export function spawnManaged(ctx, spec) {
  const maxBytes = spec.maxBytes ?? 256 * 1024
  const handle = ctx.subprocess.spawn({
    argv: spec.argv,
    cwd: spec.cwd,
    stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } },
    graceMs: spec.graceMs ?? 5000,
    ...(spec.env ? { env: spec.env } : {}),
  })

  const offsets = { stdout: 0, stderr: 0 }
  const flush = () => {
    for (const stream of /** @type {const} */ (['stdout', 'stderr'])) {
      const collected = handle.collected?.[stream]
      if (!collected || typeof collected.readFrom !== 'function') continue
      const chunk = collected.readFrom(offsets[stream])
      if (!chunk || !chunk.text) continue
      offsets[stream] = chunk.nextOffset
      spec.onData?.(stream, chunk.text)
    }
  }
  const stopPoll = ctx.interval(flush, spec.pollMs ?? 500)

  // done 可能 reject（spawn 失败），两种情况都要通知出去，否则状态机会卡在 starting
  void handle.done.then(
    (outcome) => {
      flush()
      stopPoll()
      spec.onExit({ code: outcome?.exitCode ?? null, signal: outcome?.signal ?? null })
    },
    (error) => {
      stopPoll()
      spec.onData?.('stderr', `\n[启动失败] ${error instanceof Error ? error.message : String(error)}\n`)
      spec.onExit({ code: null, signal: null })
    },
  )

  return {
    flush,
    terminate() {
      try {
        handle.terminate()
      } catch {
        // 幂等：受管范围已经空了再 terminate 是 no-op
      }
    },
    /**
     * 等它真的退出。返回 false 表示超时（受管范围里还有进程）。
     * @param {number} ms
     */
    async waitForExit(ms) {
      const result = await Promise.race([
        handle.waitForExit().then(() => true, () => false),
        new Promise((resolve) => setTimeout(() => resolve(false), ms)),
      ])
      return Boolean(result)
    },
  }
}
