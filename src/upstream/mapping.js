// @ts-check
// 字段映射：上游的中文键 → 插件统一的英文键。
//
// 两条硬规则：
// 1. 结构化字段（价格、链接、时间、ID）进 core，自由文本（标题、昵称、AI 理由）进 untrusted。
//    模型看到的 untrusted 一律包在 <untrusted> 里，它是数据不是指令。
// 2. 所有对外文本都先 clean + clip：去掉控制字符、折叠空白、按码点截断。
//    上游内容来自第三方，长度和字符集都不可控。

/** 控制字符（保留空格）；DEL 也去掉。 */
const CONTROL = /[\u0000-\u001f\u007f]/g
/** 连续空白折叠成一个半角空格。 */
const BLANKS = /\s+/g

/**
 * 去掉控制字符并折叠空白。控制字符会把终端和日志搅乱，还会伪装成换行。
 * @param {unknown} value
 * @returns {string}
 */
export function clean(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(CONTROL, '').replace(BLANKS, ' ').trim()
}

/**
 * 按码点截断，超长补省略号。按码点而不是 UTF-16 单元，避免把 emoji 劈成半个。
 * @param {string} text
 * @param {number} limit
 * @returns {string}
 */
export function clip(text, limit) {
  const points = Array.from(text)
  if (points.length <= limit) return text
  return points.slice(0, limit).join('') + '…'
}

/**
 * 只放行 https 链接；http 图片地址升级到 https；其余（javascript:、data:、file:）返回 null。
 * 商品链接会进 <a href>，所以这里必须是白名单而不是黑名单。
 * @param {unknown} value
 * @returns {string|null}
 */
export function safeUrl(value) {
  const raw = clean(value)
  if (!raw) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol === 'https:') return url.toString()
  if (url.protocol === 'http:') {
    url.protocol = 'https:'
    return url.toString()
  }
  return null
}

/**
 * 解析上游的中文/带货币符号的价格文本。
 * 支持 `¥4,520`、`4520.00`、`1.2万`；`面议`、"起"之类没有数字的返回 null。
 * 有"万"时只按万算，不再猜"万"是修饰还是单位——上游只在这种写法里用万。
 * @param {unknown} value
 * @returns {number|null}
 */
export function parsePrice(value) {
  const text = clean(value).replace(/[¥￥,\s]/g, '')
  if (!text) return null
  const match = /(\d+(?:\.\d+)?)/.exec(text)
  if (!match) return null
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  const wanIndex = text.indexOf('万')
  const price = wanIndex !== -1 && wanIndex >= match.index ? base * 10000 : base
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : null
}

/**
 * 数字化的价格：优先用上游算好的 price_insight.current_price，没有才解析原文。
 * @param {unknown} insightPrice
 * @param {unknown} priceText
 * @returns {number|null}
 */
function toPrice(insightPrice, priceText) {
  const direct = typeof insightPrice === 'number' ? insightPrice : parsePrice(insightPrice)
  if (direct !== null && Number.isFinite(direct)) return direct
  return parsePrice(priceText)
}

/** @param {unknown} value */
function str(value) {
  return value === null || value === undefined ? '' : clean(value)
}

/** @param {unknown} value */
function num(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(clean(value))
  return Number.isFinite(parsed) ? parsed : null
}

/** 只挑白名单字段，避免把上游新增字段一路透传出去。 */
function pick(source, keys) {
  /** @type {Record<string, unknown>} */
  const out = {}
  if (!source || typeof source !== 'object') return out
  for (const key of keys) {
    const value = /** @type {Record<string, unknown>} */ (source)[key]
    if (value !== undefined && value !== null) out[key] = typeof value === 'number' ? value : clean(value)
  }
  return out
}

/**
 * 结果项 → { core, untrusted }。
 * core 是可信的结构化数据，untrusted 是第三方文本，二者在工具返回和面板里分开展示。
 * @param {any} raw 上游结果项（中文键）
 */
export function mapResultItem(raw) {
  const product = (raw && raw['商品信息']) || {}
  const seller = (raw && raw['卖家信息']) || {}
  const ai = (raw && raw.ai_analysis) || {}
  const insight = (raw && raw.price_insight) || {}
  const priceText = str(product['当前售价'])
  return {
    core: {
      itemId: str(product['商品ID']),
      price: toPrice(insight.current_price, priceText),
      priceText,
      link: safeUrl(product['商品链接']),
      image: safeUrl(product['商品主图链接']),
      crawledAt: str(raw?.['爬取时间']),
      recommended: ai.is_recommended === true,
      source: typeof ai.analysis_source === 'string' ? clean(ai.analysis_source) : null,
      hidden: raw?._effective_hidden === true,
      insight: pick(insight, ['median_price', 'price_change_percent', 'deal_label']),
    },
    untrusted: {
      title: clip(clean(product['商品标题']), 60),
      seller: clip(clean(seller['卖家昵称'] ?? product['卖家昵称']), 24),
      reason: clip(clean(ai.reason), 80),
    },
  }
}

