# dsh-goofish · 闲鱼监控

在 DSH 里部署、运行和管理 [ai-goofish-monitor](https://github.com/Usagi-org/ai-goofish-monitor)：对话查货、定时汇报、管理面板。

- **对话**：`goofish_service`、`goofish_tasks`、`goofish_task_create`、`goofish_task_edit`、`goofish_results`、`goofish_result_detail` 六个工具。
- **面板**：侧栏「闲鱼监控」→ 概览 / 任务 / 结果 / 账号 / 运行。
- **汇报**：一条定时任务，把摘要投递到一个固定会话（第一次投递时才创建）。

> **免责声明**：抓取闲鱼违反其用户协议，账号有被限制或封禁的风险。本项目只做本机部署与界面整合，不对上游行为负责。请自行评估是否使用。

## 前置条件

| 项 | 要求 |
|---|---|
| 系统 | Windows（插件依赖 PowerShell 与 taskkill 做进程管理） |
| Python | 3.10 以上，在 PATH 里（或配置 `pythonPath`） |
| Git | 在 PATH 里（或配置 `gitPath`） |
| 磁盘 | `projectDir` 所在盘至少 2 GB 空闲（虚拟环境 + Chromium） |
| 网络 | 首次安装需要能访问 GitHub、PyPI、Playwright 的下载源 |

DSH 版本：`>=0.2.2-rc.1 <0.3.0`。

## 装上之后先做三件事

1. **安装上游**：侧栏「闲鱼监控」→「运行」→「安装」。九步进度会在页面上滚出来；中断了再点一次会从失败的那一步继续。
2. **填 AI 接口**：同一个页面往下，「设置」里填接口地址和模型名（会写入上游 `.env`），密钥单独保存（存进 DSH 凭据 `GOOFISH_OPENAI_API_KEY`，不写入 `.env`）。不填也能用，只是只有关键词模式。
3. **导入账号**：侧栏「闲鱼监控」→「账号」→「导入/更新账号」，粘贴上游 Chrome 扩展导出的 JSON。cookie 只会提交给本机服务，不写日志、不进对话。

## 配置

插件配置在你自己 profile 的 `cordis.patch.yml` 里按 `id: goofish` 覆盖。**覆盖会整体替换 `config`**，所以只改一个字段时也要把其余字段抄全（下面这份就是完整的一份）。

```yaml
- id: goofish
  name: dsh-goofish
  config:
    projectDir: "D:\\goofish\\ai-goofish-monitor"     # 绝对路径、ASCII、无空格；省略时默认 ~/.dsh/goofish/ai-goofish-monitor
    pythonPath: ""                                  # 留空用 PATH 里的 python
    gitPath: ""                                     # 留空用 PATH 里的 git
    port: 8765                                      # 只监听 127.0.0.1
    autoStartOnLaunch: true                         # DSH 启动时拉起服务
    pipIndexUrl: ""                                 # 例如 https://pypi.tuna.tsinghua.edu.cn/simple
    installProxy: ""                                # 只在安装步骤用的 HTTPS_PROXY
    ai:
      baseUrl: ""                                   # 留空，在面板里填
      model: ""                                     # 留空，在面板里填
    timeZone: "Asia/Shanghai"
    staleDays: 7
    defaultLimit: 10
    requestTimeoutMs: 15000
    generateTimeoutMs: 90000
    digest:
      windowHours: 24
```

- **改任何配置都会重启插件**，服务会跟着重启一次（几秒）。插件不导出声明式 `Config`：那需要 `@deepseek-ai/schemastery`，而以目录/链接方式安装的插件解析不到 DSH 的内部包，import 失败会让整个插件不加载。所以配置字段只在 README 和面板里说明，没有类型校验表单。
- **AI 密钥不在配置里**。它存在 DSH 凭据里，启动子进程时作为环境变量注入。

## 工具速查

| 工具 | 用途 | 需要审批 |
|---|---|---|
| `goofish_service` | 状态 / 诊断 / 安装 / 启动 / 停止 | install、start、stop |
| `goofish_tasks` | 列任务或看单个任务 | — |
| `goofish_task_create` | 建任务（ai 或 keyword 模式） | — |
| `goofish_task_edit` | 改 / 启动 / 停止 / 删除任务 | delete |
| `goofish_results` | 结果列表（按任务或关键词） | — |
| `goofish_result_detail` | 单条详情（卖家、风险、评价） | — |

**没有账号写入类工具**：cookie 只能在面板里管理。插件还挡了一条低成本的防线——`bash` / `pwsh` 命令里出现上游端口或 `/api/accounts`、`read` / `grep` / `glob` 落到 `projectDir\state` 之下，都会被直接拒绝。

## 安全边界（请如实看待）

| 威胁 | 措施 | 剩余风险 |
|---|---|---|
| 局域网访问上游（上游没有鉴权） | 只监听 `127.0.0.1` | 本机其他用户或程序仍可访问 |
| cookie 进入模型 | 无账号类工具；返回体不含 cookie；从不调用 `GET /api/accounts/{name}`；守卫拦 state 目录与账号接口 | 模型若能拼出等价命令，仍可能绕过守卫 |
| 日志泄露 | 插件日志只记 `{event, method, endpoint, status, ms, state, code}` | 子进程输出在面板可见：上游自己打印的敏感信息会被展示 |
| API 密钥泄露 | DSH 凭据 + 启动时环境变量注入；不写 `.env` | 同机同用户的进程能读到子进程环境变量 |
| 提示注入 | 第三方文本放 `untrusted` 并截断；写操作审批 | 模型仍可能被影响去做**只读**动作 |
| 误删误杀 | 删除要审批；只结束 `ExecutablePath` 在 `projectDir` 之下的进程 | — |
| 路径穿越 | 账号名白名单正则；`projectDir` 规范化 | — |
| XSS | 面板只按文本节点渲染；链接只放行 `https:` | — |

守卫是**防误操作**，不是安全边界。想让 cookie 更安全，就把 `projectDir` 放进受系统账户保护的位置。

## 卸载

1. 面板「概览」→「移除汇报」（定时汇报不会随插件卸载自动删除，因为它也可能只是配置变化引起的重启）。
2. 面板「运行」→「停止」，确认没有残留进程。
3. 停用/移除插件（插件管理页），然后自己决定是否删除 `projectDir`。

插件卸载时会主动停服务并按路径清理 `projectDir` 下的子进程；DSH 被强杀时不会有这个机会，下次启动会先做一次残留清理。

## 开发

```sh
npm test            # 单元 + 冒烟测试（node --test）
npm run build       # 重新生成 dist/client.js
npm run check       # 只校验 dist/client.js 是否与 client/*.js 一致
```

Host 代码是无构建的 ESM（`// @ts-check` + JSDoc）。面板源码在 `client/`，用 `scripts/build.mjs` 打成单文件 CJS（不引 esbuild，安装时不跑任何 install 脚本）。

目录：

```
src/index.js            装配：工具、审批、守卫、路由、提示、运行时
src/config.js           配置读取与校验（Host 侧零依赖）
src/controller.js       业务唯一入口
src/tools.js            6 个工具
src/approval.js         tools/pre-execute 审批
src/guards.js           纵深防御
src/http.js             /goofish/api/* 路由
src/digest.js           定时汇报
src/diagnose.js         日志分类
src/prompt.js           系统提示与汇报模板
src/upstream/           上游客户端、契约、字段映射
src/runtime/            状态机、安装器、.env、进程、元数据
client/                 面板源码（CJS，打成 dist/client.js）
test/                   node --test 用例
```

### 与技术文档的差异（实现时被迫调整，均已实测）

| 文档写法 | 实际做法 | 原因 |
|---|---|---|
| `export const Config = Schema.object({...})`，含 volatile 字段 | **不导出 Config**，配置由 `src/config.js` 自己读默认值并校验 | 以目录/链接方式安装的插件解析不到 `@deepseek-ai/schemastery`（实测 `ERR_MODULE_NOT_FOUND`，整个插件不加载）。代价：没有类型化配置表单，改配置会重启插件 |
| `inject = ['tools','webServer','connection','subprocess']` | `inject = ['tools','webServer','subprocess','timer']` | 不 inject `timer` 就读 `ctx.interval` 会抛 `cannot get property "timer" without inject`；`connection` 改用 `ctx.get('connection')` 可选读取 |
| 工具 `output.render` 返回文本内容 | 返回 `[{type:'text', text}]` | `ToolDefinition.output.render` 的返回类型是 `ContentBlock[]` |
| `tools/pre-execute` 返回 `{ decision:'ask', reason }` | 返回 `{ kind:'ask', reason, displayReason:{en,...} }` | 决策是 `{kind}` 判别联合；`displayReason` 的 `en` 是必填键 |
| Client 用 JSX + esbuild | 用 `React.createElement` + 自写的 40 行打包脚本 | 保持安装时不跑任何 install 脚本、也没有 devDependency；产物形态仍是 `window.__ModuleLoader__.load` + `require('react')` |
| 服务状态里的 `pid` 来自子进程句柄 | 从端口占用者（`Get-NetTCPConnection`）取 PID | `SubprocessHandle` 没有 `pid` 字段 |

### 已对照上游源码核实的契约（基线 `77f8d758`）

代码审查时逐个读了上游的 `tasks.py`、`results.py`、`accounts.py`、`logs.py`、`task.py`、`task_generation.py`、`failure_guard.py`、`storage_names.py`、`app.py`。以下几点以前是猜的，现在以源码为准，并有 `test/regression.test.js` 里的用例守着：

| 点 | 上游事实 | 插件做法 |
|---|---|---|
| 任务字段名 | 模型是 `extra="ignore"`，写错的字段**被静默丢弃** | 工具的 `mode` → `decision_mode`，`account` → `account_state_file`（先用账号列表把名字翻成路径） |
| 任务 id | 整数 | 统一成字符串比较 |
| AI 建任务 | 202 `{job:{job_id,status,task,error}}`，状态值 `queued/running/completed/failed`；关键词模式直接 200 `{task}` | 轮询读 `job.status`；关键词模式不轮询 |
| 更新任务 | 返回 `{message, task}`；改 AI 描述时在这次 PATCH 里**同步**调 AI | 取 `.task`；超时放宽到 `generateTimeoutMs` |
| 结果接口 | **服务端分页**，默认 20 条，`limit ≤ 100`；支持 `recommended_only/include_hidden/sort_by/sort_order`，没有时间窗口参数 | 无时间窗口时筛选/排序/分页全交给上游；有 `since_hours` 时按 `crawl_time` 倒序翻页，翻出窗口即停（最多 10 页） |
| 结果文件名 | `关键词.replace(' ','_') + '_full_data.jsonl'` | 精确匹配；找不到就报"还没有结果"，绝不退回别的文件 |
| 结果状态 | `active / hidden / expired` | 同 |
| 账号 | `content` 是 **JSON 文本**；`POST` 对已存在账号返回 409，更新要用 `PUT` | 先查列表再选 POST/PUT |
| API 鉴权 | `/api/*` 没有服务端鉴权（登录只在前端校验） | 无需处理 |

### 已知限制（审查中发现，未改或无法改）

- **守卫会误伤正常调试**：命令文本里只要出现上游端口或 `/api/accounts`，`bash`/`pwsh` 调用就被拒绝——审查本插件时就被自己的守卫拦过三次。这是设计取舍（防误操作，不是安全边界），需要调试时请改用文件工具，或临时调整 `src/guards.js`。
- **熔断文件的 key**：上游 `failure_guard.py` 只说 key 是调用方传入的 `task_key`，传的是任务名还是 ID 在 `scraper.py`（60 KB）里，没有读到。目前两种都匹配。
- **登录态过期判断**：用 `state\<账号>.json` 的修改时间；上游改了 `ACCOUNT_STATE_DIR` 时会误报"可能过期"。
- **日志分类关键词是猜的**（`src/diagnose.js`，例如 `登录` 会命中"登录成功"这类正常日志），需要拿真实失败日志校准。
- **孤儿进程**：DSH 被强杀、而 venv 启动器已经不在时，监听端口的基础解释器会变成孤儿；它的路径不在 `projectDir` 下，插件**不会**去杀它，而是报"端口被占用"并给出 PID，由你自己处理。
- **看板数字**：`/api/dashboard/summary` 的字段来自 PRD，没有读 `dashboard_service.py` 核对，缺字段时按 0 显示。
- **保存设置**：面板「设置」通过 `configEditor.edit(ctx.fiber.entry, …)` 写回 profile；`ctx.fiber.entry` 在文档里没有验证。失败时会把原因原样显示，不会假装保存成功。
- **面板（浏览器端）没有在真实页面里跑过**：打包产物能解析、模块形状与 `dsh-guizang-design` 一致，但侧栏图标和五个页面的实际显示、明暗主题、`bg-mask-*` 等令牌是否存在，都还没有人眼确认。

### 仍需要真实上游才能确认的点

- 安装流程与 `requirements-runtime.txt` 的实际内容；
- 价格与 `爬取时间` 的真实格式（`parseCrawlTime` 按本地时间 `YYYY-MM-DD HH:MM:SS` 解析）；
- 账号导入 JSON 的字段名（目前要求顶层有非空 `cookies` 数组）；
- `startLocked` 里 uvicorn 冷启动是否 30 秒内能过 `/health`。

这些用真实响应校准后，`test/` 里应补上对应的 fixture。
