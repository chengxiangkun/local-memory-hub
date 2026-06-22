# SPIKE 025 - 本机能力检查 Doctor

## 目标

为一键启动和设置页排障补一个最小可用的本机能力检查，明确本机是否具备本地存储、PDF、OCR、视频音频解析和桌面打包所需的关键工具。

## 已完成

- 新增 `apps/api/src/system-doctor.js`。
- 新增 `GET /api/system/doctor`。
- 设置页新增“本机能力检查”区域。
- 新增 `npm run test:doctor`。

## 检查项

- 本地数据目录读写。
- `sqlite3`。
- `ffmpeg` / `ffprobe`。
- `pdftotext`。
- `tesseract`。
- `rustc` / `cargo`。

## 决策

第一版只检查能力并展示中文状态，不自动安装依赖。自动安装涉及 macOS/Windows 权限、网络、包管理器差异，后续应放到一键安装器或桌面端引导里处理。