/**
 * 结果项详情：在列表项之上补卖家画像、风险标签、评分摘要、图片列表和最多 3 条评价。
 * 卖家信用和好评率同样是第三方文本，一起放进 untrusted。
 * @param {any} raw
 */
export function mapResultDetail(raw) {
  const base = mapResultItem(raw)
  const seller = (raw && raw['卖家信息']) || {}
  const ai = (raw && raw.ai_analysis) || {}
  const images = Array.isArray(raw?.['商品图片'])
    ? raw['商品图片'].map(safeUrl).filter(Boolean).slice(0, 6)
    : []
  const reviews = Array.isArray(raw?.['商品评价'])
    ? raw['商品评价']
        .slice(0, 3)
        .map((row) => clip(clean(typeof row === 'string' ? row : row?.内容 ?? row?.text), 60))
        .filter(Boolean)
    : []
  return {
    core: {
      ...base.core,
      imageCount: images.length || num(raw?.image_count) || 0,
      imageList: images,
      criteria: pick(ai, ['criteria', 'score']),
    },
    untrusted: {
      ...base.untrusted,
      sellerCredit: clip(clean(seller['卖家信用'] ?? seller['信用等级']), 24),
      sellerGoodRate: clip(clean(seller['好评率']), 16),
      sellerOnSale: clip(clean(seller['在售商品数']), 16),
      riskTags: Array.isArray(ai.risk_tags)
        ? ai.risk_tags.slice(0, 5).map((tag) => clip(clean(tag), 20)).filter(Boolean)
        : [],
      reviews,
    },
  }
}

/**
 * 状态文件路径 → 账号名：`state\alice.json` / `state/alice.json` / `alice.json` → `alice`。
 * @param {unknown} file
 * @returns {string}
 */
export function accountNameOf(file) {
  const text = str(file)
  if (!text) return ''
  const base = text.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.json$/i, '')
}

/**
 * 任务：字段名已对照上游 src/domain/models/task.py（decision_mode、account_state_file 等）。
 * 缺的字段留空而不是猜。
 * 只映射插件对外承诺的字段（PRD §6.1）。
 * @param {any} raw
 */
export function mapTask(raw) {
  const task = raw && typeof raw === 'object' ? raw : {}
  const name = str(task.task_name ?? task.name)
  const keyword = str(task.keyword ?? task.keywords)
  return {
    // 上游任务 id 是整数；统一成字符串，比较和拼 URL 都只面对一种类型
    id: str(task.id ?? task.task_id ?? name),
    name,
    keyword,
    // 上游字段是 decision_mode（ai | keyword）。不要用"有没有 keyword"去猜——每个任务都有 keyword
    mode: str(task.decision_mode ?? task.mode) || 'ai',
    description: clip(clean(task.description), 200),
    // 完整描述只给面板编辑表单用；工具输出不渲染它
    descriptionFull: str(task.description),
    priceRange: [str(task.min_price), str(task.max_price)].filter(Boolean).join('-'),
    cron: str(task.cron),
    nextRunAt: str(task.next_run_at ?? task.next_run_time),
    running: task.is_running === true || task.running === true,
    enabled: task.enabled !== false,
    // 上游绑定账号用 account_state_file（状态文件路径，如 state\alice.json）。
    // 对外的 account 是**账号名**（alice）：工具和面板都按名字传，controller 再翻回路径；
    // 如果这里直接给路径，编辑表单把它原样回传时会因为"没有叫 state\alice.json 的账号"而失败。
    account: accountNameOf(task.account_state_file) || str(task.account ?? task.account_name),
    accountFile: str(task.account_state_file),
    accountStrategy: str(task.account_strategy),
    raw: undefined,
  }
}

/**
 * 概览：dashboard/summary。上游把统计放在 summary 里，缺字段就当 0，不抛错——
 * 概览缺一行数字不该让整次状态查询失败。
 * @param {any} raw
 */
export function mapSummary(raw) {
  const summary = (raw && raw.summary) || {}
  return {
    enabledTasks: num(summary.enabled_tasks) ?? 0,
    runningTasks: num(summary.running_tasks) ?? 0,
    resultFiles: num(summary.result_files) ?? 0,
    recommendedItems: num(summary.recommended_items) ?? 0,
    lastUpdatedAt: str(summary.last_updated_at),
    activities: Array.isArray(raw?.recent_activities)
      ? raw.recent_activities.slice(0, 8).map((row) => clip(clean(row?.message ?? row?.text ?? row), 120))
      : [],
  }
}
