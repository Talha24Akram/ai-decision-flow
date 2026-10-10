import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { askYesNo } from "@/lib/llm";
import { findStart, nextEdge } from "@/lib/graph";
import { updateRun } from "@/lib/runstore";
import { MAX_STEPS, type Workflow } from "@/lib/types";

/**
 * Runs a workflow graph. Every decision node is one Inngest step (`step.run`), so each model call is
 * individually retried, memoised and shown in the Inngest dashboard. The path through the graph is
 * decided by the YES/NO each step returns.
 */
export const runWorkflow = inngest.createFunction(
  { id: "run-workflow", retries: 2, triggers: [{ event: "workflow/run" }] },
  async ({ event, step }) => {
    const { runId, workflow, input } = event.data as { runId: string; workflow: Workflow; input: string };
    const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
    const start = findStart(workflow);

    await step.run("start", () =>
      updateRun(runId, (r) => {
        r.status = "running";
      }),
    );

    let current = start;
    for (let i = 0; i < MAX_STEPS && current; i++) {
      const node = current;
      if (node.data.kind === "outcome") {
        await step.run(`reach-${node.id}-${i}`, () =>
          updateRun(runId, (r) => {
            r.endNodeId = node.id;
            r.status = "done";
            r.finishedAt = new Date().toISOString();
          }),
        );
        return { path: node.id };
      }

      await step.run(`begin-${node.id}-${i}`, () =>
        updateRun(runId, (r) => {
          r.steps[i] = { index: i, nodeId: node.id, label: node.data.label, prompt: node.data.prompt, status: "running", at: new Date().toISOString() };
        }),
      );

      let answer: "YES" | "NO";
      try {
        answer = await step.run(`decide-${node.id}-${i}`, async () => {
          const t0 = Date.now();
          let a: "YES" | "NO";
          try {
            a = await askYesNo(node.data.prompt, input);
          } catch (e) {
            // A bad key or missing model will not fix itself, so don't burn retries on it.
            const code = (e as { status?: number }).status;
            if (code === 401 || code === 403 || code === 404) {
              throw new NonRetriableError(e instanceof Error ? e.message : String(e));
            }
            throw e;
          }
          await updateRun(runId, (r) => {
            r.steps[i] = { ...r.steps[i], status: "done", answer: a, ms: Date.now() - t0 };
          });
          return a;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await step.run(`fail-${node.id}-${i}`, () =>
          updateRun(runId, (r) => {
            r.steps[i] = { ...r.steps[i], status: "error", error: message };
            r.status = "error";
            r.error = `Node "${node.data.label}" failed after retries: ${message}`;
            r.endNodeId = node.id;
            r.finishedAt = new Date().toISOString();
          }),
        );
        return { error: message };
      }

      const edge = nextEdge(workflow, node.id, answer);
      if (!edge) {
        await step.run(`dead-end-${node.id}-${i}`, () =>
          updateRun(runId, (r) => {
            r.status = "done";
            r.endNodeId = node.id;
            r.error = `No edge for ${answer} from "${node.data.label}"; the run stopped here.`;
            r.finishedAt = new Date().toISOString();
          }),
        );
        return { stoppedAt: node.id };
      }
      await step.run(`take-${edge.id}-${i}`, () =>
        updateRun(runId, (r) => {
          r.edgesTaken.push(edge.id);
        }),
      );
      current = byId.get(edge.target);
    }

    await step.run("too-long", () =>
      updateRun(runId, (r) => {
        r.status = "error";
        r.error = `Stopped after ${MAX_STEPS} steps (is there a loop in the graph?).`;
        r.finishedAt = new Date().toISOString();
      }),
    );
    return { error: "max steps" };
  },
);

export const functions = [runWorkflow];
