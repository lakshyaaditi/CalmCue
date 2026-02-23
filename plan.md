# CalmCue Deployment Plan

## Architecture Overview

Two separate deployments:

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  SITE 1: Landing Page   │         │  SITE 2: Next.js Demo App    │
│  (Netlify Static Site)  │         │  (Netlify — SSR via          │
│                         │         │   @netlify/plugin-nextjs)    │
│  index.html only        │─"Try──→│                              │
│  drag-and-drop deploy   │ Demo"  │  App Router + API routes     │
│  OR separate Netlify    │ link   │  Prisma + Supabase Postgres  │
│  site from /landing dir │        │  Modulate / Airia / Discord  │
└─────────────────────────┘         └──────────┬───────────────────┘
                                               │
                                    ┌──────────▼───────────────────┐
                                    │  Supabase (Cloud Postgres)   │
                                    │  policies / sessions /       │
                                    │  feedback tables             │
                                    └──────────────────────────────┘
```

**Why two sites?** `index.html` is a standalone static page with its own CSS/JS — it's not part of the Next.js app. Serving it as the Next.js root would require converting it to a React component. Keeping them separate is simpler and lets you update the landing page independently.

---

## Step 1: Supabase PostgreSQL Setup

### 1a. Supabase Project

Use your existing Supabase project (`bkzavcxkxqllfvfcjvdh`). No need to create a new one — the tables and data from your previous push are already there.

### 1b. Get the Connection String

Go to **Project Settings → Database → Connection string → URI** tab.

You need the **Session Pooler** connection string (NOT the direct connection), because:
- Serverless functions open/close connections rapidly
- The pooler handles connection reuse
- Direct connections hit IPv6 issues on some platforms

The string looks like:
```
postgresql://postgres.XXXX:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres
```

**Important:** Add `?pgbouncer=true` to the end for Prisma compatibility with Supabase's connection pooler:
```
postgresql://postgres.XXXX:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true
```

### 1c. Push Schema to Supabase

From your local machine (one-time setup):

```bash
# Set the Supabase URL temporarily
export DATABASE_URL="postgresql://postgres.bkzavcxkxqllfvfcjvdh:YOUR_PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true"

# Push schema (creates tables without migration history — fine for hackathon)
npx prisma db push

# Seed the default policy v1
npx tsx prisma/seed.ts
```

You already pushed a snapshot of local data to Supabase previously — **you do not need to push again**. The schema and seed data (Policy v1 + your 7 sessions) are already there.

Verify by checking Supabase Dashboard → Table Editor: `policies`, `sessions`, `feedback` should all exist with data.

### 1d. How Fresh Data Flows After Deployment

Once the Next.js app is deployed with `DATABASE_URL` pointing at Supabase, the data flow is:

```
User clicks "Run Demo" on deployed app
  → POST /api/session/start  → new Session row written to Supabase
  → (user interacts, gives feedback)
  → POST /api/session/end    → Session updated with metrics + reward
                              → new Policy version created (if feedback given)
