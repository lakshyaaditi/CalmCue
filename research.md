# CalmCue: Comprehensive Technical Research Report

---

## Table of Contents

1. Project Overview and Architecture
2. Repository Structure and Build System
3. The Web Audio API Pipeline
4. Chaos Score Formula and Shield Mechanics
5. The Self-Learning Policy System
6. The Reward Formula
7. Modulate Velma Batch API Integration
8. Airia Gateway Integration
9. Prisma Schema and Data Flow
10. dbt Models and Lightdash Analytics Pipeline
11. Demo Mode Architecture
12. The Session Lifecycle
13. Frontend State Management and Component Architecture
14. Error Handling and Graceful Degradation
15. File-by-File Deep-Dive
16. Cross-Cutting Observations and Gotchas

---

## 1. Project Overview and Architecture

CalmCue is a hackathon-built, neurodivergent-friendly voice chat UX layer that reduces sensory overload through real-time audio dynamics adaptation. The core philosophical stance is explicit and repeated throughout the codebase and documentation: CalmCue is NOT content moderation. It never classifies what people say. It only analyzes how audio behaves — overlap, interruption counts, and loudness spikes — and applies "shields" (dynamic leveling, ducking, toast notifications, and focus-mode recaps) to reduce the cognitive load of chaotic voice conversations.

The project was built for a hackathon with three sponsor integrations: Modulate (Velma Transcribe for speech-to-text with speaker diarization), Airia (OpenAI-compatible gateway for recap summarization), and Lightdash (analytics dashboard connected to Postgres/Supabase).

The overall system is a Next.js 15 (App Router) full-stack application. Client-side, it uses the browser's Web Audio API entirely (no server audio processing). Server-side, it provides REST API routes for session management, policy versioning, transcription, and AI summarization. All state persistence is through Postgres via Prisma ORM. Observability is through Braintrust.

The architectural division is clean:

- Audio analysis is 100% client-side (AudioEngine class using Web Audio API)
- Policy logic lives in a shared library (`lib/policy.ts`) used by both client and server
- External API calls (Modulate, Airia) are always server-side (API routes), never exposing keys to the browser
- State is held in React `useState` in `app/page.tsx` as a single-page application with no routing

---

## 2. Repository Structure and Build System

### Package and Toolchain

The `package.json` reveals a lean dependency set:

**Runtime dependencies:**
- `next@^15.2.0` — Framework with App Router
- `react@^19.0.0` and `react-dom@^19.0.0` — UI library
- `@prisma/client@^6.4.1` — Database ORM client
- `openai@^4.85.4` — Used by the legacy `lib/summarize.ts` path for the Airia OpenAI-compatible interface
- `zod@^3.23.8` — Runtime validation on API route bodies
- `braintrust@^3.1.0` — Observability and tracing

**Dev dependencies:**
- `tailwindcss@^4.0.0` with `@tailwindcss/postcss@^4.0.0` — Note this is Tailwind v4 which uses the PostCSS plugin approach rather than a `tailwind.config.ts` file. This explains why no `tailwind.config.ts` exists.
- `prisma@^6.4.1` — Schema management and migration CLI
- `tsx@^4.21.0` — TypeScript execution for scripts and seed file
- `typescript@^5.7.0` — Compiler

Key `package.json` scripts:
- `demo:audio` — runs `scripts/generate_demo_audio.sh` (macOS `say` command)
- `demo:audio:win` — runs `npx tsx scripts/generate_demo_audio_win.ts` (Windows fallback with synthesized tones)
- `db:seed` — runs `npx tsx prisma/seed.ts` to seed the default policy
- `postinstall` — runs `prisma generate` automatically on every `npm/pnpm install`

The `pnpm.onlyBuiltDependencies` array restricts native compilation to Prisma's own packages and `sharp`, avoiding unnecessary native rebuilds.

### TypeScript Configuration

`tsconfig.json` targets `ES2017` (important for Web Audio API compatibility), enables strict mode, and uses `moduleResolution: "bundler"` (Next.js 15 default). The `@/*` path alias maps to the project root, enabling absolute imports like `@/lib/audioEngine`. `isolatedModules: true` ensures compatibility with SWC/esbuild bundlers.

### Next.js Configuration

`next.config.ts` is minimal — the only configuration is `serverExternalPackages: ["@prisma/client"]`. This tells Next.js to not bundle `@prisma/client` server-side but instead use the native Node.js module resolution, which is required because Prisma uses native Node.js binaries for database queries.

### PostCSS / Tailwind

`postcss.config.mjs` configures a single plugin: `@tailwindcss/postcss`. This is the Tailwind v4 integration pattern. Tailwind v4 does not use a `tailwind.config.ts` file — instead, configuration is done through CSS custom properties and the `@import "tailwindcss"` directive in `globals.css`.

### Docker

