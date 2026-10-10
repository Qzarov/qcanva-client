/**
 * A refusal over the plan's limit (402 { code: "plan_limit" }) from any API
 * call: the server says which limit. One dialog for all of them, shown from
 * the API client so no caller has to handle it; the call still fails.
 */
export type PlanLimitKind = 'resources' | 'storage' | 'collaborators' | 'mcp';
export type PlanLimitBody = { code: 'plan_limit'; limit: PlanLimitKind; used: number; max: number; message?: string };

export const isPlanLimit = (status: number, body: unknown): body is PlanLimitBody =>
  status === 402 && Boolean(body) && (body as { code?: unknown }).code === 'plan_limit';

type Listener = (body: PlanLimitBody) => void;
let listener: Listener | null = null;

/** Set once by the app (App.vue): what to do when a limit is hit. */
export function onPlanLimit(next: Listener | null) {
  listener = next;
}

export function reportPlanLimit(body: PlanLimitBody) {
  listener?.(body);
}
