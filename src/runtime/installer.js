// @ts-check
// 安装器：分步、幂等、可重入。
//
// 每一步都能单独重跑：git clone 看 .git 在不在、venv 看 python.exe 在不在、checkout 看 HEAD。
// 用户在第五步失败，再点一次安装就从第五步继续，不会从头再来一遍 1 GB 的下载。
// 进度写进内存（面板轮询），不落盘——它是"这一次运行"的状态，重启后没必要恢复。

import { mkdir, readdir, readFile, stat, statfs, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GoofishError } from '../errors.js'
import { BASELINE_COMMIT } from '../upstream/contract.js'
import { runToEnd } from './run.js'

/** 上游仓库地址。写死在这里：README 里承诺装的就是这一个。 */
export const UPSTREAM_REPO = 'https://github.com/Usagi-org/ai-goofish-monitor'

/** 安装至少需要 2 GB 空闲（虚拟环境 + Chromium）。 */
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024

/** 进度日志环形缓冲的行数。 */
const LOG_LINES = 300

/**
 * @typedef {object} InstallProgress
 * @property {number} step 当前步骤号（1 起）
 * @property {number} total
 * @property {string} label
 * @property {boolean} running
 * @property {boolean} done
 * @property {string[]} log 最后 LOG_LINES 行
 * @property {string} error
 */

/**
 * @param {object} options
 * @param {import('../config.js').GoofishConfig} options.cfg
 * @param {any} options.subprocess ctx.subprocess（受管子进程）
 * @param {(cb: () => void, ms: number) => () => void} [options.interval] ctx.interval（流式读输出用）
 * @param {(event: string, fields?: Record<string, unknown>) => void} [options.log]
 */
