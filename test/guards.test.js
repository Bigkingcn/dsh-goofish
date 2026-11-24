// @ts-check
// 守卫的单测：挡住直连上游账号接口和读 state 目录这两条路。
import assert from 'node:assert/strict'
import test from 'node:test'
import { isStatePath, touchesAccountApi } from '../src/guards.js'

const projectDir = 'D:\\goofish\\ai-goofish-monitor'

test('识别 state 目录下的路径', () => {
  assert.equal(isStatePath(projectDir, `${projectDir}\\state\\alice.json`), true)
  // 相对路径按 projectDir 解析
  assert.equal(isStatePath(projectDir, 'state/alice.json'), true)
  // 大小写不敏感（Windows）
  assert.equal(isStatePath(projectDir, `${projectDir}\\STATE\\alice.json`.toLowerCase()), true)
})

test('state 目录之外与相似前缀不算', () => {
  assert.equal(isStatePath(projectDir, `${projectDir}\\logs\\x.json`), false)
  // states 与 state 是不同目录：不能靠 startsWith 混过去
  assert.equal(isStatePath(projectDir, `${projectDir}\\states\\x.json`), false)
  assert.equal(isStatePath(projectDir, 'F:\\其他\\state\\x.json'), false)
})

test('识别账号接口与本机端口', () => {
  assert.equal(touchesAccountApi('curl http://127.0.0.1:8765/api/accounts', 8765), true)
  assert.equal(touchesAccountApi('curl localhost:8765/api/accounts/alice', 8765), true)
  assert.equal(touchesAccountApi('curl http://127.0.0.1:8765/api/tasks', 8765), true)
  assert.equal(touchesAccountApi('curl http://127.0.0.1:9000/api/tasks', 8765), false)
  assert.equal(touchesAccountApi('ls -la', 8765), false)
  assert.equal(touchesAccountApi('', 8765), false)
})
