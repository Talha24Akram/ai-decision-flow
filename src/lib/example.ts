import type { Workflow } from "./types";

const d = (id: string, x: number, y: number, label: string, prompt: string) => ({
  id, type: "decision", position: { x, y }, data: { kind: "decision" as const, label, prompt },
});
const o = (id: string, x: number, y: number, label: string) => ({
  id, type: "outcome", position: { x, y }, data: { kind: "outcome" as const, label, prompt: "" },
});
const e = (source: string, handle: "yes" | "no", target: string) => ({
  id: `e-${source}-${handle}`, source, target, sourceHandle: handle,
});

/** "Is this a support request? YES -> support, NO -> sales", grown a little. */
export const EXAMPLE: Workflow = {
  nodes: [
    d("n1", 340, 0, "Support request?", "Is this message a customer support request (something is broken or they need help using the product)?"),
    d("n2", 40, 230, "Urgent?", "Does this message describe an outage, data loss, or someone unable to log in?"),
    d("n3", 640, 230, "Sales question?", "Is this message a question about pricing, plans or buying?"),
    o("n4", -120, 480, "Page the on-call engineer"),
    o("n5", 220, 480, "Support queue"),
    o("n6", 520, 480, "Sales team"),
    o("n7", 820, 480, "Ignore / not relevant"),
  ],
  edges: [
    e("n1", "yes", "n2"), e("n1", "no", "n3"),
    e("n2", "yes", "n4"), e("n2", "no", "n5"),
    e("n3", "yes", "n6"), e("n3", "no", "n7"),
  ],
};
