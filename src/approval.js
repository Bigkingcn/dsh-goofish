// @ts-check
// 审批：破坏性和系统级动作在 tools/pre-execute 里返回 ask，由 DSH 的审批界面问用户。
//
// 只对两个工具的少数动作要求审批；其他调用一律 next()，绝不吞掉别人的决策——
// pre-execute 是瀑布流，返回 allow 会把后面插件的拒绝覆盖掉。

/** 需要审批的动作。放一张表里，比散在 if 里好核对。 */
const NEEDS_APPROVAL = {
  goofish_service: new Set(['install', 'start', 'stop']),
  goofish_task_edit: new Set(['delete']),
}

/**
 * 这个调用要不要审批。
 * @param {{name: string, arguments?: any}} exec
 */
export function needsApproval(exec) {
  const allowed = NEEDS_APPROVAL[/** @type {keyof typeof NEEDS_APPROVAL} */ (exec.name)]
  if (!allowed) return false
  return allowed.has(String(exec.arguments?.action ?? ''))
}

/**
 * 人话说明。要具体到"删掉哪个任务、会连带什么"，用户才能判断。
 * @param {{name: string, arguments?: any}} exec
 * @param {string} [taskName] 已经解析出来的任务名（拿不到就用 id）
 */
export function describeAction(exec, taskName) {
  const args = exec.arguments ?? {}
  const action = String(args.action ?? '')
  if (exec.name === 'goofish_service') {
    if (action === 'install') return '安装闲鱼监控服务：会在 projectDir 克隆上游、建虚拟环境、下载 Chromium，约占 1–1.5 GB 磁盘并联网下载依赖。'
    if (action === 'start') return '启动闲鱼监控服务：会在本机 127.0.0.1 上拉起 uvicorn，并按计划开始抓取闲鱼。'
    if (action === 'stop') return '停止闲鱼监控服务：正在运行的抓取任务会被中断。'
  }
  if (exec.name === 'goofish_task_edit' && action === 'delete') {
    const label = taskName || args.task_id || '（未知任务）'
    return `删除任务「${label}」：若没有其他任务使用同一关键词，它的结果文件、价格快照和日志也会一起被上游删除，无法恢复。`
  }
  return '这个操作会改变本机状态，需要你确认。'
}

/**
 * 注册审批监听。
 * @param {any} ctx
 * @param {{tasks: {get: (ref: string) => Promise<{name: string}>}}} controller
 * @returns {() => void} 注销函数
 */
export function registerApproval(ctx, controller) {
  return ctx.on('tools/pre-execute', async (exec, next) => {
    if (!needsApproval(exec)) return next()
    // 任务名能让提示具体一点；查不到（服务离线）也不该卡住审批，用 id 顶上
    let taskName
    if (exec.name === 'goofish_task_edit' && exec.arguments?.task_id) {
      taskName = await Promise.race([
        controller.tasks.get(String(exec.arguments.task_id)).then((task) => task.name).catch(() => undefined),
        new Promise((resolve) => setTimeout(() => resolve(undefined), 3000)),
      ])
    }
    const reason = describeAction(exec, taskName)
    return {
      kind: 'ask',
      reason,
      // displayReason 的 en 是必填键，其余语言可选；审批界面按当前语言取
      displayReason: {
        en: reason,
        zh: reason,
      },
    }
  })
}
