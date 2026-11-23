# AI Showcase — How JetBrains tools were used on SIGHTLINE

*Status as of 23 November 2026. This document describes what actually happened — no more, no less.*

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
| Junie reviews of the pipeline and frontend | **Queued, not yet run** — blocked by the shared OpenRouter free-tier daily quota (50/50 used on 23 Nov; resets 24 Nov 2026 07:00 WIB). Junie already read the full pipeline and started the review before the quota ran out; the review runs will be re-attempted after the reset, and their reports will land in `.junie/reviews/`. |
| JetBrains Air repository indexing | **Pending** — `jbcontext` 0.9.22 is installed, but indexing needs an interactive login to the JetBrains AI Platform (OAuth in the browser), which has not been completed yet. |

**Junie did not build this app.** The app was built by the Muse agent; Junie's
role is reviewer and improver, and Air's role is repository indexing for
semantic search. Both are real uses of JetBrains tools, and both are
documented here as they actually stand.

## Junie CLI — what works and what doesn't (yet)

- **Junie CLI 26.11.2** is installed and authenticates successfully with a
  `JUNIE_API_KEY` generated at junie.jetbrains.com/cli (the key itself is
  never committed; it lives outside the repo).
- **Built-in JetBrains models are blocked right now:** the JetBrains account
  has no active JetBrains AI subscription yet, so the JetBrains LLM proxy
  answers `403 NO_LICENSE` ("No active JetBrains AI subscription found").
  The hackathon's 6-month All Products Pack + AI Ultimate codes are expected
  by email within 5 business days of registration (~30 Nov 2026); once they
  are claimed, Junie's built-in models should work directly.
- **Working path — BYOK custom model:** Junie runs on a custom model profile
  (`.junie/models/openrouter-nemotron.json`, committed in this repo) that
  routes Junie to the free tier of OpenRouter (`nvidia/nemotron-3-ultra-550b-a55b:free`)
  over the OpenAI Chat Completions format. The profile references the API key
  only as `${OPENROUTER_API_KEY}` — no secret is stored in the repo.
- **Verified 23 Nov 2026:** Junie authenticated, listed and opened project
  files, and completed a real task end-to-end on this BYOK path. The sandbox
  also needed the egress proxy's CA imported into Junie's bundled JVM
  truststore before the model service was reachable at all.
- **Known limits of the BYOK path:** the shared OpenRouter free tier allows
  50 requests/day across all free models, so long Junie sessions must be
  scheduled early in the day, before other work consumes the quota.

## Evidence in this repo

- `.junie/guidelines.md` — project rules Junie follows (GRID data handling,
  honesty labels, no fabricated claims).
- `.junie/models/openrouter-nemotron.json` — the working BYOK model profile.
- `.junie/reviews/` — Junie's review reports (pipeline + frontend) will be
  committed here once the quota allows the runs to finish.

## Reproducing the Junie setup

```bash
# 1. Install Junie CLI, generate a key at junie.jetbrains.com/cli,
#    and export it (never commit it):
export JUNIE_API_KEY="..."
export OPENROUTER_API_KEY="..."

# 2. Run Junie on the committed BYOK profile:
junie --model custom:openrouter-nemotron "Your task here"
```
