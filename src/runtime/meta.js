// @ts-check
// 插件的运行元数据：<projectDir>\.dsh-goofish\state.json
//
// 为什么放在 projectDir 而不是 DSH 的 storage：这些信息（装的是哪个 commit、汇报定时任务 id、
// 上游 Web 口令）与 projectDir 同生命周期，放在一起用户卸载时删目录就干净了。
// 写入必须原子：DSH 被强杀时不能留下半截 JSON。

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @typedef {object} GoofishState
 * @property {number} schema
 * @property {string} installedCommit
 * @property {string} installedAt
 * @property {string} pythonVersion
 * @property {{scheduleId?: string}} digest
 * @property {string} webPassword
 * @property {{at: string, code: number|null, reason: string}|null} lastExit
 */

/** @type {GoofishState} */
export function emptyState() {
  return {
    schema: 1,
    installedCommit: '',
    installedAt: '',
    pythonVersion: '',
    digest: {},
    webPassword: '',
    lastExit: null,
  }
}

/**
 * @param {string} projectDir
 */
export function stateDir(projectDir) {
  return join(projectDir, '.dsh-goofish')
}

/**
 * @param {string} projectDir
 */
export function statePath(projectDir) {
  return join(stateDir(projectDir), 'state.json')
}

/**
 * 状态存储。读失败不抛错：损坏的文件先改名留档，然后从空状态继续——
 * 元数据坏了不该让插件起不来，用户还能在面板里重装。
 * @param {string} projectDir
 * @param {{log?: (event: string, fields?: Record<string, unknown>) => void}} [options]
 */
export function createMeta(projectDir, options = {}) {
  const file = statePath(projectDir)
  /** @type {GoofishState|null} */
  let cache = null

  /** @returns {Promise<GoofishState>} */
  async function read() {
    if (cache) return cache
    try {
      const text = await readFile(file, 'utf8')
      const parsed = JSON.parse(text)
      cache = { ...emptyState(), ...parsed, digest: { ...parsed.digest } }
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code
      if (code === 'ENOENT') {
        cache = emptyState()
      } else {
        // 损坏：留档副本，别覆盖掉——里面可能还有用户需要的信息
        const backup = `${file}.corrupt-${Date.now()}`
        await rename(file, backup).catch(() => {})
        options.log?.('meta.corrupt', { code: 'STATE_CORRUPT' })
        cache = emptyState()
      }
    }
    return /** @type {GoofishState} */ (cache)
  }

  /**
   * 合并写入。写入串行化：两个并发调用各自读-改-写会丢字段。
   *
   * `digest` 特例：只要 patch 里带了 digest，就**整体替换**，不做浅合并——
   * 它只有 scheduleId 一个字段，调用方永远知道完整内容；浅合并没有清空的办法（clear 会失败）。
   * @param {Partial<GoofishState>} patch
   */
  async function update(patch) {
    const current = await read()
    const nextDigest = patch.digest === undefined ? current.digest : { ...patch.digest }
    cache = { ...current, ...patch, digest: nextDigest }
    await mkdir(stateDir(projectDir), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(cache, null, 2), 'utf8')
    await rename(temp, file)
    return cache
  }

  return {
    read,
    update,
    /** 配置里的 projectDir 变了要丢掉缓存。 */
    reset() {
      cache = null
    },
    file,
  }
}

/** @typedef {ReturnType<typeof createMeta>} MetaStore */