`docker-compose.yml` runs a single `postgres:16-alpine` container with:
- Database name: `calmcue`
- User/password: `postgres/postgres`
- Port: `5432:5432`
- Data persistence through a named volume `pgdata`

This is a straightforward local development database. For the Lightdash integration, data is pushed to Supabase as a cloud intermediary (since Lightdash Cloud cannot reach localhost directly).

---

## 3. The Web Audio API Pipeline

The audio pipeline is implemented entirely in `lib/audioEngine.ts` and runs 100% in the browser. This is the most technically dense part of the codebase.

### Node Graph per Speaker

For each of the two speaker tracks, the following Web Audio API node graph is constructed:

```
HTMLAudioElement
  → MediaElementAudioSourceNode (source)
  → GainNode (gain[i])
  → DynamicsCompressorNode (compressor[i])
  → AnalyserNode (analyser[i])
  → AudioContext.destination
```

The init method in `AudioEngine` creates this graph:

```typescript
this.sources[i] = this.ctx.createMediaElementSource(elements[i]);
this.gainNodes[i] = this.ctx.createGain();
this.analysers[i] = this.ctx.createAnalyser();
this.analysers[i]!.fftSize = 2048;
this.compressors[i] = this.ctx.createDynamicsCompressor();

this.sources[i]!
  .connect(this.gainNodes[i]!)
  .connect(this.compressors[i]!)
  .connect(this.analysers[i]!)
  .connect(this.ctx.destination);
```

Critical implementation detail: `createMediaElementSource` is one-shot per `HTMLAudioElement`. Calling it again on the same element throws an error. This is a known Web Audio API gotcha. The solution is to destroy the old AudioEngine and create fresh `<audio>` elements dynamically for each session start. The audio elements are appended to a hidden `<div>` (`audioContainerRef`) rather than being declared in JSX.

### Analysis Loop: RMS → dB Computation

The engine runs a `setInterval` every `ANALYSIS_INTERVAL_MS = 50` milliseconds (20 Hz analysis rate). Each tick calls `analyze()` which:

1. Calls `analyser.getFloatTimeDomainData(buffer)` — pulls 2048 samples of the time-domain waveform (PCM float values in [-1, 1])
2. Computes RMS (Root Mean Square):
   ```
   rms = sqrt(sum(x[i]^2) / N)
   ```
3. Converts to dB:
   ```
   db = 20 * log10(rms)   (if rms > 0, else -Infinity)
   ```

The fftSize of 2048 at typical 44100 Hz sample rate gives approximately 46ms of audio per analysis frame, matching the 50ms interval well. The float time-domain data gives the raw PCM amplitude, making RMS straightforward to compute without any FFT needed.

### Rolling Baseline

A per-speaker exponential moving average baseline is maintained:

```
rollingBaselineDb = (1 - BASELINE_ALPHA) * rollingBaselineDb + BASELINE_ALPHA * db
```

where `BASELINE_ALPHA = 0.02`. Only updates when `db > -60` (i.e., not in near-silence). This gives a time constant of approximately 50 / (0.02 × 1000) = 2.5 seconds, meaning the baseline adapts slowly to the speaker's average volume. This slow adaptation is intentional so that sustained loud speech shifts the baseline gradually, while brief spikes are detected relative to a stable reference.

### Voice Activity Detection (VAD) with Hangover

The VAD uses a simple energy threshold with hangover:

```
VAD_THRESHOLD_DB = -45 dB
VAD_HANGOVER_MS = 300 ms
```

Logic:
- If `db > -45`: mark VAD as active, record `vadLastActiveTime`
- Else if `now - vadLastActiveTime > 300ms`: mark VAD as inactive
- Otherwise: VAD remains active (the "hangover" window)

The hangover prevents false VAD deactivations during natural pauses in speech (e.g., between syllables or words). 300ms is a standard hangover value for speech processing. The `wasActive` array stores the previous tick's VAD state, which is used to detect when a speaker becomes newly active.

### Overlap Detection

Overlap is defined as both speakers being VAD-active simultaneously:
```
bothActive = vadActive[0] && vadActive[1]
```

When `bothActive` transitions from false to true, `overlapStartTime` is recorded. While both are active, `totalOverlapMs` accumulates at `ANALYSIS_INTERVAL_MS` per tick. The instantaneous `overlapDurationMs` is `now - overlapStartTime`.

For the rolling window computation:
- `overlapSamplesInWindow` counts samples in the last 5000ms (CHAOS_WINDOW_MS) where both were active
- `totalSamplesInWindow` counts total samples in that window
- When the window fills (100 samples at 50ms = 5s), the oldest sample is "dropped" by decrementing `overlapSamplesInWindow` only if the current tick is NOT an overlap tick (approximation)
- This gives `overlapRatio = overlapSamplesInWindow / totalSamplesInWindow`

### Interruption Detection

An interruption is detected when speaker i transitions from inactive to active while the OTHER speaker (`wasActive[otherIdx]`) was active:

