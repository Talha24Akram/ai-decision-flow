"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EXAMPLE } from "@/lib/example";
import { findStart, validate } from "@/lib/graph";
import type { FlowNodeData, NodeStatus, RunRecord, Workflow } from "@/lib/types";

type FNode = Node<FlowNodeData>;

const GRAPH_KEY = "adf-graph-v1";
const HISTORY_KEY = "adf-history-v1";
const RING: Record<NodeStatus, string> = {
  idle: "border-border",
  running: "border-amber-500 ring-2 ring-amber-400 animate-pulse",
  yes: "border-emerald-500 ring-2 ring-emerald-400",
  no: "border-rose-500 ring-2 ring-rose-400",
  reached: "border-sky-500 ring-2 ring-sky-400",
  error: "border-red-600 ring-2 ring-red-500",
};

const yesNo = (h: string) => (h === "yes" ? { label: "YES", color: "#059669" } : { label: "NO", color: "#e11d48" });

function DecisionNode({ id, data }: NodeProps<FNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div className={`w-64 rounded-lg border-2 bg-card p-2 text-card-foreground shadow ${RING[data.status ?? "idle"]}`}>
      <Handle type="target" position={Position.Top} />
      <input
        className="nodrag w-full bg-transparent text-sm font-semibold outline-none"
        value={data.label}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        aria-label="node title"
      />
      <textarea
        className="nodrag nowheel mt-1 h-20 w-full resize-none rounded border bg-background p-1 text-xs"
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="A yes/no question about the input..."
        aria-label="node prompt"
      />
      {data.status === "yes" || data.status === "no" ? (
        <div className="mt-1 text-center text-xs font-bold">{data.status.toUpperCase()}</div>
      ) : null}
      <div className="mt-1 flex justify-between px-4 text-[10px] font-bold">
        <span className="text-emerald-600">YES</span>
        <span className="text-rose-600">NO</span>
      </div>
      <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "25%", background: "#059669" }} />
      <Handle id="no" type="source" position={Position.Bottom} style={{ left: "75%", background: "#e11d48" }} />
    </div>
  );
}

function OutcomeNode({ id, data }: NodeProps<FNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div className={`w-48 rounded-full border-2 bg-muted px-4 py-2 text-center ${RING[data.status ?? "idle"]}`}>
      <Handle type="target" position={Position.Top} />
      <input
        className="nodrag w-full bg-transparent text-center text-sm font-semibold outline-none"
        value={data.label}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        aria-label="outcome title"
      />
    </div>
  );
}

const nodeTypes = { decision: DecisionNode, outcome: OutcomeNode };

function toEdge(source: string, handle: string, target: string): Edge {
  const { label, color } = yesNo(handle);
  return {
    id: `e-${source}-${handle}`, source, target, sourceHandle: handle, label,
    style: { stroke: color, strokeWidth: 2 }, labelStyle: { fill: color, fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color },
  };
}

const fromWorkflow = (wf: Workflow): { nodes: FNode[]; edges: Edge[] } => ({
  nodes: wf.nodes.map((n) => ({ ...n, data: { ...n.data, status: "idle" as const } })) as FNode[],
  edges: wf.edges.map((e) => toEdge(e.source, e.sourceHandle ?? "yes", e.target)),
});

const toWorkflow = (nodes: FNode[], edges: Edge[]): Workflow => ({
  nodes: nodes.map((n) => ({
    id: n.id, type: n.type, position: n.position,
    data: { kind: n.data.kind, label: n.data.label, prompt: n.data.prompt },
  })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })),
});

