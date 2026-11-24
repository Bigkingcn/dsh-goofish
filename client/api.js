// 面板的 HTTP 封装。
//
// 所有业务都走 Host 的 /goofish/api：面板不直接连上游，也不碰 cookie 内容。
// Host 返回 { ok, data } 或 { ok:false, code, message, hint }，这里统一成
// "成功返回值 / 失败抛 Error(message；hint)"，页面只处理一种形状。

const BASE = '/goofish/api'

/**
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} path
 * @param {any} [body]
 */
async function call(method, path, body) {
  /** @type {RequestInit} */
  const options = { method, headers: {}, credentials: 'same-origin' }
  if (body !== undefined) {
    options.headers = { 'content-type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const response = await fetch(`${BASE}${path}`, options)
  /** @type {any} */
  let payload = null
  try {
    payload = await response.json()
  } catch {
    // 非 JSON（例如网关直接返回 502 页面）：保留状态码信息
    throw new Error(`HTTP ${response.status}`)
  }
  if (!payload || payload.ok !== true) {
    const message = payload?.message ?? payload?.error ?? `HTTP ${response.status}`
    const hint = payload?.hint ?? ''
    throw Object.assign(new Error(hint ? `${message}；${hint}` : message), { code: payload?.code, status: response.status })
  }
  return payload.data
}

/** @param {Record<string, any>} params */
function qs(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '' || value === false) continue
    search.set(key, value === true ? '1' : String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

const api = {
  status: () => call('GET', '/status'),
  alerts: () => call('GET', '/alerts'),
  runtimeLog: (from = 0) => call('GET', `/runtime/log?from=${from}`),
  installProgress: () => call('GET', '/runtime/install-progress'),
  runtimeAction: (action) => call('POST', `/runtime/${action}`),

  tasks: (params) => call('GET', `/tasks${qs(params)}`),
  task: (id) => call('GET', `/tasks/${encodeURIComponent(id)}`),
  taskLog: (id, lines = 200) => call('GET', `/tasks/${encodeURIComponent(id)}/log?lines=${lines}`),
  createTask: (body) => call('POST', '/tasks', body),
  patchTask: (id, patch) => call('PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
  startTask: (id) => call('POST', `/tasks/${encodeURIComponent(id)}/start`),
  stopTask: (id) => call('POST', `/tasks/${encodeURIComponent(id)}/stop`),
  removeTask: (id) => call('DELETE', `/tasks/${encodeURIComponent(id)}`),

  results: (params) => call('GET', `/results${qs(params)}`),
  resultDetail: (item, params) => call('GET', `/results/${encodeURIComponent(item)}${qs(params)}`),
  markResult: (item, status, params) => call('POST', `/results/${encodeURIComponent(item)}/status${qs(params)}`, { status }),

  accounts: () => call('GET', '/accounts'),
  upsertAccount: (name, content) => call('POST', '/accounts', { name, content }),
  removeAccount: (name) => call('DELETE', `/accounts/${encodeURIComponent(name)}`),

  digest: () => call('GET', '/digest'),
  setDigest: (body) => call('PUT', '/digest', body),
  clearDigest: () => call('DELETE', '/digest'),

  settings: () => call('GET', '/settings'),
  saveSettings: (body) => call('PUT', '/settings', body),
  saveSecret: (value) => call('PUT', '/settings/secret', { value }),
  clearSecret: () => call('DELETE', '/settings/secret'),
}

module.exports = { api }