```

Every demo run by anyone on the deployed site writes fresh rows directly to Supabase. Your existing 7 sessions stay, and new ones accumulate alongside them. This means:

- **Supabase always has the latest data** — no manual export/push step needed after deployment
- **Lightdash (already connected to Supabase)** sees new data automatically — just refresh your Lightdash dashboard or re-run the SQL queries
- The 3 Lightdash queries (`lightdash/lightdash_queries.sql`) will show the new sessions in "Reward Trend", "Overlap per Policy Version" (new policy versions from online demo runs), and "Before vs After"

**For the hackathon demo:** Run the demo 2–3 times on the deployed site (with feedback clicks) to generate fresh session data, then switch to Lightdash to show the live dashboard reflecting those runs. No manual data export required — Lightdash queries Supabase directly.

### 1e. Optional: Clear Old Data Before Demo Day

If you want a clean slate so Lightdash charts only show data from your live demo:

```sql
-- Run in Supabase SQL Editor
DELETE FROM feedback;
DELETE FROM sessions;
DELETE FROM policies WHERE version > 1;
```

This keeps Policy v1 (the default) and removes all old sessions. Your first demo run on stage will be Session #1.

---

## Step 2: Code Fixes Required Before Deployment

There are **two file-system operations** in the codebase that will break on Netlify's read-only serverless filesystem. These must be fixed before deploying.

### Fix 2a: `lib/transcribe.ts` — Remove `fs.writeFileSync` for caching

**Problem:** Line ~133 writes a cache file to `public/demo/transcript_cache.json`. Serverless functions have a read-only filesystem — this will throw an error.

**What to do:**
- The `transcript_cache.json` already exists in the repo (committed from a previous Modulate API call). On Netlify, it will be deployed as a static file and the `fs.readFileSync` to read it will work fine (since it reads from the build output).
- Remove only the `fs.writeFileSync` call (the cache write). The read-from-cache path stays. The fallback chain becomes: **read cache → call Modulate API (but don't write cache) → read mock JSON**.
- Alternatively, wrap the write in a try/catch that silently swallows EROFS (read-only filesystem) errors.

**Also:** The `fs.readFileSync` calls that read WAV files from `public/demo/` for sending to Modulate — verify these paths resolve correctly on Netlify. On Netlify, `process.cwd()` in serverless functions points to the build directory. `path.join(process.cwd(), "public", "demo", "speakerA.wav")` should work because Netlify includes `public/` in the function bundle. But test this — if it fails, the mock fallback will catch it.

### Fix 2b: `lib/services/airiaGateway.ts` — Remove direct `.env` file reading

**Problem:** Lines ~10–25 define `loadEnvVarFromFile()` which reads `.env` from disk using `fs.readFileSync`. There is no `.env` file on serverless platforms — env vars are injected into `process.env` by the platform.

**What to do:**
- The function already falls back to `process.env` when the file doesn't exist, so this technically works. But it's fragile.
- Replace all `loadEnvVarFromFile("AIRIA_API_KEY")` calls with direct `process.env.AIRIA_API_KEY?.trim() ?? ""`.
- Same applies to `lib/services/braintrustLogger.ts` if it uses the same pattern.

**Why the `.env` file reader exists:** Airia API keys contain `=` characters which some dotenv parsers truncate. On Netlify, environment variables are injected directly by the platform (not parsed from a file), so `=` characters are preserved correctly. The file reader is unnecessary for deployment.

---

## Step 3: Deploy the Next.js App on Netlify

### 3a. Install the Netlify Next.js Plugin

Create `netlify.toml` in the project root:

```toml
[build]
  command = "npx prisma generate && next build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

The `@netlify/plugin-nextjs` plugin handles:
- Server-side rendering via Netlify Functions (or Edge Functions)
- API routes (`/api/*`) as serverless functions
- Static assets served from CDN
- Automatic ISR/SSG support

### 3b. Add `@netlify/plugin-nextjs` as a Dev Dependency

```bash
pnpm add -D @netlify/plugin-nextjs
```

### 3c. Connect to Netlify

**Option A: Git-based deploy (recommended)**
1. Push your repo to GitHub
2. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project"
3. Connect your GitHub repo
4. Netlify auto-detects Next.js and applies the correct settings
5. Set the build command to: `npx prisma generate && next build`
6. Set the publish directory to: `.next`

**Option B: CLI deploy**
```bash
npx netlify-cli deploy --build --prod
```

### 3d. Set Environment Variables on Netlify

Go to **Site settings → Environment variables** and add:

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.XXXX:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true` | Yes |
| `MODULATE_API_KEY` | `52536081-...` (your key) | Yes (for live transcription; cache fallback works without it) |
| `AIRIA_API_KEY` | Your Airia key | Yes (for AI recap; fallback works without it) |
| `AIRIA_PIPELINE_URL` | `https://api.airia.com/v1/PipelineExecution/...` | Yes (if using Pipeline mode) |
| `AIRIA_OPENAI_BASE_URL` | `https://api.airia.com/v1/PipelineExecution/` | Alternative to PIPELINE_URL |
| `NEXT_PUBLIC_APP_NAME` | `CalmCue` | Optional |
| `DISCORD_WEBHOOK_URL` | Your Discord webhook URL | Optional |
| `BRAINTRUST_API_KEY` | Your Braintrust key | Optional |
| `BRAINTRUST_PROJECT` | `calmcue` | Optional |

