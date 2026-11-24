// @ts-check
// 纵深防御：挡住"模型直接读账号文件 / 直接调上游账号接口"这条路。
//
// 这**不是**安全边界：命令文本可以被拼接绕过（`curl 127.0.0.$((1)).0.1:8765`）。
// 它的价值是挡住误操作和提示注入带来的随手一试。README 的「安全」一节如实写这一点。

import { resolve as resolvePath, sep } from 'node:path'


/** 带命令文本的工具。 */
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'terminal_exec', 'terminal_send'])
/** 带路径的工具。 */
const PATH_TOOLS = new Set(['read', 'grep', 'glob', 'write', 'edit'])

/**
 * 从一次调用里取出要检查的路径（可能不止一个）。
 * @param {any} args
 * @returns {string[]}
 */
function pathsOf(args) {
  if (!args || typeof args !== 'object') return []
  return ['path', 'file_path', 'filePath', 'dir', 'directory', 'cwd']
    .map((key) => args[key])
    .filter((value) => typeof value === 'string' && value)
}

/**
 * 路径是否落在 projectDir/state 下（大小写不敏感，兼容相对路径）。
 * @param {string} projectDir
 * @param {string} candidate
 */
export function isStatePath(projectDir, candidate) {
  const root = resolvePath(projectDir, 'state')
  // 相对路径按 projectDir 解析：模型可能用 "state/xxx.json"
  const target = resolvePath(projectDir, candidate)
  const left = process.platform === 'win32' ? root.toLowerCase() : root
  const right = process.platform === 'win32' ? target.toLowerCase() : target
  return right === left || right.startsWith(left.endsWith(sep) ? left : left + sep)
}

/**
 * 命令文本是否在直连上游的账号接口。
 * @param {string} command
 * @param {number} port
 */
export function touchesAccountApi(command, port) {
  const text = String(command || '')
  if (!text) return false
  if (text.includes('/api/accounts')) return true
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]
  return hosts.some((host) => text.toLowerCase().includes(host.toLowerCase()))
}

/**
 * 注册守卫。返回注销函数。
 * @param {any} ctx
 * @param {{projectDir: string, port: number}} target
 */
export function registerGuards(ctx, target) {
  return ctx.tools.guard((exec) => {
    const args = exec.arguments ?? {}

    if (SHELL_TOOLS.has(exec.name)) {
      const command = typeof args.command === 'string' ? args.command : typeof args.input === 'string' ? args.input : ''
      if (touchesAccountApi(command, target.port)) return DENIED
    }

    if (PATH_TOOLS.has(exec.name)) {
      for (const path of pathsOf(args)) {
        if (isStatePath(target.projectDir, path)) return DENIED
      }
    }

    return undefined
  })
}

/** 统一拒绝理由。说得具体一点，用户才知道该去哪儿。 */
const DENIED = '账号信息（cookie）只能在闲鱼监控面板里管理：打开侧栏「闲鱼监控」→「账号」。插件不提供读写账号的模型工具，也不允许直接访问上游账号接口或 state 目录。'

