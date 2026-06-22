# Local Memory Hub 代码规范

本文档约束第一版原型到可维护产品之间的代码组织方式。目标不是一次性做“大架构”，而是防止导入、解析、图谱、问答和治理逻辑混成一个难以扩展的大文件。

## 基本原则

- 本地优先：默认数据留在本机，代码中不要隐式上传用户源文件、API Key 或解析结果。
- 模块边界清楚：API 调用、状态、工具函数、页面渲染、业务流程分开。
- 业务词稳定：`source` 表示源资料，`memorySegment` 表示文本片段，`vectorIndex` 表示向量索引，`graphNode` 表示图谱节点，`pollutionStatus` 表示污染状态。
- 注释解释意图：注释说明“为什么这样做”和“模块负责什么”，不解释显而易见的语法。

## 前端目录约定

```text
apps/web/public/
  index.html
  styles.css
  main.js                 页面启动与顶层编排
  js/
    api.js                本地 API 客户端
    state.js              浏览器端共享状态
    utils.js              纯工具函数
```

后续页面复杂度上来后，再继续拆：

```text
js/
  graph-renderer.js       图谱布局与 SVG 渲染
  graph-detail.js         节点详情、影响范围、隔离/恢复
  sources-view.js         源资料表格
  import-flow.js          导入流程
  qa-view.js              问答、引用来源和任务模型选择
  governance-view.js      污染治理
  settings-view.js        设置页、模型 Provider 模板和本地状态展示
```

## 模块职责

- `api.js`：只封装 `fetch` 和 API 基础地址。页面代码不直接拼 API URL。
- `state.js`：只保存可序列化状态，不保存 DOM 引用。
- `utils.js`：只放无副作用函数，如 HTML 转义、日期格式化、状态文案、SVG 创建、防抖。
- `main.js`：负责启动、事件绑定、调用渲染函数。不能继续无限膨胀，单文件超过约 500 行时必须拆页面模块。

## 命名规范

- 文件名使用 `kebab-case.js`。
- 函数使用动词开头的 `camelCase`：`loadSources`、`renderGraph`、`importText`。
- 常量使用 `UPPER_SNAKE_CASE`：`API_BASE_URL`。
- DOM 集中放在 `els` 对象中，避免散落的 `document.querySelector`。
- 状态字段使用后端一致命名，避免 UI 自造一套同义词。

## 注释规范

- 每个模块顶部必须说明职责和边界。
- 复杂业务流程前添加短注释，例如导入流水线、污染级联、问答兜底。
- 不写“给变量赋值”“点击按钮”这类噪音注释。

## 扩展规则

- 新增导入来源：优先扩展后端 `Importer`，前端只增加入口和状态展示。
- 新增模型：优先扩展后端 Provider Adapter，前端读取 `/api/models/providers` 自动展示。
- 新增解析器：作为解析流水线的一环，不要写进 UI。
- 新增页面：先定义页面负责的业务对象，再建独立 view 模块。

## 验证要求

每次改动至少验证：

- Web 页面能打开。
- `/health` 能读取数据目录。
- 文本导入后能解析并出现在源资料库。
- 图谱能显示节点。
- 问答能返回本地兜底答案。
- 隔离/恢复操作后图谱和源资料状态刷新。

注意：迁移测试、污染级联测试、会改写 schema 或全局本地数据目录的测试必须串行执行，不能和普通 API smoke test 并行跑。
