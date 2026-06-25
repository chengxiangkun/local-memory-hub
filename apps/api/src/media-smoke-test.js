import { execFile } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { handleImport } from "./import-pipeline.js";
import { initModelProviders } from "./model-provider.js";
import { parseSource } from "./parser-service.js";
import { getSourceById, initSqlite } from "./sqlite-store.js";

const execFileAsync = promisify(execFile);
const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-media-"));

try {
  await main();
  console.log("Media smoke test passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function main() {
  initModelProviders();
  await initSqlite(dataDir);

  const videoFile = path.join(dataDir, "sample.mp4");
  await createSampleVideo(videoFile);

  const imported = await handleImport(
    {
      entrypoint: "media_smoke_test",
      source_hint: "file",
      payload: {
        title: "本地视频解析测试",
        file_path: videoFile
      }
    },
    dataDir
  );

  const failed = await parseSource(imported.source.source_id, {}, dataDir);
  assertEqual(failed.status, "failed", "media parse should fail without transcriber");
  assert(failed.error.includes("缺少本地语音转写器"), `unexpected media error: ${failed.error}`);

  const audioPath = path.join(dataDir, "extracted", "audio", `${imported.source.source_id}.wav`);
  await stat(audioPath);

  // 音视频无本地转写器时:文本模型收不到音频内容,不应"假兜底"入记忆。
  // 应显式失败且不入记忆(修复 #29)。
  const fallback = await parseSource(imported.source.source_id, { llm_fallback: true }, dataDir);
  assertEqual(fallback.status, "failed", "media without transcriber should fail clearly, not fake-fallback");

  const source = await getSourceById(imported.source.source_id, dataDir);
  assert(source.memory_status !== "memory_indexed", "media without transcriber must not enter memory");
}

async function createSampleVideo(videoFile) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=160x90:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=1",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    videoFile
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}