**Critical:** Do NOT put `DATABASE_URL` in your `.env` file committed to git. It contains your Supabase password.

### 3e. Prisma on Netlify — Binary Targets

Netlify serverless functions run on Linux. Add the correct binary target to `prisma/schema.prisma`:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}
```

`"native"` = your local dev machine (macOS). `"rhel-openssl-3.0.x"` = Netlify's Linux runtime. Without this, Prisma will fail at runtime with a "Query engine binary not found" error.

### 3f. Note Your App URL

After deployment, Netlify gives you a URL like:
```
https://calmcue-demo.netlify.app
```

You'll need this for the landing page's "Try Demo" button.

---

## Step 4: Deploy the Landing Page on Netlify

### Option A: Drag-and-Drop (Simplest)

1. Create a folder (e.g., `landing/`) containing just `index.html`
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `landing/` folder onto the page
4. Netlify deploys it as a static site instantly
5. Set a custom domain or use the generated `.netlify.app` URL

### Option B: Separate Netlify Site from Git

1. Create a second Netlify site from the same repo
2. Set the **base directory** to a folder like `landing/` (you'd move `index.html` there)
3. Set publish directory to `landing/`
4. No build command needed (pure static HTML)

### Option C: Same Repo, Two Sites via Netlify Config

Not recommended — mixing a static HTML site and a Next.js app in one Netlify deploy is messy. Keep them separate.

---

## Step 5: Connect the Landing Page to the Demo

### 5a. Update `index.html` Links

Currently, these buttons all have `href="#"` (dead links):

| Button | Location in HTML | Change to |
|---|---|---|
| "Try the demo" (hero CTA) | `<a href="#" class="cta-btn primary">` | `https://calmcue-demo.netlify.app` |
| "Get the demo" (navbar) | `<a href="#" class="nav-cta">Get the demo</a>` | `https://calmcue-demo.netlify.app` |
| "Request access" (navbar) | `<a href="#" class="nav-cta secondary">` | Remove or link to a form |

### 5b. Consider Opening in New Tab

Since the demo is on a different domain, add `target="_blank" rel="noopener noreferrer"`:

```html
<a href="https://calmcue-demo.netlify.app" target="_blank" rel="noopener noreferrer" class="cta-btn primary">
  Try the demo
</a>
```

### 5c. Custom Domains (Optional)

If you have a domain like `calmcue.app`:
- `calmcue.app` → landing page (static site)
- `demo.calmcue.app` → Next.js app

Both configured via Netlify's domain settings.

---

## Step 6: Verify the Deployment

### Checklist

After both sites are deployed, verify:

- [ ] **Landing page loads** — `https://your-landing-site.netlify.app`
- [ ] **"Try Demo" button** — navigates to the Next.js app
- [ ] **Next.js app loads** — `https://calmcue-demo.netlify.app`
- [ ] **Policy loads** — check browser DevTools Network tab for `GET /api/policy` returning 200 with policy JSON (confirms DB connection)
- [ ] **"Run Demo Session" works** — audio plays, chaos meter animates, transcript appears
- [ ] **Transcript loads** — `POST /api/transcribe` returns entries (from cache file)
- [ ] **Session persists** — `POST /api/session/start` and `/api/session/end` return 200 (confirms Prisma + Supabase)
- [ ] **Focus Mode recap** — click "Want a recap?" → bullets appear (confirms Airia or fallback)
- [ ] **Feedback + policy learning** — click "Too Aggressive", end session, start new session → policy version increments
- [ ] **Second run behavior changes** — chaos threshold, toast cooldown, ducking strength visibly differ

### Common Failure Modes

