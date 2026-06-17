# Spike 012：向量索引与污染治理联动验证

## 验证目标

验证资料进入记忆系统后，文本片段可以被写入本地向量索引，并且源资料被标记为污染/隔离后，向量检索结果会同步排除相关内容。

## 已实现内容

- 新增 `vector_index` 本地表，用于保存文本片段对应的向量记录。
- 新增 `vector-service.js`：
  - `indexSegments()`：解析成功后为文本片段生成向量索引。
  - `vectorSearch()`：按查询文本进行向量相似度搜索。
- 解析链路在生成文本片段后自动写入向量索引。
- 污染治理链路会同步更新：
  - 源资料状态
  - 记忆片段状态
  - 图谱节点状态
  - 向量索引状态
- 新增接口：
  - `GET /api/vector/search?q=关键词`
- 新增验证脚本：
  - `npm run test:vector`

## 验证命令

```bash
rm -rf /tmp/lmh-vector-spike
LMH_DATA_DIR=/tmp/lmh-vector-spike npm run dev:api
LMH_DATA_DIR=/tmp/lmh-vector-spike npm run test:vector
```

## 验证结果

```json
{
  "before": 1,
  "after": 0
}
```

结论：

- 导入文本后，本地解析成功。
- 文本片段成功进入向量索引。
- 使用“语义搜索”可以命中向量结果。
- 源资料被隔离后，向量检索不再返回该资料相关结果。

## 当前限制

- 当前向量实现是确定性的轻量 hash-bag 向量，用于验证工程链路，不代表最终语义效果。
- 第一版产品实现时应切换为可插拔 Embedding Provider：
  - 本地 embedding 模型优先。
  - 外部 embedding API 可选。
  - 每条向量记录需要保存 provider、model、dimension、版本号，便于升级和重建索引。

## 下一步

- 将搜索层升级为混合检索：
  - 关键词检索
  - 向量检索
  - 图谱邻居扩展
  - 来源可信度与时间排序
- 在图谱节点详情中展示“来自哪些源资料、哪些文本片段、哪些向量索引”。
- 增加向量索引重建能力，支持模型升级后不丢源数据地重新生成索引。
