# 飞书接入说明

## 当前定位

飞书接入用于降低资料进入本地记忆系统的成本。第一版优先保证：

- 飞书文档链接可以保存为源资料。
- 飞书 `docx` 和 `wiki` 链接可以解析文本。
- 飞书知识库目录可以读取一层子节点。
- 导入后保留源链接、本地源文件、解析状态、入记忆状态和追溯状态。
- 外部删除不自动删除本地向量和图谱，必须由用户确认。

## 当前已实现

### 链接导入

支持链接形态：

```text
https://xxx.feishu.cn/docx/{document_id}
https://xxx.feishu.cn/wiki/{node_token}
```

系统会自动识别 `feishu.cn` 链接，归入“飞书空间”文件夹。

### 文档解析

解析流程：

```text
飞书链接 -> 获取 tenant_access_token -> 解析 docx/wiki token -> 读取文档块 -> 转成纯文本 -> 切分文本片段 -> 写入向量和图谱
```

当前支持：

- 普通文本块
- 标题块
- mention 用户/文档标题的文本提取
- 未知块结构的递归文本提取兜底

### 知识库目录

支持从 `wiki` 目录链接读取一层子节点：

```text
GET /open-apis/wiki/v2/spaces/{space_id}/nodes?parent_node_token={node_token}
```

已验证可读取：

- 子文档标题
- `obj_type`
- `node_token`
- `obj_token`
- 是否存在子节点

### 真实测试命令

在项目根目录创建 `.env.local`：

```bash
FEISHU_APP_ID=你的飞书应用 ID
FEISHU_APP_SECRET=你的飞书应用 Secret
FEISHU_TEST_DOC_URL=飞书文档或 wiki 文档链接
FEISHU_TEST_FOLDER_URL=飞书 wiki 目录链接
```

执行：

```bash
npm run test:feishu-real
npm run test:feishu-folder-real
npm run import:feishu-real
```

`test:feishu-real` 验证文档读取、文本解析、入记忆、图谱生成和目录读取。

`import:feishu-real` 会把真实飞书数据导入当前本地 UI 使用的数据目录。

## 当前未实现

### 还不能自动加载用户所有文档

原因不是技术不可行，而是权限和产品边界需要补齐：

- 需要用户 OAuth 授权。
- 需要用户选择同步范围。
- 需要记录远端文档 ID、版本号、更新时间。
- 需要增量同步任务。
- 需要外部删除保护策略。

### 还不是完整自动同步

当前同步能力是开发验证级：

- 已知文档链接可以读取。
- 已知目录链接可以读取一层子节点。
- 可以手动导入真实数据。

还没有：

- 周期轮询任务
- 飞书事件订阅回调
- 全量空间扫描
- 删除检测任务
- OAuth 授权页面

## 正式同步设计

### 推荐第一版同步范围

不要默认同步用户所有飞书内容。第一版建议只支持：

```text
用户选择一个飞书知识库目录 -> 本地保存目录结构 -> 定时同步新增和修改 -> 外部删除只标记
```

这样权限更清晰，也避免把用户不想入库的内容自动拉进本地记忆。

### 同步状态

每个远端文档需要记录：

```text
platform = feishu
remote_node_token
remote_obj_token
remote_obj_type
remote_parent_token
remote_title
remote_updated_at
local_source_id
sync_status
last_sync_at
last_error
```

### 新增

远端出现新文档：

```text
保存源链接 -> 归入飞书空间/远端目录 -> 解析 -> 入记忆 -> 生成图谱
```

### 修改

远端更新时间变化：

```text
重新读取文本 -> 生成新解析结果 -> 更新文本片段、向量和图谱 -> 保留追溯记录
```

第一版可以直接覆盖派生数据。后续再做版本对比。

### 删除

远端文档不存在或无权限：

```text
标记 trace_status = external_deleted
不删除本地源资料
不删除向量和图谱
提示用户选择：仅隔离 / 删除源文件 / 删除派生数据
```

## Feishu CLI 的使用边界

飞书开放平台提供的 CLI 对开发有帮助，但不建议作为用户主链路。

适合：

- 开发期调试飞书 API。
- 探测 token、空间、文档块结构。
- 作为排障工具。
- 学习飞书 MCP/AI 工具调用方式。

不适合：

- 作为一键启动的必需依赖。
- 作为后台同步核心。
- 让用户额外安装 CLI。
- 依赖 CLI 输出格式做长期数据同步。

产品主链路应继续由本地后端直接调用飞书开放 API。

## 页面帮助文案

可以在“导入中心 -> 飞书文档 -> 帮助”里展示：

```text
当前支持飞书 docx/wiki 链接导入和知识库目录读取。自动同步所有文档需要用户授权和同步范围选择，第一版建议从指定知识库目录同步。外部删除不会自动删除本地记忆，需要用户确认。
```

