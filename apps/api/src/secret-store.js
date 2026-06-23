import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { getDataDir, initDataDir } from "./data-store.js";

/**
 * 本地密钥加密(AES-256-GCM)。
 *
 * 把 API Key 等敏感值在落盘前加密,密钥保存在数据目录的本地文件 `.secret-key`
 * (0600,首次自动生成,位于仓库外/已 gitignore)。读取时解密;对未加密的旧明文
 * 值向后兼容(原样返回),便于平滑迁移。
 */

const PREFIX = "enc:v1:";
const keyCache = new Map(); // dataDir -> Buffer(32)

function keyPath(dataDir) {
  return path.join(dataDir, "config", ".secret-key");
}

async function getKey(dataDir) {
  if (keyCache.has(dataDir)) return keyCache.get(dataDir);
  await initDataDir(dataDir);
  const file = keyPath(dataDir);
  let key;
  try {
    const hex = (await readFile(file, "utf8")).trim();
    key = Buffer.from(hex, "hex");
    if (key.length !== 32) throw new Error("invalid key length");
  } catch {
    key = randomBytes(32);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, key.toString("hex"), { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
  }
  keyCache.set(dataDir, key);
  return key;
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export async function encryptSecret(plaintext, dataDir = getDataDir()) {
  if (!plaintext) return "";
  if (isEncrypted(plaintext)) return plaintext;
  const key = await getKey(dataDir);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export async function decryptSecret(value, dataDir = getDataDir()) {
  if (!value) return "";
  if (!isEncrypted(value)) return value; // 向后兼容明文旧值
  try {
    const key = await getKey(dataDir);
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
