// Fire the example workflow at the running app and print the execution trail.
// Usage: node scripts/run-example.mjs "message to classify" [baseUrl]
import { EXAMPLE } from "../src/lib/example.ts";

const input = process.argv[2] ?? "I can't log in and all our data is gone!";
const base = process.argv[3] ?? "http://localhost:3000";

const res = await fetch(`${base}/api/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input, workflow: EXAMPLE }),
});
const started = await res.json();
if (res.status !== 202) {
  console.error("start failed", res.status, started);
  process.exit(1);
}
let run;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  run = await (await fetch(`${base}/api/runs/${started.runId}`)).json();
  if (run.status === "done" || run.status === "error") break;
}
console.log(`input: ${input}`);
console.log(`status: ${run.status}${run.error ? ` (${run.error})` : ""}`);
for (const s of run.steps)
  console.log(` ${s.index + 1}. ${s.label} -> ${s.answer ?? s.status}${s.error ? ` (${s.error})` : ""} [${s.ms ?? 0}ms]`);
console.log(`ended at: ${run.endNodeId ?? "-"}`);
process.exit(run.status === "done" ? 0 : 1);
