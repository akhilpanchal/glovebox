// Thin wrapper over the Anthropic Messages API — raw fetch, no SDK (see the v3
// agent-architecture notes: one provider, a shallow tool loop, so a hand-rolled
// call keeps the Worker dependency-free). The API key is a Cloudflare secret
// (`ANTHROPIC_API_KEY`); it lives only in the Worker and never reaches the browser.

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// POST a Messages request body; return the parsed JSON response. Throws on a
// non-2xx so the caller can turn it into a 502. The thrown message includes the
// API's error text (never the key) for server-side logging.
export async function callMessages(env, body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}
