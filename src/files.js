// @ts-check
// 只读文件访问：上游 state\*.json 的修改时间、熔断文件 logs\task-failure-guard.json。
//
// 上游在 Windows 上自己也不加锁，所以这里也只读、并容忍读到半截内容：
// 解析失败就当没有，绝不重命名、不修改、不修复上游的文件。

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** 账号名要拼进路径，先按白名单校验，挡住 ..\ 之类的路径穿越。 */
const ACCOUNT_NAME = /^[a-zA-Z0-9_-]{1,50}$/

/**
 * @param {string} projectDir
 */
export function createFiles(projectDir) {
  /**
   * 每个账号的登录态文件最后修改时间。上游把它当"cookie 什么时候更新的"使用。
   * @param {string[]} names
   * @returns {Promise<Record<string, string>>} 账号名 → ISO 时间
   */
  async function accountFileTimes(names) {
    /** @type {Record<string, string>} */
    const out = {}
    for (const name of names) {
      if (!ACCOUNT_NAME.test(name)) continue
      try {
        const info = await stat(join(projectDir, 'state', `${name}.json`))
        out[name] = info.mtime.toISOString()
      } catch {
        // 文件不存在：账号是刚导入的，或者上游换了存储方式。留空，不报错。
      }
    }
    return out
  }

  /**
   * 熔断文件。键是任务名还是任务 ID 取决于上游爬虫子进程传的 task_key，
   * M0 才确认，所以这里两种都保留，调用方两边都匹配。
   * @returns {Promise<Array<{key: string, pausedUntil: string, consecutiveFailures: number, lastFailureReason: string, lastFailureAt: string}>>}
   */
  async function readGuard() {
    /** @type {any} */
    let parsed
    try {
      parsed = JSON.parse(await readFile(join(projectDir, 'logs', 'task-failure-guard.json'), 'utf8'))
    } catch {
      return []
    }
    /** @type {Record<string, any>} */
    const tasks = parsed?.tasks
    if (!tasks || typeof tasks !== 'object') return []
    return Object.entries(tasks)
      .filter(([, row]) => row && typeof row === 'object')
      .map(([key, row]) => ({
        key,
        pausedUntil: String(row.paused_until ?? ''),
        consecutiveFailures: Number(row.consecutive_failures) || 0,
        lastFailureReason: String(row.last_failure_reason ?? ''),
        lastFailureAt: String(row.last_failure_at ?? ''),
      }))
  }

  /**
   * 还在暂停期内的任务。
   * @param {Awaited<ReturnType<typeof readGuard>>} entries
   * @param {Date} now
   */
  function pausedTasks(entries, now = new Date()) {
    return entries.filter((entry) => {
      if (!entry.pausedUntil) return false
      const until = Date.parse(entry.pausedUntil)
      return Number.isFinite(until) && until > now.getTime()
    })
  }

  /**
   * 任务是否受熔断影响。任务名和任务 ID 都试——这就是"两种键都匹配"。
   * @param {Awaited<ReturnType<typeof readGuard>>} entries
   * @param {{name: string, id: string}} task
   */
  function guardFor(entries, task) {
    return entries.find((entry) => entry.key === task.name || entry.key === task.id) ?? null
  }

  /**
   * state 目录下的账号文件名（不读内容）。上游 /api/accounts 不可用时的兜底。
   * @returns {Promise<string[]>}
   */
  async function accountFileNames() {
    try {
      const names = await readdir(join(projectDir, 'state'))
      return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).filter((name) => ACCOUNT_NAME.test(name))
    } catch {
      return []
    }
  }

  return { accountFileTimes, readGuard, pausedTasks, guardFor, accountFileNames }
}

/** @typedef {ReturnType<typeof createFiles>} FilesApi */