| Symptom | Likely Cause | Fix |
|---|---|---|
| App loads but "Run Demo" does nothing | Audio files not in build output | Verify `public/demo/speakerA.wav` and `speakerB.wav` exist and are < 25MB (Netlify function payload limit) |
| `/api/policy` returns 500 | DATABASE_URL not set or wrong | Check Netlify env vars; verify Supabase connection string has `?pgbouncer=true` |
| "Query engine binary not found" | Missing Prisma binary target | Add `"rhel-openssl-3.0.x"` to `binaryTargets` in schema.prisma |
| Transcript returns empty | `transcript_cache.json` not found at expected path | Verify file exists in `public/demo/` and is included in the build |
| Airia recap fails silently | AIRIA_API_KEY contains `=` getting truncated | Ensure Netlify env var is set correctly (Netlify preserves `=` in env vars, unlike some dotenv parsers) |
| CORS errors | Landing page and demo on different domains | Not an issue — the landing page just links to the demo, no cross-origin API calls |
| `fs.writeFileSync` EROFS error | Cache write to read-only filesystem | Apply Fix 2a (remove or wrap the write) |

---

## Step 7: Environment Variables Cheat Sheet

### Where Each Env Var Is Used

| Variable | Used In | What Happens If Missing |
|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma`, all API routes | App crashes — Prisma cannot connect. **Required.** |
| `MODULATE_API_KEY` | `lib/transcribe.ts` | Transcript served from `transcript_cache.json` → `transcript_mock.json`. Demo still works. |
| `AIRIA_API_KEY` | `lib/services/airiaGateway.ts` | Focus recap uses fallback (last 3 speaker turns). Demo still works. |
| `AIRIA_PIPELINE_URL` | `lib/services/airiaGateway.ts` | Falls back to `AIRIA_OPENAI_BASE_URL` if set, else fallback bullets. |
| `AIRIA_OPENAI_BASE_URL` | `lib/services/airiaGateway.ts` | Alternative to PIPELINE_URL. Only one is needed. |
| `DISCORD_WEBHOOK_URL` | `lib/services/discordWebhook.ts` | "Send to Discord" button shows "not configured" toast. |
| `BRAINTRUST_API_KEY` | `lib/services/braintrustLogger.ts` | Logging silently disabled. No user-facing impact. |
| `NEXT_PUBLIC_APP_NAME` | `app/layout.tsx` (if used) | Defaults to `CalmCue`. |

### Minimum Viable Deployment

For the demo to work end-to-end with the least effort, you only strictly need:

```
DATABASE_URL=postgresql://postgres.XXXX:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true
```

Everything else has graceful fallbacks. The transcript comes from the committed cache file, the recap uses fallback bullets, Discord and Braintrust are optional.

For the full experience with all sponsor integrations working:

```
DATABASE_URL=...
MODULATE_API_KEY=...
AIRIA_API_KEY=...
AIRIA_PIPELINE_URL=...
```

---

## Detailed Todo List

### Phase 1: Code Fixes (serverless compatibility)

These changes make the codebase safe to run on Netlify's read-only serverless filesystem. Must be done before any deploy attempt.

- [x] **1.1** Open `lib/transcribe.ts` — find the `fs.writeFileSync(CACHE_PATH, ...)` call (~line 133)
- [x] **1.2** Wrap that write in a try/catch that silently catches `EROFS` / any write error, so the function still returns the transcript even if caching fails
- [x] **1.3** Verify the `fs.readFileSync` calls for `transcript_cache.json` and `transcript_mock.json` still work unchanged (they read from `public/demo/` which is included in the build — no change needed)
- [x] **1.4** Verify the `fs.readFileSync` calls for `speakerA.wav` / `speakerB.wav` still work (same `public/demo/` path — no change needed, but note these may not resolve on Netlify serverless; the mock fallback covers this)
- [x] **1.5** Open `lib/services/airiaGateway.ts` — find `loadEnvVarFromFile()` function (~lines 10–25)
- [x] **1.6** Replace all `loadEnvVarFromFile("AIRIA_API_KEY")` calls with `process.env.AIRIA_API_KEY?.trim() ?? ""`
- [x] **1.7** Replace all `loadEnvVarFromFile("AIRIA_PIPELINE_URL")` calls with `process.env.AIRIA_PIPELINE_URL?.trim() ?? ""`
- [x] **1.8** Replace all `loadEnvVarFromFile("AIRIA_OPENAI_BASE_URL")` calls with `process.env.AIRIA_OPENAI_BASE_URL?.trim() ?? ""`
- [x] **1.9** Remove the `loadEnvVarFromFile()` function itself and its `fs`/`path` imports (if no longer used elsewhere in the file)
- [x] **1.10** Check `lib/services/braintrustLogger.ts` for the same `loadEnvVarFromFile` pattern — if present, apply the same replacement with `process.env`
- [x] **1.11** Run `pnpm build` locally to confirm no compile errors from changes

**Additional fix:** Removed `public/demo/transcript_cache.json` from `.gitignore` so the cached Modulate transcription deploys with the app (better quality than mock fallback).

### Phase 2: Prisma configuration for serverless

- [x] **2.1** Open `prisma/schema.prisma`
- [x] **2.2** Add `binaryTargets = ["native", "rhel-openssl-3.0.x"]` to the `generator client` block
- [x] **2.3** Run `npx prisma generate` locally to verify it generates both binary targets without errors
- [ ] **2.4** Ensure `.env` has `DATABASE_URL` pointing to Supabase Session Pooler URL with `?pgbouncer=true` suffix (for local testing against Supabase before deploy)

### Phase 3: Netlify configuration

- [x] **3.1** Create `netlify.toml` in the project root with build command `npx prisma generate && next build`, publish dir `.next`, and `@netlify/plugin-nextjs` plugin
- [x] **3.2** Run `pnpm add -D @netlify/plugin-nextjs`
- [x] **3.3** Verify `.gitignore` includes `.next/`, `node_modules/`, `.env` (should already be there — just confirm secrets won't be pushed)
- [x] **3.4** Run `pnpm build` locally one more time to confirm the full build succeeds with all changes from Phase 1–3

### Phase 4: Supabase verification

- [ ] **4.1** Log into Supabase Dashboard for project `bkzavcxkxqllfvfcjvdh`
- [ ] **4.2** Go to Table Editor — confirm `policies`, `sessions`, `feedback` tables exist
- [ ] **4.3** Confirm `policies` table has at least one row (Policy v1 with default params)
- [ ] **4.4** Copy the Session Pooler connection string from **Project Settings → Database → Connection string → URI → Session Pooler**
- [ ] **4.5** Append `?pgbouncer=true` to the connection string — save this for Netlify env vars
- [ ] **4.6** (Optional) If you want a clean slate for demo day, run the DELETE statements from Step 1e in Supabase SQL Editor

### Phase 5: Deploy Next.js app to Netlify

- [ ] **5.1** Push all code changes (Phase 1–3) to GitHub
- [ ] **5.2** Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project"
- [ ] **5.3** Connect the GitHub repo
- [ ] **5.4** Confirm Netlify detected the build settings (build command: `npx prisma generate && next build`, publish: `.next`)
- [ ] **5.5** Before triggering deploy, go to **Site settings → Environment variables** and add:
  - [ ] `DATABASE_URL` — Supabase Session Pooler URL with `?pgbouncer=true` **(required)**
  - [ ] `MODULATE_API_KEY` — your Modulate key (optional — cache fallback works)
  - [ ] `AIRIA_API_KEY` — your Airia key (optional — fallback bullets work)
  - [ ] `AIRIA_PIPELINE_URL` — your Airia pipeline URL (optional — needed only if AIRIA_API_KEY is set)
  - [ ] `NEXT_PUBLIC_APP_NAME` — `CalmCue` (optional)
  - [ ] `DISCORD_WEBHOOK_URL` — your Discord webhook (optional)
  - [ ] `BRAINTRUST_API_KEY` — your Braintrust key (optional)
- [ ] **5.6** Trigger the deploy (or let it auto-deploy from the push)
- [ ] **5.7** Watch the deploy log for errors — common ones:
  - Prisma binary not found → check Phase 2
  - Build fails on TypeScript error → check Phase 1
  - Plugin not found → check Phase 3
- [ ] **5.8** Note the deployed URL (e.g., `https://calmcue-demo.netlify.app`)

