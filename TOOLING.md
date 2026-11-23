# SIGHTLINE — Tooling: how JetBrains tools were used

How JetBrains tooling (Junie CLI, and the attempted JetBrains Air setup)
was actually used on SIGHTLINE — what works, what is queued, and what
failed. This document describes what actually happened — no more, no less.
Status as of 23 November 2026.

## 0. Honest split: who built what

| Work | Done by |
| --- | --- |
| App design, data pipeline (`pipeline/`), frontend (`docs/`), tests, demo deployment | A Muse coding agent (the author's AI assistant, "forza") |
| Project rules for the AI tools (`.junie/guidelines.md`) | Written for Junie before the build, committed 23 Nov 2026 |
| Junie CLI setup, auth, and BYOK model profile | Set up and verified working 23 Nov 2026 (see below) |
| Junie reviews of the pipeline and frontend | **Queued, not yet run** — blocked by the shared OpenRouter free-tier daily quota (see §3) |
| JetBrains Air repository indexing | **Not done** — login was attempted and failed for an environmental reason (see §4) |

**Junie did not build this app.** The app was built by the Muse agent;
Junie's role is reviewer and improver. Nothing in this document implies
otherwise.

## 1. Junie CLI 26.11.2 — the primary JetBrains tool

Junie CLI is the main JetBrains tool used on this project. It is installed
in the build environment and authenticates successfully with a
`JUNIE_API_KEY` generated at junie.jetbrains.com/cli. (The key itself is
never committed; it lives outside the repo.)

### 1.1 The problem: built-in JetBrains models are blocked

The JetBrains account used for this project has no active JetBrains AI
subscription yet, so the JetBrains LLM proxy answers every built-in-model
request with `403 NO_LICENSE` ("No active JetBrains AI subscription
found"). The hackathon's 6-month All Products Pack + AI Ultimate codes are
expected by email within 5 business days of registration (~30 Nov 2026);
until they are claimed, Junie's built-in models cannot run.

### 1.2 The working path: BYOK custom model profile

Junie runs on a committed custom model profile,
`.junie/models/openrouter-nemotron.json`, that routes Junie to the free
tier of OpenRouter over the OpenAI Chat Completions format:

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

# 2. Run Junie on the committed BYOK profile:
junie --model custom:openrouter-nemotron "Your task here"
```

## 2. What Junie actually did

Verified 23 Nov 2026, on the BYOK path:

- Authenticated successfully and listed/opened project files.
- Completed a real task end-to-end on this path.
- Read the full aggregation pipeline and **started the first review pass**
  before the daily quota ran out (see §3).

The review pass was interrupted, not finished: no review report exists yet,
and none is claimed here.

## 3. What is queued, and why

The planned Junie work — a review of `pipeline/` (aggregation correctness,
caveat handling, sampling) and a review of `docs/` (frontend correctness,
honesty labels, accessibility) — is **queued**. Their reports will land in
`.junie/reviews/` (the directory does not exist yet because no report has
been produced).

The blocker is the shared OpenRouter free tier: **50 requests/day across
all free models and all projects on the key**. On 23 Nov 2026 the quota was
fully consumed (50/50) before Junie's review runs could finish. The quota
resets 24 Nov 2026 07:00 WIB, and the review runs are scheduled to retry
24 Nov 2026 07:05 WIB (via cron), early in the day before other work
consumes the quota again. Long Junie sessions on this path must always be
scheduled early in the day for the same reason.

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

> Note: `AI_SHOWCASE.md` in this repo still says the Air login "has not
> been completed yet". That line is stale as of the 23 Nov login attempt
> described above; it will be updated when the showcase document is next
> revised. This file (TOOLING.md) carries the current, accurate status.

## 5. Evidence in this repo

- `.junie/guidelines.md` — project rules Junie follows (GRID data handling:
  never commit raw data, never `git clone` the starter repo; every insight
  carries its sample size; estimates always labeled; no fabricated claims;
  keep the demo fast).
- `.junie/models/openrouter-nemotron.json` — the working BYOK model
  profile (§1.2).
- `.junie/reviews/` — Junie's review reports (pipeline + frontend) will be
  committed here once the quota allows the runs to finish.
- `AI_SHOWCASE.md` — the showcase summary of JetBrains tool usage (see the
  staleness note in §4 about its Air line).

## 6. What changes when the hackathon codes arrive

Once the 6-month All Products Pack + AI Ultimate codes arrive (~30 Nov
2026) and are claimed on the JetBrains account:

- The `403 NO_LICENSE` block disappears and **Junie's built-in models work
  directly** — no BYOK profile, no OpenRouter quota, no 50-requests/day
  ceiling on review runs.
- The queued pipeline + frontend reviews can run on JetBrains models
  instead of the free-tier Nemotron profile, and longer review/improvement
  sessions become practical.
- Air remains a separate question: the login failure was environmental
  (jbcontext's HTTP client vs. the sandbox egress proxy), not a license
  issue, so the codes alone do not unblock Air indexing in this VM. The
  `--token` path (§4) would still need verification.

Until then, the honest status stands: Junie CLI works via BYOK, its first
review pass started and is queued for completion after the quota reset,
and Air indexing is not done.
