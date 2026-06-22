# Spike Results 017：文本、PDF、图片解析最小验证

## 结论

S6 最小解析链路已通过。

V1 解析策略：

```text
文本 / Markdown / 常见代码文本：内置直接解析
PDF：优先调用本地 pdftotext，缺失或失败时允许大模型兜底
图片：优先调用本地 tesseract OCR，缺失或失败时允许大模型兜底
未知格式：保留源文件，走失败状态或大模型兜底
```

## 当前机器能力

已发现：

```text
ffmpeg: /opt/homebrew/bin/ffmpeg
```

未发现：

```text
pdftotext
tesseract
ocrmypdf
```

因此当前机器可以继续验证视频/音频拆解能力，但不能直接验证真实 PDF 文本抽取和图片 OCR。

## 已实现内容

更新：

```text
apps/api/src/parser-service.js
```

新增：

```text
apps/api/src/parser-smoke-test.js
```

新增命令：

```bash
npm run test:parser
```

已验证：

- Markdown 文件可本地解析。
- 本地解析结果可写入 `extracted/text/`。
- 解析结果可生成文本片段。
- 解析结果可进入向量索引。
- 解析结果可生成图谱节点。
- PDF 本地解析失败时返回中文错误。
- 图片 OCR 失败时可触发大模型兜底。
- 大模型兜底后源资料可入记忆。

## 验证结果

```text
npm run test:parser
Parser smoke test passed
```

## 当前限制

- 当前 PDF 解析依赖系统 `pdftotext`，本机未安装。
- 当前图片 OCR 依赖系统 `tesseract`，本机未安装。
- V1 正式分发不能要求普通用户手动安装这些工具。
- 现阶段未做 Word、Excel、PPT、EPUB 的解析。
- PDF 扫描件需要 OCR，不是 `pdftotext` 能解决。

## 正式实现建议

V1 不要把所有解析能力一次性做重。

优先级：

1. 内置文本、Markdown、URL 文本快照解析。
2. PDF 文本层解析。
3. 图片 OCR。
4. 视频/音频转写。
5. Office 文档解析。

打包策略：

- 桌面版优先考虑随应用打包必要的小工具，避免用户手动配置。
- npm CLI 模式先提供 `doctor` 检查，提示缺失工具和兜底方式。
- 所有解析器必须返回明确中文错误，不能只暴露系统异常。
- 解析失败不影响源文件保存。

## 依赖扫描结论

- `pdftotext`/Poppler：适合 PDF 文本层抽取，但需要打包或安装。
- `tesseract`：适合本地 OCR，但模型文件较大，中文识别还需要语言包。
- `ffmpeg`：本机已存在，后续可用于视频/音频拆解，不等于语音转写。

## 下一步

继续推进视频/音频解析 Spike：

- 使用 `ffmpeg` 抽取音频。
- 评估本地转写方案。
- 如果本地转写不可用，则进入大模型/外部模型兜底。
