# 导入与快捷导入系统架构设计

## 1. 目标

导入系统负责把来自不同入口的信息统一变成源资料记录，并交给后续解析、清洗、记忆入库和图谱构建流程。

它必须满足：

- 支持多来源：文件、链接、截图、剪贴板、浏览器插件、飞书、有道云、视频平台、MCP/API。
- 支持快捷导入：快捷键、拖拽、分享链接、文件夹监听。
- 后期增加新平台时，不改主流程。
- 每次导入都先创建可追溯的源资料记录。
- 导入和解析解耦，导入完成后异步进入解析队列。
- 所有来源都进入同一套状态机。
- 失败可重试，可解释，可追踪。

## 2. 核心原则

### 2.1 入口多样，模型统一

外部入口可以很多，但进入系统后必须统一成一个 `ImportRequest`。

```text
文件拖拽
粘贴链接
快捷键
浏览器插件
飞书
有道云
视频链接
MCP/API
        ↓
ImportRequest
        ↓
Import Pipeline
        ↓
SourceRecord
        ↓
Parse Job
```

主流程只认识 `ImportRequest` 和 `SourceRecord`，不直接关心飞书、有道云或浏览器插件的细节。

### 2.2 导入只负责“拿到源数据”

导入系统不做深度解析，不做摘要，不做 embedding，不做图谱。

导入系统负责：

- 接收导入请求
- 识别来源类型
- 拉取或保存原始数据
- 写入源资料记录
- 生成基础元数据
- 创建后续解析任务

解析系统负责：

- 文本抽取
- OCR
- 视频转写
- 清洗
- chunk
- embedding
- 图谱
- 大模型兜底

### 2.3 所有导入必须可追溯

每个 `SourceRecord` 必须保存：

- 来源入口
- 来源平台
- 原始路径或 URL
- 导入时间
- 导入操作者
- 导入参数
- 原始文件 hash
- 导入状态
- 后续解析任务 ID

### 2.4 失败不能中断主流程

导入失败分两类：

- 源数据无法获取：导入失败。
- 源数据已保存，但解析失败：导入成功，解析失败。

这两类必须分开，否则用户会搞不清“文件没进来”还是“文件进来了但没解析出来”。

## 3. 推荐设计模式

### 3.1 Strategy：不同来源的导入策略

每种来源实现一个 `Importer`。

```text
FileImporter
UrlImporter
FeishuImporter
YoudaoImporter
ClipboardImporter
ScreenshotImporter
VideoLinkImporter
BrowserExtensionImporter
McpImporter
WatchedFolderImporter
```

每个 importer 只处理自己的来源，不互相调用。

### 3.2 Registry / Factory：动态选择 importer

系统维护一个 `ImporterRegistry`。

职责：

- 注册所有 importer。
- 根据 `ImportRequest` 选择合适 importer。
- 支持多个 importer 竞争同一个请求。
- 支持平台优先级。

例如一个 URL：

```text
https://bilibili.com/video/xxx
```

选择顺序可以是：

```text
VideoLinkImporter
GenericUrlImporter
ManualFallbackImporter
```

### 3.3 Adapter：外部平台适配

飞书、有道云、视频平台不要直接污染导入主流程。

它们应该有自己的 adapter：

```text
FeishuClient
YoudaoClient
BilibiliClient
YouTubeClient
GenericWebClient
```

Importer 使用 adapter 获取平台数据。

好处：

- API 变化时只改 adapter。
- importer 只关心导入语义。
- 认证、分页、限流、重试都封装在 adapter 内。

### 3.4 Pipeline：导入管线

导入过程拆成固定阶段。

```text
ValidateRequest
DetectSource
SelectImporter
FetchSource
PersistRawData
CreateSourceRecord
EnrichMetadata
EnqueueParseJob
ReturnImportResult
```

每个阶段都是独立 step。

优点：

- 方便插入新逻辑。
- 方便测试。
- 方便记录每一步耗时和失败原因。

### 3.5 Command：快捷导入统一成命令

快捷键、剪贴板、截图、右键菜单、MCP 写入，本质都是命令。

```text
QuickImportCommand
ClipboardImportCommand
ScreenshotImportCommand
BrowserPageImportCommand
McpAddMemoryCommand
WatchedFolderImportCommand
```

Command 只负责收集输入，然后生成 `ImportRequest`。

### 3.6 State Machine：状态流转

导入、解析、入记忆、污染、删除必须用状态机管理。

不要让业务代码到处直接写：

