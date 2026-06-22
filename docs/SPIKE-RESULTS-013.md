# Spike Results 013：Force Graph 图谱库验证

## 结论

`force-graph` 可以作为 V1 图谱首页的首选候选继续推进。

它比当前零依赖 SVG 原型更适合正式实现 Obsidian 风格图谱基础交互：

- 缩放。
- 平移。
- 节点拖拽。
- hover 高亮。
- 点击节点。
- 搜索后居中和缩放。
- Canvas 力导向布局。

## 验证位置

```text
spikes/s8-graph-library-force-graph/
```

访问地址：

```text
http://127.0.0.1:5188/
```

## 依赖信息

关键依赖：

- `force-graph@1.51.4`
- `vite@7.3.5`
- `esbuild@0.28.1`，通过 npm overrides 修复低危审计问题

许可：

- `force-graph` 为 MIT。

## 验证结果

### 运行检查

```bash
npm run check
```

结果：通过。

### 安全审计

```bash
npm audit --omit=dev
```

结果：0 vulnerabilities。

### 生产构建

```bash
npm run build
```

结果：通过。

构建产物：

```text
dist/index.html                   1.65 kB │ gzip: 0.88 kB
dist/assets/index-Dv6WilGw.css    2.79 kB │ gzip: 1.18 kB
dist/assets/index-BoItQXcD.js   183.40 kB │ gzip: 61.49 kB
```

### 浏览器验证

使用系统 Chrome 验证：

- 页面渲染 1 个 Canvas。
- 当前过滤后显示 54 个节点、80 条关系。
- 搜索“主题 2”后能定位节点。
- 右侧详情面板能更新。
- 控制台无错误。

截图：

```text
/var/folders/bz/xv2g0n612xl5jq95vcjcrnp00000gn/T/s8-force-graph-spike-v2.png
```

## 发现的问题

### 1. 样式刷新 API 不能假设存在

初版 Spike 使用了不存在的 `graph.refresh()`，浏览器报错。

修正方式：

- hover、click、search 后重新设置 `nodeColor`、`nodeVal`、`linkColor`、`linkWidth`、`linkDirectionalParticles` 等 accessor。

正式实现时必须把图库 API 封装在适配器内，避免业务层直接依赖细节。

### 2. 标签显示需要单独设计

`force-graph` 默认更适合 tooltip 和 Canvas 节点绘制。若要实现 Obsidian 风格常驻标签，需要验证：

- `nodeCanvasObject` 自定义绘制。
- 只展示关键节点标签。
- 搜索或 hover 时显示标签。
- 高密度节点下的标签遮挡策略。

### 3. 节点跟随鼠标仍不进入 V1

`force-graph` 支持力导向和拖拽，但“节点跟随鼠标移动/靠近避让/局部力场扰动”仍属于后置增强，不作为 V1 验收项。

## 建议

下一步优先做 `GraphRendererAdapter` 设计：

```text
GraphViewModel -> GraphRendererAdapter -> ForceGraphRenderer
```

正式前端不要直接把业务状态写进 `force-graph` 调用点。

V1 可采用：

- 当前 SVG 原型作为 fallback。
- `force-graph` 作为正式图谱候选实现。
- 继续保留 D3 force / Sigma.js 作为后备方案。

