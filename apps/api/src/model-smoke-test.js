const baseUrl = `http://127.0.0.1:${process.env.LMH_PORT || 4317}`;

async function main() {
  const providers = await get("/api/models/providers");
  assert(
    providers.providers.some((item) => item.provider_id === "deepseek"),
    "providers should include DeepSeek"
  );
  assert(
    providers.providers.some((item) => item.provider_id === "dashscope"),
    "providers should include DashScope"
  );

  const imported = await post("/api/import", {
    entrypoint: "onboarding",
    source_hint: "text",
    payload: {
      title: "模型问答测试",
      text: "DeepSeek 和通义千问都应该作为模型供应商配置模板出现。"
    }
  });
  await post("/api/parse", { source_id: imported.source.source_id });

  const answer = await post("/api/ask", {
    provider_id: "mock",
    question: "DeepSeek 和通义千问是否支持？"
  });
  assert(answer.answer.includes("本地记忆") || answer.answer.includes("相关资料"), "mock answer should respond");
  assert(answer.citations.length >= 1, "mock answer should include citations");

  console.log("Model smoke test passed");
  console.log(JSON.stringify({ provider_count: providers.providers.length, citations: answer.citations.length }, null, 2));
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
