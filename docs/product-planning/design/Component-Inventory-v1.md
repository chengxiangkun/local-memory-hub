# 组件清单：Local Memory Hub V1

## 1. 目标

本文件把 V1 页面拆成可实现的 UI 组件。

用途：

- 帮助设计和工程对齐组件边界。
- 避免页面开发时重复造组件。
- 明确每个组件的状态、依赖和优先级。
- 为后续代码脚手架提供依据。

优先级：

- P0：V1 核心闭环必须实现。
- P1：V1 应实现，用于补齐体验。
- P2：可后置。

## 2. 全局组件

### 2.1 AppShell

**优先级：P0**

职责：

- 管理整体布局。
- 包含左侧导航、顶部栏、主内容区、右侧详情面板。
- 支持窄屏折叠。

组成：

- `SidebarNav`
- `TopCommandBar`
- `MainContent`
- `DetailPanel`

状态：

- 正常
- 详情面板打开
- 详情面板关闭
- 窄屏导航折叠

### 2.2 SidebarNav

**优先级：P0**

导航项：

- 图谱首页
- 工作台
- Inbox
- 源资料
- 记忆库
- 搜索/问答
- 治理
- 外部接入
- 设置

要求：

- 支持当前页面高亮。
- 支持图标 + 中文标签。
- 窄屏可折叠。

### 2.3 TopCommandBar

**优先级：P0**

职责：

- 全局搜索。
- 快捷导入。
- 显示当前模型状态。
- 显示解析任务状态。

子组件：

- `GlobalSearchInput`
- `QuickImportButton`
- `ModelStatusPill`
- `TaskStatusIndicator`

### 2.4 DetailPanel

**优先级：P0**

职责：

- 展示当前选中对象详情。

支持对象：

- 源资料
- 记忆
- 图谱节点
- 解析任务
- 污染记录
- 外部调用日志

状态：

- 空
- 加载中
- 正常
- 错误
- 可折叠

### 2.5 StatusBadge

**优先级：P0**

职责：

统一展示状态。

状态类型：

- 已保存
- 等待解析
- 解析中
- 解析成功
- 解析失败
- 等待入记忆
- 已入记忆
- 入记忆失败
- 已污染
- 已隔离
- 可追溯
- 追溯异常

要求：

- 用户可见文案必须是中文。
- 失败状态可点击查看原因。
- 污染状态视觉上要和普通失败区分。

### 2.6 EmptyState

**优先级：P0**

职责：

展示页面空状态。

需要支持：

- 图谱首页空状态
- 源资料库空状态
- 搜索无结果
- 治理无污染
- 外部接入未启用

### 2.7 ErrorState

**优先级：P0**

职责：

展示错误和下一步操作。

要求：

- 错误提示必须可理解。
- 必须给出下一步，例如授权、上传兜底、重试、查看日志。

### 2.8 ConfirmDialog

**优先级：P0**

使用场景：

- 删除源资料
- 删除派生产物
- 标记污染
- 关闭 MCP
- 清除模型配置

## 3. 首次启动引导组件

### 3.1 OnboardingFlow

**优先级：P0**

步骤：

1. 选择数据目录。
2. 配置大模型，可跳过。
3. 导入一段文本。
4. 展示生成结果。
5. 进入图谱首页。

状态：

- 初次进入
- 当前步骤
- 步骤完成
- 跳过模型配置
- 导入示例文本
- 完成

### 3.2 DataDirectoryStep

**优先级：P0**

职责：

- 让用户选择本地数据目录。
- 显示当前选择路径。
- 检查目录读写权限。

状态：

- 未选择
- 已选择
- 权限不足

### 3.3 ModelSetupStep

**优先级：P0**

职责：

- 引导用户配置大模型。
- 支持跳过。

支持入口：

- 主流模型供应商
- 自定义 OpenAI-Compatible Endpoint
- 自定义 Anthropic-Compatible Endpoint
- 本地模型

子组件：

- `ProviderSelector`
- `ApiKeyInput`
- `EndpointInput`
- `TestConnectionButton`
- `SkipModelSetupButton`

### 3.4 FirstTextImportStep

**优先级：P0**

职责：

- 让用户随便导入一段文本。
- 提供示例文本。
- 生成第一条源资料。

状态：

- 空输入
- 已输入
- 保存中
- 保存成功
- 保存失败

