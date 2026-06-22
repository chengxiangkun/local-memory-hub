# SPIKE 027 - 源资料文件夹与手动归类

## 目标

让源资料库从静态分类展示推进到可运行的本地文件夹能力，支持新建文件夹和把源资料移动到指定文件夹。

## 已完成

- 新增 `apps/api/src/source-folder-store.js`。
- 新增 `GET /api/source-folders`。
- 新增 `POST /api/source-folders`。
- 新增 `POST /api/source-folders/move`。
- 源资料库左侧文件夹树改为动态渲染。
- 源资料表“文件夹”列支持下拉选择并保存归类。
- 新增 `npm run test:source-folders`。

## 当前边界

- 文件夹和归类映射保存在本地 JSON 配置中。
- 当前不做拖拽移动，先用表格下拉选择完成归类。
- 外部结构树的真实层级同步等真实连接器 API 接入后再写入同一套文件夹数据。
