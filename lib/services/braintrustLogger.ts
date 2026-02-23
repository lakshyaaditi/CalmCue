/**
 * Braintrust logging for CalmCue: focus-summary and session-end traces.
 * No-op when BRAINTRUST_API_KEY is not set. Uses initLogger + traced() for observability.
 * Reads API key from .env file so it is not truncated (e.g. keys containing "=").
 */

import { initLogger } from "braintrust";

function getApiKey(): string {
  return process.env.BRAINTRUST_API_KEY?.trim() ?? "";
}

function getProject(): string {
  return process.env.BRAINTRUST_PROJECT?.trim() || "CalmCue";
}

let loggerInstance: ReturnType<typeof initLogger> | null = null;

async function getLogger(): Promise<ReturnType<typeof initLogger> | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (loggerInstance === null) {
    loggerInstance = initLogger({
      projectName: getProject(),
      apiKey,
      setCurrent: false,
    });
  }
  return loggerInstance;
}

export type FocusSummaryLog = {
  lastSeconds: number;
  transcriptLineCount: number;
  source: string;
  bulletsCount: number;
  errorMessage?: string;
};

export async function logFocusSummary(data: FocusSummaryLog): Promise<void> {
  try {
    const logger = await getLogger();
    if (!logger) return;
    await logger.traced(
      async (span) => {
        span.log({
          input: {
            lastSeconds: data.lastSeconds,
            transcriptLineCount: data.transcriptLineCount,
          },
          output: {
            source: data.source,
            bulletsCount: data.bulletsCount,
          },
          ...(data.errorMessage && {
            metadata: { errorMessage: data.errorMessage },
          }),
        });
      },
      { name: "focus-summary", type: "task" }
    );
    await logger.flush();
  } catch (err) {
    console.error("Braintrust focus-summary log error:", err);
  }
}

export type SessionEndLog = {
  sessionId: string;
  reward: number;
  overloadScore: number;
  annoyanceScore: number;
  metrics: {
    overlapSeconds: number;
    interruptionsCount: number;
    shoutSpikesCount: number;
    toastCount: number;
    focusPromptsCount: number;
    recapsSentCount: number;
    feedbackTooAggressiveCount: number;
    feedbackTooWeakCount: number;
  };
  newPolicyVersion?: number;
};

export async function logSessionEnd(data: SessionEndLog): Promise<void> {
  try {
    const logger = await getLogger();
    if (!logger) return;
    await logger.traced(
      async (span) => {
        span.log({
          input: { sessionId: data.sessionId },
          output: {
            reward: data.reward,
            overloadScore: data.overloadScore,
            annoyanceScore: data.annoyanceScore,
            newPolicyVersion: data.newPolicyVersion,
          },
          metadata: { metrics: data.metrics },
        });
      },
      { name: "session-end", type: "task" }
    );
    await logger.flush();
  } catch (err) {
    console.error("Braintrust session-end log error:", err);
  }
}