```text
status = "done"
```

应该通过状态迁移：

```text
transition(sourceId, IMPORT_SUCCEEDED)
transition(sourceId, PARSE_FAILED)
transition(sourceId, MARK_POLLUTED)
```

### 3.7 Outbox / Job Queue：异步任务

导入完成后，不在 UI 请求里做重任务。

```text
导入请求
  ↓
保存源数据
  ↓
写 source_record
  ↓
写 outbox_event
  ↓
worker 创建 parse_job
```

这样可以避免：

- UI 卡死
- 应用崩溃导致任务丢失
- 导入和解析耦合

## 4. 核心数据模型

### 4.1 ImportRequest

`ImportRequest` 是所有入口进入系统后的统一输入。

```json
{
  "request_id": "uuid",
  "entrypoint": "clipboard | file_drag | url_paste | browser_extension | feishu | youdao | mcp | watched_folder",
  "source_hint": "file | url | text | image | video | external_doc",
  "payload": {
    "text": null,
    "url": null,
    "file_paths": [],
    "binary_ref": null,
    "external_doc_id": null
  },
  "user_intent": {
    "add_to_memory": true,
    "parse_immediately": true,
    "privacy_level": "normal",
    "tags": []
  },
  "context": {
    "app": "Chrome",
    "window_title": null,
    "selected_text": null,
    "created_at": "datetime"
  }
}
```

### 4.2 ImportResult

```json
{
  "request_id": "uuid",
  "status": "success | partial | failed | fallback_required",
  "source_ids": ["uuid"],
  "message": "已保存，等待解析",
  "failure_reason": null,
  "next_action": "parse_queued | manual_export_required | auth_required"
}
```

### 4.3 SourceRecord

```json
{
  "source_id": "uuid",
  "title": "文档标题",
  "source_type": "file | url | external_doc | screenshot | clipboard | video",
  "source_platform": "local | feishu | youdao | bilibili | youtube | browser | mcp",
  "entrypoint": "url_paste",
  "original_url": "https://...",
  "canonical_url": "https://...",
  "local_file_path": "/data/raw/xxx",
  "content_hash": "sha256",
  "folder_id": "uuid",
  "import_status": "saved",
  "parse_status": "parse_pending",
  "memory_status": "memory_pending",
  "trace_status": "traceable",
  "pollution_status": "clean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 4.4 ImportJob

```json
{
  "job_id": "uuid",
  "request_id": "uuid",
  "importer_name": "FeishuImporter",
  "status": "pending | running | success | failed | needs_user_action",
  "attempt_count": 0,
  "error_code": null,
  "error_message": null,
  "started_at": null,
  "finished_at": null
}
```

## 5. Importer 接口设计

### 5.1 Importer 接口

```ts
interface Importer {
  name: string;

  canHandle(request: ImportRequest): Promise<CanHandleResult>;

  import(request: ImportRequest, context: ImportContext): Promise<ImportResult>;
}
```

### 5.2 CanHandleResult

```ts
type CanHandleResult = {
  supported: boolean;
  confidence: number;
  reason?: string;
};
```

### 5.3 ImportContext

```ts
type ImportContext = {
  storage: RawStorage;
  sourceRepository: SourceRepository;
  eventBus: EventBus;
  authManager: AuthManager;
  logger: Logger;
};
```

### 5.4 Importer 职责边界

Importer 可以做：

- 校验请求。
- 拉取源数据。
- 保存原始内容。
- 创建 SourceRecord。
- 返回导入结果。

Importer 不应该做：

- 深度解析。
- 生成 embedding。
- 写图谱。
- 调用总结模型。
- 直接更新记忆库。

## 6. 快捷导入设计

### 6.1 快捷导入入口

V1 推荐入口：

- 全局快捷键保存剪贴板。
- 全局快捷键保存选中文本。
- 截图并导入。
- 拖拽文件到应用。
- 粘贴 URL。
- 浏览器插件保存当前页面。
- 文件夹监听。
- MCP/API 写入。

### 6.2 快捷导入流程

```text
快捷动作触发
  ↓
Command 读取上下文
  ↓
生成 ImportRequest
  ↓
ImportService.handle(request)
  ↓
返回轻量结果
  ↓
