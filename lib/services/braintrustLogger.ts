/**
 * Braintrust logging for CalmCue: focus-summary and session-end traces.
 * No-op when BRAINTRUST_API_KEY is not set. Uses initLogger + traced() for observability.
 * Reads API key from .env file so it is not truncated (e.g. keys containing "=").
 */

import * as fs from "fs";
import * as path from "path";
import { initLogger } from "braintrust";

function loadEnvFromFile(name: string): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return "";
    const content = fs.readFileSync(envPath, "utf-8");
    const line = content.split("\n").find((l) => l.startsWith(name + "="));
    if (!line) return "";
    const eq = line.indexOf("=");
    let raw = line.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).trim();
    else if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1).trim();
    return raw.replace(/\r/g, "");
  } catch {
    return "";
  }
}

function getApiKey(): string {
  const fromFile = loadEnvFromFile("BRAINTRUST_API_KEY").trim();
  const fromEnv = process.env.BRAINTRUST_API_KEY?.trim() ?? "";
  return fromFile || fromEnv;
}

function getProject(): string {
  const fromFile = loadEnvFromFile("BRAINTRUST_PROJECT").trim();
  const fromEnv = process.env.BRAINTRUST_PROJECT?.trim() ?? "";
  return (fromFile || fromEnv || "CalmCue");
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
