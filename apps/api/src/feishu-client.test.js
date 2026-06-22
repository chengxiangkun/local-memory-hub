import assert from "node:assert/strict";
import { extractFeishuDocxToken, extractFeishuWikiToken, feishuBlocksToText } from "./feishu-client.js";

assert.equal(
  extractFeishuDocxToken("https://example.feishu.cn/docx/AbCdEf123?from=from_copylink"),
  "AbCdEf123"
);

assert.equal(
  extractFeishuWikiToken("https://example.feishu.cn/wiki/PvqPwRLduiNWU6ksSAVccfven1c?from=from_copylink"),
  "PvqPwRLduiNWU6ksSAVccfven1c"
);

assert.equal(
  feishuBlocksToText([
    { heading1: { elements: [{ text_run: { content: "标题" } }] } },
    { text: { elements: [{ text_run: { content: "正文" } }, { mention_user: { name: "张三" } }] } },
    { paragraph: { elements: [{ text_run: { content: "段落" } }] } }
  ]),
  "标题\n正文张三\n段落"
);

console.log("Feishu client test passed");
