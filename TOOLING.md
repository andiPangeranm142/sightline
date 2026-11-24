# SIGHTLINE — Tooling: how JetBrains tools were used

How JetBrains tooling (Junie CLI, and the attempted JetBrains Air setup)
was actually used on SIGHTLINE — what works, what is running, and what
failed. This document describes what actually happened — no more, no less.
Status as of 24 November 2026.

## 0. Honest split: who built what

| Work | Done by |
| --- | --- |
| App design, data pipeline (`pipeline/`), frontend (`docs/`), tests, demo deployment | A Muse coding agent (the author's AI assistant, "forza") |
| Project rules for the AI tools (`.junie/guidelines.md`) | Written for Junie before the build, committed 23 Nov 2026 |
| Junie CLI setup, auth, and BYOK model profile | Set up and verified working 23 Nov 2026 (see below) |
| Junie reviews of the pipeline and frontend | **Completed 24 Nov 2026** on JetBrains built-in models (AI Ultimate claimed; see §3) — reports in `.junie/reviews/`, fixes applied and aggregates regenerated |
| JetBrains Air repository indexing | **Not done** — login was attempted and failed for an environmental reason (see §4) |

**Junie did not build this app.** The app was built by the Muse agent;
Junie's role is reviewer and improver. Nothing in this document implies
otherwise.

## 1. Junie CLI 26.11.2 — the primary JetBrains tool

Junie CLI is the main JetBrains tool used on this project. It is installed
in the build environment and authenticates successfully with a
`JUNIE_API_KEY` generated at junie.jetbrains.com/cli. (The key itself is
never committed; it lives outside the repo.)

### 1.1 Resolved 24 Nov 2026: built-in JetBrains models now work

On 23 Nov 2026 the JetBrains account had no active AI subscription, so the
JetBrains LLM proxy answered every built-in-model request with `403
NO_LICENSE` ("No active JetBrains AI subscription found"). That block is
gone: the hackathon codes arrived by email 24 Nov 2026 00:31 WIB (Devpost
Credits) and were claimed the same day — All Products Pack + AI Ultimate,
each 2 months of access, valid through 22 Jan 2027 (per the license
certificates; the Licenses page shows the next billing date as 23 Jan
2027). A test task on the default (built-in) model completed
successfully 24 Nov 2026 01:16 WIB: authenticated, no license error. Note:
the codes give 2 months each, not 6 — the codes email is authoritative.

### 1.2 The fallback path: BYOK custom model profile

Junie can run on a committed custom model profile,
`.junie/models/openrouter-nemotron.json`, that routes Junie to the free
tier of OpenRouter over the OpenAI Chat Completions format. This was the
working path on 23 Nov 2026; since the AI Ultimate claim (§1.1) it is the
fallback, with built-in models primary:

```json
{
  "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
  "apiType": "OpenAICompletion",
  "apiKey": "${OPENROUTER_API_KEY}",
  "displayName": "Nemotron 3 Ultra 550B (OpenRouter free)",
  "providerName": "OpenRouter"
}
```

The profile references the API key only as `${OPENROUTER_API_KEY}` — no
secret is stored in the repo. Note that Junie rejects
`--provider openrouter --model <id>` (the model must be in Junie's own
catalog); a custom profile is the only way to add an outside model ID.

Two environment fixes were needed before this path worked at all:

1. **TLS / egress proxy CA.** The sandbox routes egress through a MITM
   proxy, and Junie's bundled JVM rejected its certificate (PKIX path
   building failed). Fix: import the egress CA into Junie's bundled JVM
   truststore (`junie-app/lib/runtime/lib/security/cacerts`).
2. **Auth method.** `--model junie-lite` needs interactive ACP login, not
   the API key — the API-key path (`JUNIE_API_KEY`) is the one that works
   non-interactively.

Reproducing the setup:

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

## 2. What Junie actually did

Verified 23 Nov 2026, on the BYOK path:

- Authenticated successfully and listed/opened project files.
- Completed a real task end-to-end on this path.
- Read the full aggregation pipeline and **started the first review pass**
  before the daily quota ran out (see §3).

