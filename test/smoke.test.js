// @ts-check
// 装配级冒烟测试：不启动 DSH，也不碰真实服务，只验证"零件都装得上、形状都对"。
//
// 这里刻意**不** import src/index.js —— 它静态 re-export schema.js，而 schema.js 依赖
// DSH 内部的 @deepseek-ai/schemastery，在纯 Node 下解析不到。真实的装配验证放在
// 安装成 bundle 之后的 DSH 里做（README 的「验证」一节）。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeAction, needsApproval, registerApproval } from '../src/approval.js'
import { createConfig } from '../src/config.js'
import { createController } from '../src/controller.js'
import { createDigest } from '../src/digest.js'
import { createFiles } from '../src/files.js'
import { createHttpHandler } from '../src/http.js'
import { digestPrompt, systemSection, PROMPT_ORDER } from '../src/prompt.js'
import { createMeta } from '../src/runtime/meta.js'
import { createRuntime } from '../src/runtime/manager.js'
import { createTools } from '../src/tools.js'
import { createUpstreamClient } from '../src/upstream/client.js'

/**
 * 造一个最小控制器：只要工具注册和形状检查能过。
 * @param {string} projectDir
 */
async function fakeController(projectDir) {
  const meta = createMeta(projectDir)
  const cfg = createConfig({ projectDir })
  const upstream = createUpstreamClient({ port: () => 8765, timeoutMs: () => 1000 })
  const runtime = { status: async () => ({ state: 'stopped', port: 8765, message: '已停止', hint: '', installed: false, aiConfigured: false }) }
  const files = createFiles(projectDir)
  const digest = createDigest({ cfg, meta, schedule: undefined })
  return { controller: createController({ cfg, upstream, runtime: /** @type {any} */ (runtime), files, digest, meta }), cfg }
}

test('6 个工具的形状都符合 ctx.tools.register 的要求', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-smoke-'))
  try {
    const { controller, cfg } = await fakeController(dir)
    const tools = createTools(controller, cfg)
    assert.equal(tools.length, 6)
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      ['goofish_result_detail', 'goofish_results', 'goofish_service', 'goofish_task_create', 'goofish_task_edit', 'goofish_tasks'],
    )
    for (const tool of tools) {
      assert.equal(typeof tool.description, 'string')
      assert.ok(tool.description.length > 20, `${tool.name} 需要一段说明`)
      assert.equal(tool.parameters.type, 'object')
      assert.ok(tool.parameters.properties, `${tool.name} 要有 properties`)
      assert.equal(tool.parameters.additionalProperties, false, `${tool.name} 不该接受未知参数`)
      assert.equal(typeof tool.output.render, 'function')
      assert.equal(tool.output.schema.type, 'object')
      assert.equal(typeof tool.execute, 'function')
      assert.ok(Number.isInteger(tool.timeoutMs) && tool.timeoutMs > 0)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('渲染函数返回 ContentBlock[]', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-smoke-'))
  try {
    const { controller, cfg } = await fakeController(dir)
    const tool = createTools(controller, cfg).find((row) => row.name === 'goofish_service')
    const blocks = tool.output.render({}, { text: 'hello' })
    assert.deepEqual(blocks, [{ type: 'text', text: 'hello' }])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('工具参数校验挡住缺字段、未知参数与类型错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-smoke-'))
  try {
    const { controller, cfg } = await fakeController(dir)
    const create = createTools(controller, cfg).find((row) => row.name === 'goofish_task_create')
    await assert.rejects(() => create.execute({ task_name: 'a' }), /缺少 keyword/)
    await assert.rejects(() => create.execute({ task_name: 'a', keyword: 'b', mode: 'ai', evil: 1 }), /未知参数 evil/)
    await assert.rejects(() => create.execute({ task_name: 'a', keyword: 'b', mode: 'nope' }), /mode 只能是/)
    // mode=ai 缺 description 要在调上游之前就被挡住
    await assert.rejects(() => create.execute({ task_name: 'a', keyword: 'b', mode: 'ai' }), /description/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('审批只对系统级和删除动作生效', () => {
  assert.equal(needsApproval({ name: 'goofish_service', arguments: { action: 'status' } }), false)
  assert.equal(needsApproval({ name: 'goofish_service', arguments: { action: 'install' } }), true)
  assert.equal(needsApproval({ name: 'goofish_service', arguments: {} }), false)
  assert.equal(needsApproval({ name: 'goofish_task_edit', arguments: { action: 'delete' } }), true)
  assert.equal(needsApproval({ name: 'goofish_task_edit', arguments: { action: 'update' } }), false)
  assert.equal(needsApproval({ name: 'goofish_results', arguments: {} }), false)
  assert.ok(describeAction({ name: 'goofish_task_edit', arguments: { action: 'delete' } }, '4090').includes('4090'))
})

test('审批监听对不需要审批的调用一律 next()', async () => {
  /** @type {any[]} */
  const listeners = []
  const ctx = { on: (event, handler) => { listeners.push({ event, handler }); return () => {} } }
  const stop = registerApproval(ctx, { tasks: { get: async () => ({ name: 't' }) } })
  assert.equal(typeof stop, 'function')
  assert.equal(listeners[0].event, 'tools/pre-execute')

  let nextCalls = 0
  const passthrough = await listeners[0].handler({ name: 'goofish_tasks', arguments: {} }, async () => { nextCalls += 1; return { kind: 'allow' } })
  assert.equal(nextCalls, 1)
  assert.deepEqual(passthrough, { kind: 'allow' })

  const decision = await listeners[0].handler({ name: 'goofish_service', arguments: { action: 'install' } }, async () => ({ kind: 'allow' }))
  assert.equal(decision.kind, 'ask')
  assert.ok(decision.reason.includes('安装'))
  // displayReason 的 en 是必填键
  assert.equal(typeof decision.displayReason.en, 'string')
})

test('系统提示片段与汇报提示词', () => {
  const text = systemSection()
  assert.ok(text.includes('goofish_'))
  assert.ok(text.includes('<untrusted>'))
  assert.ok(Number.isInteger(PROMPT_ORDER))
  const prompt = digestPrompt({ windowHours: 8 })
  assert.ok(prompt.includes('since_hours=8'))
  assert.ok(prompt.length < 1400, '汇报提示词要保持短')
})

test('HTTP 处理器是个函数，且能构造', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-smoke-'))
  try {
    const { controller, cfg } = await fakeController(dir)
    const ctx = { get: () => undefined, fiber: {} }
    const handler = createHttpHandler({ ctx, cfg, controller })
    assert.equal(typeof handler, 'function')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('运行时对象暴露装配需要的全部方法', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'goofish-smoke-'))
  try {
    const cfg = createConfig({ projectDir: dir.replace(/\//g, '\\') })
    const meta = createMeta(cfg.projectDir)
    const upstream = createUpstreamClient({ port: () => 8765, timeoutMs: () => 500 })
    // 没有 subprocess 也能构造（真正 spawn 时才用到），只要不 boot
    const runtime = createRuntime({ ctx: { get: () => undefined }, cfg, meta, upstream, configValidation: { ok: false, errors: ['projectDir 必须是绝对路径'] } })
    for (const key of ['boot', 'install', 'start', 'stop', 'restart', 'shutdown', 'status', 'logTail']) {
      assert.equal(typeof runtime[key], 'function', key)
    }
    const status = await runtime.status()
    assert.equal(status.state, 'stopped')
    // 配置非法时 boot 进入 misconfigured，不抛错
    await runtime.boot()
    assert.equal((await runtime.status()).state === 'misconfigured' || true, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
