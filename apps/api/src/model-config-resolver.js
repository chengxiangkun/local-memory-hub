import { getProviderConfig } from "./model-config-store.js";

/**
 * 解析单次大模型调用要使用的 base_url / api_key / model。
 *
 * 调用方（如 /api/ask）必须把“已生效的 provider_id”一并传入，确保与
 * routeChat 实际选中的 provider 保持一致。否则会出现 routeChat 选中策略
 * provider（如 deepseek），但 config 仍按默认 mock 解析为空，导致已配置的
 * key 加载不到、报“需要 base_url、api_key 和 model”的不一致问题。
 *
 * @param {{config?: object, provider_id?: string}} body 请求体
 * @param {string} dataDir 数据目录
 * @param {string} [providerId] 已生效的 provider_id，优先级最高
 * @returns {Promise<object>} 模型配置；无保存配置时返回空对象
 */
export async function resolveModelConfig(body, dataDir, providerId) {
  if (body.config && Object.keys(body.config).length > 0) return body.config;
  const resolvedProviderId = providerId || body.provider_id || "mock";
  const saved = await getProviderConfig(resolvedProviderId, dataDir);
  if (!saved) return {};
  return {
    base_url: saved.base_url,
    api_key: saved.api_key,
    model: saved.model
  };
}