```typescript
if (this.vadActive[i] && !wasActiveBefore) {
  const otherIdx = 1 - i;
  if (this.wasActive[otherIdx]) {
    this.state.sessionInterruptions++;
  }
}
```

This counts session-cumulative interruptions. Note that `wasActive` is the state from the previous analysis tick (50ms ago), so this detects new-activation events precisely.

### Shout/Loudness Spike Detection

Shout detection compares current dB to the rolling baseline:
```
delta = db - rollingBaselineDb
```
- If `delta > policy.shoutDeltaDb` and speaker was not already shouting: increment `sessionShoutSpikes`, set `isShouting = true`
- If `delta < policy.shoutDeltaDb - 3`: clear `isShouting`

The 3 dB hysteresis on the way down prevents rapid toggling (chattering) around the threshold. Default `shoutDeltaDb = 12` dB means a speaker must be 12 dB louder than their personal baseline to register as shouting — roughly 4x their normal amplitude.

---

## 4. Chaos Score Formula and Shield Mechanics

### Chaos Score Formula

```
chaosScore = min(100, round(
  40 × overlapRatio +
  30 × min(sessionInterruptions / 10, 1) +
  30 × min(sessionShoutSpikes / 5, 1)
))
```

Weights:
- Overlap ratio contributes up to 40 points (most heavily weighted, as simultaneous speech is the primary overload trigger)
- Interruptions contribute up to 30 points, normalized against 10 interruptions = maximum
- Shout spikes contribute up to 30 points, normalized against 5 shouts = maximum

The score saturates at 100. Notable: interruptions and shouts use cumulative session counts (not windowed), while overlap ratio uses the 5-second rolling window. This means the chaos score has a mix of temporal granularity: short-term overlap dynamics combine with long-running session behavior for interruptions and shouts.

### Color Coding in ChaosMeter

