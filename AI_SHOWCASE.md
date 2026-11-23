# AI Showcase — How JetBrains tools were used on SIGHTLINE

*Status as of 24 November 2026. This document describes what actually happened — no more, no less.*

## What SIGHTLINE is

SIGHTLINE is a VALORANT tactical scouting console built for the Cloud9 x
JetBrains "Sky's The Limit" Hackathon 2026 (Category 1). It turns 337 pro
matches of GRID data into opponent utility heatmaps, Operator sniper
profiles, and one-click anti-strat plans.

## Who built what (honest split)

| Work | Done by |
| --- | --- |
| App design, data pipeline (`pipeline/`), frontend (`docs/`), tests, demo deployment | A Muse coding agent (the author's AI assistant, "forza") |
| Project rules for the AI tools (`.junie/guidelines.md`) | Written for Junie before the build, committed 23 Nov 2026 |
| Junie CLI setup, auth, and BYOK model profile | Set up and verified working 23 Nov 2026 (see below) |
| Junie reviews of the pipeline and frontend | **Running 24 Nov 2026** on JetBrains built-in models (AI Ultimate claimed; the 23 Nov OpenRouter quota block is gone). Reports will land in `.junie/reviews/`. |
| JetBrains Air repository indexing | **Blocked in this VM** — `jbcontext` 0.9.22 is installed and the browser OAuth authorization succeeded (23 Nov 2026), but the CLI login fails: jbcontext's HTTP client cannot CONNECT through this VM's egress proxy (its own log: "Failed to parse CONNECT response: unexpected EOF"), and no direct egress exists. The `--token` manual-auth path is unverified. Air is a nice-to-have; the JetBrains tool requirement is met by Junie. |

**Junie did not build this app.** The app was built by the Muse agent; Junie's
role is reviewer and improver. Air's intended role was repository indexing
for semantic search, but it could not be run in this environment. Both are
documented here as they actually stand.

## Junie CLI — what works and what doesn't (yet)

- **Junie CLI 26.11.2** is installed and authenticates successfully with a
  `JUNIE_API_KEY` generated at junie.jetbrains.com/cli (the key itself is
  never committed; it lives outside the repo).
- **Built-in JetBrains models work now (resolved 24 Nov 2026):** the
  hackathon codes arrived by email 24 Nov 2026 00:31 WIB and were claimed
  the same day — All Products Pack + AI Ultimate, each 2 months of access,
  active until 23 Jan 2027 (verified on the Licenses page). The earlier
  `403 NO_LICENSE` block is gone; a test task on the default (built-in)
  model completed successfully 24 Nov 2026 01:16 WIB.
- **Fallback path — BYOK custom model:** Junie can run on a custom model profile
  (`.junie/models/openrouter-nemotron.json`, committed in this repo) that
  routes Junie to the free tier of OpenRouter (`nvidia/nemotron-3-ultra-550b-a55b:free`)
  over the OpenAI Chat Completions format. The profile references the API key
  only as `${OPENROUTER_API_KEY}` — no secret is stored in the repo. This was
  the working path on 23 Nov 2026; since the AI Ultimate claim it is the
  fallback, with built-in models primary.
- **Verified 23 Nov 2026:** Junie authenticated, listed and opened project
  files, and completed a real task end-to-end on this BYOK path. The sandbox
  also needed the egress proxy's CA imported into Junie's bundled JVM
  truststore before the model service was reachable at all.
- **Verified 24 Nov 2026:** built-in models work — Junie authenticated and
  completed a small task end-to-end on the default model with no license
  error (codes claimed, AI Ultimate active until 23 Jan 2027).
- **Known limits of the BYOK path:** the shared OpenRouter free tier allows
  50 requests/day across all free models, so long Junie sessions must be
  scheduled early in the day, before other work consumes the quota.

## Evidence in this repo

- `.junie/guidelines.md` — project rules Junie follows (GRID data handling,
  honesty labels, no fabricated claims).
- `.junie/models/openrouter-nemotron.json` — the working BYOK model profile.
- `.junie/reviews/` — Junie's review reports (pipeline + frontend) will be
  committed here once the review runs finish (running 24 Nov 2026 on
  built-in models).

## Reproducing the Junie setup

```bash
# 1. Install Junie CLI, generate a key at junie.jetbrains.com/cli,
#    and export it (never commit it):
export JUNIE_API_KEY="..."
export OPENROUTER_API_KEY="..."

# 2. Run Junie on its built-in models (primary since 24 Nov 2026):
junie "Your task here"

# 3. Fallback if built-in models fail — the committed BYOK profile:
junie --model custom:openrouter-nemotron "Your task here"
```