### Phase 6: Test the deployed Next.js app

- [ ] **6.1** Open the deployed URL in browser — verify the app loads (dark UI, CalmCue header)
- [ ] **6.2** Open DevTools → Network tab
- [ ] **6.3** Verify `GET /api/policy` returns 200 with JSON containing `version: 1` and policy params (confirms DB connection)
- [ ] **6.4** Click "Run Demo Session"
- [ ] **6.5** Verify audio plays (both speakers audible)
- [ ] **6.6** Verify Chaos Meter animates (score changes, color shifts)
- [ ] **6.7** Verify transcript lines appear progressively in the panel
- [ ] **6.8** Wait for overlap → verify toast nudge appears
- [ ] **6.9** Wait for chaos > threshold → verify Focus Mode prompt appears
- [ ] **6.10** Click a recap window (e.g., 30s) → verify recap card shows 3 bullets
- [ ] **6.11** Click "Too Aggressive" feedback button at least once
- [ ] **6.12** Click "End Session" → verify session results card shows reward score
- [ ] **6.13** Click "Run Demo Session" again → verify Policy Badge shows "v2" with explanation
- [ ] **6.14** Verify second run behaves differently (higher chaos threshold, longer toast cooldown, etc.)
- [ ] **6.15** Check Supabase Table Editor → `sessions` table should have new rows from your test runs
- [ ] **6.16** (Optional) Open Lightdash, refresh dashboard → verify new session data appears in charts

