# 功能说明：飞书与腾讯文档连接器同步

## 1. 目标

V1 最少支持飞书和腾讯文档接入，降低用户反复复制、导出、上传资料的成本。用户连接账号后，可以选择外部文档或文件夹导入本地，系统同步新增和修改；外部删除不自动删除本地记忆，必须由用户手动确认删除范围。

## 2. 范围

V1 必做：

- 飞书文档连接器。
- 腾讯文档连接器。
- 保留外部文件夹结构导入。
- 支持导入到本地“未分类”后手动归类。
- 新建本地文件夹。
- 源资料移动到文件夹。
- 同步新增文档。
- 同步文档修改并生成新版本。
- 外部删除时标记风险，不自动删除本地向量和图谱。
- 用户手动选择删除源资料、文本片段、向量索引和图谱节点。

V1 不承诺：

- 所有空间自动全量同步。
- 所有平台实时同步。
- 多人冲突编辑的精细 diff。
- 跨设备云同步。

## 3. 连接器能力

### 飞书

飞书优先使用 OAuth/API 拉取文档内容。平台权限允许时，后续可通过云文档事件订阅触发同步。V1 界面上应允许用户选择“立即同步”，并为事件订阅预留状态。

### 腾讯文档

腾讯文档优先使用 OAuth/API 拉取文档内容。V1 同步策略以定时轮询和手动同步为主，不承诺 Webhook 级实时同步。

## 4. 数据模型补充

### ExternalConnector

```text
connector_id
platform                 feishu / tencent_docs
account_name
auth_status              connected / auth_expired / disconnected
sync_mode                manual / polling / event
last_sync_at
created_at
updated_at
```

### ExternalDocumentBinding

```text
binding_id
source_id
connector_id
external_document_id
external_parent_id
external_path
source_url
sync_status              sync_disabled / sync_connected / sync_polling / sync_event_ready / syncing / sync_success / sync_failed / auth_expired / external_deleted
source_lifecycle_status  active / external_deleted
last_remote_updated_at
last_sync_at
```

### SourceFolder

```text
folder_id
parent_folder_id
name
origin                  local / feishu / tencent_docs
external_parent_id
sort_order
created_at
updated_at
```

### SourceRevision

```text
revision_id
source_id
version
content_hash
change_type             created / updated / deleted_remote / manual_import
raw_snapshot_path
parsed_snapshot_id
created_at
```

## 5. 同步流程

### 新增同步

```text
连接器发现新文档
  -> 创建 SourceFolder 映射
  -> 创建 SourceRecord
  -> 创建 SourceRevision v1
  -> 进入解析流水线
  -> 写入文本片段、向量和图谱
```

### 修改同步

```text
连接器发现更新时间或 hash 变化
  -> 拉取最新内容
  -> 创建 SourceRevision vN
  -> 旧文本片段、向量和图谱标记 superseded
  -> 新版本重新解析并入记忆
  -> 源资料库显示同步成功和版本号
```

### 外部删除

```text
连接器发现外部文档不存在
  -> SourceRecord.trace_status 标记 external_deleted
  -> 不删除本地源文件
  -> 不删除文本片段、向量和图谱
  -> 源资料库展示删除决策入口
  -> 用户选择保留、隔离或清理
```

删除选项：

- 仅标记外部已删除：继续保留本地快照和记忆。
- 隔离本地资料：退出普通搜索、问答和图谱推荐。
- 删除源资料和记忆：删除源资料、文本片段、向量索引和图谱节点，保留审计记录。

## 6. UI 要求

### 导入中心

- 外部文档页签必须突出飞书和腾讯文档。
- 支持选择保留外部结构。
- 支持选择同步修改后生成新版本。
- 外部删除自动清理必须默认关闭。

### 源资料库

- 左侧展示资料结构树。
- 资料结构树包含本地文件夹、飞书空间、腾讯文档空间和未分类。
- 支持新建文件夹。
- 支持移动资料到文件夹。
- 粘贴飞书或腾讯文档链接导入时，默认自动归入对应平台空间。
- 右侧资料表展示文件夹、来源、同步状态、处理状态、是否入记忆、可追溯。
- 展示外部删除保护提示。
- 支持手动“立即同步”。

## 7. 验收标准

1. 用户可以连接飞书并导入至少一个文档。
2. 用户可以连接腾讯文档并导入至少一个文档。
3. 选择保留外部结构时，本地资料结构树能反映外部文件夹层级。
4. 选择导入到未分类时，资料进入未分类，后续可手动移动到本地文件夹。
5. 外部文档修改后，系统生成新版本并重新进入解析、向量和图谱流水线。
6. 外部文档删除后，系统不自动删除本地向量和图谱。
7. 用户可以选择是否删除源资料、向量和图谱。
8. 授权失效时，系统展示授权失效状态，并继续保留最后一次成功同步的本地快照。