Verified 24 Nov 2026, on the built-in path: authenticated successfully
and completed a small task end-to-end (listed the repo's top-level files)
with no license error.

The 23 Nov review pass was interrupted, not finished. The reviews were
completed 24 Nov 2026 on built-in models (see §3).

## 3. Reviews: completed 24 Nov 2026 on built-in models

Junie reviewed `pipeline/` (aggregation correctness, caveat handling,
sampling) and `docs/` (frontend correctness, honesty labels,
accessibility) on JetBrains built-in models, finishing 24 Nov 2026
01:30 WIB. The reports are in `.junie/reviews/`:

- `pipeline-2026-11-24.md` — 16 findings (5 High, 9 Medium, 2 Low).
- `frontend-2026-11-24.md` — 8 findings (4 High, 4 Medium).

Both reports were written by Junie in Indonesian and translated to
English afterwards (translation note on each file; content unchanged).

Findings acted on: Junie applied small safe fixes itself (bounds
validation, `gap_exceeded` handling, timeout projections, the ballistic
allowlist, plus frontend accessibility/contrast fixes), then the
aggregates were regenerated with the fixed code — the 438
non-ballistic landing-zone points are gone (verified live: 3,250 stored
points, 0 non-ballistic), the heatmap binning edge bug is fixed (all
cells inside 0–1000), and anti-strat cards now say "casts concentrated
in sector" instead of "placements". All tests re-ran green after the
regeneration (jsdom 30/30, Playwright 14/14, pipeline 5/5, frontend
4/4). The remaining findings (sample-size denominators, historical
Operator team attribution, cross-game context) are documented in the
reports as follow-ups and were deliberately not changed this close to
submission.

History: on 23 Nov 2026 the reviews were blocked by the shared OpenRouter
free tier (**50 requests/day across all free models and all projects on
the key**), fully consumed (50/50) before the review runs could finish.
The AI Ultimate claim (§1.1) removed that blocker entirely — built-in
models have no OpenRouter ceiling.

## 4. JetBrains Air (jbcontext) — attempted, failed, not done

**Air indexing is NOT done, and this document does not claim it is.**

`jbcontext` 0.9.22 (the Air CLI) is installed. On 23 Nov 2026 the full
login was attempted:

- The browser completed the JetBrains OAuth authorization — the
  authorization code was obtained and the state matched.
- But delivering the callback to the CLI's `localhost:62350` listener
  failed: requests carrying code+state got empty responses (connection
  closed, no HTTP response), while a no-params request returned a normal
  200 page.
- The CLI waited out its ~4 minute timeout, fell back to JetBrains Account
  login, and died with `OAuth login failed -- Unsupported HTTP version:
  muse:`.

Root cause (from `~/.jbcontext/logs/jbcontext.log`): jbcontext's HTTP
client cannot do CONNECT through the sandbox egress proxy — its own log
shows `Analytics push failed: Failed to parse CONNECT response:
unexpected EOF`. Direct egress does not exist in this VM, so bypassing the
proxy is impossible.

One remaining path is **unverified**: `jbcontext login --token <token>`
(needs a JCP token from the JetBrains web console) plus `--no-verify` —
and even then, index/search may still need the same broken HTTP client.
Air is therefore treated as nice-to-have: Junie (`.junie/` + this repo's
`AI_SHOWCASE.md`) already satisfies the hackathon's JetBrains-tool
requirement, and Air indexing is not on the critical path for the project.

> Note: `AI_SHOWCASE.md` in this repo was updated on 23 Nov 2026 to record
> the diagnosed Air login failure above, so it now agrees with this file.

## 5. Evidence in this repo

- `.junie/guidelines.md` — project rules Junie follows (GRID data handling:
  never commit raw data, never `git clone` the starter repo; every insight
  carries its sample size; estimates always labeled; no fabricated claims;
  keep the demo fast).
- `.junie/models/openrouter-nemotron.json` — the working BYOK model
  profile (§1.2).
- `.junie/reviews/` — Junie's review reports (pipeline + frontend),
  completed 24 Nov 2026 on built-in models (§3).
- `AI_SHOWCASE.md` — the showcase summary of JetBrains tool usage (its Air
  line records the diagnosed login failure; see §4).

## 6. Hackathon codes: claimed 24 Nov 2026

The All Products Pack + AI Ultimate codes arrived by email 24 Nov 2026
00:31 WIB and were claimed the same day (each 2 months of access, valid
through 22 Jan 2027 per the license certificates):

- The `403 NO_LICENSE` block is gone and **Junie's built-in models work
  directly** — no BYOK profile, no OpenRouter quota, no 50-requests/day
  ceiling on review runs.
- The pipeline + frontend reviews are complete on JetBrains models (§3),
  and longer review/improvement sessions are now practical.
- Air remains a separate question: the login failure was environmental
  (jbcontext's HTTP client vs. the sandbox egress proxy), not a license
  issue, so the codes alone do not unblock Air indexing in this VM. The
  `--token` path (§4) would still need verification.

Current honest status: Junie CLI works on built-in models, its reviews are
complete and acted on, and Air indexing is not done.
