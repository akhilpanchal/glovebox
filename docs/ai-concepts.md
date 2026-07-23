# AI concepts, as they apply to Glovebox

A running glossary for the v3 agent work. Each entry is *what it is* and *why it
matters here specifically* — no generic AI theory. Appended to as concepts come
up during the build.

**Last updated:** 2026-07-22

---

## Token

The unit models read and bill in. Roughly ¾ of an English word — `"Anderson"` is
one token, `"$853.88"` is several. Everything is priced and limited in tokens,
which is why sizes throughout the v3 plan are quoted that way rather than in
pages or kilobytes.

**Here:** the entire service history is ~10k tokens. The owner's manual is ~360k.
That single ratio is what decided the architecture (see *RAG*).

## Context window

The maximum tokens a model can consider at once — instructions, knowledge,
conversation history, and its own reply, all counted together. Exceed it and the
request fails; approach it and quality degrades before it fails.

**Here:** we use ~15k against a limit in the hundreds of thousands. We are not
close to any edge, which is a luxury and the reason we can skip retrieval
entirely. Worth re-checking if chat history ever gets persisted and replayed.

## Statelessness

**The model has no memory between requests.** None. Each API call is evaluated
from scratch against exactly the bytes in that request.

What feels like a conversation is the client **re-sending the whole transcript**
every turn:

```
turn 1  → messages: [user: "do I need a brake flush?"]
turn 2  → messages: [user: "do I need a brake flush?",
                     assistant: "...",              ← resent
                     user: "what about transmission?"]
```

**Here:** this is why v3.0's "ephemeral history" is nearly free — the browser
keeps an array and posts it back. There is no server session to build, expire, or
scale. It's also why every request pays to re-read the context, and why prompt
caching matters.

## System prompt vs. messages

Two slots with different jobs:

| | `system` | `messages[]` |
|---|---|---|
| Holds | standing instructions + knowledge | the actual back-and-forth |
| Written by | us | the user, and the model |
| Changes | rarely | every turn |

Within `system` we keep two *further* distinct things — see the table in
[v3-agent-plan.md §4](./v3-agent-plan.md): **rules** (how to behave, hand-written)
and **context** (what's true about the car, generated from D1). They concatenate
into one blob, but separating them at the source is what makes a wrong answer
diagnosable — missing fact vs. bad judgment.

## Prompt caching

Re-reading 15k tokens on every turn is wasteful when 15k of it is identical. The
API can cache a **prefix** of the request; subsequent calls that share that prefix
pay a large discount to read it back.

The mechanism is the important part: **caching matches from the start of the
request forward, and the first differing byte invalidates everything after it.**

**Here:** this dictates ordering inside `system`. `RULES` never changes; context
changes whenever a service visit is logged. Stable-first, volatile-last means a
new entry invalidates only the tail. Reversed, every entry would throw away the
entire cache. This is the difference between ~1¢ and several ¢ per question — not
much money at family scale, but a clean illustration that these ideas have
mechanical consequences.

## Grounding, and why the math is in JavaScript

A model generates plausible continuations. Given 90 raw fuel rows and asked for
average MPG, it will produce a number that *looks* right, is often slightly
wrong, and is always stated with total confidence. Long arithmetic chains are a
known weak spot.

**Grounding** = giving the model facts to quote rather than asking it to derive
them.

**Here:** `context.js` computes MPG, lifetime spend, cost per mile, and
miles-since-every-service in JavaScript, and presents them as fixed lines the
model reads off. The rules block then says *quote these, don't recalculate*. The
division of labour: **deterministic math in JS, judgment in the model.** Judgment
is what it's good at — "$295.80 for the same two operations San Carlos did for
$169.17 is worth questioning" is reasoning, not arithmetic.

Related: **hallucination** is confident output unsupported by any source. The
defence isn't asking the model to be careful — it's making sure the true answer
is present in the context, and being able to *read* the context when an answer
looks wrong (hence dev-only `GET /api/context`).

## RAG (Retrieval-Augmented Generation) — and why we're not using it

The standard pattern when a corpus is too big to fit in the context window: chop
documents into chunks, embed each as a vector, and at question time retrieve the
handful of chunks most similar to the question. The model sees only those.

RAG is a **compression strategy under a size constraint**. It has a real cost:
anything not retrieved is invisible, and a retrieval miss is silent — you get a
confident answer built on the wrong five paragraphs, with nothing signalling the
gap.

**Here we have no size constraint**, so we pay the cost for nothing. Two concrete
failure modes we're avoiding:

- Our whole history is 7 visits. Retrieving "the 3 most relevant" for *"how has
  spending trended?"* is strictly worse than showing all 7.
- The Maintenance Minder code table (manual p.479–481) is a dense grid of
  two-word phrases — `1 Rotate tires`, `7 Replace brake fluid`. It has almost no
  keyword surface. Ask *"do I need a brake flush?"* and similarity search
  plausibly returns the *brake fluid reservoir check* page instead. You would
  never know it missed.

So instead we **curate**: hand-pick ~15 pages of the manual into
`src/config/manual.js` and keep them in context permanently. Curation beats
retrieval when the useful subset is small, stable, and identifiable in advance —
which is exactly our situation.

The trigger to revisit: if the corpus grows past roughly 100k tokens, or if
questions start needing arbitrary pages of the manual rather than the maintenance
chapter.

## Tool use (function calling)

Models can be given tools they may request during a turn: they emit "call
`web_search` with these arguments", something executes it, the result is fed
back, and generation continues. This is what makes an "agent" rather than a
one-shot text generator.

Usually **you** implement the loop: receive the tool request, run the function,
send the result back, repeat until done. That loop is the bulk of most agent
frameworks.

**Here we avoid writing one entirely.** Anthropic's `web_search` executes
server-side — the model calls it, Anthropic runs it, and only the finished
response comes back. Our Worker stays a dumb proxy: `fetch` in, stream out. No
orchestration, no retry logic, no framework, no new dependency.

If we later want *our own* tool (say, "look up a shop's Yelp rating"), we'd have
to build that loop, and the chat handler stops being a proxy. Worth knowing where
that cliff is.

## Streaming (SSE)

Without streaming, a request that takes 15 seconds shows a blank screen for 15
seconds. With `stream: true`, the API returns Server-Sent Events — a long-lived
HTTP response emitting text chunks as they're generated.

**Here:** because there's no tool loop to manage, the Worker can hand the upstream
body straight to the browser (`return new Response(upstream.body, …)`) — the
whole feature is one line server-side plus ~40 lines of vanilla JS to read it. No
framework needed, consistent with CLAUDE.md.

## Evals

Automated checks that answer quality hasn't regressed. Prompt changes are not
like code changes: editing one sentence in `RULES` can silently degrade an
unrelated class of answers, and nothing throws an error.

**Here:** deliberately lightweight — Phase 6 is a handful of real questions with
known-good answers, run by hand. Two anchors so far:

- *"Is \$295.80 reasonable for an A1 service?"* → must surface the \$169.17
  comparison unprompted.
- *"Do I need a brake flush?"* → must cite code `7` and the 22-month gap between
  the Oct 2023 and Aug 2025 flushes.

Formal eval tooling is overkill for a family app; having *any* written-down check
is not, because it's the only way to tell whether a prompt edit helped.