interface HistoryItem { id: string; input: string; status: string; end: string; at: string }

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FNode>(fromWorkflow(EXAMPLE).nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(fromWorkflow(EXAMPLE).edges);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("Hi, I can't log in to my account and our whole team is locked out.");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const counter = useRef(100);

  // Load the saved graph + history once, in the browser.
  useEffect(() => {
    // deferred one tick so the effect itself does not set state synchronously
    void Promise.resolve().then(() => {
    try {
      const saved = localStorage.getItem(GRAPH_KEY);
      if (saved) {
        const g = fromWorkflow(JSON.parse(saved));
        setNodes(g.nodes);
        setEdges(g.edges);
      }
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"));
    } catch { /* corrupt storage: keep the example */ }
    setLoaded(true);
    });
  }, [setNodes, setEdges]);

  // Auto-save the graph locally (Phase 2: "store graph state locally").
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(GRAPH_KEY, JSON.stringify(toWorkflow(nodes, edges))); } catch { /* quota */ }
  }, [nodes, edges, loaded]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target || !c.sourceHandle) return;
    // one edge per answer: connecting YES again replaces the old YES edge
    setEdges((es) => [...es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)), toEdge(c.source!, c.sourceHandle!, c.target!)]);
  }, [setEdges]);

  const addNode = (kind: "decision" | "outcome") => {
    const id = `n${++counter.current}-${Date.now() % 100000}`;
    setNodes((ns) => [...ns, {
      id, type: kind, position: { x: 100 + (ns.length % 5) * 30, y: 100 + (ns.length % 5) * 30 },
      data: kind === "decision" ? { kind, label: "New decision", prompt: "" } : { kind, label: "New outcome", prompt: "" },
    }]);
  };

  // Overlay the run on the graph: node rings + animated edges.
  const shownNodes = useMemo(() => nodes.map((n) => {
    let status: NodeStatus = "idle";
    if (run) {
      const step = run.steps.find((s) => s.nodeId === n.id);
      if (step) status = step.status === "running" ? "running" : step.status === "error" ? "error" : step.answer === "YES" ? "yes" : "no";
      else if (run.endNodeId === n.id) status = run.status === "error" ? "error" : "reached";
    }
    return { ...n, data: { ...n.data, status } };
  }), [nodes, run]);

  const shownEdges = useMemo(() => edges.map((e) => {
    const taken = run?.edgesTaken.includes(e.id);
    const lastTaken = run?.status === "running" && run.edgesTaken.at(-1) === e.id;
    return {
      ...e,
      animated: !!lastTaken || (run?.status === "running" && !!taken),
      style: { ...e.style, strokeWidth: taken ? 4 : 2, opacity: run && !taken ? 0.25 : 1 },
    };
  }), [edges, run]);

  const remember = (r: RunRecord) => {
    const endNode = nodes.find((n) => n.id === r.endNodeId);
    const item: HistoryItem = { id: r.id, input: r.input, status: r.status, end: endNode?.data.label ?? "-", at: r.startedAt };
    setHistory((h) => {
      const next = [item, ...h.filter((x) => x.id !== r.id)].slice(0, 10);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };

  const start = async () => {
    setError("");
    const wf = toWorkflow(nodes, edges);
    const problem = validate(wf);
    if (problem) return setError(problem);
    setBusy(true);
    setRun(null);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: wf, input }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const deadline = Date.now() + 180_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 600));
        const r: RunRecord = await (await fetch(`/api/runs/${body.runId}`)).json();
        setRun(r);
        if (r.status === "done" || r.status === "error") { remember(r); break; }
        if (Date.now() > deadline) throw new Error("timed out waiting for the run (is the Inngest dev server up?)");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(toWorkflow(nodes, edges), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "workflow.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const wf = JSON.parse(await file.text());
      const problem = validate(wf);
      if (problem && !String(problem).includes("empty prompt")) throw new Error(problem);
      const g = fromWorkflow(wf);
      setNodes(g.nodes);
      setEdges(g.edges);
      setRun(null);
      setError("");
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const openHistory = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`);
    if (res.ok) setRun(await res.json());
  };

  const startNode = findStart(toWorkflow(nodes, edges));

  return (
    <div className="flex h-screen w-screen">
      <div className="relative flex-1">
        <ReactFlow
          nodes={shownNodes} edges={shownEdges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          fitView deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
          <Panel position="top-left" className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => addNode("decision")}>+ Decision node</Button>
            <Button size="sm" variant="secondary" onClick={() => addNode("outcome")}>+ Outcome node</Button>
            <Button size="sm" variant="outline" onClick={exportJson}>Export JSON</Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Import JSON</Button>
            <Button size="sm" variant="ghost" onClick={() => { const g = fromWorkflow(EXAMPLE); setNodes(g.nodes); setEdges(g.edges); setRun(null); }}>Reset example</Button>
            <input ref={fileRef} type="file" accept="application/json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
          </Panel>
        </ReactFlow>
      </div>

      <aside className="flex w-[380px] flex-col gap-3 overflow-y-auto border-l bg-background p-3">
        <h1 className="text-lg font-bold">AI Decision Flow</h1>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Run the workflow</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Start node: <b>{startNode?.data.label ?? "none"}</b>. Each decision node asks the model its question about this text.
            </p>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} maxLength={2000} aria-label="workflow input" />
            <div className="flex items-center gap-2">
              <Button onClick={start} disabled={busy || !input.trim()}>{busy ? "Running..." : "Run"}</Button>
              {run && <Badge variant={run.status === "error" ? "destructive" : "secondary"}>{run.status}</Badge>}
              {run && run.status === "error" && !busy && <Button size="sm" variant="outline" onClick={start}>Retry run</Button>}
            </div>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            {run?.error && <p className="text-xs text-red-600">{run.error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Execution log</CardTitle></CardHeader>
          <CardContent>
            {!run || run.steps.length === 0 ? <p className="text-xs text-muted-foreground">Nothing has run yet.</p> : (
              <ol className="space-y-2 text-xs">
                {run.steps.map((s) => (
                  <li key={s.index} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{s.index + 1}. {s.label}</span>
                      <Badge variant={s.status === "error" ? "destructive" : s.answer === "YES" ? "default" : "secondary"}>
                        {s.status === "running" ? "asking model..." : s.status === "error" ? "failed" : s.answer}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{s.prompt}</p>
                    {s.ms != null && <p className="mt-1">{s.ms} ms</p>}
                    {s.error && <p className="mt-1 text-red-600">{s.error}</p>}
                  </li>
                ))}
                {run.endNodeId && run.status !== "error" && (
                  <li className="rounded bg-sky-100 p-2 font-semibold text-sky-900">
                    Ended at: {nodes.find((n) => n.id === run.endNodeId)?.data.label}
                  </li>
                )}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">History</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? <p className="text-xs text-muted-foreground">No runs yet.</p> : (
              <ul className="space-y-1 text-xs">
                {history.map((h) => (
                  <li key={h.id}>
                    <button className="w-full rounded border p-1 text-left hover:bg-muted" onClick={() => openHistory(h.id)}>
                      <span className="font-semibold">{h.status === "error" ? "failed" : h.end}</span>
                      <span className="block truncate text-muted-foreground">{h.input}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
