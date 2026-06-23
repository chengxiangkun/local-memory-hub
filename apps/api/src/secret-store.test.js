import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initDataDir } from "./data-store.js";
import { encryptSecret, decryptSecret, isEncrypted } from "./secret-store.js";
import { saveProviderConfig, getProviderConfig, providerConfigPath } from "./model-config-store.js";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "lmh-secret-"));
process.env.LMH_DATA_DIR = dataDir;

try {
  await initDataDir(dataDir);

  // 加密往返
  const enc = await encryptSecret("my-api-key-123", dataDir);
  assert(isEncrypted(enc), "加密结果应带 enc 前缀");
  assert(!enc.includes("my-api-key-123"), "密文不应包含明文");
  assert((await decryptSecret(enc, dataDir)) === "my-api-key-123", "解密应还原明文");

  // 向后兼容:明文原样返回
  assert((await decryptSecret("plain-legacy-key", dataDir)) === "plain-legacy-key", "明文旧值应原样返回");
  // 已加密再加密不应二次包裹
  assert((await encryptSecret(enc, dataDir)) === enc, "已加密值不应被二次加密");
  // 空值
  assert((await encryptSecret("", dataDir)) === "" && (await decryptSecret("", dataDir)) === "", "空值处理");

  // 与 model-config-store 集成:落盘密文,读取明文
  await saveProviderConfig({ provider_id: "deepseek", base_url: "https://x/v1", model: "m", api_key: "secret-xyz" }, dataDir);
  const raw = await readFile(providerConfigPath(dataDir), "utf8");
  assert(!raw.includes("secret-xyz"), "配置文件不应明文存 key");
  assert(raw.includes("enc:v1:"), "配置文件应存密文");
  const cfg = await getProviderConfig("deepseek", dataDir);
  assert(cfg.api_key === "secret-xyz", "getProviderConfig 应返回解密后的明文 key");

  console.log("Secret store test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
