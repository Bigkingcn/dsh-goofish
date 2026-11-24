// @ts-check
// 配置读取与校验的单测。重点：volatile 字段（引用）也要能读到值。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createConfig, DEFAULT_PROJECT_DIR, validateConfig } from '../src/config.js'

test('空配置落到默认值', () => {
  const cfg = createConfig({})
  assert.equal(cfg.projectDir, DEFAULT_PROJECT_DIR)
  assert.equal(cfg.port, 8765)
  assert.equal(cfg.timeZone, 'Asia/Shanghai')
  assert.equal(cfg.digestWindowHours, 24)
  assert.deepEqual(cfg.ai, { baseUrl: '', model: '' })
})

test('volatile 字段支持 { get } 引用', () => {
  let hours = 6
  const cfg = createConfig({ staleDays: { get: () => 3 }, digest: { windowHours: { get: () => hours } } })
  assert.equal(cfg.staleDays, 3)
  assert.equal(cfg.digestWindowHours, 6)
  // 引用是活读：改了之后下一次读就变
  hours = 12
  assert.equal(cfg.digestWindowHours, 12)
})

test('合法配置通过校验', () => {
  const result = validateConfig(createConfig({ projectDir: 'D:\\goofish\\ai-goofish-monitor' }))
  assert.deepEqual(result, { ok: true, errors: [] })
})

test('相对路径、空格、非 ASCII 都被挡住', () => {
  for (const projectDir of ['ai-goofish-monitor', 'F:\\Program Files\\goofish', 'F:\\项目\\goofish']) {
    const result = validateConfig(createConfig({ projectDir }))
    assert.equal(result.ok, false, projectDir)
    assert.ok(result.errors.some((line) => line.includes('projectDir')))
  }
})

test('端口非法被挡住', () => {
  assert.equal(validateConfig(createConfig({ port: 0 })).ok, false)
  assert.equal(validateConfig(createConfig({ port: 70000 })).ok, false)
})

test('pythonPath / gitPath 要么留空要么绝对路径', () => {
  assert.equal(validateConfig(createConfig({ pythonPath: 'python' })).ok, false)
  assert.equal(validateConfig(createConfig({ pythonPath: 'C:\\Python311\\python.exe' })).ok, true)
})