后台解析
```

### 6.3 快捷导入不能绕过主流程

任何快捷入口都不能直接写数据库或直接进记忆。

错误做法：

```text
快捷键 -> 直接写 memory_chunk
```

正确做法：

```text
快捷键 -> ImportRequest -> Import Pipeline -> SourceRecord -> Parse Job -> Memory
```

## 7. 外部文档连接器

外部文档不只支持“一次性导入”，还需要支持“持续同步”。但不同平台开放能力差异很大，不能用同一个实时同步承诺覆盖所有平台。

连接器能力分级：

```text
Level 1：链接保存
  保存外部链接、平台、标题、document_id，等待用户授权或导出。

Level 2：授权拉取
  用户授权后拉取文档内容，形成 SourceRecord 和版本快照。

Level 3：轮询同步
  定时检查外部文档的更新时间或版本号，发现变化后重新拉取。

Level 4：事件同步
  平台支持事件订阅/Webhook 时，收到变更事件后触发增量拉取。
```

V1 目标：

- 飞书：优先做到 Level 2，技术上可向 Level 4 演进。
- 腾讯文档：优先做到 Level 2 + Level 3。
- 有道云：优先做到 Level 1 + 手动导出/复制兜底；只有用户已有可用 API Key 或平台新接口可用时再做 Level 2。

同步后仍然必须进入统一导入流水线：

```text
ConnectorSyncEvent
  ↓
FetchExternalDocument
  ↓
CreateSourceRevision
  ↓
ParsePipeline
  ↓
MemorySegment / VectorIndex / GraphNode
  ↓
旧版本标记为 superseded，保留可追溯历史
```

### 7.1 飞书

飞书导入能力分层：

1. 粘贴链接导入。
2. 用户授权后通过 API 拉取。
3. 订阅云文档事件，收到文件编辑、标题变更等事件后触发同步。
4. API 不可用时提示用户导出文件上传。
5. 保留源链接、文档 ID、空间信息和标题。

飞书相关逻辑放在：

```text
FeishuImporter
FeishuClient
FeishuAuthProvider
FeishuMetadataMapper
FeishuSyncScheduler
FeishuEventReceiver
```

技术判断：

- 可直接连接：可行，但需要用户或企业授权。
- 及时同步：可行，飞书开放平台支持云文档事件订阅，但需要订阅权限，且通常要求应用或用户具备文档所有者/管理者等权限。
- V1 不应该承诺“所有飞书文档自动全量同步”，应该先做用户选择文档后的单文档/文件夹同步。

### 7.2 腾讯文档

腾讯文档导入能力分层：

1. 粘贴腾讯文档链接。
2. 用户 OAuth 授权后通过 Open API 拉取文档内容。
3. 通过定时轮询文件列表、文档元信息或更新时间判断是否需要重新同步。
4. API 不可用或权限不足时保存链接，并提示用户导出文件或复制内容。
5. 保留源链接、文档 ID、标题、授权账号和最近同步时间。

腾讯文档相关逻辑放在：

```text
TencentDocImporter
TencentDocClient
TencentDocAuthProvider
TencentDocMetadataMapper
TencentDocSyncScheduler
```

技术判断：

- 可直接连接：可行，腾讯文档开放平台提供 OAuth2.0 授权和 Open API。
- 及时同步：建议 V1 使用轮询，不优先承诺 Webhook 级实时同步。
- 同步频率：默认 15 到 60 分钟，可在用户打开应用、打开源资料库、手动点击“立即同步”时触发补偿同步。

### 7.3 有道云

有道云导入能力分层：

1. 粘贴链接导入。
2. 用户导出文件后导入。
3. 用户复制内容后导入。
4. 保留笔记本、标题、源链接等信息。

有道相关逻辑放在：

```text
YoudaoImporter
YoudaoClient
YoudaoAuthProvider
YoudaoMetadataMapper
```

技术判断：

- 可直接连接：不应作为 V1 默认承诺。有道云笔记 OpenAPI 官方页面已提示停止新增申请。
- 及时同步：V1 不承诺自动同步。
- 推荐方案：导出文件、复制内容、链接保存、未来适配用户已有 API Key 或官方新 MCP/API。

### 7.4 同步状态

外部连接器需要在源资料库中展示同步状态：

```text
sync_disabled      未开启同步
sync_connected     已连接
sync_polling       定时检查中
sync_event_ready   已开启事件订阅
syncing            同步中
sync_success       同步成功
sync_failed        同步失败
auth_expired       授权失效
export_required    需要导出导入
external_deleted   外部已删除
```

用户可见文案必须中文化：

```text
已连接飞书，最近同步 5 分钟前。
该腾讯文档授权已过期，请重新连接。
有道云暂不支持自动同步，请导出文件后导入。
检测到外部文档更新，已生成新版本并重新入记忆。
检测到外部文档已删除，本地资料和记忆已保留，请选择是否清理向量和图谱。
```

### 7.5 通用网页文档

通用网页文档走：

```text
GenericUrlImporter
GenericWebClient
ReadabilityMetadataExtractor
```

## 8. 失败和兜底

### 8.1 导入失败类型

```text
UNSUPPORTED_SOURCE
AUTH_REQUIRED
PERMISSION_DENIED
NETWORK_ERROR
RATE_LIMITED
SOURCE_NOT_FOUND
EXPORT_REQUIRED
FILE_TOO_LARGE
HASH_DUPLICATE
UNKNOWN_ERROR
```

### 8.2 用户可见提示

错误提示必须告诉用户下一步：

```text
飞书文档需要授权，请连接飞书账号。
该有道云笔记无法直接读取，请导出后上传。
该视频平台暂不支持直接解析，已保存链接，可手动上传视频文件。
该文件已存在，已合并为同一源资料。
```

### 8.3 兜底策略

所有外部来源都需要 fallback。

```text
API 导入失败
  ↓
