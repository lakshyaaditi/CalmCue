/**
 * Generate minimal demo WAV files on Windows (no macOS `say` / `afconvert`).
 * Creates short silent/sine tones so the demo can load; transcript is still from mock JSON.
 * Run: npx tsx scripts/generate_demo_audio_win.ts
 */

import * as fs from "fs";
import * as path from "path";

const DEMO_DIR = path.join(process.cwd(), "public", "demo");
const SAMPLE_RATE = 44100;
const DURATION_SEC = 32; // Match approximate demo length
const NUM_SAMPLES = SAMPLE_RATE * DURATION_SEC;

function createWavBuffer(samples: Float32Array): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * 2; // 16-bit = 2 bytes per sample
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  function write(str: string) {
    buffer.write(str, offset);
    offset += str.length;
  }
  function writeU32(n: number) {
    buffer.writeUInt32LE(n, offset);
    offset += 4;
  }
  function writeU16(n: number) {
    buffer.writeUInt16LE(n, offset);
    offset += 2;
  }

  write("RIFF");
  writeU32(36 + dataSize);
  write("WAVE");
  write("fmt ");
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(SAMPLE_RATE);
  writeU32(byteRate);
  writeU16(numChannels * (bitsPerSample / 8));
  writeU16(bitsPerSample);
  write("data");
  writeU32(dataSize);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(Math.round(v), offset);
    offset += 2;
  }

  return buffer;
}

const VOLUME = 0.55; // Loud enough to hear clearly (max safe ~0.6–0.7)

function fillTone(
  buffer: Float32Array,
  freq: number,
  durationSamples: number,
  startSample: number
): void {
  for (let i = 0; i < durationSamples && startSample + i < NUM_SAMPLES; i++) {
    const t = (startSample + i) / SAMPLE_RATE;
    buffer[startSample + i] += VOLUME * Math.sin(2 * Math.PI * freq * t);
  }
}

const speakerA = new Float32Array(NUM_SAMPLES);
const speakerB = new Float32Array(NUM_SAMPLES);

// Speaker A: clear segments from 0s (so A is heard first and isn't silent)
fillTone(speakerA, 220, SAMPLE_RATE * 3, 0);                    // 0–3s
fillTone(speakerA, 240, SAMPLE_RATE * 2, Math.floor(SAMPLE_RATE * 5));  // 5–7s
fillTone(speakerA, 200, SAMPLE_RATE * 4, Math.floor(SAMPLE_RATE * 10)); // 10–14s
fillTone(speakerA, 180, SAMPLE_RATE * 2, Math.floor(SAMPLE_RATE * 18));  // 18–20s
// Speaker B: starts ~1s for overlap, then alternates
fillTone(speakerB, 260, SAMPLE_RATE * 2, Math.floor(SAMPLE_RATE * 1));  // 1–3s (overlap)
fillTone(speakerB, 280, SAMPLE_RATE * 2, Math.floor(SAMPLE_RATE * 6));  // 6–8s
fillTone(speakerB, 250, SAMPLE_RATE * 3, Math.floor(SAMPLE_RATE * 12)); // 12–15s
fillTone(speakerB, 300, SAMPLE_RATE * 2, Math.floor(SAMPLE_RATE * 20));  // 20–22s
// Fill rest so neither file is silent at the end
for (let i = SAMPLE_RATE * 22; i < NUM_SAMPLES; i++) {
  speakerA[i] = 0.25 * Math.sin((2 * Math.PI * 180 * i) / SAMPLE_RATE);
  speakerB[i] = 0.25 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE);
}

if (!fs.existsSync(DEMO_DIR)) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
}

fs.writeFileSync(path.join(DEMO_DIR, "speakerA.wav"), createWavBuffer(speakerA));
fs.writeFileSync(path.join(DEMO_DIR, "speakerB.wav"), createWavBuffer(speakerB));

console.log("Demo audio (Windows) generated:");
console.log("  - public/demo/speakerA.wav");
console.log("  - public/demo/speakerB.wav");
console.log("(Minimal tones for playback; transcript comes from transcript_mock.json)");
