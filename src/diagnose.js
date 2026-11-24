// @ts-check
// 日志分类：把最近 200 行任务日志归到一个可执行的下一步。
//
// 关键词是"猜测"，M0 必须用真实失败日志校准（§10.1、§14 V10）。这里把规则集中在一张表里，
// 校准就是改表，不动逻辑。匹配"最近一次命中"：日志越靠后越可能是当前失败的原因。

import { clean, clip } from './upstream/mapping.js'

/**
 * 分类规则，顺序即优先级以外的扫描顺序；命中多类时取在日志里出现位置最靠后的那一类。
 * @type {Array<{category: string, nextStep: string, words: string[]}>}
 */
export const RULES = [
  {
    category: 'login_expired',
    nextStep: '打开侧栏「闲鱼监控」→「账号」，更新这个账号的 cookie',
    words: ['登录', 'cookie', 'Cookie', '失效', '未登录', 'FAIL_SYS_SESSION_EXPIRED', 'Session expired'],
  },
  {
    category: 'risk_control',
    nextStep: '先暂停该任务，降低抓取频率或换账号；触发验证码时上游不会自己过',
    words: ['验证码', '滑块', '风控', 'captcha', 'RGV587', 'punish', 'x5sec'],
  },
  {
    category: 'ai_error',
    nextStep: '检查面板「运行」页的接口地址、模型和密钥，确认额度没超',
    words: ['openai', 'OpenAI', 'api key', 'API Key', '401', '403', '429', '模型', 'quota', 'insufficient_quota'],
  },
  {
    category: 'network',
    nextStep: '检查本机网络和代理设置；安装时用的代理不会在运行时生效',
    words: ['timeout', 'timed out', 'Timeout', 'proxy', 'Proxy', 'connection', 'ECONN', 'Network is unreachable'],
  },
]

/**
 * @typedef {object} Diagnosis
 * @property {'login_expired'|'risk_control'|'ai_error'|'network'|'unknown'} category
 * @property {string[]} evidence 最多 5 行，已清洗和截断
 * @property {string} nextStep
 */

/**
 * @param {string} logText
 * @returns {Diagnosis}
 */
export function classify(logText) {
  const lines = String(logText || '')
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean)

  /** @type {{category: string, nextStep: string, at: number, word: string}|null} */
  let hit = null
  for (const rule of RULES) {
    for (const word of rule.words) {
      // 从末尾往前找：同一个关键词出现多次时，最后一次才是当前失败
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index].includes(word)) {
          if (!hit || index > hit.at) hit = { category: rule.category, nextStep: rule.nextStep, at: index, word }
          break
        }
      }
    }
  }

  if (!hit) {
    return {
      category: 'unknown',
      evidence: lines.slice(-5).map((line) => clip(line, 160)),
      nextStep: '在面板「运行」页看服务日志的最后 20 行，把失败那一段发给维护者',
    }
  }

  // 证据 = 命中行本身 + 它前后各一行，最多 5 行，够看懂上下文又不至于刷屏
  const from = Math.max(0, hit.at - 2)
  const evidence = lines.slice(from, hit.at + 2).map((line) => clip(line, 160)).slice(0, 5)
  return { category: /** @type {Diagnosis['category']} */ (hit.category), evidence, nextStep: hit.nextStep }
}
