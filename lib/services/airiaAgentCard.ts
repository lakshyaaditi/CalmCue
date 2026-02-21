/**
 * Optional Airia AgentCard registration (feature-flagged).
 * Stub: no-op when AIRIA_ENABLE_AGENTCARD is not set or endpoint unclear.
 */

const AGENTCARD_ENABLED = process.env.AIRIA_ENABLE_AGENTCARD === "true";

export async function registerAgentCard(_payload: {
  name: string;
  description?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!AGENTCARD_ENABLED) {
    return { ok: false, reason: "agentcard_disabled" };
  }
  // TODO: POST to Airia AgentCard endpoint with X-API-Key when docs are available
  return { ok: false, reason: "not_implemented" };
}
