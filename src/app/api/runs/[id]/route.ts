import { NextResponse } from "next/server";
import { loadRun } from "@/lib/runstore";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await loadRun(id);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "run not found" }, { status: 404 });
}
