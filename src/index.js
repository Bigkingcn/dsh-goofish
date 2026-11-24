// @ts-check
// dsh-goofish 的 Host 入口：装配、注册、清理。
//
// 装配顺序有意固定：先建"读配置和状态"的基础件，再建运行时（它持有子进程），
// 最后才把工具、审批、守卫、HTTP、提示片段挂到 DSH 上——任何一步失败都不会留下半个插件。
// 所有副作用都在 ctx.effect 里注册，卸载时由 Cordis 统一回收。

import { registerApproval } from './approval.js'
import { createConfig, validateConfig } from './config.js'
import { createController } from './controller.js'
import { createDigest } from './digest.js'
import { createFiles } from './files.js'
import { registerGuards } from './guards.js'
import { createHttpHandler } from './http.js'
import { PROMPT_ORDER, systemSection } from './prompt.js'
import { createMeta } from './runtime/meta.js'
import { createRuntime } from './runtime/manager.js'
import { createTools } from './tools.js'
import { createUpstreamClient } from './upstream/client.js'

export const name = 'goofish'

/**
 * tools / webServer / subprocess 是硬依赖；timer 用来做健康监测和输出轮询——
 * Cordis 里不 inject 就直接读 ctx.interval 会抛 "cannot get property without inject"，
 * 所以它必须列在这里，不能靠 typeof 探测。
 */
export const inject = ['tools', 'webServer', 'subprocess', 'timer']

// 注意：这里**不**导出 Config。
// 声明式 Config 需要 @deepseek-ai/schemastery，而以目录/链接方式安装的插件解析不到 DSH 的内部包
// （实测 ERR_MODULE_NOT_FOUND），一旦 import 失败整个插件都不会加载。代价是：
//   - 配置没有类型校验表单，字段说明在 README 里；
//   - 不存在 volatile 字段，改任何配置都会重启插件（服务会跟着重启）。
// 换来的是插件一定能加载，并且 Host 侧零依赖。

/**
 * 日志：只允许白名单字段。上游响应体和账号内容一律不进日志。
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
function log(event, fields = {}) {
  const allowed = ['tool', 'route', 'endpoint', 'status', 'ms', 'state', 'code', 'step', 'method']
  /** @type {Record<string, unknown>} */
  const safe = {}
  for (const key of allowed) if (fields[key] !== undefined) safe[key] = fields[key]
  // console 而不是 ctx.logger：插件没有自己的 logger 实例时也能看到一行
  console.log(`[goofish] ${event} ${JSON.stringify(safe)}`)
}

/**
 * @param {any} ctx
 * @param {any} rawConfig
 */
export function apply(ctx, rawConfig) {
  const cfg = createConfig(rawConfig)
  const validation = validateConfig(cfg)

  const meta = createMeta(cfg.projectDir, { log })
  const upstream = createUpstreamClient({
    port: () => cfg.port,
    timeoutMs: () => cfg.requestTimeoutMs,
    log,
  })
  const runtime = createRuntime({ ctx, cfg, meta, upstream, configValidation: validation, log })
  const files = createFiles(cfg.projectDir)
  // 传函数而不是 ctx.get('schedule') 的当前值：schedule 服务可能比本插件晚就绪
  const digest = createDigest({ cfg, meta, schedule: () => ctx.get('schedule'), log })
  const controller = createController({ cfg, upstream, runtime, files, digest, meta, log })

  // 工具：注册原始 JSON Schema，每个都带 timeoutMs（声明式，真正的超时在各工具里）
  for (const tool of createTools(controller, cfg)) ctx.effect(() => ctx.tools.register(tool))

  // 审批与守卫
  ctx.effect(() => registerApproval(ctx, controller), 'dsh-goofish: approval')
  ctx.effect(() => registerGuards(ctx, { projectDir: cfg.projectDir, port: cfg.port }), 'dsh-goofish: guards')

  // 面板路由
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/goofish', handler: createHttpHandler({ ctx, cfg, controller, log }) }),
    'dsh-goofish: /goofish routes',
  )

  // 系统提示片段（可选服务）
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section({ name: 'goofish', order: PROMPT_ORDER, text: systemSection() }), 'dsh-goofish: prompt')
  }

  // 运行时：加载时按配置启动，卸载时停服务并清理进程
  ctx.effect(() => {
    void runtime.boot().catch((error) => log('runtime.boot.failed', { code: /** @type {any} */ (error)?.code }))
    // 返回 shutdown() 的 Promise 而不是丢掉它：Cordis 会等异步清理完成，
    // 否则 DSH 退出/插件重载时子进程还没杀干净，下次启动就撞上残留
    return () => runtime.shutdown()
  }, 'dsh-goofish: runtime')
}
