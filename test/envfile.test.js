// @ts-check
// .env 区块管理的单测：区块外一个字节都不能动，这是这个模块存在的理由。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeBlock, readBlock, renderBlock } from '../src/runtime/envfile.js'

const values = { port: 8765, aiBaseUrl: '', aiModel: '', webPassword: 'pw-123' }

test('空文件只写入区块', () => {
  const merged = mergeBlock('', values)
  assert.equal(merged, renderBlock(values, '\n') + '\n')
})

test('已有其他配置时追加，且不改动原有行', () => {
  const original = 'WEBHOOK_URL=https://example/hook\nOTHER=1\n'
  const merged = mergeBlock(original, values)
  assert.ok(merged.startsWith(original))
  assert.equal(readBlock(merged)?.SERVER_PORT, '8765')
  assert.equal(readBlock(merged)?.WEB_PASSWORD, 'pw-123')
})

test('原文件最后一行没有换行时不会把两行粘在一起', () => {
  const merged = mergeBlock('A=1', values)
  assert.ok(merged.startsWith('A=1\n'))
})

test('区块存在时只替换区块内部，前后内容保留', () => {
  const first = mergeBlock('BEFORE=1\n', values)
  const changed = mergeBlock(first, { ...values, port: 9000 })
  assert.ok(changed.startsWith('BEFORE=1\n'))
  assert.equal(readBlock(changed)?.SERVER_PORT, '9000')
  const after = mergeBlock(`${changed}AFTER=2\n`, { ...values, port: 9001 })
  assert.ok(after.endsWith('AFTER=2\n'))
  assert.equal(readBlock(after)?.SERVER_PORT, '9001')
})

test('保留 CRLF 换行风格', () => {
  const merged = mergeBlock('A=1\r\n', values)
  assert.ok(merged.includes('SERVER_PORT=8765\r\n'))
  assert.ok(!/[^\r]\n/.test(merged))
})

test('区块里不写 API 密钥', () => {
  const merged = mergeBlock('', values)
  assert.ok(!merged.includes('OPENAI_API_KEY'))
})

test('重复应用同一次配置没有变化', () => {
  const once = mergeBlock('', values)
  assert.equal(mergeBlock(once, values), once)
})

test('readBlock 在没有区块时返回 null', () => {
  assert.equal(readBlock('A=1\n'), null)
})
