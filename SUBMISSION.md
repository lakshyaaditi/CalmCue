## Inspiration

Group voice calls are chaotic — people talk over each other, loudness spikes hit without warning, and conversations move too fast to follow. For neurodivergent users (ADHD, autism, sensory processing differences), this isn't just annoying — it's genuinely overwhelming. Existing solutions focus on moderating *what* people say (toxicity filters), but nobody is addressing *how* the conversation sounds. We wanted to build something that makes voice rooms calmer without policing anyone's speech.

## What it does

CalmCue is a neurodivergent-friendly voice chat UX that reduces sensory overload through real-time audio dynamics adaptation. It analyzes **how** people talk — not **what** they say.

- **Chaos Meter** — A real-time 0–100 score computed from overlap ratio, interruptions, and loudness spikes, updated every second
- **Overlap Nudge Toasts** — Gentle reminders like "Let Speaker A finish before Speaker B" when two people talk over each other for too long
- **Focus Mode Recap** — When chaos stays high, CalmCue prompts "Too chaotic — want a recap?" and generates a private summary of what you missed using Airia's AI gateway
- **Rolling Transcript** — Live captions with speaker labels powered by Modulate's Velma Transcribe API
- **Self-Learning Policy** — Feedback buttons ("Too Aggressive" / "Too Weak") let users tune the sensitivity. The system learns across sessions — run the demo twice and the second run visibly behaves differently based on your feedback
- **Analytics Dashboard** — Session telemetry persists to Postgres and flows into Lightdash for visualizing reward trends and before/after comparisons

## How we built it

- **Next.js (App Router) + TypeScript** for the full-stack app
- **Web Audio API** for the entire audio analysis pipeline — each speaker track runs through `MediaElementSource → GainNode → DynamicsCompressor → AnalyserNode → Destination`. We compute RMS→dB every 50ms, run voice activity detection with hangover, detect overlaps, count interruptions, and identify loudness spikes against a rolling baseline
- **Modulate Velma Transcribe** (batch API) for real-time transcription — we send both speaker WAV files in parallel, split the returned utterances into sentence-level chunks with proportionally distributed timestamps, and merge them into an interleaved rolling transcript
- **Airia Gateway** (OpenAI-compatible) for Focus Mode recap summarization — when chaos is high, we send the recent transcript to Airia and get back 3 concise bullets
- **Lightdash** connected to Supabase for analytics — SQL queries visualize reward trends, overlap-per-policy-version, and before-vs-after comparisons
- **Postgres + Prisma** for session telemetry, policy versioning, and feedback storage
- **Demo Mode** with deterministic audio generated via macOS `say` command — no binary files shipped, fully reproducible

## Challenges we ran into

- **`createMediaElementSource` is one-shot** — Web Audio API only lets you connect an `<audio>` element to a `MediaElementSource` once, ever. Running the demo a second time crashed. We solved it by dynamically creating fresh `<audio>` elements for each session
- **Modulate returns full paragraphs** — The batch API transcribes each file as one long utterance. We had to build a sentence-splitting layer that distributes timestamps proportionally across the audio duration to create the interleaved rolling transcript effect
- **Rate limiting on Modulate** — Too many API calls caused failures. We added a caching layer that persists transcriptions to disk after the first successful call
- **Lightdash connectivity** — Getting Lightdash Cloud to talk to a local Postgres required creative routing. We ended up pushing data to Supabase as a cloud intermediary
- **Policy learning that's visible** — Making the self-learning demo compelling required careful tuning of the adjustment function — changes had to be noticeable but not extreme (capped at ±10% per session)

## Accomplishments that we're proud of

- **Zero content moderation** — We proved you can make voice chat dramatically calmer without ever analyzing or filtering what people say
- **Real audio pipeline** — Not a mockup. Real Web Audio API nodes doing real-time RMS computation, VAD, overlap detection, dynamic leveling, and ducking at 50ms intervals
- **Visible learning** — Run the demo twice with "Too Aggressive" feedback and the second run measurably changes: higher chaos threshold, longer toast cooldowns, gentler ducking. The policy badge updates with a human-readable explanation
- **Three sponsor integrations working end-to-end** — Modulate for transcription, Airia for summarization, Lightdash for analytics, all with graceful fallbacks
- **Fully deterministic demo** — Audio generated from `say` command, cached transcriptions, mock fallbacks. The 3-minute demo works reliably every single time

## What we learned

- The Web Audio API is incredibly powerful but full of gotchas — one-shot source connections, cross-origin restrictions, and the need to resume AudioContext after user gesture
- Neurodivergent-friendly design isn't about dumbing things down — it's about giving users control over sensory input and providing escape hatches (like Focus Mode) when things get overwhelming
- Self-learning systems need to be transparent. Showing "Policy v2: Made shields less aggressive" builds trust in a way that silent parameter changes never could
- For hackathon demos, deterministic reproducibility beats live API calls. Cache everything, fallback gracefully, and make the happy path bulletproof

## What's next for CalmCue

- **Live microphone input** — Replace demo WAV files with real WebRTC streams for actual multi-user voice rooms
- **Per-user sensitivity profiles** — Different users in the same room could have different chaos thresholds and ducking levels
- **Continuous learning** — Move from end-of-session batch updates to real-time policy adjustment using reinforcement learning
- **Browser extension** — Inject CalmCue's audio pipeline into existing platforms (Discord, Google Meet, Zoom) as an accessibility overlay
- **Emotion-aware shields** — Use Modulate Velma's emotion detection to distinguish excited enthusiasm from frustrated shouting, and respond differently
- **Mobile haptic cues** — Replace visual toasts with gentle vibration patterns for users who can't watch the screen during a call
