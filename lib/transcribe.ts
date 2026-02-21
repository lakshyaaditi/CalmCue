import fs from "fs";
import path from "path";

export interface TranscriptEntry {
  time: number;
  speaker: string;
  text: string;
}

async function modulateTranscribe(audioPath: string): Promise<TranscriptEntry[]> {
  const apiKey = process.env.MODULATE_API_KEY;
  if (!apiKey) throw new Error("No MODULATE_API_KEY");

  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  const formData = new FormData();
  formData.append("audio", blob, path.basename(audioPath));

  const response = await fetch("https://api.modulate.ai/v1/transcribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Modulate API error: ${response.status}`);
  }

  const data = await response.json();
  // Map Modulate response to our format
  return (data.segments || data.results || []).map(
    (seg: { start?: number; time?: number; speaker?: string; text?: string }) => ({
      time: seg.start || seg.time || 0,
      speaker: seg.speaker || "Unknown",
      text: seg.text || "",
    })
  );
}

export async function transcribe(
  audioPath?: string
): Promise<TranscriptEntry[]> {
  // Try Modulate first
  if (process.env.MODULATE_API_KEY && audioPath) {
    try {
      return await modulateTranscribe(audioPath);
    } catch (e) {
      console.error("Modulate transcription failed, using mock:", e);
    }
  }

  // Fallback: load mock transcript
  const mockPath = path.join(process.cwd(), "public", "demo", "transcript_mock.json");
  const raw = fs.readFileSync(mockPath, "utf-8");
  return JSON.parse(raw) as TranscriptEntry[];
}
