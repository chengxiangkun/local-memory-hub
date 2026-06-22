# S8 Spike：Force Graph 图谱库验证

## 目标

验证 `force-graph` 是否适合作为 Local Memory Hub V1 Obsidian 风格图谱首页的候选渲染库。

## 验证能力

- Canvas 图谱渲染。
- 缩放和平移。
- 节点拖拽。
- 节点 hover 高亮。
- 节点点击后更新右侧详情。
- 搜索命中后居中和放大。
- 污染/隔离节点过滤。
- 暗色 Obsidian 风格基础视觉。

## 命令

```bash
npm install
npm run check
npm run start
npm run build
npm audit --omit=dev
```

访问地址：

```text
http://127.0.0.1:5188/
```

## 当前结论

`force-graph` 可以作为 V1 图谱首页的首选候选继续验证。

原因：

- 自带 Canvas 渲染、力导向布局、拖拽、缩放和平移。
- hover/click 接入简单。
- 生产构建体积在可接受范围。
- MIT 许可。

注意：

- 样式刷新不能调用不存在的 `graph.refresh()`，需要重新设置 accessor。
- 节点标签需要额外绘制或使用 tooltip，默认 Canvas 节点不直接显示复杂标签。
- 正式接入时需要封装为 `GraphRendererAdapter`，避免业务代码依赖具体库 API。

