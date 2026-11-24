// @ts-check
// 上游接口契约：只依赖 PRD §8.1 列出的字段子集。
//
// 为什么要有这一层：上游 requirements 没有锁版本，字段可能改。缺字段时我们宁可在
// 一个端点上报 ContractDrift，也不要让面板显示一片空白或把 undefined 当成 0。

import { GoofishError } from '../errors.js'

/** 插件构建时对齐的上游 commit（PRD 决策）。状态里用它判断是否可能漂移。 */
export const BASELINE_COMMIT = '77f8d75869acd65f9dba72731b95c7c49ea67bdf'

/** 上游 FastAPI 的 title，用来确认"这个端口上跑的是不是这个项目"。 */
export const UPSTREAM_TITLE = '闲鱼智能监控机器人'

/**
 * 每个端点的必需字段。`shape` 说明顶层是数组还是对象。
 * 只列我们真正读取的字段；上游新增字段一律忽略。
 * @type {Record<string, {path: string, shape: 'array'|'object', required: string[], alternates?: string[]}>}
 */
export const ENDPOINTS = {
  health: { path: '/health', shape: 'object', required: ['status'] },
  summary: { path: '/api/dashboard/summary', shape: 'object', required: ['summary'] },
  tasks: { path: '/api/tasks', shape: 'array', required: ['id', 'task_name'], alternates: ['tasks'] },
  task: { path: '/api/tasks/{id}', shape: 'object', required: ['id', 'task_name'] },
  // AI 模式返回 202 {message, job:{job_id,...}}；关键词模式同步返回 200 {message, task}
  generate: { path: '/api/tasks/generate', shape: 'object', required: ['job'], alternates: ['job_id', 'task'] },
  // 作业状态包在 job 里：{job:{job_id,status,message,task,error,...}}
  generateJob: { path: '/api/tasks/generate-jobs/{job}', shape: 'object', required: ['job'] },
  resultFiles: { path: '/api/results/files', shape: 'object', required: ['files'] },
  resultFile: { path: '/api/results/{file}', shape: 'object', required: ['items'], alternates: ['total_items'] },
  resultInsights: { path: '/api/results/{file}/insights', shape: 'object', required: [], alternates: ['insights'] },
  accounts: { path: '/api/accounts', shape: 'array', required: ['name'] },
  logsTail: { path: '/api/logs/tail', shape: 'object', required: ['content'] },
}

/**
 * 上游把列表包在对象里（{tasks:[...]}）还是直接返回数组，不同版本不一样。
 * 这里做一次归一，后面的代码只处理数组。
 * @param {unknown} data
 * @param {string} [key]
 * @returns {unknown[]}
 */
export function listOf(data, key) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const record = /** @type {Record<string, unknown>} */ (data)
    if (key && Array.isArray(record[key])) return /** @type {unknown[]} */ (record[key])
    for (const value of Object.values(record)) if (Array.isArray(value)) return value
  }
  return []
}

/**
 * 检查一个端点返回体是否符合基线。
 *
 * 数组端点检查"至少能取出一个元素且元素有必需字段"——空列表是合法的（新装没有任务）。
 * @param {string} name ENDPOINTS 的键
 * @param {unknown} data
 * @param {{installedCommit?: string}} [state]
 * @returns {unknown} 原样返回，方便链式调用
 */
export function assertShape(name, data, state) {
  const spec = ENDPOINTS[name]
  if (!spec) throw new Error(`未知端点 ${name}`)

  const drift = (missing) => {
    throw new GoofishError({
      code: 'CONTRACT_DRIFT',
      message: `上游接口 /${name} 的返回与基线 ${state?.installedCommit ?? BASELINE_COMMIT} 不一致（缺少 ${missing.join('、')}）`,
      hint: '插件可能需要更新；先到面板「运行」页看安装的 commit，必要时重新安装',
    })
  }

  if (spec.shape === 'array') {
    const list = listOf(data, spec.alternates?.[0])
    if (list.length === 0) return data
    const sample = list[0]
    if (!sample || typeof sample !== 'object') drift(['列表元素'])
    const missing = spec.required.filter((field) => !hasField(sample, field))
    if (missing.length) drift(missing)
    return data
  }

  if (!data || typeof data !== 'object') drift(['返回体'])
  const record = /** @type {Record<string, unknown>} */ (data)
  // 有 alternate 时任意一个命中即可（例如 generate 可能给 {job:{...}} 也可能给 {job_id}）
  const missing = spec.required.filter((field) => {
    if (hasField(record, field)) return false
    return !(spec.alternates ?? []).some((alt) => hasField(record, alt))
  })
  if (missing.length) drift(missing)
  return data
}

/**
 * 字段存在且不是 undefined。允许 null —— 上游用 null 表示"没有这个值"，
 * 那是合法状态，不该算漂移。
 * @param {unknown} object
 * @param {string} field
 */
function hasField(object, field) {
  if (!object || typeof object !== 'object') return false
  return Object.hasOwn(/** @type {Record<string, unknown>} */ (object), field)
}

/**
 * 生成任务的端点把作业放在 job 里（{job:{job_id,...}}），统一取 job id。
 * @param {unknown} data
 * @returns {string}
 */
export function jobIdOf(data) {
  const record = /** @type {any} */ (data)
  const job = record?.job ?? record
  const id = job?.job_id ?? job?.id ?? record?.job_id
  return typeof id === 'string' ? id : ''
}

/**
 * 取作业对象本身。轮询接口返回 {job:{...}}，下面的状态、task、error 都在 job 里；
 * 只认顶层会永远读到空状态，一直轮询到超时。
 * @param {unknown} data
 * @returns {any}
 */
export function jobOf(data) {
  const record = /** @type {any} */ (data)
  return record?.job ?? record ?? null
}

/**
 * 完成态的任务在 job.task 里（上游 TaskGenerationJob.task）。
 * @param {unknown} data
 */
export function jobTaskOf(data) {
  const job = jobOf(data)
  return job?.task ?? job?.result?.task ?? null
}

/**
 * 上游结果文件名规则：关键词里的 ASCII 空格换成下划线，再加 _full_data.jsonl。
 * 与上游 build_result_filename 保持一致——靠它能精确定位任务的结果文件，不用靠猜。
 * @param {unknown} keyword
 */
export function buildResultFilename(keyword) {
  return `${String(keyword ?? '').replace(/ /g, '_')}_full_data.jsonl`
}