export function createInstaller({ cfg, subprocess, interval, log }) {
  /** @type {InstallProgress} */
  let progress = { step: 0, total: 9, label: '未开始', running: false, done: false, log: [], error: '' }
  /** 预检读到的 Python 版本，写进 state.json。 */
  let detectedPython = ''
  const runCtx = { subprocess, interval }

  /** 追加输出到环形缓冲。截断按行，保留最近的整行。 */
  function push(text) {
    if (!text) return
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue
      progress.log.push(line.length > 500 ? line.slice(0, 500) + '…' : line)
    }
    if (progress.log.length > LOG_LINES) progress.log.splice(0, progress.log.length - LOG_LINES)
  }

  /**
   * 跑一步命令，把输出流进进度。
   * @param {string[]} argv
   * @param {{cwd?: string, env?: Record<string, string|undefined>, allowFailure?: boolean}} [options]
   */
  async function exec(argv, options = {}) {
    push(`$ ${argv.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ')}`)
    const result = await runToEnd(runCtx, {
      argv,
      cwd: options.cwd ?? cfg.projectDir,
      env: { ...baseEnv(), ...options.env },
      maxBytes: 128 * 1024,
      onData: (_stream, text) => push(text),
    })
    if (!result.ok && !options.allowFailure) {
      throw new GoofishError({
        code: 'INSTALL_FAILED',
        message: `安装第 ${progress.step} 步失败（退出码 ${result.code ?? '无'}）`,
        hint: '看面板「运行」页的安装输出最后 20 行；修好环境后重新点安装，会从失败的那一步继续',
      })
    }
    return result
  }

  /** 子进程的公共环境：Windows 控制台默认 GBK，输出中文和 emoji 会抛 UnicodeEncodeError。 */
  function baseEnv() {
    return {
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      PLAYWRIGHT_BROWSERS_PATH: join(cfg.projectDir, '.ms-playwright'),
      NO_PROXY: '127.0.0.1,localhost',
    }
  }

  /** 只有 clone / pip / playwright 三步走代理：运行时是 127.0.0.1，不该走代理。 */
  function proxyEnv() {
    const proxy = cfg.installProxy.trim()
    return proxy ? { HTTPS_PROXY: proxy, HTTP_PROXY: proxy } : {}
  }

  function python() {
    return cfg.pythonPath.trim() || 'python'
  }

  function venvPython() {
    return join(cfg.projectDir, '.venv', 'Scripts', 'python.exe')
  }

  function git() {
    return cfg.gitPath.trim() || 'git'
  }

  /** @param {number} step @param {string} label */
  function begin(step, label) {
    progress = { ...progress, step, label, running: true, done: false, error: '' }
    push(`\n[${step}/${progress.total}] ${label}`)
  }

  /** 步骤 1：预检。环境不满足时早点说，别等下载到一半才失败。 */
  async function preflight() {
    begin(1, '预检 Python / Git / 磁盘')
    const version = await exec([python(), '-c', 'import sys;print("%d.%d.%d"%sys.version_info[:3])'], { cwd: process.cwd(), allowFailure: true })
    const text = version.stdout.trim().split(/\r?\n/).pop() ?? ''
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text)
    if (!match) {
      throw new GoofishError({
        code: 'INSTALL_FAILED',
        message: `找不到可用的 Python（${python()}）`,
        hint: '装 Python 3.10 以上版本，或在配置里把 pythonPath 指向 python.exe 的绝对路径',
      })
    }
    const [major, minor] = [Number(match[1]), Number(match[2])]
    if (major < 3 || (major === 3 && minor < 10)) {
      throw new GoofishError({ code: 'INSTALL_FAILED', message: `Python 版本太低（${text}）`, hint: '上游要求 3.10 以上，装新版本后重试' })
    }
    detectedPython = text
    const gitVersion = await exec([git(), '--version'], { cwd: process.cwd(), allowFailure: true })
    if (!gitVersion.ok) {
      throw new GoofishError({ code: 'INSTALL_FAILED', message: '找不到 git', hint: '安装 Git for Windows，或在配置里把 gitPath 指向 git.exe' })
    }
    // 磁盘：装在哪个盘就查哪个盘。F 盘装得下才继续。
    const driveRoot = `${cfg.projectDir.slice(0, 2)}\\`
    try {
      const info = await statfs(driveRoot)
      const free = Number(info.bavail) * Number(info.bsize)
      if (free < MIN_FREE_BYTES) {
        throw new GoofishError({
          code: 'INSTALL_FAILED',
          message: `${driveRoot} 剩余空间不足 2 GB（约 ${(free / 1024 / 1024 / 1024).toFixed(1)} GB）`,
          hint: '清出空间，或把 projectDir 换到空间更大的盘',
        })
      }
    } catch (error) {
      if (error instanceof GoofishError) throw error
      push('磁盘空间检查跳过（无法读取卷信息）')
    }
    return text
  }

  /** 步骤 2：克隆。目标目录非空且没有 .git 时拒绝——那是用户自己的目录。 */
  async function clone() {
    begin(2, '克隆上游仓库')
    if (existsSync(join(cfg.projectDir, '.git'))) {
      push('已存在 .git，跳过克隆')
      return
    }
    const existing = await readdirSafe(cfg.projectDir)
    if (existing.length > 0) {
      throw new GoofishError({
        code: 'INSTALL_FAILED',
        message: `projectDir 已存在且不是空目录：${cfg.projectDir}`,
        hint: '换一个不存在的目录，或先把这个目录清空/改名（插件不会删你已有的文件）',
      })
    }
    await mkdir(cfg.projectDir, { recursive: true })
    await exec([git(), 'clone', UPSTREAM_REPO, cfg.projectDir], { cwd: process.cwd(), env: proxyEnv() })
  }

  /** 步骤 3：锁定基线版本。漂移会让契约层对不上。 */
  async function checkout() {
    begin(3, `锁定上游版本 ${BASELINE_COMMIT.slice(0, 8)}`)
    const head = await exec([git(), 'rev-parse', 'HEAD'], { allowFailure: true })
    if (head.ok && head.stdout.trim() === BASELINE_COMMIT) {
      push('HEAD 已是基线版本，跳过')
      return
    }
    await exec([git(), 'fetch', '--depth', '1', 'origin', BASELINE_COMMIT], { env: proxyEnv(), allowFailure: true })
    await exec([git(), 'checkout', '--force', BASELINE_COMMIT])
  }

  /** 步骤 4：虚拟环境。 */
  async function venv() {
    begin(4, '创建虚拟环境')
    if (existsSync(venvPython())) {
      push('.venv 已存在，跳过')
      return
    }
    await exec([python(), '-m', 'venv', join(cfg.projectDir, '.venv')], { cwd: process.cwd() })
  }

  /** 步骤 5：依赖。上游 requirements 没锁版本，所以这一步永远重跑（pip 自己幂等）。 */
  async function dependencies() {
    begin(5, '安装 Python 依赖')
    const runtimeFile = join(cfg.projectDir, 'requirements-runtime.txt')
    const file = existsSync(runtimeFile) ? runtimeFile : join(cfg.projectDir, 'requirements.txt')
    const args = [venvPython(), '-m', 'pip', 'install', '-r', file]
    const index = cfg.pipIndexUrl.trim()
    if (index) args.push('--index-url', index)
    await exec(args, { env: proxyEnv() })
  }

  /** 步骤 6：冻结清单。上游不锁版本，我们自己记一份，出问题时能复现。 */
  async function freeze() {
    begin(6, '记录依赖清单')
    const result = await exec([venvPython(), '-m', 'pip', 'freeze'], { allowFailure: true })
    await mkdir(join(cfg.projectDir, '.dsh-goofish'), { recursive: true })
    await writeFile(join(cfg.projectDir, '.dsh-goofish', 'freeze.txt'), result.stdout, 'utf8')
  }

  /** 步骤 7：Chromium。装在 projectDir 下，不污染用户目录，卸载时一起删。 */
  async function browsers() {
    begin(7, '下载 Chromium')
    const target = join(cfg.projectDir, '.ms-playwright')
    if (existsSync(target)) {
      const entries = await readdirSafe(target)
      if (entries.some((name) => name.startsWith('chromium'))) {
        push('已存在 Chromium，跳过')
        return
      }
    }
    await exec([venvPython(), '-m', 'playwright', 'install', 'chromium'], { env: proxyEnv() })
  }

  /** 步骤 8：写 .env 区块和 state.json（口令复用已有的，不每次重生成）。 */
  async function configure(meta) {
    begin(8, '写入配置')
    const state = await meta.read()
    const password = state.webPassword || randomPassword()
    await meta.update({
      installedCommit: BASELINE_COMMIT,
      installedAt: new Date().toISOString(),
      webPassword: password,
      pythonVersion: detectedPython,
    })
    push('配置已写入 .dsh-goofish/state.json（.env 区块由运行时维护）')
  }

  /** 步骤 9：冒烟。三个包 import 成功说明依赖和解释器都对得上。 */
  async function verify() {
    begin(9, '验证安装')
    await exec([venvPython(), '-c', 'import fastapi,uvicorn,playwright;print("ok")'])
  }

  /**
   * 跑完整流程。任何一步抛错都停在原地，错误写进 progress.error。
   * @param {{meta: import('./meta.js').MetaStore, onConfigured?: () => Promise<void>}} options
   */
  async function run({ meta, onConfigured }) {
    if (progress.running) throw new GoofishError({ code: 'INSTALL_FAILED', message: '安装已在进行中', hint: '等这次装完，或看面板里的进度' })
    progress = { step: 0, total: 9, label: '开始安装', running: true, done: false, log: [], error: '' }
    try {
      await preflight()
      await clone()
      await checkout()
      await venv()
      await dependencies()
      await freeze()
      await browsers()
      await configure(meta)
      await onConfigured?.()
      await verify()
      progress = { ...progress, running: false, done: true, label: '安装完成' }
      log?.('install.done', { state: 'installed' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      progress = { ...progress, running: false, done: false, error: message, label: `第 ${progress.step} 步失败` }
      log?.('install.failed', { state: 'failed', code: progress.step })
      throw error
    }
  }

  return {
    run,
    /** 面板轮询用。返回的是快照，调用方拿不到内部数组。 */
    progress() {
      return { ...progress, log: progress.log.slice(-LOG_LINES) }
    },
    /** 安装是否已经在跑（运行管理与面板按钮共用）。 */
    get busy() {
      return progress.running
    },
    venvPython,
  }
}

/** @param {string} dir */
async function readdirSafe(dir) {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/** 随机口令：上游 Web 界面不再对外提供，但仍然生成一个，避免它退回到默认口令。 */
function randomPassword() {
  const bytes = new Uint8Array(18)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 判断目录是否已经装好（.venv 里的 python 存在）。 */
export async function isInstalled(projectDir) {
  try {
    const info = await stat(join(projectDir, '.venv', 'Scripts', 'python.exe'))
    return info.isFile()
  } catch {
    return false
  }
}

/** 读 freeze.txt（面板展示用）。 */
export async function readFreeze(projectDir) {
  try {
    return await readFile(join(projectDir, '.dsh-goofish', 'freeze.txt'), 'utf8')
  } catch {
    return ''
  }
}

/** @typedef {ReturnType<typeof createInstaller>} Installer */
