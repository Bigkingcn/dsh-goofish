// 把 client/*.js 打成一个浏览器可加载的 dist/client.js。
//
// 为什么不用 esbuild：插件要保持"安装时不跑任何 install 脚本、也没有 devDependency"。
// 我们自己只需要把几个 CJS 模块装进一个 registry，几十行就够，而且产物形状与
// dsh-media-desk / dsh-guizang-design 的 dist/client.js 一致（window.__ModuleLoader__.load + require('react')）。

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client')
const OUT = join(ROOT, 'dist', 'client.js')

/** 打包顺序就是这里的顺序；入口放最后。 */
const MODULES = ['i18n.js', 'styles.js', 'api.js', 'ui.js', 'pages.js', 'index.js']
const ENTRY = 'index.js'
const PLUGIN_ID = 'dsh-goofish'

/** 缩进模块体，让产物还能读。 */
function indent(source, pad = '    ') {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

async function build() {
  const parts = []
  const sizes = []

  parts.push(`// 由 scripts/build.mjs 生成，不要手改。改 client/*.js 后重新 npm run build。`)
  parts.push(`window.__ModuleLoader__.load({`)
  parts.push(`  id: ${JSON.stringify(PLUGIN_ID)},`)
  parts.push(`  factory: (require) => {`)
  parts.push(`    const __defs = {}`)
  parts.push(`    const __cache = {}`)
  parts.push(`    // './x.js' 走本地 registry，'react' 之类交给宿主的模块表`)
  parts.push(`    function __require(id) {`)
  parts.push(`      if (!id.startsWith('./')) return require(id)`)
  parts.push(`      const name = id.slice(2)`)
  parts.push(`      if (__cache[name]) return __cache[name].exports`)
  parts.push(`      const def = __defs[name]`)
  parts.push(`      if (!def) throw new Error('[dsh-goofish] 找不到模块 ' + id)`)
  parts.push(`      const module = { exports: {} }`)
  parts.push(`      __cache[name] = module`)
  parts.push(`      def(module, module.exports, __require)`)
  parts.push(`      return module.exports`)
  parts.push(`    }`)

  for (const name of MODULES) {
    const file = join(CLIENT, name)
    const source = await readFile(file, 'utf8')
    if (/^\s*(import|export)\s/m.test(source)) {
      throw new Error(`client/${name} 里有 ESM 语法；面板模块统一用 require/module.exports`)
    }
    sizes.push({ name, bytes: (await stat(file)).size })
    parts.push('')
    parts.push(`    __defs[${JSON.stringify(name)}] = function (module, exports, require) {`)
    parts.push(indent(source))
    parts.push(`    }`)
  }

  parts.push('')
  parts.push(`    return __require(${JSON.stringify(`./${ENTRY}`)})`)
  parts.push(`  },`)
  parts.push(`})`)
  parts.push('')

  const output = parts.join('\n')
  await mkdir(dirname(OUT), { recursive: true })

  if (process.argv.includes('--check')) {
    // 只校验，不写盘：CI 里用来确认 dist 与源码没有漂移
    const existing = await readFile(OUT, 'utf8').catch(() => '')
    if (existing !== output) {
      console.error('dist/client.js 与 client/*.js 不一致，运行 node scripts/build.mjs')
      process.exit(1)
    }
    console.log('dist/client.js 是最新的')
    return
  }

  await writeFile(OUT, output, 'utf8')
  const total = Buffer.byteLength(output)
  for (const row of sizes) console.log(`  client/${row.name.padEnd(12)} ${String(row.bytes).padStart(7)} B`)
  console.log(`dist/client.js 已生成：${(total / 1024).toFixed(1)} KB`)
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
