# Spike Results 021：任务模型策略

## 结论

任务模型策略最小链路已通过。

已验证：

- 默认策略存在。
- 用户可保存不同任务的默认 Provider。
- 问答默认读取 `chat` 策略。
- 解析兜底默认读取 `parse_fallback` 策略。
- 设置页可选择问答默认模型和解析兜底模型。

## 已实现内容

新增：

```text
apps/api/src/model-policy-store.js
apps/api/src/model-policy-store.test.js
apps/api/src/model-policy-api-smoke-test.js
```

更新：

```text
apps/api/src/server.js
apps/api/src/parser-service.js
apps/web/public/index.html
apps/web/public/js/settings-view.js
apps/web/public/main.js
apps/web/public/js/state.js
apps/web/public/styles.css
```

新增命令：

```bash
npm run test:model-policy
npm run test:model-policy-api
```

## 策略文件

保存位置：

```text
config/model-policies.json
```

当前默认：

```json
[
  { "task": "chat", "provider_id": "mock", "mode": "balanced" },
  { "task": "parse_fallback", "provider_id": "mock", "mode": "balanced" }
]
```

## 新增接口

```http
GET /api/models/policies
POST /api/models/policies
```

## 当前限制

- 只支持任务到单个 Provider 的映射。
- 还没有 fallback provider 列表。
- 还没有按“省 token / 平衡 / 深度”改变调用行为。
- 还没有单独配置 embedding、rerank、图谱推断模型。

## 下一步

继续补问答兜底和错误引用治理：

- 未配置模型时明确返回搜索兜底。
- 用户可以标记错误引用。
- 错误引用关联源资料污染隔离。
