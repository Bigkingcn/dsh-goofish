// @ts-check
// 日志分类的单测。规则还没用真实日志校准，这些用例钉的是"取最近一次命中"的行为。
import assert from 'node:assert/strict'
import test from 'node:test'
import { classify } from '../src/diagnose.js'

test('识别登录态过期', () => {
  const result = classify('启动任务\n检查登录状态失败：FAIL_SYS_SESSION_EXPIRED\n退出')
  assert.equal(result.category, 'login_expired')
  assert.ok(result.nextStep.includes('账号'))
  assert.ok(result.evidence.length > 0)
})

test('识别风控', () => {
  assert.equal(classify('打开页面\n出现滑块验证码\n等待中').category, 'risk_control')
})

test('识别 AI 配置错误', () => {
  assert.equal(classify('调用 openai 失败\nstatus=401').category, 'ai_error')
})

test('识别网络问题', () => {
  assert.equal(classify('请求超时 timeout after 15000ms').category, 'network')
})

test('多类命中时取日志里最靠后的那一类', () => {
  const text = ['调用 openai 失败 401', '网络 timeout', '再次检查登录：cookie 失效'].join('\n')
  assert.equal(classify(text).category, 'login_expired')
})

test('未知失败附最后 5 行并给下一步', () => {
  const text = Array.from({ length: 8 }, (_, i) => `第 ${i} 行`).join('\n')
  const result = classify(text)
  assert.equal(result.category, 'unknown')
  assert.equal(result.evidence.length, 5)
  assert.ok(result.nextStep.length > 0)
})

test('空日志不抛错', () => {
  const result = classify('')
  assert.equal(result.category, 'unknown')
  assert.deepEqual(result.evidence, [])
})

test('证据行被截断，不返回整段日志', () => {
  const long = 'x'.repeat(3000)
  const result = classify(`timeout ${long}`)
  assert.ok(result.evidence.every((line) => Array.from(line).length <= 161))
})