保存链接
  ↓
提示授权/导出/复制内容
  ↓
用户补充源数据
  ↓
合并到同一 SourceRecord
```

## 9. 去重与合并

### 9.1 去重层级

- 文件 hash 去重。
- canonical URL 去重。
- 外部平台 document_id 去重。
- 文本 simhash 去重。
- embedding 语义近似去重。

### 9.2 合并策略

如果同一资料从不同入口进入：

```text
飞书链接导入
用户又上传导出 PDF
用户又复制正文
```

系统应合并到同一个 `SourceRecord` 或同一个 source group。

合并后保留多个来源证据：

```text
source_evidence:
  - feishu_url
  - exported_pdf
  - copied_text
```

## 10. 状态机

### 10.1 导入状态

```text
new
validating
fetching
saving
saved
partial
failed
needs_user_action
```

### 10.2 解析状态

```text
parse_pending
parsing
parse_success
parse_partial
parse_failed
llm_fallback_pending
llm_fallback_success
llm_fallback_failed
```

### 10.3 记忆状态

```text
memory_pending
indexing
memory_indexed
memory_partial
memory_failed
memory_removed
```

### 10.4 治理状态

```text
clean
suspected_polluted
polluted
quarantined
restored
deleted
```

## 11. 目录建议

```text
src/
  import/
    ImportService.ts
    ImporterRegistry.ts
    ImportPipeline.ts
    types.ts
    commands/
      ClipboardImportCommand.ts
      ScreenshotImportCommand.ts
      BrowserPageImportCommand.ts
      WatchedFolderImportCommand.ts
    importers/
      FileImporter.ts
      UrlImporter.ts
      FeishuImporter.ts
      YoudaoImporter.ts
      VideoLinkImporter.ts
      ScreenshotImporter.ts
      ClipboardImporter.ts
      McpImporter.ts
    adapters/
      FeishuClient.ts
      YoudaoClient.ts
      GenericWebClient.ts
      VideoPlatformClient.ts
    pipeline/
      ValidateRequestStep.ts
      DetectSourceStep.ts
      SelectImporterStep.ts
      FetchSourceStep.ts
      PersistRawDataStep.ts
      CreateSourceRecordStep.ts
      EnrichMetadataStep.ts
      EnqueueParseJobStep.ts
    state/
      SourceStateMachine.ts
      transitions.ts
```

## 12. 反模式

这些写法必须避免：

- 在导入主流程里写平台 if/else。
- 快捷键直接写记忆库。
- 飞书逻辑散落在 UI、service、worker 多处。
- URL 解析、下载、元数据提取写成一个巨型函数。
- 导入成功和解析成功混成一个状态。
- 删除源文件时不处理向量和图谱派生产物。
- 大模型兜底结果只用于本次，不沉淀规则或样例。
- 失败原因只写 `unknown error`。

## 13. V1 最小实现建议

V1 可以先实现这些 importer：

```text
FileImporter
UrlImporter
ClipboardImporter
ScreenshotImporter
FeishuImporter
YoudaoImporter
McpImporter
```

视频平台链接可以先挂在 `UrlImporter` 后面，以插件形式逐步拆成：

```text
VideoLinkImporter
BilibiliImporter
YouTubeImporter
DouyinImporter
```

V1 的关键不是平台覆盖多，而是架构上保证新增平台不会污染主流程。