### 3.5 FirstMemoryCreatedSummary

**优先级：P0**

职责：

展示首次导入结果。

内容：

- 已保存
- 解析成功
- 已入记忆
- 已生成图谱节点

操作：

- 进入我的记忆图谱

## 4. 图谱首页组件

### 4.1 GraphHomePage

**优先级：P0**

职责：

- 作为应用默认首页。
- 展示 Obsidian 风格图谱。
- 支持搜索、快捷导入和节点详情。

子组件：

- `GraphCanvas`
- `GraphToolbar`
- `GraphSearchInput`
- `GraphNodeDetailPanel`
- `GraphEmptyState`
- `GraphLegend`

### 4.2 GraphCanvas

**优先级：P0**

职责：

- 渲染图谱节点和关系。
- 支持缩放、平移、聚焦。

状态：

- 无数据
- 加载中
- 正常
- 搜索聚焦
- 节点选中
- 加载失败

要求：

- 图谱首页必须可用。
- 污染节点默认隐藏。
- 节点点击后打开详情。

### 4.3 GraphToolbar

**优先级：P0**

功能：

- 搜索节点
- 节点类型筛选
- 来源筛选
- 关系类型筛选
- 污染节点开关
- 时间线模式
- 导出快照

### 4.4 GraphNodeDetailPanel

**优先级：P0**

展示：

- 节点名称
- 节点类型
- 来源资料
- 关联记忆
- 相邻节点
- 关系原因
- 污染状态

操作：

- 打开源资料
- 进入问答
- 标记污染
- 从图谱移除

### 4.5 GraphLegend

**优先级：P1**

职责：

- 解释节点类型和关系类型。

## 5. 工作台组件

### 5.1 DashboardPage

**优先级：P1**

职责：

- 展示系统状态概览。
- 不作为默认首页。

模块：

- 处理任务
- 最近源资料
- 最近记忆召回
- 污染提醒
- MCP 状态

### 5.2 ProcessingSummaryCards

**优先级：P1**

展示：

- 解析中
- 解析失败
- 已入记忆
- 已污染
- 需要授权

## 6. Inbox 组件

### 6.1 InboxPage

**优先级：P0**

职责：

- 展示新导入资料和待处理资料。

子组件：

- `InboxFilterTabs`
- `InboxItemList`
- `InboxItemRow`
- `InboxItemDetail`

### 6.2 InboxFilterTabs

**优先级：P0**

筛选：

- 全部
- 等待解析
- 解析中
- 解析失败
- 需要授权
- 需要上传兜底
- 已污染

### 6.3 InboxItemRow

**优先级：P0**

字段：

- 标题
- 来源类型
- 来源平台
- 导入方式
- 导入时间
- 解析状态
- 入记忆状态
- 污染状态
- 操作

## 7. 源资料组件

### 7.1 SourceLibraryPage

**优先级：P0**

职责：

- 管理源文件、链接、截图和外部文档。

子组件：

- `SourceFolderTree`
- `SourceFilterBar`
- `SourceTable`
- `SourceDetailPanel`
- `SourceDeleteDialog`

### 7.2 SourceTable

**优先级：P0**

字段：

- 文件名/标题
- 文件夹
- 日期
- 类型
- 来源
- 源路径/源链接
- 解析状态
- 是否已入记忆
- 追溯状态
- 污染状态

### 7.3 SourceDetailPanel

**优先级：P0**

显示：

- 基础信息
- 来源信息
- 原始路径或 URL
- 解析记录
- 入记忆记录
- 关联记忆
- 关联图谱节点
- 删除和污染记录

操作：

- 打开源文件
- 预览
- 重新解析
- 加入记忆
- 从记忆中移除
- 标记污染
- 删除

### 7.4 SourceDeleteDialog

**优先级：P0**

选项：

- 移入回收站，并从搜索中排除
- 仅删除源文件，保留记忆
- 删除源文件和解析文本
- 删除源文件、向量索引和图谱
- 全部删除

## 8. 记忆库组件

### 8.1 MemoryLibraryPage

**优先级：P0**

职责：

- 展示 AI 可使用的记忆。

### 8.2 MemoryTable

**优先级：P0**

字段：

- 记忆标题
- 来源资料
- 文本片段数量
- 向量索引状态
- 图谱状态
- 摘要状态
- 最近被使用
- 污染状态

