// @ts-check
// 进程与端口工具。只用 powershell.exe 和 taskkill，不引入依赖。
//
// 安全规则（§5.7）：只有在 projectDir 之下、由我们拉起的可执行文件才会被结束。
// 绝不按进程名杀（"python.exe" 可能是用户自己的），更不按端口号结束别人的进程。
// PowerShell 参数从环境变量传入，不拼进脚本文本——避免命令注入。

import { execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve as resolvePath, sep } from 'node:path'

/**
 * 跑一段 PowerShell，拿 JSON 回来。
 * 用环境变量传参：脚本里只有固定的字段名，用户数据不进脚本文本。
 * @param {string} script
 * @param {Record<string, string>} [env]
 * @returns {Promise<any>}
 */
function runPowerShell(script, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 20_000,
        env: { ...process.env, ...env },
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(new Error(String(stderr || error.message).trim()), { cause: error }))
          return
        }
        const text = String(stdout).trim()
        if (!text) {
          resolve(null)
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch {
          resolve(text)
        }
      },
    )
  })
}

/** ConvertTo-Json 对单个对象不返回数组，这里统一成数组。 */
function asArray(value) {
  if (Array.isArray(value)) return value
  return value === null || value === undefined ? [] : [value]
}

/** 规范化路径后比较前缀：盘符大小写、尾部分隔符都不该影响判断。 */
function isUnder(dir, candidate) {
  if (!candidate) return false
  const root = resolvePath(dir)
  const target = resolvePath(candidate)
  const left = process.platform === 'win32' ? root.toLowerCase() : root
  const right = process.platform === 'win32' ? target.toLowerCase() : target
  return right === left || right.startsWith(left.endsWith(sep) ? left : left + sep)
}

/**
 * 端口占用者（连同它的父进程）。
 *
 * 为什么要带父进程：虚拟环境里的 `.venv\Scripts\python.exe` 在 Windows 上只是个启动器，
 * 它会再拉起**基础安装目录里**的真正解释器（如 C:\Python311\python.exe）去跑 uvicorn，
 * 真正监听端口的是这个子进程——它的可执行文件路径不在 projectDir 下。
 * 只看监听者自己的路径，会把"我们自己的服务"误判成别人的进程，报假的端口冲突。
 * @param {number} port
 * @returns {Promise<{pid: number, name: string, executablePath: string, commandLine: string, parentPid: number, parentExecutablePath: string}|null>}
 */
export async function portOwner(port) {
  const script = `
$ErrorActionPreference = 'Stop'
$conn = Get-NetTCPConnection -LocalPort ([int]$env:GOOFISH_PORT) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { 'null'; exit 0 }
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"
if (-not $proc) { 'null'; exit 0 }
$parentPath = $null
if ($proc.ParentProcessId) {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)"
  if ($parent) { $parentPath = $parent.ExecutablePath }
}
@{
  pid = [int]$proc.ProcessId; name = $proc.Name; executablePath = $proc.ExecutablePath; commandLine = $proc.CommandLine
  parentPid = [int]$proc.ParentProcessId; parentExecutablePath = $parentPath
} | ConvertTo-Json -Compress
`
  const result = await runPowerShell(script, { GOOFISH_PORT: String(port) })
  if (!result || typeof result !== 'object') return null
  return {
    pid: Number(result.pid) || 0,
    name: String(result.name ?? ''),
    executablePath: String(result.executablePath ?? ''),
    commandLine: String(result.commandLine ?? ''),
    parentPid: Number(result.parentPid) || 0,
    parentExecutablePath: String(result.parentExecutablePath ?? ''),
  }
}

/**
 * projectDir 下的进程（虚拟环境里的 python、Playwright 的 Chromium）。
 * @param {string} projectDir
 * @returns {Promise<Array<{pid: number, name: string, executablePath: string}>>}
 */
export async function listProjectProcesses(projectDir) {
  // -like 通配符本身不区分大小写，正好符合 Windows 路径语义
  const script = `
$ErrorActionPreference = 'Stop'
$prefix = $env:GOOFISH_DIR.TrimEnd('\\') + '\\*'
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name LIKE 'chrome%'" |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like $prefix } |
  Select-Object @{n='pid';e={[int]$_.ProcessId}}, @{n='name';e={$_.Name}}, @{n='executablePath';e={$_.ExecutablePath}} |
  ConvertTo-Json -Compress
`
  const result = await runPowerShell(script, { GOOFISH_DIR: resolvePath(projectDir) })
  const rows = asArray(result).map((row) => ({
    pid: Number(row.pid) || 0,
    name: String(row.name ?? ''),
    executablePath: String(row.executablePath ?? ''),
  }))
  // 脚本已经用前缀筛过一遍；这里再按规范化路径复核一次，防止通配符被奇怪路径绕过
  return rows.filter((row) => isUnder(projectDir, row.executablePath))
}

/**
 * 结束 projectDir 下的进程（先子后父，/T 带上整棵树）。
 * 每个 PID 一条日志，便于事后对账。
 * @param {string} projectDir
 * @param {{log?: (event: string, fields?: Record<string, unknown>) => void}} [options]
 * @returns {Promise<Array<{pid: number, name: string}>>}
 */
export async function killProjectProcesses(projectDir, options = {}) {
  const processes = await listProjectProcesses(projectDir).catch(() => [])
  const killed = []
  // 深路径（子进程）优先：Chromium 的 chrome.exe 比 python.exe 更深
  for (const proc of processes.sort((a, b) => b.executablePath.length - a.executablePath.length)) {
    const ok = await new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, (error) => resolve(!error))
    })
    options.log?.('procs.kill', { state: ok ? 'killed' : 'failed', code: proc.pid })
    if (ok) killed.push({ pid: proc.pid, name: proc.name })
  }
  return killed
}

/**
 * 快速预检：端口是否空闲。比 PowerShell 快一个量级，用来挡住明显的冲突。
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

/**
 * 占用者是否是我们自己服务（用于区分"残留的旧进程"和"别人的服务"）。
 * 监听者自己或它的**直接父进程**在 projectDir 下都算（venv 启动器 → 基础解释器，见 portOwner）。
 * @param {{executablePath: string, parentExecutablePath?: string}|null} owner
 * @param {string} projectDir
 */
export function isOwnProcess(owner, projectDir) {
  if (!owner) return false
  return isUnder(projectDir, owner.executablePath) || isUnder(projectDir, owner.parentExecutablePath ?? '')
}
