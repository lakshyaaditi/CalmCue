# CalmCue — 3-Minute Demo Script & Speaker Notes

Use this with the deck in `presentation/index.html`. Open the deck in a browser (Chrome/Firefox), press **F** for fullscreen, **Esc** for overview. Use **arrow keys** or **space** to advance.

---

## Slide 1 — Title (15 sec)

**Say:**  
"CalmCue — neurodivergent-friendly voice chat that reduces sensory overload through real-time audio UX adaptation. We're not moderating what people say; we're making *how* it sounds easier to handle."

---

## Slide 2 — Hook (5 sec)

**Say:**  
"Voice chat shouldn't feel like a sensory assault. We fix the sound, not the words."

---

## Slide 3 — The Problem (25 sec)

**Say:**  
"The problem isn't the content of the conversation — it's the *dynamics*. Overlapping voices, sudden loudness spikes, rapid interruptions. For many people, especially neurodivergent folks, that's exhausting. And there's often no good 'What did I miss?' when you need a second to process."

**Note:** Keep it personal and relatable; avoid jargon.

---

## Slide 4 — What We're NOT Doing (15 sec)

**Say:**  
"Important: we're not building toxicity or content moderation. We don't classify or police what's said. We only touch *audio* — loudness, overlap, turn-taking — and accessibility features like captions and summaries."

---

## Slide 5 — The Solution (30 sec)

**Say:**  
"CalmCue is a real-time voice room that adapts the experience. We level volume so no one speaker blows out your ears. When two people talk over each other, we duck the non-dominant one. We can nudge 'one speaker at a time' with a gentle cue. Live captions show who said what. And a Focus Mode gives you a short 'What did I miss?' summary. Your feedback — too aggressive or too weak — is used to tune sensitivity for the next session."

---

## Slide 6 — How It Works (25 sec)

**Say:**  
"Under the hood: WebRTC for the voice room, Web Audio for per-speaker gain and compression. We analyze loudness and voice activity in real time, detect overlap and interruptions, then apply leveling and ducking. Transcription comes from Modulate's Velma for captions; Airia powers the Focus summary; and we store telemetry in Postgres and surface it in Lightdash. A small agent uses your feedback to propose updated thresholds for next time."

---

## Slide 7 — Sponsor Tech (20 sec)

**Say:**  
"We use Modulate's Velma for robust transcription in messy audio, Airia's OpenAI Gateway for the Focus Mode summarizer, and Lightdash for dashboards over session telemetry. The rest is WebRTC, Web Audio, Node, Next.js, and a Discord bot to join rooms and set shield sensitivity."

---

## Slide 8 — Demo (45 sec if live, else 20 sec)

**If doing live demo:**  
"Two browser tabs in the same room. I'll turn on some chaos — overlapping talk. You'll see the overlay: 'Overlap detected,' and the leveling and ducking kick in. Here are the toggles: Shield on/off, sensitivity, captions, one-speaker cue, Focus mode. Now I'll hit 'What did I miss?' — that's the Airia-powered summary. And these feedback buttons train the system for next session. We also have a seed script so Lightdash shows real session metrics."

**If slides-only:**  
"We have a full MVP: join a room, see overlap detection and leveling, use the toggles, get a Focus summary, and send feedback. Telemetry is stored and we can show improvement over a session in Lightdash."

---

## Slide 9 — Impact (20 sec)

**Say:**  
"Impact: neurodivergent-friendly design without changing what people say. We measure overlap, interruptions, and loudness spikes, and we can compare the first 30 seconds of a session to the last 30 to show improvement. The system learns from your feedback. All of this is demoable in about three minutes."

---

## Slide 10 — Thank You (10 sec)

**Say:**  
"CalmCue — try the room, tweak your sensitivity, and ask 'What did I miss?' when you need it. Thanks."

---

## Timing Summary

| Slide     | Content        | Time  |
|----------|----------------|-------|
| 1        | Title          | 15 s  |
| 2        | Hook           | 5 s   |
| 3        | Problem        | 25 s  |
| 4        | Not moderation | 15 s  |
| 5        | Solution       | 30 s  |
| 6        | How it works   | 25 s  |
| 7        | Sponsor tech   | 20 s  |
| 8        | Demo           | 45 s* |
| 9        | Impact         | 20 s  |
| 10       | Thank you      | 10 s  |

\* Use ~45 s if you do a live demo; otherwise ~20 s for slides-only.  
**Total:** ~3 min with live demo, ~2:20 slides-only.

---

## Tips to Win

1. **Lead with the problem** — sensory overload is real; judges will remember "we're not policing speech, we're calming the *sound*."
2. **Show one clear demo moment** — overlap overlay + leveling or "What did I miss?" is enough to make it stick.
3. **Name the sponsors** — Modulate, Airia, Lightdash — and say exactly what each does in the product.
4. **Keep the pitch tight** — 3 minutes means every sentence should earn its place.
5. **End with a clear CTA** — "Try the room, tweak sensitivity, ask 'What did I miss?'"
