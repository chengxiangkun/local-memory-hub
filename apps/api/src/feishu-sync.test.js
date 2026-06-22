import { planFeishuSync } from "./feishu-sync-service.js";

try {
  const remoteNodes = [
    { node_token: "A", title: "新增文档", url: "u/A", edit_time: "100" },
    { node_token: "B", title: "未变文档", url: "u/B", edit_time: "200" },
    { node_token: "C", title: "已改文档", url: "u/C", edit_time: "350" }
  ];
  const localSources = [
    { source_id: "src-B", remote_node_token: "B", remote_edit_time: "200" }, // 未变
    { source_id: "src-C", remote_node_token: "C", remote_edit_time: "300" }, // edit_time 变化
    { source_id: "src-D", remote_node_token: "D", remote_edit_time: "400" }, // 远端已无
    { source_id: "src-manual", remote_node_token: "", remote_edit_time: "" } // 非同步来源,忽略
  ];

  const plan = planFeishuSync(remoteNodes, localSources);

  assert(plan.toAdd.length === 1 && plan.toAdd[0].node_token === "A", "A 应作为新增");
  assert(plan.toUpdate.length === 1 && plan.toUpdate[0].source.source_id === "src-C", "C 应作为修改重拉");
  assert(plan.toSkip.length === 1 && plan.toSkip[0].source.source_id === "src-B", "B 应跳过");
  assert(plan.toDelete.length === 1 && plan.toDelete[0].source_id === "src-D", "D 应标记外部删除");
  // 没有 remote_node_token 的手动来源不应被判为删除
  assert(!plan.toDelete.some((item) => item.source_id === "src-manual"), "无远端标记的来源不参与删除判定");

  console.log("Feishu sync plan test passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
