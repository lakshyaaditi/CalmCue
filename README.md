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
| **Airia** (OpenAI Gateway) | POST `/api/focus-summary` — Focus Mode recap (3 bullets) | Deterministic last-3-turns bullets |
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
# Edit .env: AIRIA_API_KEY, AIRIA_OPENAI_BASE_URL, DISCORD_WEBHOOK_URL (see below)

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

### Running on Windows

Use these steps on **Windows (PowerShell or CMD)**:

1. **Install dependencies**  
   `pnpm install`

2. **Copy env file**  
   - **CMD:** `copy .env.example .env`  
   - **PowerShell:** `Copy-Item .env.example .env`  
   Then edit `.env` if you need Airia/Discord/DB.

3. **Start Postgres**  
   `docker compose up -d`  
   (Requires Docker Desktop for Windows.)

4. **Run migrations**  
   `pnpm prisma migrate dev --name init`

5. **Demo audio**  
   - **macOS:** `pnpm demo:audio` (generates WAVs with `say`).  
   - **Windows:** `pnpm demo:audio` does **not** work (script uses macOS-only tools). Use either:
     - **Option A:** Run `pnpm demo:audio:win` (or `npx tsx scripts/generate_demo_audio_win.ts`) to create minimal placeholder WAVs, or  
     - **Option B:** Copy `speakerA.wav` and `speakerB.wav` from a teammate/Mac into `public/demo/`.

6. **Start dev server**  
   `pnpm dev`  
   Then open [http://localhost:3000](http://localhost:3000).

If you skip step 5 and the WAVs are missing, **Run Demo Session** will fail when loading audio; Focus recap and other API features still work.

### No sound during demo?

- **WAV files:** Ensure `public/demo/speakerA.wav` and `speakerB.wav` exist. On Windows run `pnpm demo:audio:win` to generate them (then try **Run Demo Session** again).
- **Browser:** Some browsers block audio until you’ve interacted with the page. Click once on the page (e.g. the **Run Demo Session** button), then start the demo. If it still doesn’t play, click the tab’s speaker icon and ensure the tab isn’t muted.
- **Volume:** Check system volume and the browser tab volume (right‑click tab → Unmute site if available).
- **Windows placeholder audio:** The Windows script creates **tones** (beeps), not speech. For real speech you’d need WAVs from a Mac (`pnpm demo:audio` there) copied into `public/demo/`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/calmcue` | Postgres connection |
| `AIRIA_API_KEY` | No | — | Airia Gateway API key for recap summarization |
| `AIRIA_OPENAI_BASE_URL` | No | `https://gateway.airia.ai/openai/v1` | Airia OpenAI-compatible gateway |
| `MODULATE_API_KEY` | No | — | Modulate Velma Transcribe API key |
| `DISCORD_WEBHOOK_URL` | No | — | Discord incoming webhook for Focus recap posts |
| `NEXT_PUBLIC_APP_NAME` | No | `CalmCue` | App display name |

## Airia Setup (Focus Mode summarizer)

1. Get an API key from [Airia](https://airia.ai) (OpenAI-compatible gateway).
2. In `.env` set:
   - `AIRIA_API_KEY=<your-key>`
   - `AIRIA_OPENAI_BASE_URL=https://gateway.airia.ai/openai/v1`
3. Focus Mode uses `gpt-4o-mini` via the gateway. **You must set `AIRIA_API_KEY`** to get real AI summaries; otherwise you get a quick recap (last 3 speaker turns verbatim). If the gateway fails, the app falls back to that same quick recap. No API keys are exposed to the frontend.

## Discord Setup (post recap to a channel)

1. Open your **Discord server** in the app or browser.
2. Click the server name (top-left) → **Server settings** (or right‑click server → Server settings).
3. In the left sidebar go to **Integrations** → **Webhooks**.
4. Click **New Webhook** (or **Create Webhook**). Name it e.g. `CalmCue Recap`, choose the **channel** where recaps should appear.
5. Click **Copy Webhook URL**.
6. In your CalmCue project folder open **`.env`** and add or edit:
   ```env
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
   Paste the full URL (no quotes).
7. Restart the dev server (`pnpm dev`). After you get a Focus recap, click **"Send to Discord"** in the Recap card; the message will appear in that channel. If `DISCORD_WEBHOOK_URL` is not set, the app shows "Discord not configured" and does not crash.

**Quick test:** `POST /api/focus-summary` with `roomId`, `lastSeconds`, `transcriptLines` (each `{ ts, speaker, text }`) returns `{ summary, bullets, source }`. `POST /api/discord/post-focus` with `{ roomId, bullets }` posts to the webhook.

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
    focus-summary/route.ts — Airia Focus Mode (3 bullets; fallback if no key)
    discord/post-focus/   — Post recap to Discord webhook
    summarize/route.ts    — Legacy summarization (still used by some flows)
    transcribe/route.ts  — Modulate transcription
    session/start/      — Start session, get policy
    session/end/        — End session, compute reward, update policy
    policy/route.ts     — GET/POST policy

lib/
  audioEngine.ts        — Web Audio analysis + shield actions
  policy.ts             — Policy params + self-learning adjustment
  summarize.ts          — Legacy Airia summarization
  services/
    airiaGateway.ts     — Airia Focus summary (OpenAI SDK + fallback)
    discordWebhook.ts   — Post recap to Discord
    airiaAgentCard.ts   — Optional AgentCard stub (feature-flagged)
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
