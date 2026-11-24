// @ts-check
// 控制器里那些纯函数的单测：结果文件归一、筛选排序、任务请求体、候选提示、告警摘要。
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAlerts, buildTaskBody, nearest, normalizeFiles, selectResults } from '../src/controller.js'

test('normalizeFiles 兼容字符串与对象两种写法', () => {
  const files = normalizeFiles({ files: ['4090_full_data.jsonl', { filename: 'switch_full_data.jsonl', keyword: 'switch' }] })
  assert.equal(files.length, 2)
  assert.equal(files[0].file, '4090_full_data.jsonl')
  assert.equal(files[1].keyword, 'switch')
  assert.equal(normalizeFiles(null).length, 0)
})

/** 造一条最小结果项。 */
function item({ id = '1', price = 100, recommended = false, hidden = false, crawledAt = '2026-11-20 10:00:00' } = {}) {
  return {
    '商品信息': { '商品ID': id, '当前售价': `¥${price}`, '商品链接': `https://www.goofish.com/item?id=${id}` },
    爬取时间: crawledAt,
    ai_analysis: { is_recommended: recommended },
    price_insight: { current_price: price },
    _effective_hidden: hidden,
  }
}

test('selectResults 默认隐藏已隐藏条目', () => {
  const rows = selectResults([item({ id: '1' }), item({ id: '2', hidden: true })])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].core.itemId, '1')
  assert.equal(selectResults([item({ id: '2', hidden: true })], { includeHidden: true }).length, 1)
})

test('selectResults 支持只推荐与按价格排序', () => {
  const rows = [item({ id: 'a', price: 300 }), item({ id: 'b', price: 100, recommended: true })]
  assert.equal(selectResults(rows, { recommendedOnly: true }).length, 1)
  const asc = selectResults(rows, { sortBy: 'price', sortOrder: 'asc' })
  assert.deepEqual(asc.map((row) => row.core.itemId), ['b', 'a'])
  const desc = selectResults(rows, { sortBy: 'price', sortOrder: 'desc' })
  assert.deepEqual(desc.map((row) => row.core.itemId), ['a', 'b'])
})

test('selectResults 按 since_hours 过滤，时间解析不了时保留', () => {
  const rows = [item({ id: 'old', crawledAt: '2020-01-01 00:00:00' }), item({ id: 'bad', crawledAt: '' })]
  const rows2 = selectResults(rows, { sinceHours: 24 })
  assert.deepEqual(rows2.map((row) => row.core.itemId), ['bad'])
})

test('buildTaskBody 只透明白名单字段并把价格转字符串', () => {
  const body = buildTaskBody({ task_name: 't', keyword: 'k', mode: 'ai', min_price: 100, evil: 'x' })
  assert.equal(body.task_name, 't')
  assert.equal(body.min_price, '100')
  assert.equal(body.evil, undefined)
  // 新建时补齐上游必填项
  assert.equal(body.free_shipping, true)
  assert.equal(body.max_pages, 3) // 上游 max_pages 是 int
  assert.equal(buildTaskBody({ keyword: 'k' }, { partial: true }).max_pages, undefined)
})

test('nearest 给出最接近的任务名', () => {
  assert.deepEqual(nearest(['4090 显卡', 'switch 游戏机', '相机'], '4090顯示卡', 2).length, 2)
  assert.equal(nearest(['4090 显卡', 'switch', '相机'], 'switch', 1)[0], 'switch')
})

test('buildAlerts 汇总服务、账号、熔断与 AI 配置', () => {
  const alerts = buildAlerts({
    online: false,
    runtime: { state: 'stopped', message: '已停止' },
    accounts: [{ name: 'alice', stale: true }],
    paused: [{ key: '4090', pausedUntil: '2026-11-21T10:00:00+08:00', lastFailureReason: '登录失效' }],
    aiConfigured: false,
  })
  const kinds = alerts.map((row) => row.kind)
  assert.deepEqual(kinds.sort(), ['account', 'ai', 'guard', 'runtime'])
  assert.ok(alerts.some((row) => row.level === 'error'))
})
