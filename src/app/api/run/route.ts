import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { inngest } from "@/inngest/client";
import { validate } from "@/lib/graph";
import { saveRun } from "@/lib/runstore";
import type { RunRecord } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input || input.length > 2000) {
    return NextResponse.json({ error: "input must be 1-2000 characters" }, { status: 400 });
  }
  const problem = validate(body?.workflow);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const run: RunRecord = {
    id: randomUUID(),
    status: "queued",
    input,
    startedAt: new Date().toISOString(),
    steps: [],
    edgesTaken: [],
  };
  await saveRun(run);
  try {
    await inngest.send({ name: "workflow/run", data: { runId: run.id, workflow: body.workflow, input } });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not reach Inngest (is the dev server running?): ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ runId: run.id }, { status: 202 });
}