The UI maps the score to colors:
- `< 30`: green (var(--green), #4ade80)
- `30–59`: yellow (var(--yellow), #facc15)
- `60–79`: orange (var(--orange), #fb923c)
- `≥ 80`: red (var(--red), #f87171)

The card applies CSS class `chaos-danger` (red glow) when `score > policy.k`, and `chaos-glow` (purple glow) when `30 < score ≤ k`.

### Shield 1: Dynamic Leveling

Applied every analysis tick in `applyShieldActions()`:

```typescript
if (db > target + 3 && db > -60) {
  const reduction = Math.min((db - target) * 0.01, 0.05);
  gainNodes[i].gain.value = Math.max(0.1, gainNodes[i].gain.value - reduction);
} else if (gainNodes[i].gain.value < 1.0) {
  gainNodes[i].gain.value = Math.min(1.0, gainNodes[i].gain.value + 0.01);
}
```

When a speaker exceeds `levelingTargetDb + 3 dB` (default target is -22 dB, so trigger is -19 dB), gain is reduced. The reduction amount is proportional to how far above target the speaker is (`(db - target) * 0.01`), capped at 0.05 per tick. The gain floor is 0.1 (10% of original volume, approximately -20 dB reduction). Recovery is slow: +0.01 per tick (50ms), so full recovery from 0.1 to 1.0 takes 45 ticks × 50ms = 2.25 seconds. This asymmetry (fast attack, slow release) matches psychoacoustic principles for compressors.

### Shield 2: Overlap Ducking

When overlap duration exceeds `policy.overlapTriggerMs` (default 600ms):

```typescript
const duckIdx = dbA >= dbB ? 1 : 0; // duck the quieter speaker
const targetGain = 1 - policy.duckingStrength; // default: 1 - 0.5 = 0.5
gainNodes[duckIdx].gain.value = Math.max(
  targetGain,
  gainNodes[duckIdx].gain.value - 0.02
);
```

The quieter speaker (lower dB) is identified as the one who started talking second (the "interruptor" in most cases), and their volume is reduced. The reduction ramps at -0.02/tick to the target gain floor of `1 - duckingStrength`. At default `duckingStrength = 0.5`, the target is 0.5 (6 dB reduction), ramping at 50ms per tick — reaching floor in 25 ticks × 50ms = 1.25 seconds.

### Shield 3: Toast Nudges

A toast is fired when ALL conditions are met:
1. Currently overlapping (`isCurrentlyOverlapping`)
2. Overlap has lasted longer than `policy.tSec × 1000` milliseconds (default: 1500ms)
3. The time since the last toast exceeds `policy.toastCooldownMs` (default: 30000ms = 30 seconds)

The toast message identifies which speaker is dominant (higher dB = "Speaker A" or "Speaker B") and suggests the quieter one should wait.

### Shield 4: Focus Prompt

The FocusPrompt is triggered when chaos stays above `policy.k` for a sustained 5-second period (`FOCUS_PROMPT_DELAY_MS = 5000`):

```typescript
if (chaosScore > policy.k) {
  if (chaosAboveKSince === 0) {
    chaosAboveKSince = now;
  } else if (now - chaosAboveKSince > 5000) {
    focusPromptShown = true;
    focusPromptsCount++;
    onFocusPrompt?.();
  }
} else {
  chaosAboveKSince = 0; // Reset if chaos drops
}
```

Once triggered, `focusPromptShown` is set to true, preventing repeated triggers until explicitly reset. `resetFocusPrompt()` clears both `focusPromptShown` and `chaosAboveKSince`.

---

## 5. The Self-Learning Policy System

### PolicyParams Interface (`lib/policy.ts`)

```typescript
interface PolicyParams {
  k: number;               // Focus chaos threshold 40..90 (default 60)
  tSec: number;            // Overlap toast trigger in seconds 0.3..3.0 (default 1.5)
  overlapTriggerMs: number;// Ducking trigger in ms 200..1200 (default 600)
  duckingStrength: number; // Ducking depth 0.2..0.9 (default 0.5)
  levelingTargetDb: number;// Leveling target dB -28..-16 (default -22)
  shoutDeltaDb: number;    // Shout detection threshold 6..18 (default 12)
  toastCooldownMs: number; // Toast rate limit 10000..60000 (default 30000)
  learningEnabled: boolean; // Master switch (default true)
}
```

### adjustPolicy() Function

The adjustment function takes the current policy and feedback counts and returns a modified policy with explanation:

```typescript
export function adjustPolicy(
  current: PolicyParams,
  tooAggressiveCount: number,
  tooWeakCount: number
): { updated: PolicyParams; explanation: string }
```

The net feedback direction:
```
net = tooWeakCount - tooAggressiveCount
direction = sign(net)  // +1 = make stronger, -1 = make weaker
magnitude = min(|net|, 3)  // cap at 3 units
pct = 0.10 × (magnitude / 3)  // max 10% change
```

The magnitude cap at 3 means that even if a user clicks "Too Weak" 10 times, the system treats it as 3 units of feedback. Combined with the 10% maximum change, this prevents feedback spam from causing extreme policy shifts.

Adjustment directions for each parameter:

| Parameter | Too Weak (direction=+1) | Too Aggressive (direction=-1) |
|-----------|------------------------|-------------------------------|
| `k` | Decrease (lower threshold = triggers sooner) | Increase (higher threshold = triggers later) |
| `tSec` | Decrease (faster toast trigger) | Increase (slower toast trigger) |
| `overlapTriggerMs` | Decrease (earlier ducking) | Increase (later ducking) |
| `duckingStrength` | Increase (stronger ducking) | Decrease (softer ducking) |
| `toastCooldownMs` | Decrease (more frequent toasts) | Increase (less frequent toasts) |

Note that `levelingTargetDb` and `shoutDeltaDb` are NOT adjusted by the learning system — they remain static. Only the behavioral thresholds and response strengths are tuned.

All adjusted values are clamped to the defined CLAMPS ranges immediately after computation.

### Policy Persistence Flow

1. Database seed creates Policy v1 (DEFAULT_POLICY)
2. On session start (`/api/session/start`), the latest policy version is fetched and stored with the new Session record (`policyVersionUsed`)
3. During a session, feedback clicks increment in-memory counters in `feedbackCounts` state
4. On session end (`/api/session/end`), if `learningEnabled` and any feedback was given, `adjustPolicy()` is called and a new `Policy` record is created in Postgres with `version = currentVersion + 1`
5. The new policy params and explanation are returned in the response and applied to client state
6. Additionally, the new policy is saved to `localStorage` under key `calmcue_policy`
7. On next session start, `/api/policy` is fetched (GET) which returns the latest policy from DB, and the AudioEngine is initialized with these params via `engine.setPolicy(policy)`

---

## 6. The Reward Formula

The reward is computed in `/api/session/end` route:

```
overloadScore = overlapSeconds + 2 × interruptionsCount + 3 × shoutSpikesCount
annoyanceScore = 0.5 × toastCount + 3 × feedbackTooAggressiveCount
reward = -(overloadScore + annoyanceScore)
```

The reward is always negative (or zero in an idealized session). Key observations:

- **Shout spikes are weighted 3×** — the heaviest weight, since sudden loudness is the most acute sensory stressor
- **Interruptions are weighted 2×** — significant because they break turn-taking expectations
- **Overlap seconds are weighted 1×** — raw duration contributes linearly
- **Toast count contributes 0.5×** to annoyance — too many toasts are nagging
- **"Too Aggressive" feedback contributes 3×** to annoyance — explicit user dissatisfaction is heavily penalized

The dual-objective nature (minimize overload AND minimize annoyance) creates the fundamental tension that the learning system navigates. A policy that shows too many toasts might reduce overlap but increase annoyance. A policy that never shows toasts might let chaos run unchecked.

---

## 7. Modulate Velma Batch API Integration

### API Details (`lib/transcribe.ts`)

**Endpoint:** `https://modulate-prototype-apis.com/api/velma-2-stt-batch`

**Authentication:** `X-API-Key` header with the value of `MODULATE_API_KEY` env variable

**Request format:** `multipart/form-data` with two fields:
- `upload_file`: the WAV audio blob (with filename)
- `speaker_diarization`: string `"true"` to enable speaker separation

**Response format:**
```json
{
  "utterances": [
    { "start_ms": 0, "duration_ms": 5200, "speaker": 0, "text": "..." }
  ],
  "duration_ms": 43000
}
```

The API returns whole utterances (paragraph-level), not sentence-level. Speaker numbers are integers (0, 1), not labels.

### Transcription Flow

Two files are transcribed in parallel:
```typescript
const [uttA, uttB] = await Promise.all([
  modulateTranscribeOne(fileA, apiKey),  // speakerA.wav → Speaker A label
  modulateTranscribeOne(fileB, apiKey),  // speakerB.wav → Speaker B label
]);
```

Speaker B gets a 1-second time offset (`timeOffsetSec = 1`) during splitting to match the demo audio playback where Speaker B starts 1 second after Speaker A.

### Sentence Splitting

Because Modulate returns full paragraphs, the `splitUtteranceIntoSentences()` function distributes timestamps proportionally:

1. Split text on sentence boundaries: `(?<=[.!?])\s+` (lookbehind regex for period/exclamation/question followed by whitespace)
2. Count total characters across all sentences
3. For each sentence, compute its starting time as: `startSec + (charsSoFar / totalChars) × durationSec`
4. Round timestamps to 0.1 second precision

This is a character-count-proportional approximation. It assumes speaking rate is uniform across the utterance, which is a simplification, but it produces reasonable-looking rolling transcript timing.

### Caching

```
CACHE_PATH = public/demo/transcript_cache.json
```

Priority order:
1. If `transcript_cache.json` exists, serve from cache (skip API call)
2. If `MODULATE_API_KEY` is set, call Modulate API
3. If Modulate call fails or returns empty, fall back to `transcript_mock.json`

The cache is a simple JSON file written to disk after a successful API call. This is a deliberate hackathon optimization: Modulate's API has rate limits and latency, and for demo purposes the transcript is deterministic (same audio files every time).

---

## 8. Airia Gateway Integration

### Two Integration Modes (`lib/services/airiaGateway.ts`)

The Airia integration supports two backend modes detected at runtime:

**Mode 1: Airia Pipeline Execution API (Agent mode)**
- Triggered when `AIRIA_PIPELINE_URL` is set OR `AIRIA_OPENAI_BASE_URL` contains `"PipelineExecution"` or `"api.airia.ai/v2"`
- Uses `X-API-KEY` header (not Bearer)
- Body: `{ userInput: "<full prompt + transcript>", asyncOutput: false }`

**Mode 2: OpenAI-compatible Chat Completions**
- Used when `AIRIA_OPENAI_BASE_URL` points to `gateway.airia.ai/openai/v1`
- Uses standard OpenAI chat completions format with system+user messages

### System Prompt

```
You are a helpful summarizer for voice chat. The user will give you a transcript
of the last N seconds of a conversation. Your job is to output exactly 3 bullet
points (start each with "• ").
Rules:
- Max 60 words total across all 3 bullets.
- Include speaker names (e.g. "Alice said...", "Bob asked...").
- Highlight: decisions made, questions/asks, and action items.
- Summarize and condense—do NOT quote long phrases verbatim.
- Do not moderate or judge content. Summarize only what was said.
```

### stripAiriaThinking()

Airia's agent sometimes returns reasoning traces wrapped in `<airiaThinking>` blocks. The `stripAiriaThinking()` function removes these using regex, ensuring only the clean bullet-point output is returned to the user.

### Deterministic Fallback

When Airia is unavailable, `fallbackFocusBullets()` produces 3 deterministic bullets from the last 3 distinct speaker turns in the transcript. A "turn" is defined by speaker changes — consecutive lines from the same speaker are merged.

---

## 9. Prisma Schema and Data Flow

### Schema (`prisma/schema.prisma`)

Three models:

**Policy** (`policies` table)
```
id          String   CUID primary key
version     Int      unique
policyJson  Json     (PolicyParams object)
explanation String   (human-readable change description)
createdAt   DateTime
```

**Session** (`sessions` table)
```
id                String   CUID primary key
policyVersionUsed Int      (FK to policies.version, denormalized)
metricsJson       Json     (all metrics including overloadScore, annoyanceScore)
reward            Float    (computed reward value)
createdAt         DateTime
feedback          Feedback[] (relation)
```

**Feedback** (`feedback` table)
```
id        String   CUID primary key
sessionId String   (FK to sessions.id)
type      String   "too_aggressive" | "too_weak"
createdAt DateTime
session   Session  (relation)
```

### Prisma Client Singleton (`lib/prisma.ts`)

The standard Next.js Prisma singleton pattern to avoid connection pool exhaustion in development:

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Data Flow per Session

1. **Seed**: `prisma/seed.ts` creates Policy v1 only if no policy exists
2. **Session Start** (`/api/session/start`): Fetches latest Policy, creates Session with empty metrics and reward 0
3. **Session End** (`/api/session/end`): Computes overload/annoyance/reward scores, updates Session, conditionally creates new Policy

---

## 10. dbt Models and Lightdash Analytics Pipeline

### Lightdash SQL Queries (`lightdash/lightdash_queries.sql`)

Three queries are provided:

**Query 1: Sessions Over Time — Reward Trend**
```sql
SELECT DATE(created_at) AS session_date, COUNT(*) AS session_count,
  ROUND(AVG(reward)::numeric, 2) AS avg_reward, ...
FROM sessions GROUP BY DATE(created_at) ORDER BY session_date;
```

**Query 2: Average Overlap Seconds per Policy Version**
```sql
SELECT policy_version_used, COUNT(*) AS sessions,
  ROUND(AVG((metrics_json->>'overlapSeconds')::numeric)::numeric, 2) AS avg_overlap_seconds, ...
FROM sessions GROUP BY policy_version_used ORDER BY policy_version_used;
```
Uses JSONB extraction operator (`->>'fieldName'`) to pull metrics from the `metrics_json` column. This is the core analytics view for evaluating whether policy learning improves outcomes.

**Query 3: Before vs After — First vs Second Run**
```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY created_at) AS run_number FROM sessions
)
SELECT CASE WHEN run_number = 1 THEN 'First Run' ELSE 'Second Run' END AS run_label, ...
FROM ranked WHERE run_number <= 2 ORDER BY run_number;
```

### Pipeline Architecture

The analytics pipeline is:
1. Postgres (local Docker) → Supabase (cloud Postgres, for Lightdash Cloud connectivity)
2. Supabase → Lightdash Cloud (SQL Runner or dashboard)

---

## 11. Demo Mode Architecture

### Philosophy

The demo is fully deterministic and reproducible. No live microphone input is required. Two pre-recorded WAV files simulate a chaotic design review meeting with intentional overlaps and interruptions. The demo can run without any API keys at all (using the mock transcript and fallback summarization).

### Demo Audio Generation

**macOS (`scripts/generate_demo_audio.sh`):**
- Uses macOS `say` command with two different voices: Alex (Speaker A) and Samantha (Speaker B)
- Audio is generated as AIFF and converted to WAV using `afconvert -f WAVE -d LEI16`

**Windows (`scripts/generate_demo_audio_win.ts`):**
- Generates pure sine tone WAV files (not speech) using a hand-crafted WAV header writer
- Speaker B overlaps Speaker A at specific time offsets
- 32 seconds of audio at 44100 Hz, 16-bit, mono

### Transcript Mock vs Cache

**`transcript_mock.json`** (hand-crafted, 27 entries):
- Timestamps from 0.0 to 31.0 seconds
- Designed to match the demo audio script exactly

**`transcript_cache.json`** (actual Modulate API response, 31 entries):
- Generated by running `transcribe()` with real audio files and the Modulate API key
- Committed to the repo, so future runs use the cached response without hitting Modulate's API
- Cache check precedes API key check in `transcribe()`, so the cache is always used if present

### Demo Playback

Speaker B starts 1 second after Speaker A intentionally:
```typescript
const playA = audioA.play();
setTimeout(() => {
  const playB = audioB.play();
}, 1000);
```

The transcript timer polls at 300ms intervals, revealing lines as their timestamps pass, creating a progressive rolling transcript effect.

---

## 12. The Session Lifecycle

### Complete Flow

**Initialization (page mount):**
1. `useEffect` fetches `/api/policy` (GET) to load the latest policy
2. Sets `policyVersion`, `policyExplanation`, and `policy` state

**startDemo() — triggered by "Run Demo Session" button:**
1. Reset all state (transcript, toasts, focus prompt, recap, feedback, session flags)
2. POST `/api/transcribe` → receive transcript entries
3. POST `/api/session/start` → receive `sessionId`, `policyVersion`, `policyJson`
4. Destroy previous AudioEngine and remove old `<audio>` elements from DOM
5. Create fresh `<audio>` elements for speakerA.wav and speakerB.wav
6. Wait for both to reach `readyState >= 3` (canplaythrough)
7. Create new `AudioEngine`, set policy, attach callbacks
8. Call `engine.init(audioA, audioB)` — builds Web Audio node graph
9. Call `engine.start()` — begins 50ms analysis interval
10. Play Speaker A immediately, Speaker B after 1000ms delay
11. Start transcript timer (300ms poll interval)

**During session (continuous):**
- Analysis loop runs every 50ms, emitting state updates via `onStateUpdate`
- Toasts fire via `onToastCue` → `addToast()` → ToastStack renders
- Focus prompt fires via `onFocusPromptCue` → FocusPrompt modal appears
- User feedback increments counters and fires "fire and forget" POST to `/api/session/end`

**endSession() — triggered by "End Session" button:**
1. Stop AudioEngine, pause both audio elements, clear transcript timer
2. Get session metrics from engine
3. POST `/api/session/end` with sessionId, metrics, and feedback counts
4. If `newPolicy` in response: update policy state and save to `localStorage`
5. Display session results card

**requestRecap() — triggered by FocusPrompt:**
1. Filter `visibleLines` into `transcriptLines` with absolute timestamps
2. POST `/api/focus-summary` with `{ roomId, userId, lastSeconds, transcriptLines }`
3. Display RecapCard with bullets

---

## 13. Frontend State Management and Component Architecture

### State Architecture (`app/page.tsx`)

The entire application state is managed in a single "god component" — the default `Home` export in `page.tsx`. There is no Redux, Zustand, or Context API used. All state is local React state (`useState`) or refs (`useRef`).

State variables (18 total) manage everything from session lifecycle to UI display. Refs (8 total) hold imperative handles (AudioEngine, audio elements, timers).

### Component Breakdown

| Component | Purpose |
|-----------|---------|
| `ChaosMeter.tsx` | Chaos score display with color coding and glow effects |
| `TranscriptPanel.tsx` | Scrollable transcript with speaker colors and auto-scroll |
| `ToastStack.tsx` | Fixed top-right toast notifications with slide-in animation |
| `FocusPrompt.tsx` | Full-screen modal with time window selection |
| `RecapCard.tsx` | Fixed bottom-right summary card with Discord send option |
| `PolicyBadge.tsx` | Top-right nav badge with tooltip showing policy explanation |
| `SpeakerViz.tsx` | Volume bars with ACTIVE/LOUD badges and overlap banner |

### Rendering Performance

`engineState` is updated every 50ms via the AudioEngine callback which calls `structuredClone(this.state)`. This triggers React re-renders of components that use `engineState`. Only `ChaosMeter` and `SpeakerViz` consume `engineState` directly. At 20Hz updates, this is fast enough to feel real-time without overwhelming React's reconciler.

---

## 14. Error Handling and Graceful Degradation

CalmCue is designed with multiple layers of graceful degradation:

| Failure | Behavior |
|---------|----------|
| Audio files missing | Toast: "Demo audio missing. Run: pnpm demo:audio" — session never starts |
| AudioContext autoplay blocked | Toast: "Audio blocked. Click the page once, then Run Demo again." |
| Transcript API failure | Empty array — panel shows "Waiting for session to start..." |
| Database unavailable | Session runs locally without persistence. Policy uses DEFAULT_POLICY |
| Airia API failure | Fallback: last 3 speaker turns as bullets, with `source: "fallback"` |
| Discord not configured | Returns `{ ok: false, reason: "not_configured" }`, toast shown |
| Modulate API failure | Cascade: cache → mock JSON — always produces valid transcript |
| Braintrust logging failure | Silent no-op via try/catch — never affects primary flow |

---

## 15. File-by-File Deep-Dive

### Core Libraries

- **`lib/audioEngine.ts`** — The entire client-side audio analysis and shield engine (~360 lines). Constants: `VAD_THRESHOLD_DB = -45`, `VAD_HANGOVER_MS = 300`, `BASELINE_ALPHA = 0.02`, `ANALYSIS_INTERVAL_MS = 50`, `CHAOS_WINDOW_MS = 5000`. Uses `performance.now()` for timing (more precise than `Date.now()`).

- **`lib/policy.ts`** — Policy parameter types, defaults, clamps, and self-learning adjustment function. CLAMPS table defines hard boundaries. The `adjustPolicy()` function is pure (no side effects).

- **`lib/transcribe.ts`** — Server-side only (uses `fs`). Sentence splitting with character-proportional timestamp distribution. Speaker B gets +1 second time offset.

- **`lib/summarize.ts`** — Legacy Airia summarization via OpenAI SDK. Superseded by `lib/services/airiaGateway.ts` for Pipeline mode support.

- **`lib/prisma.ts`** — Prisma client singleton using `globalThis` pattern.

### Services

- **`lib/services/airiaGateway.ts`** — Dual-mode Airia integration (Pipeline API vs OpenAI-compat). Reads API key from `.env` file directly. Strips `<airiaThinking>` blocks.

- **`lib/services/discordWebhook.ts`** — Discord incoming webhook for posting recaps. Never throws.

- **`lib/services/braintrustLogger.ts`** — Observability for focus summaries and session-end events. Lazy singleton initialization.

### API Routes

- **`/api/transcribe`** — Delegates to `lib/transcribe.ts`
- **`/api/summarize`** — Legacy route, delegates to `lib/summarize.ts`
- **`/api/session/start`** — Creates Session, returns sessionId + current policy
- **`/api/session/end`** — Computes reward, updates Session, triggers policy learning
- **`/api/policy`** — GET returns latest policy, POST creates manual policy
- **`/api/focus-summary`** — Airia Focus Mode recap with Zod validation
- **`/api/discord/post-focus`** — Discord webhook posting with Zod validation

### Static Assets

- **`public/demo/transcript_mock.json`** — Hand-crafted 27-entry fallback transcript
- **`public/demo/transcript_cache.json`** — Real Modulate API response (31 entries)
- **`public/demo/speakerA.wav`** and **`speakerB.wav`** — Generated demo audio files

### Other Files

- **`index.html`** — Standalone marketing landing page (not part of Next.js). Uses IntersectionObserver for scroll-reveal animations. Respects `prefers-reduced-motion`.
- **`SUBMISSION.md`** — Hackathon submission document
- **`README.md`** — Developer setup guide and architecture reference

---

## 16. Cross-Cutting Observations and Gotchas

### The createMediaElementSource One-Shot Problem

The Web Audio API specification says that calling `createMediaElementSource()` on an already-connected `<audio>` element throws `InvalidStateError`. Every session start destroys the AudioEngine, removes audio elements from the DOM, and creates brand-new elements. The `AudioContext` is re-created every session — no reuse of the audio graph.

### TypeScript Casting in Session End Route

`/api/session/end` does not use Zod for body parsing (unlike `/api/focus-summary` and `/api/discord/post-focus`). It directly casts the body — a minor type safety gap.

### The Feedback "Fire and Forget" Mid-Session Call

When a user clicks "Too Aggressive" or "Too Weak" during a session, `handleFeedback()` fires a POST to `/api/session/end` with current metrics. This runs the full session-end logic including potential policy creation. Combined with the final `endSession()` call, this could create multiple policy versions per session.

### Session Metrics Accumulation

Session overlap seconds, interruptions, and shout spikes are CUMULATIVE counters, not rolling window values. Long sessions naturally accumulate higher overload scores regardless of whether the session settled down after an initial chaotic period.

### Policy Learning Coverage

Only 5 of 7 `PolicyParams` are adjusted by `adjustPolicy()`: `k`, `tSec`, `overlapTriggerMs`, `duckingStrength`, `toastCooldownMs`. `levelingTargetDb` and `shoutDeltaDb` are excluded — leveling and shout detection are physical audio properties that shouldn't change based on subjective feedback.

### Design System Consistency

The entire frontend uses a consistent dark-only design system:
- Single color palette via CSS custom properties
- `glass-card` as the universal card primitive (glassmorphism)
- `backdrop-filter: blur(10px)` everywhere
- No light mode (`--bg: #05060a`)

---

## Summary Table: Sponsor Integrations

| Sponsor | Module | Endpoint | Auth | Trigger | Fallback |
|---------|--------|----------|------|---------|----------|
| Modulate (Velma) | `lib/transcribe.ts` | `POST modulate-prototype-apis.com/api/velma-2-stt-batch` | `X-API-Key` header | Session start → `/api/transcribe` | `transcript_cache.json` → `transcript_mock.json` |
| Airia Gateway | `lib/services/airiaGateway.ts` | `POST [AIRIA_PIPELINE_URL]` or `[AIRIA_OPENAI_BASE_URL]/chat/completions` | `X-API-KEY` header | Focus prompt → `/api/focus-summary` | `fallbackFocusBullets()` (last 3 speaker turns) |
| Lightdash | `lightdash/lightdash_queries.sql` | Lightdash SQL Runner | Lightdash project credentials | Manual (paste queries) | N/A (analytics only) |
| Braintrust | `lib/services/braintrustLogger.ts` | Braintrust API | `BRAINTRUST_API_KEY` | `/api/focus-summary` and `/api/session/end` | Silent no-op |

---

## Summary Table: Key Formulas

| Formula | Expression |
|---------|------------|
| RMS | `sqrt(sum(x[i]^2) / N)` |
| dB | `20 * log10(rms)` |
| Rolling Baseline | `(1 - 0.02) * prev + 0.02 * db` (when db > -60) |
| Overlap Ratio | `overlapSamples / totalSamples` (5s window) |
| Chaos Score | `min(100, round(40 * overlapRatio + 30 * min(interruptions/10, 1) + 30 * min(shouts/5, 1)))` |
| Policy Change % | `0.10 * (min(\|net\|, 3) / 3)` max 10% |
| Overload Score | `overlapSeconds + 2 * interruptions + 3 * shoutSpikes` |
| Annoyance Score | `0.5 * toastCount + 3 * aggressiveFeedback` |
| Reward | `-(overloadScore + annoyanceScore)` |

---

This completes the comprehensive technical research report for the CalmCue codebase. The project represents a carefully architected hackathon submission with genuine technical depth in the Web Audio API pipeline, a thoughtful self-learning feedback loop, multiple graceful degradation paths, and clean separation between the content-agnostic dynamics layer and the optional AI integration layer.
