// @ts-check
// 汇报定时任务的单测：用一个假 schedule 服务验证创建、更新、删除三件事。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfig } from '../src/config.js'
import { createDigest } from '../src/digest.js'
import { createMeta } from '../src/runtime/meta.js'

/** 假 schedule：只记调用，不落盘。 */
function fakeSchedule() {
  const calls = { create: [], edit: [], view: [] }
  /** @type {any} */
  let stored = null
  return {
    calls,
    async create(request) {
      calls.create.push(request)
      stored = { id: 'schedule-1', ...request, updatedAt: '2026-11-20T00:00:00Z' }
      return stored
    },
    async edit(request) {
      calls.edit.push(request)
      if (request.action === 'update' && stored) stored = { ...stored, ...request.patch, updatedAt: '2026-11-20T01:00:00Z' }
      return {}
    },
    async view({ id }) {
      calls.view.push(id)
      if (!stored || stored.id !== id) throw new Error('not found')
      return stored
    },
  }
}

/** @returns {Promise<{dir: string, meta: any, cfg: any}>} */
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-digest-'))
  const meta = createMeta(dir)
  const cfg = createConfig({ projectDir: dir.replace(/\//g, '\\') })
  return { dir, meta, cfg }
}

test('没有 schedule 服务时 get 报不可用，set 抛错', async () => {
  const { dir, meta, cfg } = await setup()
  try {
    const digest = createDigest({ cfg, meta, schedule: undefined })
    const info = await digest.get()
    assert.equal(info.available, false)
    await assert.rejects(() => digest.set({}), /schedule/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('建立汇报并写入 state，再次 set 走更新', async () => {
  const { dir, meta, cfg } = await setup()
  try {
    const schedule = fakeSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({ windowHours: 12 })
    assert.equal(schedule.calls.create.length, 1)
    // 提示词里带上了窗口小时数
    assert.ok(schedule.calls.create[0].prompt.includes('12'))
    assert.equal(schedule.calls.create[0].target.kind, 'new_once')
    assert.equal((await meta.read()).digest.scheduleId, 'schedule-1')

    await digest.set({ windowHours: 24 })
    assert.equal(schedule.calls.create.length, 1, '第二次 set 应该更新而不是再建一条')
    assert.equal(schedule.calls.edit.length, 1)
    assert.ok(schedule.calls.edit[0].patch.prompt.includes('24'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('多个时间点用 rrule 表达（分钟相同）', async () => {
  const { dir, meta, cfg } = await setup()
  try {
    const schedule = fakeSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({ times: ['09:30', '18:30'] })
    const timing = schedule.calls.create[0].timing
    assert.equal(timing.kind, 'rrule')
    assert.ok(timing.rrule.includes('BYHOUR=9,18'))
    assert.ok(timing.rrule.includes('BYMINUTE=30'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('单个时间点用 cron，并带上时区', async () => {
  const { dir, meta, cfg } = await setup()
  try {
    const schedule = fakeSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({ times: ['07:05'] })
    const timing = schedule.calls.create[0].timing
    assert.equal(timing.kind, 'cron')
    assert.equal(timing.cron.expression, '5 7 * * *')
    assert.equal(timing.cron.time_zone, 'Asia/Shanghai')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('clear 删除定时任务并清掉 state 里的 id', async () => {
  const { dir, meta, cfg } = await setup()
  try {
    const schedule = fakeSchedule()
    const digest = createDigest({ cfg, meta, schedule })
    await digest.set({})
    const result = await digest.clear()
    assert.equal(result.removed, true)
    assert.equal((await meta.read()).digest.scheduleId, undefined)
    assert.equal(schedule.calls.edit.at(-1).action, 'delete')
    // 再 clear 一次是无操作
    assert.equal((await digest.clear()).removed, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
