# Spike Results 020：模型配置本地保存

## 结论

模型配置本地保存最小链路已通过。

已验证：

- Provider 配置可保存到本地数据目录。
- API Key 不会从 API 响应返回。
- Provider 列表可展示配置状态。
- 问答接口在请求未传 `config` 时，可读取本地保存的配置。
- 配置文件权限设置为 `600`。

## 已实现内容

新增：

```text
apps/api/src/model-config-store.js
apps/api/src/model-config-store.test.js
apps/api/src/model-config-api-smoke-test.js
```

更新：

```text
apps/api/src/server.js
apps/web/public/js/settings-view.js
apps/web/public/main.js
apps/web/public/styles.css
```

新增命令：

```bash
npm run test:model-config
npm run test:model-config-api
```

## 配置文件

当前 Spike 将配置写入：

```text
config/providers.local.json
```

文件权限：

```text
600
```

API 返回时只暴露：

- provider_id
- base_url
- model
- enabled
- has_api_key

不会返回：

- api_key

## 新增接口

```http
GET /api/models/configs
POST /api/models/configs
```

## 设置页

设置页 Provider 卡片已支持：

- 展示已配置/未配置。
- 展示已配置模型名。
- 展开配置表单。
- 保存 base_url、model、api_key。

## 验证结果

```text
npm run test:model-config
npm run test:model-config-api
npm run test:model-provider
```

均已通过。

## 当前限制

- API Key 当前是本地明文文件保存，只通过本地目录和 `600` 权限隔离。
- 还没有接入 macOS Keychain / Windows Credential Manager。
- 还没有对配置做真实连通性测试。
- 还没有任务模型策略。

## 下一步

继续补任务模型策略：

- 问答默认模型。
- 解析兜底默认模型。
- 摘要/图谱推断默认模型。
- 配置缺失时自动回退到 Mock 或搜索兜底。