### Phase 7: Update landing page and deploy

- [x] **7.1** Open `index.html`
- [x] **7.2** Find the hero "Try the demo" button — changed `href="#"` to `DEMO_URL_PLACEHOLDER` (will replace with actual Netlify URL after Phase 5)
- [x] **7.3** Add `target="_blank" rel="noopener noreferrer"` to that link
- [x] **7.4** Find the navbar "Get the demo" button — changed `href="#"` to `DEMO_URL_PLACEHOLDER`, added `target="_blank" rel="noopener noreferrer"`
- [x] **7.5** Changed navbar "Request access" button to `href="#features"` (points to features section instead of dead link)
- [x] **7.6** Searched for remaining `href="#"` — only footer links (Privacy, Terms, Contact) remain as placeholders, which is fine
- [ ] **7.7** Test `index.html` locally (open in browser, click "Try the demo" → should open the deployed app in a new tab)
- [ ] **7.8** Create a `landing/` folder, copy `index.html` into it
- [ ] **7.9** Go to [app.netlify.com/drop](https://app.netlify.com/drop) — drag the `landing/` folder to deploy
- [ ] **7.10** Verify the landing page loads at its Netlify URL
- [ ] **7.11** Click "Try the demo" on the live landing page → confirm it opens the deployed Next.js app

### Phase 8: Final end-to-end verification

- [ ] **8.1** Open the landing page URL in an incognito/private browser window (no cache, no localStorage)
- [ ] **8.2** Click "Try the demo" → app opens
- [ ] **8.3** Click "Run Demo Session" → full demo runs (audio, chaos meter, transcript, toasts, focus prompt)
- [ ] **8.4** Give feedback ("Too Aggressive" or "Too Weak") → end session → policy updates
- [ ] **8.5** Run a second session → confirm policy badge shows v2 and behavior is visibly different
- [ ] **8.6** Check Supabase → fresh rows in `sessions` and `policies` tables
- [ ] **8.7** Open Lightdash → run queries or refresh dashboard → confirm new data is visible
- [ ] **8.8** (Optional) Test on a phone browser — landing page should be responsive, demo app should work (audio may need a tap to start due to mobile autoplay policies)

---

## Summary: Phase Dependencies

```
Phase 1 (code fixes)
  └→ Phase 2 (Prisma config)
      └→ Phase 3 (Netlify config)
          └→ Phase 4 (Supabase verify) — can run in parallel with Phase 3
              └→ Phase 5 (deploy Next.js app)
                  └→ Phase 6 (test deployed app)
                      └→ Phase 7 (landing page)
                          └→ Phase 8 (end-to-end verify)
```

Phases 1–3 are local code changes (can be done in one commit). Phase 4 is a Supabase dashboard check (no code). Phases 5–8 are deploy and verify.
