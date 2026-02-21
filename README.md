# CalmCue
**Neurodivergent-friendly voice chat UX that reduces sensory overload via real-time audio dynamics adaptation.**

CalmCue is NOT content moderation. It only analyzes audio dynamics and turn-taking UX signals: overlap, interruptions, and loudness spikes. It never classifies or polices what is said.

## Features

- **Rolling Transcript** — Live captions with speaker labels and timestamps (Modulate Velma Transcribe with mock fallback)
- **Chaos Meter** — Real-time score (0–100) from overlap ratio, interruptions, and loudness spikes
- **Focus Mode Recap** — When chaos exceeds threshold, get a private summary of what you missed (Airia Gateway)
- **Overlap Nudge Toasts** — Gentle "Let Speaker A finish" reminders with rate limiting
- **Self-Learning Policy** — Feedback buttons adjust shield sensitivity across sessions, persisted in Postgres

## Sponsor Integrations

| Sponsor | Integration | Fallback |
|---------|------------|----------|
| **Modulate** (Velma Transcribe) | POST `/api/transcribe` — batch transcription | Mock transcript JSON |
| **Airia** (OpenAI Gateway) | POST `/api/summarize` — recap summarization | Heuristic bullet extraction |
| **Lightdash** | SQL queries in `/lightdash/lightdash_queries.sql` | Paste into SQL Runner |

## Prerequisites (macOS)

```bash
# Xcode Command Line Tools
xcode-select --install

# Node 20+ (recommend fnm)
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 20

# pnpm via corepack
corepack enable
corepack prepare pnpm@latest --activate

# Docker Desktop — download from https://docker.com/products/docker-desktop
# Make sure Docker Desktop is running before continuing
```

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env to add AIRIA_API_KEY, MODULATE_API_KEY if available

# 3. Start Postgres
docker compose up -d

# 4. Run database migrations
pnpm prisma migrate dev --name init

# 5. Generate demo audio files (uses macOS `say` command)
pnpm demo:audio

# 6. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/calmcue` | Postgres connection |
| `AIRIA_API_KEY` | No | — | Airia Gateway API key for recap summarization |
| `AIRIA_OPENAI_BASE_URL` | No | `https://api.airia.com/v1/PipelineExecution/` | Airia endpoint |
| `MODULATE_API_KEY` | No | — | Modulate Velma Transcribe API key |
| `NEXT_PUBLIC_APP_NAME` | No | `CalmCue` | App display name |

## 3-Minute Demo Script

### Run 1: Baseline

1. Click **"Run Demo Session"** — two speakers play simultaneously
2. Watch the **Chaos Meter** rise as speakers overlap and interrupt
3. See **overlap toast nudges** appear: "Let Speaker A finish before Speaker B"
4. When chaos stays high, the **Focus Prompt** appears: "Too chaotic — want a recap?"
5. Click **"Last 30s"** → see the **Recap Card** with a summary (Airia if configured, fallback otherwise)
6. Click **"Too Aggressive"** once or twice — feedback is recorded
7. Click **"End Session"** — see session results with reward score

### Run 2: Adapted

8. Click **"Run Demo Session Again"**
9. Notice the **Policy badge** shows v2 with explanation of changes
10. Observe: higher chaos threshold, longer toast cooldowns = fewer interruptions from the shields
11. End session again — compare rewards

### Lightdash

12. Open Lightdash, connect to Postgres (`DATABASE_URL`)
13. Go to SQL Runner, paste queries from `/lightdash/lightdash_queries.sql`
14. Create charts showing reward trends and before/after comparison

## Architecture

```
app/
  page.tsx              — Main UI (client-side)
  layout.tsx            — Root layout
  globals.css           — Tailwind + custom styles
  components/
    ChaosMeter.tsx      — Chaos score display
    TranscriptPanel.tsx — Rolling transcript
    ToastStack.tsx      — Overlap nudge toasts
    FocusPrompt.tsx     — "Too chaotic" modal
    RecapCard.tsx       — DM-style recap card
    PolicyBadge.tsx     — Policy version indicator
    SpeakerViz.tsx      — Speaker audio levels
  api/
    summarize/route.ts  — Airia summarization
    transcribe/route.ts — Modulate transcription
    session/start/      — Start session, get policy
    session/end/        — End session, compute reward, update policy
    policy/route.ts     — GET/POST policy

lib/
  audioEngine.ts        — Web Audio analysis + shield actions
  policy.ts             — Policy params + self-learning adjustment
  summarize.ts          — Airia OpenAI SDK integration
  transcribe.ts         — Modulate integration
  prisma.ts             — Prisma client singleton

prisma/
  schema.prisma         — policies, sessions, feedback tables

scripts/
  generate_demo_audio.sh — Generate WAV files with macOS `say`

lightdash/
  lightdash_queries.sql  — 3 SQL queries for Lightdash SQL Runner

public/demo/
  speakerA.wav          — Generated demo audio
  speakerB.wav          — Generated demo audio
  transcript_mock.json  — Fallback transcript
```

## Audio Pipeline

For each speaker track:
```
AudioContext → MediaElementSource → GainNode → DynamicsCompressor → AnalyserNode → Destination
```

- **VAD**: RMS → dB, active if > -45 dB with 300ms hangover
- **Overlap**: both speakers active simultaneously
- **Interruption**: speaker B starts while A is active (or vice versa)
- **Loudness spike**: dB exceeds rolling baseline by `shoutDeltaDb`

## Policy Self-Learning

Policy parameters are versioned and persisted. After each session with feedback:

- **"Too Aggressive"** → raise chaos threshold, lengthen toast cooldown, reduce ducking
- **"Too Weak"** → lower chaos threshold, shorten toast cooldown, increase ducking
- Changes clamped to max ±10% per session
- Each new version includes a human-readable explanation

## License

MIT
>>>>>>> f95e575 (mark-one)
