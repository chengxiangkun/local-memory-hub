const NODE_TYPES = ["source", "topic", "memory", "person", "project", "idea"];

const TYPE_LABELS = {
  source: "源资料",
  topic: "主题",
  memory: "记忆",
  person: "人物",
  project: "项目",
  idea: "想法"
};

export function buildMockGraph() {
  const nodes = Array.from({ length: 58 }, (_, index) => {
    const type = NODE_TYPES[index % NODE_TYPES.length];
    const quarantined = index % 19 === 0;
    return {
      id: `node-${index + 1}`,
      label: `${TYPE_LABELS[type]} ${index + 1}`,
      type,
      sourcePath: type === "source" ? `D:/Memory/raw/doc-${index + 1}.pdf` : "",
      status: quarantined ? "quarantined" : "clean",
      description: `${TYPE_LABELS[type]}节点，用于验证 Force Graph 的缩放、拖拽、搜索和详情交互。`
    };
  });

  const links = [];
  for (let index = 1; index < nodes.length; index += 1) {
    links.push({
      source: nodes[index].id,
      target: nodes[Math.max(0, index - 1 - (index % 5))].id,
      type: index % 3 === 0 ? "semantic" : "source",
      reason: index % 3 === 0 ? "语义相似" : "来自同一源资料"
    });
  }
  for (let index = 0; index < 42; index += 1) {
    links.push({
      source: nodes[(index * 7) % nodes.length].id,
      target: nodes[(index * 11 + 9) % nodes.length].id,
      type: "related",
      reason: "图谱扩展关系"
    });
  }

  return { nodes, links };
}
