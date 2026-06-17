# Spike Results 005：图谱首页前端渲染

## 结论

第五批 Spike 已完成。

已验证：

- 新增最小 Web 前端。
- 可访问图谱首页。
- 可调用本地 API `/api/graph`。
- 可在空状态下导入示例文本。
- 示例文本会进入导入管线。
- 示例文本会解析成文本片段。
- 示例文本会生成图谱节点和关系。
- 图谱页面可渲染节点和边。
- 图谱节点可点击查看详情。
- 图谱搜索框可高亮/弱化节点。

## 访问地址

API：

```text
http://127.0.0.1:4317
```

图谱首页：

```text
http://127.0.0.1:3100
```

## 新增命令

启动 API：

```bash
npm run dev:api
```

启动 Web：

```bash
npm run dev:web
```

## 新增文件

```text
apps/web/src/server.js
apps/web/public/index.html
apps/web/public/styles.css
apps/web/public/main.js
```

## 当前限制

- 这是零依赖 SVG 静态图谱，不是最终图谱方案。
- 当前布局是环形布局，不是力导向布局。
- 还没有真实 Obsidian 级交互。
- 还没有拖拽、缩放和平移。
- 还没有图谱搜索接口，当前只在前端过滤节点。
- 还没有图谱节点坐标持久化。

## 下一步建议

1. 验证专业图库：Sigma.js 或 Cytoscape.js。
2. 增加图谱缩放、平移、拖拽。
3. 增加图谱节点搜索 API。
4. 隔离源资料时同步隔离图谱节点。
5. 接入首次启动引导页面。

