# Spike Results 018：视频/音频解析最小验证

## 结论

视频/音频最小本地解析链路已通过。

当前能做到：

- 使用 `ffprobe` 读取媒体元数据。
- 使用 `ffmpeg` 从视频中提取 16kHz 单声道音频。
- 把提取出的音频保存到本地数据目录。
- 缺少本地语音转写器时返回中文错误。
- 开启大模型兜底后，媒体源资料仍可进入记忆系统、向量索引和图谱。

当前不能做到：

- 本地语音转文字。
- 视频画面理解。
- 自动总结真实视频内容。

这些不能伪装成已经完成。

## 当前机器能力

已发现：

```text
ffmpeg
ffprobe
```

未发现：

```text
whisper
whisper-cpp
faster-whisper
```

## 已实现内容

更新：

```text
apps/api/src/parser-service.js
apps/api/src/data-store.js
```

新增：

```text
apps/api/src/media-smoke-test.js
```

新增命令：

```bash
npm run test:media
```

数据目录新增：

```text
extracted/audio/
```

## 验证结果

```text
npm run test:media
Media smoke test passed
```

同时回归：

```text
npm run test:parser
npm run test:data-dir
```

## V1 实现策略

V1 不直接绑定某一个本地转写引擎。

推荐保留：

```text
TranscriptionAdapter
  - MissingTranscriberAdapter（默认：返回中文可解释错误）
  - WhisperCppAdapter（候选）
  - FasterWhisperAdapter（候选）
  - ModelProviderTranscriptionAdapter（外部模型兜底）
```

原因：

- 本地转写模型体积大。
- 中文识别质量依赖模型和硬件。
- Mac/Windows 打包复杂度高。
- npm CLI 用户和桌面用户环境差异很大。

## 外部方案扫描

- `ffmpeg/ffprobe`：适合媒体探测、音频抽取、转码，是 V1 媒体预处理默认选择。
- `whisper.cpp`：适合本地离线转写，部署简单但需要模型文件。
- `faster-whisper`：转写效果和速度好，但引入 Python/运行时依赖，对一键启动更重。

V1 第一阶段先打通媒体预处理和兜底链路，不强塞本地转写模型。

## 下一步

进入 S9/S10 深化：

- 模型 Provider 的真实配置和调用。
- 解析失败后选择哪一个模型兜底。
- 记录模型调用日志和 token 成本。
- 后续再把转写作为 `TranscriptionAdapter` 接入。
