import OpenAI from "openai";

export interface TranscriptLine {
  time: number;
  speaker: string;
  text: string;
}

function fallbackSummarize(lines: TranscriptLine[]): string {
  if (lines.length === 0) return "No transcript lines to summarize.";
  const lastLines = lines.slice(-6);
  const bullets = lastLines.map(
    (l) => `• ${l.speaker}: "${l.text.slice(0, 80)}"`
  );
  return bullets.slice(0, 3).join("\n");
}

export async function summarizeTranscript(
  lines: TranscriptLine[],
  windowSec: number
): Promise<string> {
  const apiKey = process.env.AIRIA_API_KEY;
  const baseURL = process.env.AIRIA_OPENAI_BASE_URL;

  if (!apiKey || !baseURL) {
    return fallbackSummarize(lines);
  }

  const filtered = lines.slice(-20);
  const transcript = filtered
    .map((l) => `[${l.time.toFixed(1)}s] ${l.speaker}: ${l.text}`)
    .join("\n");

  try {
    const client = new OpenAI({ apiKey, baseURL });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize voice chat transcripts for neurodivergent users who missed part of a conversation. Output exactly 3 bullet points, max 60 words total. Include speaker names.",
        },
        {
          role: "user",
          content: `Summarize the last ${windowSec} seconds of this conversation:\n\n${transcript}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || fallbackSummarize(lines);
  } catch (e) {
    console.error("Airia summarization failed, using fallback:", e);
    return fallbackSummarize(lines);
  }
}
