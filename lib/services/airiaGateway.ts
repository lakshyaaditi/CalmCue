/**
 * Airia integration for Focus Mode summarization.
 * Supports (1) Pipeline Execution API (Agent) and (2) OpenAI-compatible gateway.
 * No content moderation; summarization only. No API keys in frontend.
 */

import * as fs from "fs";
import * as path from "path";

function loadEnvVarFromFile(name: string): string {
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

function loadAiriaKeyFromEnvFile(): string {
  return loadEnvVarFromFile("AIRIA_API_KEY");
}

/** Remove Airia's <airiaThinking> block so we show only the actual summary, not the agent's reasoning */
function stripAiriaThinking(content: string): string {
  let out = content.trim();
  const hasClosing = /<\s*\/\s*airiaThinking\s*>|\*\*<\s*\/\s*airiaThinking\s*>\*\*/i.test(out);
  if (hasClosing) {
    out = out.replace(/\*\*?\s*<\s*airiaThinking\s*>\s*\*\*?[\s\S]*?\*\*?\s*<\s*\/\s*airiaThinking\s*>\s*\*?/gi, "").trim();
  }
  const openIdx = out.search(/<\s*airiaThinking\s*>|\*\*<\s*airiaThinking\s*>\*\*/i);
  if (openIdx !== -1) {
    const afterOpen = out.slice(openIdx).replace(/<\s*airiaThinking\s*>|\*\*<\s*airiaThinking\s*>\*\*/gi, "");
    const lines = afterOpen.split("\n");
    let from = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      const isMeta = /^(The user wants|I need to|Looking at the conversation)/i.test(line) || (line.startsWith("• ") && line.length < 40 && !line.includes("Speaker"));
      if (line.startsWith("• ") && !isMeta && (line.includes("Speaker") || line.length > 20)) {
        from = i;
        break;
      }
    }
    out = lines.slice(from).join("\n").trim();
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Extract summary text from Pipeline Execution or OpenAI-style response */
function extractContentFromResponse(responseText: string, fromPipeline: boolean): string | null {
  try {
    const data = JSON.parse(responseText) as Record<string, unknown>;
    let raw: string | null = null;
    if (fromPipeline) {
      const v = data.output ?? data.result ?? data.text ?? data.response ?? data.message ?? data.content;
      if (typeof v === "string") raw = v;
      else if (v && typeof v === "object" && "text" in v && typeof (v as { text: string }).text === "string")
        raw = (v as { text: string }).text;
      else if (v && typeof v === "object" && "message" in v && typeof (v as { message: string }).message === "string")
        raw = (v as { message: string }).message;
      if (raw) return stripAiriaThinking(raw);
      return null;
    }
    raw = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content?.trim() ?? null;
    return raw ? stripAiriaThinking(raw) : null;
  } catch {
    return null;
  }
}

export interface FocusTranscriptLine {
  ts: number;
  speaker: string;
  text: string;
}

const FOCUS_SYSTEM_PROMPT = `You are a helpful summarizer for voice chat. The user will give you a transcript of the last N seconds of a conversation. Your job is to output exactly 3 bullet points (start each with "• ").
Rules:
- Max 60 words total across all 3 bullets.
- Include speaker names (e.g. "Alice said...", "Bob asked...").
- Highlight: decisions made, questions/asks, and action items.
- Summarize and condense—do NOT quote long phrases verbatim. Write a short summary sentence per bullet.
- Do not moderate or judge content. Summarize only what was said.`;

/**
 * Deterministic fallback when AIRIA_API_KEY is missing or gateway fails.
 * Always returns exactly 3 bullets. Uses last 3 distinct speaker turns.
 */
function fallbackFocusBullets(lines: FocusTranscriptLine[]): string[] {
  if (!lines.length) {
    return [
      "• No clear speech captured.",
      "• No clear speech captured.",
      "• No clear speech captured.",
    ];
  }
  // Last N lines, then take last 3 distinct speaker "turns" (by speaker)
  const ordered = [...lines].sort((a, b) => a.ts - b.ts);
  const turns: { speaker: string; text: string }[] = [];
  let lastSpeaker = "";
  for (const line of ordered) {
    const text = line.text.trim().slice(0, 80);
    if (!text) continue;
    if (line.speaker !== lastSpeaker) {
      turns.push({ speaker: line.speaker, text });
      lastSpeaker = line.speaker;
    } else {
      turns[turns.length - 1]!.text = text;
    }
  }
  const lastThree = turns.slice(-3);
  const bullets = lastThree.map(
    (t) => `• ${t.speaker}: ${t.text.replace(/\n/g, " ")}`
  );
  while (bullets.length < 3) {
    bullets.push("• (no further speech)");
  }
  return bullets.slice(0, 3);
}

/**
 * Get Focus Mode summary: 3 bullets via Airia gateway or deterministic fallback.
 */
export async function getFocusSummary(
  transcriptLines: FocusTranscriptLine[],
  lastSeconds: number
): Promise<{ bullets: string[]; source: "airia" | "fallback"; errorMessage?: string }> {
  // Always read key from .env file so keys containing "=" are not truncated
  let apiKey = loadAiriaKeyFromEnvFile();
  if (!apiKey) {
    apiKey = process.env.AIRIA_API_KEY?.trim() ?? "";
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1).trim();
    if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1).trim();
  }
  apiKey = apiKey.replace(/\r/g, "").trim();
  const pipelineUrl = (process.env.AIRIA_PIPELINE_URL ?? loadEnvVarFromFile("AIRIA_PIPELINE_URL")).trim();
  const baseURL = (process.env.AIRIA_OPENAI_BASE_URL ?? loadEnvVarFromFile("AIRIA_OPENAI_BASE_URL") ?? "https://gateway.airia.ai/openai/v1").trim();

  if (!apiKey) {
    return {
      bullets: fallbackFocusBullets(transcriptLines),
      source: "fallback",
      errorMessage: "AIRIA_API_KEY is not set in .env",
    };
  }

  const sorted = [...transcriptLines].sort((a, b) => a.ts - b.ts);
  const maxTs = sorted.length ? sorted[sorted.length - 1]!.ts : 0;
  const cutoffTs = maxTs - lastSeconds * 1000;
  const inWindow = sorted.filter((l) => l.ts >= cutoffTs);
  const transcript = inWindow
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");

  if (!transcript.trim()) {
    return {
      bullets: fallbackFocusBullets(inWindow.length ? inWindow : transcriptLines),
      source: "fallback",
      errorMessage: "No transcript in selected time window",
    };
  }

  const minTsInWindow = inWindow[0]?.ts ?? maxTs;
  const actualSeconds = Math.max(1, Math.round((maxTs - minTsInWindow) / 1000));
  const durationNote =
    actualSeconds >= lastSeconds
      ? `last ${lastSeconds} seconds`
      : `last ~${actualSeconds} seconds (requested ${lastSeconds}s; summarize whatever is below)`;

  const userInput = `${FOCUS_SYSTEM_PROMPT}\n\nSummarize the ${durationNote} of this conversation. Output exactly 3 bullet points (start each with "• "), max 60 words total.\n\nConversation:\n${transcript}`;

  try {
    const usePipeline = pipelineUrl.length > 0 || baseURL.includes("PipelineExecution") || baseURL.includes("api.airia.ai/v2");

    let responseText: string;
    if (usePipeline) {
      const url = pipelineUrl || baseURL;
      const body = { userInput, asyncOutput: false };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify(body),
      });
      responseText = await res.text();
      if (!res.ok) {
        const errDetail = responseText ? responseText.slice(0, 300) : res.statusText;
        throw new Error(`Airia API ${res.status}: ${errDetail}`);
      }
    } else {
      const url = `${baseURL.replace(/\/$/, "")}/chat/completions`;
      const body = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: FOCUS_SYSTEM_PROMPT },
          { role: "user", content: `Summarize the ${durationNote} of this conversation:\n\n${transcript}` },
        ],
        max_tokens: 150,
        temperature: 0.3,
      };
      const useXApiKey = (process.env.AIRIA_AUTH_HEADER ?? "X-API-Key").trim().toLowerCase() === "x-api-key";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(useXApiKey ? { "X-API-Key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
      };
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      responseText = await res.text();
      if (!res.ok) {
        const errDetail = responseText ? responseText.slice(0, 300) : res.statusText;
        throw new Error(`Airia API ${res.status}: ${errDetail}`);
      }
    }

    const content = extractContentFromResponse(responseText, usePipeline);
    if (!content?.trim()) {
      return {
        bullets: fallbackFocusBullets(transcriptLines),
        source: "fallback",
        errorMessage: "Airia returned empty response",
      };
    }

    // Parse up to 3 bullets: lines starting with • - * or numbered, or split by newline and take first 3
    const lines = content.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const bullets: string[] = [];
    for (const line of lines) {
      const cleaned = line.replace(/^[•\-*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
      if (cleaned.length > 2) bullets.push("• " + cleaned);
      if (bullets.length >= 3) break;
    }
    // If model didn't use bullet format, treat each non-empty line as a bullet
    if (bullets.length === 0 && lines.length > 0) {
      for (const line of lines) {
        const cleaned = line.replace(/^[•\-*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
        if (cleaned.length > 2) bullets.push("• " + cleaned);
        if (bullets.length >= 3) break;
      }
    }
    while (bullets.length < 3) {
      bullets.push("• (no further summary)");
    }
    return { bullets: bullets.slice(0, 3), source: "airia" };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Airia focus summary failed, using fallback:", errorMessage, e);
    return {
      bullets: fallbackFocusBullets(transcriptLines),
      source: "fallback",
      errorMessage: `Airia error: ${errorMessage}`,
    };
  }
}
