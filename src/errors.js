// @ts-check
// 统一错误模型：所有对外操作返回 { ok, data } 或 { ok:false, code, message, hint }。
// 业务层不抛字符串——抛出的一定是 GoofishError，工具和面板各自渲染。

/**
 * @typedef {object} GoofishErrorInput
 * @property {string} code 错误码（见 README「错误码」）
 * @property {string} message 一句话说明发生了什么
 * @property {string} [hint] 下一步该做什么；面板和工具都会展示
 * @property {unknown} [cause] 原始错误，只留给日志，不进模型上下文
 */

export class GoofishError extends Error {
  /**
   * @param {GoofishErrorInput} input
   */
  constructor({ code, message, hint, cause }) {
    super(message)
    this.name = 'GoofishError'
    this.code = code
    this.hint = hint ?? ''
    if (cause !== undefined) this.cause = cause
  }

  /** 面板/工具共用的线上结构；cause 不进这里。 */
  toResult() {
    return /** @type {{ok: false, code: string, message: string, hint: string}} */ ({
      ok: false,
      code: this.code,
      message: this.message,
      hint: this.hint,
    })
  }

  /**
   * 模型看到的一行：Error: <说明>；下一步：<hint>。
   * 工具层用它做 throw，DSH 会把 message 显示成工具错误。
   */
  toText() {
    return this.hint ? `${this.message}；下一步：${this.hint}` : this.message
  }
}

/**
 * 把任意异常收敛成 GoofishError。已经是本类的原样返回，
 * 免得在层与层之间反复包装把 code 丢掉。
 * @param {unknown} error
 * @param {string} fallbackCode
 * @param {string} [fallbackHint]
 * @returns {GoofishError}
 */
export function asGoofishError(error, fallbackCode = 'INTERNAL', fallbackHint) {
  if (error instanceof GoofishError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new GoofishError({ code: fallbackCode, message, hint: fallbackHint, cause: error })
}

/**
 * 包一层：把回调的返回值统一成 { ok, data } / { ok:false, ... }。
 * 控制器和 HTTP 路由都走它，省得每处重复 try/catch。
 * @template T
 * @param {() => Promise<T> | T} run
 * @returns {Promise<{ok: true, data: T} | {ok: false, code: string, message: string, hint: string}>}
 */
export async function attempt(run) {
  try {
    return { ok: true, data: await run() }
  } catch (error) {
    return asGoofishError(error).toResult()
  }
}
