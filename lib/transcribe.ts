import fs from "fs";
import path from "path";

export interface TranscriptEntry {
  time: number;
  speaker: string;
  text: string;
}

const MODULATE_BATCH_URL =
  "https://modulate-prototype-apis.com/api/velma-2-stt-batch";

interface ModulateUtterance {
  start_ms: number;
  duration_ms: number;
  speaker: number;
  text: string;
}

/**
 * Split a single long utterance into sentence-level chunks,
 * distributing timestamps proportionally across the duration.
 */
function splitUtteranceIntoSentences(
  utterance: ModulateUtterance,
  speakerLabel: string,
  timeOffsetSec: number
): TranscriptEntry[] {
  const text = utterance.text.trim();
  if (!text) return [];

  // Split on sentence boundaries: . ! ? followed by space or end
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [];

  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const startSec = utterance.start_ms / 1000 + timeOffsetSec;
  const durationSec = utterance.duration_ms / 1000;

  let charsSoFar = 0;
  return sentences.map((sentence) => {
    // Distribute time proportionally by character count
    const timeFraction = totalChars > 0 ? charsSoFar / totalChars : 0;
    const time = startSec + timeFraction * durationSec;
    charsSoFar += sentence.length;
    return {
      time: Math.round(time * 10) / 10, // round to 0.1s
      speaker: speakerLabel,
      text: sentence,
    };
  });
}

async function modulateTranscribeOne(
  audioPath: string,
  apiKey: string
): Promise<ModulateUtterance[]> {
  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "application/octet-stream" });

  const formData = new FormData();
  formData.append("upload_file", blob, path.basename(audioPath));
  formData.append("speaker_diarization", "true");

  console.log(`[Modulate] Transcribing ${path.basename(audioPath)}...`);

  const response = await fetch(MODULATE_BATCH_URL, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Modulate API ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  console.log(
    `[Modulate] ${path.basename(audioPath)}: ${data.utterances?.length ?? 0} utterances, ${data.duration_ms}ms`
  );

  return data.utterances || [];
}

async function modulateTranscribeBoth(): Promise<TranscriptEntry[]> {
  const apiKey = process.env.MODULATE_API_KEY;
  if (!apiKey) throw new Error("No MODULATE_API_KEY");

  const demoDir = path.join(process.cwd(), "public", "demo");
  const fileA = path.join(demoDir, "speakerA.wav");
  const fileB = path.join(demoDir, "speakerB.wav");

  // Transcribe both speakers in parallel
  const [uttA, uttB] = await Promise.all([
    modulateTranscribeOne(fileA, apiKey),
    modulateTranscribeOne(fileB, apiKey),
  ]);

  // Split each utterance into sentences with distributed timestamps
  const entriesA = uttA.flatMap((u) => splitUtteranceIntoSentences(u, "Speaker A", 0));
  const entriesB = uttB.flatMap((u) => splitUtteranceIntoSentences(u, "Speaker B", 1)); // +1s offset

  // Merge and sort by time for interleaved rolling transcript
  const merged = [...entriesA, ...entriesB].sort((a, b) => a.time - b.time);

  console.log(
    `[Modulate] Split into ${entriesA.length} + ${entriesB.length} = ${merged.length} sentence entries`
  );
  return merged;
}

const CACHE_PATH = path.join(process.cwd(), "public", "demo", "transcript_cache.json");

export async function transcribe(): Promise<TranscriptEntry[]> {
  // 1. Return from cache if it exists (avoids repeat Modulate calls)
  if (fs.existsSync(CACHE_PATH)) {
    console.log("[Modulate] Serving from cache");
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as TranscriptEntry[];
  }

  // 2. Try Modulate if key is set
  if (process.env.MODULATE_API_KEY) {
    try {
      const entries = await modulateTranscribeBoth();
      if (entries.length > 0) {
        // Persist to cache
        fs.writeFileSync(CACHE_PATH, JSON.stringify(entries, null, 2));
        console.log(`[Modulate] Cached ${entries.length} entries to ${CACHE_PATH}`);
        return entries;
      }
    } catch (e) {
      console.error("[Modulate] Transcription failed, using mock:", e);
    }
  }

  // 3. Fallback: load mock transcript
  const mockPath = path.join(process.cwd(), "public", "demo", "transcript_mock.json");
  const raw = fs.readFileSync(mockPath, "utf-8");
  return JSON.parse(raw) as TranscriptEntry[];
}
