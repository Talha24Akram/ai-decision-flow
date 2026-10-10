export type NodeKind = "decision" | "outcome";

export type NodeStatus = "idle" | "running" | "yes" | "no" | "reached" | "error";

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  /** decision nodes: the yes/no question sent to the model */
  prompt: string;
  status?: NodeStatus;
}

export interface WorkflowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** "yes" | "no": which answer takes this edge */
  sourceHandle?: string | null;
}

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface RunStep {
  index: number;
  nodeId: string;
  label: string;
  prompt: string;
  status: "running" | "done" | "error";
  answer?: "YES" | "NO";
  ms?: number;
  error?: string;
  at: string;
}

export interface RunRecord {
  id: string;
  status: "queued" | "running" | "done" | "error";
  input: string;
  startedAt: string;
  finishedAt?: string;
  steps: RunStep[];
  /** edge ids taken, in order */
  edgesTaken: string[];
  /** node id where the run ended (an outcome node, or the last decision) */
  endNodeId?: string;
  error?: string;
}

export const MAX_STEPS = 20;
