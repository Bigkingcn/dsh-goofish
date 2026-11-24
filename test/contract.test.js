// @ts-check
// 契约层的单测：缺字段要变成 CONTRACT_DRIFT，空列表不算漂移。
import assert from 'node:assert/strict'
import test from 'node:test'
import { assertShape, jobIdOf, jobTaskOf, listOf } from '../src/upstream/contract.js'

test('合法返回体原样返回', () => {
  const data = { status: 'healthy' }
  assert.equal(assertShape('health', data), data)
})

test('缺字段抛 CONTRACT_DRIFT 并带上端点', () => {
  assert.throws(() => assertShape('health', {}), (error) => {
    assert.equal(/** @type {any} */ (error).code, 'CONTRACT_DRIFT')
    assert.ok(/** @type {any} */ (error).message.includes('/health'))
    return true
  })
})

test('数组端点允许空列表', () => {
  assert.deepEqual(assertShape('tasks', []), [])
})

test('数组端点允许被包在对象里', () => {
  const data = { tasks: [{ id: '1', task_name: 'a' }] }
  assert.equal(assertShape('tasks', data), data)
})

test('数组元素缺必需字段算漂移', () => {
  assert.throws(() => assertShape('tasks', [{ id: '1' }]), /CONTRACT_DRIFT|不一致/)
})

test('null 字段不算缺字段', () => {
  assert.doesNotThrow(() => assertShape('task', { id: '1', task_name: null }))
})

test('generate 接受 job 或 job_id 两种写法', () => {
  assert.doesNotThrow(() => assertShape('generate', { job: { job_id: 'j1' } }))
  assert.doesNotThrow(() => assertShape('generate', { job_id: 'j1' }))
  assert.throws(() => assertShape('generate', {}))
})

test('listOf 兼容数组与对象包装', () => {
  assert.deepEqual(listOf([1, 2]), [1, 2])
  assert.deepEqual(listOf({ accounts: [{ name: 'a' }] }, 'accounts'), [{ name: 'a' }])
  assert.deepEqual(listOf({ files: [] }), [])
  assert.deepEqual(listOf(null), [])
})

test('jobIdOf / jobTaskOf 提取完成态信息', () => {
  assert.equal(jobIdOf({ job: { job_id: 'j1' } }), 'j1')
  assert.equal(jobIdOf({ job_id: 'j2' }), 'j2')
  assert.equal(jobIdOf({}), '')
  assert.deepEqual(jobTaskOf({ task: { id: 't' } }), { id: 't' })
  assert.deepEqual(jobTaskOf({ result: { task: { id: 't2' } } }), { id: 't2' })
})
