// @ts-check
// .env 管理：只负责一段带标记的区块，区块外一个字节都不动。
//
// 用户会在同一个 .env 里手工写通知渠道（webhook、推送）配置，所以这里不能"整份重写"。
// 也不写 OPENAI_API_KEY：上游保存设置后会重载 .env 并覆盖环境变量，密钥放 .env 会留下明文；
// 密钥走 DSH 凭据，启动时作为环境变量注入子进程。

import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BEGIN = '# >>> dsh-goofish managed — do not edit between markers'
const END = '# <<< dsh-goofish managed'

/**
 * 管理区块里的键（顺序固定，方便用户对照文档）。值不含密钥。
 * @typedef {object} ManagedEnv
 * @property {number} port
 * @property {string} aiBaseUrl
 * @property {string} aiModel
 * @property {string} webPassword
 */

/**
 * 生成区块文本。
 * @param {ManagedEnv} values
 * @param {string} newline
 */
export function renderBlock(values, newline = '\r\n') {
  const lines = [
    BEGIN,
    `SERVER_PORT=${values.port}`,
    'RUN_HEADLESS=true',
    `OPENAI_BASE_URL=${values.aiBaseUrl}`,
    `OPENAI_MODEL_NAME=${values.aiModel}`,
    'WEB_USERNAME=goofish',
    `WEB_PASSWORD=${values.webPassword}`,
    END,
  ]
  return lines.join(newline)
}

/**
 * 把区块拼进原文件内容。
 *
 * 区块存在时只替换区块内部（含标记行），其余内容原样保留；不存在时追加到末尾，
 * 并补一个换行——原文件最后一行没有换行时，直接拼接会把两行粘成一行。
 * @param {string} original
 * @param {ManagedEnv} values
 * @returns {string}
 */
export function mergeBlock(original, values) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const block = renderBlock(values, newline)
  const beginAt = original.indexOf(BEGIN)
  const endAt = original.indexOf(END)

  if (beginAt !== -1 && endAt !== -1 && endAt > beginAt) {
    const before = original.slice(0, beginAt)
    const after = original.slice(endAt + END.length)
    return before + block + after
  }

  if (!original.trim()) return block + newline
  const separator = original.endsWith('\n') ? '' : newline
  return original + separator + block + newline
}

/**
 * 读取当前区块（诊断和"配置是否已生效"用）。
 * @param {string} text
 * @returns {Record<string, string>|null}
 */
export function readBlock(text) {
  const beginAt = text.indexOf(BEGIN)
  const endAt = text.indexOf(END)
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) return null
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of text.slice(beginAt + BEGIN.length, endAt).split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) out[match[1]] = match[2]
  }
  return out
}

/**
 * 写 .env：写临时文件再重命名，避免上游正好 reload 时读到半截内容。
 * @param {string} filePath
 * @param {ManagedEnv} values
 * @returns {Promise<{path: string, changed: boolean}>}
 */
export async function applyEnvFile(filePath, values) {
  let original = ''
  try {
    original = await readFile(filePath, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error
  }
  const merged = mergeBlock(original.replace(/^\uFEFF/, ''), values)
  if (merged === original) return { path: filePath, changed: false }
  const temp = join(dirname(filePath), `.env.dsh-goofish-${process.pid}.tmp`)
  // 无 BOM，UTF-8：上游用 python-dotenv 读，BOM 会让第一个键名带上零宽字符
  await writeFile(temp, merged, 'utf8')
  await rename(temp, filePath)
  return { path: filePath, changed: true }
}
