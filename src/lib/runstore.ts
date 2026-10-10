import { promises as fs } from "fs";
import path from "path";
import type { RunRecord } from "./types";

// File-backed so the Next route handlers and the Inngest function (same process) always agree.
const DIR = path.join(process.cwd(), ".runs");
const file = (id: string) => path.join(DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);

export async function saveRun(run: RunRecord) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file(run.id), JSON.stringify(run, null, 2));
}

export async function loadRun(id: string): Promise<RunRecord | null> {
  try {
    return JSON.parse(await fs.readFile(file(id), "utf8"));
  } catch {
    return null;
  }
}

export async function updateRun(id: string, fn: (r: RunRecord) => void) {
  const run = await loadRun(id);
  if (!run) return;
  fn(run);
  await saveRun(run);
}
