// @ts-check
// 定时汇报：只有一条 schedule，覆盖所有启用的任务（技术文档 D1）。
//
// 为什么只有一条：new_once 的会话要到第一次投递时才创建，而多个定时任务没法定向到
// "同一个还不存在的会话"。一条任务 + 一句提示词 = 天然固定在同一个会话里。
// schedule 是可选服务：没有它时面板显示"不可用"，而不是让整个插件加载失败。

import { GoofishError } from './errors.js'
import { digestPrompt } from './prompt.js'

const TITLE = '闲鱼监控汇报'

/**
 * @param {object} options
 * @param {import('./config.js').GoofishConfig} options.cfg
 * @param {import('./runtime/meta.js').MetaStore} options.meta
 * @param {any} options.schedule schedule 服务，或返回它的函数（`() => ctx.get('schedule')`），可能为 undefined。
 *   传函数是为了**每次使用时再取**：装配时 schedule 服务可能还没就绪，若在加载时就取一次并缓存，
 *   它晚一步上线后汇报功能会一直显示"不可用"。
 * @param {(event: string, fields?: Record<string, unknown>) => void} [options.log]
 */
export function createDigest({ cfg, meta, schedule: scheduleOrGetter, log }) {
  const current = () => (typeof scheduleOrGetter === 'function' ? scheduleOrGetter() : scheduleOrGetter)
  const isAvailable = () => {
    const service = current()
    return Boolean(service && typeof service.create === 'function')
  }

  /**
   * 生成 timing。默认每天 9:30（用户所在时区）。
   *
   * 多个时间点用 rrule 的 BYHOUR。但 RRULE 的 BYHOUR × BYMINUTE 是**笛卡尔积**：
   * 09:30 和 18:45 写成 BYHOUR=9,18;BYMINUTE=30,45 会变成 09:30、09:45、18:30、18:45 四个点。
   * 表达不了"每个小时配不同的分钟"，所以多个时间点必须分钟相同，否则明说，不要悄悄多发。
   * @param {string[]} times 'HH:MM' 列表
   */
  function timing(times) {
    const zone = cfg.timeZone
    const wanted = times.length ? times : ['09:30']
    for (const time of wanted) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(time))
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
        throw new GoofishError({ code: 'INTERNAL', message: `汇报时间「${time}」不合法`, hint: '用 24 小时制的 HH:MM，例如 09:30' })
      }
    }
    const hours = Array.from(new Set(wanted.map(hourOf))).sort((a, b) => Number(a) - Number(b))
    const minutes = Array.from(new Set(wanted.map(minuteOf)))
    if (minutes.length > 1) {
      throw new GoofishError({
        code: 'INTERNAL',
        message: `多个汇报时间的分钟必须相同（收到 ${wanted.join('、')}）`,
        hint: '例如 09:30 和 18:30；要不同的分钟数，请分别建两个定时任务（面板不支持，需在「定时任务」页手动加）',
      })
    }
    if (hours.length === 1) {
      return { kind: 'cron', cron: { expression: `${minutes[0]} ${hours[0]} * * *`, time_zone: zone } }
    }
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T000000`
    return { kind: 'rrule', rrule: `DTSTART;TZID=${zone}:${stamp}\nRRULE:FREQ=DAILY;BYHOUR=${hours.join(',')};BYMINUTE=${minutes[0]}` }
  }

  /** 当前汇报配置（读 state + schedule 视图）。 */
  async function get() {
    const state = await meta.read()
    const id = state.digest?.scheduleId ?? ''
    if (!isAvailable()) {
      return { available: false, id, title: TITLE, scheduleId: id, view: null, reason: '当前 profile 没有 schedule 服务' }
    }
    if (!id) return { available: true, id: '', title: TITLE, scheduleId: '', view: null, windowHours: cfg.digestWindowHours }
    try {
      const view = await current().view({ id })
      return { available: true, id, title: TITLE, scheduleId: id, view, windowHours: cfg.digestWindowHours }
    } catch (error) {
      // 定时任务被用户在别处删掉了：报出来，但不要偷偷重建
      return { available: true, id, title: TITLE, scheduleId: id, view: null, missing: true, reason: error instanceof Error ? error.message : String(error), windowHours: cfg.digestWindowHours }
    }
  }

  /**
   * 建立或更新汇报。
   *
   * 已存在就更新；**只有确认它已经不存在时才新建**。更新本身失败（冲突、校验不过）必须如实抛出——
   * 以前把更新的错误也当成"不存在"去新建，结果旧的还在跑、又多出一条，每天汇报两次。
   * @param {{times?: string[], windowHours?: number}} [options]
   */
  async function set(options = {}) {
    if (!isAvailable()) {
      throw new GoofishError({ code: 'INTERNAL', message: '当前 profile 没有 schedule 服务，无法建立定时汇报', hint: '在 profile 里加载 @deepseek-ai/dsh-schedule，或先不用汇报功能' })
    }
    const schedule = current()
    const windowHours = Number(options.windowHours ?? cfg.digestWindowHours) || 24
    const prompt = digestPrompt({ windowHours })

    const state = await meta.read()
    const existing = state.digest?.scheduleId ?? ''
    if (existing) {
      /** @type {any} */
      let view = null
      try {
        view = await schedule.view({ id: existing })
      } catch (error) {
        // 看不到它：用户在定时任务页删掉了。往下走，重新建一条
        log?.('digest.recreate', { state: 'missing', code: /** @type {any} */ (error)?.code })
      }
      if (view) {
        // 只有调用方明确给了 times 才改时间；否则保留用户在定时任务页里调整过的时间
        const patch = { title: TITLE, prompt, active: true, ...(options.times?.length ? { timing: timing(options.times) } : {}) }
        const result = await schedule.edit({
          id: existing,
          action: 'update',
          patch,
          ...(view?.updatedAt ? { expectedUpdatedAt: view.updatedAt } : {}),
        })
        // 冲突不抛异常，而是返回 { code: 'schedule_conflict' }
        if (result?.code) {
          throw new GoofishError({ code: 'INTERNAL', message: `更新汇报失败：${result.code}`, hint: '汇报刚被别处改过，刷新后再试一次' })
        }
        log?.('digest.update', { state: 'ok' })
        return get()
      }
    }

    const created = await schedule.create({ title: TITLE, prompt, timing: timing(options.times ?? []), target: { kind: 'new_once' } })
    await meta.update({ digest: { scheduleId: created.id } })
    log?.('digest.create', { state: 'ok' })
    return get()
  }

  /** 删除汇报。只在用户明确要求时调用——插件卸载不自动删（配置变化也会重启插件）。 */
  async function clear() {
    const state = await meta.read()
    const id = state.digest?.scheduleId ?? ''
    if (!id) return { removed: false }
    if (isAvailable()) {
      try {
        await current().edit({ id, action: 'delete' })
      } catch (error) {
        log?.('digest.delete.failed', { state: 'failed', code: /** @type {any} */ (error)?.code })
      }
    }
    await meta.update({ digest: {} })
    return { removed: true }
  }

  return {
    get available() {
      return isAvailable()
    },
    get,
    set,
    clear,
    TITLE,
  }
}

/** @param {string} time 'HH:MM' */
function hourOf(time) {
  return String(Number(time.split(':')[0]))
}

/** @param {string} time 'HH:MM' */
function minuteOf(time) {
  return String(Number(time.split(':')[1]))
}

/** @typedef {ReturnType<typeof createDigest>} Digest */
