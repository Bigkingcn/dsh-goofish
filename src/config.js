// @ts-check
// 配置的读取与校验（不依赖 DSH 内部包，方便单测）。
//
// 声明在 schema.js；这里只做两件事：把 Loader 传进来的 config 包成"每次读都是当前值"的视图，
// 以及在插件加载时把非法配置变成一句能照着改的提示，而不是抛错让插件消失。

import { homedir } from 'node:os'
import { join } from 'node:path'

/** 上游默认部署位置：DSH 主目录下的独立子目录。用绝对路径——相对路径会随 DSH 的 cwd 漂移。 */
export const DEFAULT_PROJECT_DIR = join(homedir(), '.dsh', 'goofish', 'ai-goofish-monitor')

/**
 * 读一个可能是 volatile 引用的字段。
 * schemastery 把 volatile 字段解析成"引用"，要 .get() 才是值。
 * @template T
 * @param {any} field
 * @returns {T}
 */
function value(field) {
  if (field && typeof field === 'object' && typeof field.get === 'function') return field.get()
  return field
}

/**
 * 把 Loader 传进来的配置包成 getter 视图：
 * 每次读都是当前值，volatile 字段改动立刻可见，不需要重读整个 config。
 * @param {any} raw
 */
export function createConfig(raw) {
  const read = (field) => value(field)
  return {
    raw,
    get projectDir() {
      return String(read(raw?.projectDir) ?? DEFAULT_PROJECT_DIR)
    },
    get pythonPath() {
      return String(read(raw?.pythonPath) ?? '')
    },
    get gitPath() {
      return String(read(raw?.gitPath) ?? '')
    },
    get port() {
      return Number(read(raw?.port) ?? 8765)
    },
    get autoStartOnLaunch() {
      // 默认 true；只有显式写了 false 才关。注意不能写成 `x !== false && ... ? Boolean(x) : true`——
      // 那样 false 会落到 `: true` 分支，配置里的 autoStartOnLaunch: false 永远不生效
      const value = read(raw?.autoStartOnLaunch)
      return value === undefined || value === null ? true : Boolean(value)
    },
    get pipIndexUrl() {
      return String(read(raw?.pipIndexUrl) ?? '')
    },
    get installProxy() {
      return String(read(raw?.installProxy) ?? '')
    },
    /** @returns {{baseUrl: string, model: string}} */
    get ai() {
      const ai = read(raw?.ai) ?? {}
      return { baseUrl: String(ai.baseUrl ?? ''), model: String(ai.model ?? '') }
    },
    get timeZone() {
      return String(read(raw?.timeZone) ?? 'Asia/Shanghai')
    },
    get staleDays() {
      return Number(read(raw?.staleDays) ?? 7)
    },
    get defaultLimit() {
      return Number(read(raw?.defaultLimit) ?? 10)
    },
    get requestTimeoutMs() {
      return Number(read(raw?.requestTimeoutMs) ?? 15000)
    },
    get generateTimeoutMs() {
      return Number(read(raw?.generateTimeoutMs) ?? 90000)
    },
    get digestWindowHours() {
      const digest = read(raw?.digest)
      const hours = digest && typeof digest === 'object' ? digest.windowHours : digest
      return Number(read(hours) ?? 24)
    },
  }
}

/** @typedef {ReturnType<typeof createConfig>} GoofishConfig */

/** 只允许盘符开头的 ASCII 路径、不带空格：上游脚本和自己拼的命令都吃不下别的。 */
const SAFE_PATH = /^[A-Za-z]:\\[\x20-\x7e]*$/

/**
 * 校验配置。不抛错——配置非法时插件仍要加载，由状态机进入 misconfigured，
 * 面板和工具把原因讲清楚，用户才能改。
 * @param {GoofishConfig} cfg
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateConfig(cfg) {
  /** @type {string[]} */
  const errors = []
  const dir = cfg.projectDir

  if (!/^[A-Za-z]:[\\/]/.test(dir)) errors.push('projectDir 必须是绝对路径（例如 D:\\goofish\\ai-goofish-monitor）')
  else if (/\s/.test(dir)) errors.push('projectDir 不能包含空格')
  else if (!/^[\x20-\x7e]+$/.test(dir)) errors.push('projectDir 只能包含 ASCII 字符')
  else if (!SAFE_PATH.test(dir)) errors.push('projectDir 请使用反斜杠路径（例如 D:\\goofish\\ai-goofish-monitor），不要用正斜杠')

  const port = cfg.port
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('port 必须是 1–65535 之间的整数')

  for (const [name, path] of /** @type {const} */ ([
    ['pythonPath', cfg.pythonPath],
    ['gitPath', cfg.gitPath],
  ])) {
    if (path && !/^[A-Za-z]:[\\/]/.test(path)) errors.push(`${name} 要么留空，要么写绝对路径`)
  }

  return { ok: errors.length === 0, errors }
}
