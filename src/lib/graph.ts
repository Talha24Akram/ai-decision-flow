import type { Workflow, WorkflowNode } from "./types";

/** The start node is the first node (left to right) that has no incoming edge. */
export function findStart(wf: Workflow): WorkflowNode | undefined {
  const targets = new Set(wf.edges.map((e) => e.target));
  return [...wf.nodes]
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
    .find((n) => !targets.has(n.id));
}

export function nextEdge(wf: Workflow, nodeId: string, answer: "YES" | "NO") {
  const handle = answer.toLowerCase();
  return wf.edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
}

/** Returns a problem description, or null when the graph can run. */
export function validate(wf: unknown): string | null {
  const w = wf as Workflow;
  if (!w || !Array.isArray(w.nodes) || !Array.isArray(w.edges)) return "workflow must have nodes and edges";
  if (w.nodes.length === 0) return "workflow has no nodes";
  if (w.nodes.length > 50) return "workflow has too many nodes (max 50)";
  for (const n of w.nodes) {
    if (!n?.id || !n.data || (n.data.kind !== "decision" && n.data.kind !== "outcome")) return "a node is malformed";
    if (n.data.kind === "decision" && !String(n.data.prompt ?? "").trim()) {
      return `decision node "${n.data.label || n.id}" has an empty prompt`;
    }
  }
  if (!findStart(w)) return "no start node (every node has an incoming edge)";
  return null;
}