### 8.3 MemoryDetailPanel

**优先级：P0**

操作：

- 查看文本片段
- 打开源资料
- 从向量中移除
- 从图谱中移除
- 重建向量索引
- 重建图谱关系
- 标记污染

## 9. 搜索/问答组件

### 9.1 SearchAskPage

**优先级：P0**

职责：

- 统一承接搜索和问答。

子组件：

- `SearchAskInput`
- `SearchFallbackResults`
- `AnswerPanel`
- `CitationList`
- `RetrievedContextPanel`
- `MarkCitationIssueDialog`

### 9.2 SearchFallbackResults

**优先级：P0**

使用场景：

- 未配置大模型。
- 用户选择搜索模式。
- 大模型调用失败但检索成功。

展示：

- 源资料
- 命中片段
- 相关记忆
- 相关图谱节点
- 配置模型入口

### 9.3 AnswerPanel

**优先级：P0**

展示：

- 答案
- 模型信息
- 使用到的文本片段
- 使用到的图谱节点
- 引用来源

### 9.4 CitationList

**优先级：P0**

展示：

- 来源标题
- 位置
- 片段
- 打开源资料
- 标记错误引用

## 10. 治理组件

### 10.1 GovernancePage

**优先级：P0**

Tab：

- 污染内容
- 隔离内容
- 删除记录
- 解析失败
- 追溯异常

### 10.2 PollutionList

**优先级：P0**

字段：

- 标题
- 类型
- 来源
- 问题类型
- 影响范围
- 标记时间
- 当前状态

### 10.3 ImpactScopePanel

**优先级：P0**

展示：

- 受影响文本片段
- 受影响图谱节点
- 受影响图谱关系
- 历史问答引用

操作：

- 恢复
- 删除派生产物
- 删除全部

## 11. 模型设置组件

### 11.1 ModelSettingsPage

**优先级：P0**

职责：

- 管理模型供应商和任务模型策略。

子组件：

- `ProviderList`
- `AddProviderDialog`
- `CustomEndpointForm`
- `TaskModelPolicyForm`
- `ModelCallLogList`

### 11.2 ProviderList

**优先级：P0**

展示：

- 供应商名称
- 连接状态
- 默认任务
- 测试连接
- 编辑
- 删除

### 11.3 CustomEndpointForm

**优先级：P0**

字段：

- 类型：OpenAI-Compatible / Anthropic-Compatible
- 名称
- 接口地址
- API Key
- 默认模型

操作：

- 测试连接
- 保存

### 11.4 TaskModelPolicyForm

**优先级：P0**

任务：

- 问答模型
- 解析兜底模型
- 图谱推断模型
- 向量索引模型

模式：

- 省 token
- 平衡
- 深度

## 12. 外部接入组件

### 12.1 IntegrationPage

**优先级：P0**

职责：

- 管理 MCP/API/Codex 接入。

模块：

- MCP 状态
- 连接信息
- 工具列表
- Codex 接入说明
- 调用日志
- 权限设置

### 12.2 McpStatusPanel

**优先级：P0**

操作：

- 启用 MCP
- 关闭 MCP
- 复制配置
- 查看文档

### 12.3 ExternalCallLogList

**优先级：P0**

字段：

- 时间
- 工具
- 请求来源
- 返回范围
- 状态

## 13. 组件实现顺序建议

### 第一批

- `AppShell`
- `SidebarNav`
- `TopCommandBar`
- `StatusBadge`
- `DetailPanel`
- `OnboardingFlow`
- `GraphHomePage`
- `GraphCanvas`
- `GraphNodeDetailPanel`

### 第二批

- `InboxPage`
- `SourceLibraryPage`
- `SourceTable`
- `SourceDetailPanel`
- `SourceDeleteDialog`
- `MemoryLibraryPage`

### 第三批

- `SearchAskPage`
- `SearchFallbackResults`
- `AnswerPanel`
- `CitationList`
- `GovernancePage`
- `PollutionList`

### 第四批

- `ModelSettingsPage`
- `CustomEndpointForm`
- `IntegrationPage`
- `McpStatusPanel`
- `GraphExport`

## 14. 命名原则

代码组件可以使用英文命名，但用户界面必须使用中文文案。

示例：

```text
组件名：MemoryChunkList
用户文案：文本片段

组件名：EmbeddingStatusBadge
用户文案：向量索引状态
```

