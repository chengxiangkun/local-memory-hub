/**
 * Shared browser-side state for the current prototype.
 *
 * Keep this object small and serializable. It represents fetched app data and
 * transient UI selections, not DOM references and not derived display strings.
 */

export const state = {
  graph: { nodes: [], edges: [] },
  graphMode: "relation",
  sources: [],
  providers: [],
  modelPolicies: [],
  externalConnectors: [],
  sourceFolders: [],
  sourceFolderAssignments: {},
  systemDoctor: null,
  version: null,
  habits: null,
  mcpStatus: null,
  selectedNodeId: null,
  matchedNodeIds: null,
  selectedFolderId: null,
  sourceQuery: "",
  sourceFilter: "",
  sourcePage: 1,
  sourcePageSize: 10,
  parsingSourceIds: new Set(),
  health: null,
  apiOnline: true
};
