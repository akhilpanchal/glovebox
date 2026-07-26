// Test doubles for the handler layer. The handlers take (request, env) as plain
// arguments, so they run in-process — no Miniflare, no live D1.
//
// `makeDB` fakes the D1 binding: it mimics the prepare(sql).bind(...).run()/.all()
// chain, records every statement (sql + bound params + op) for assertions, and
// returns results from a caller-supplied queue consumed in call order. It runs
// no SQL — it verifies the handler's logic (validation, auth, status codes, and
// exactly what gets bound), which is where the risk lives.
export function makeDB(queue = []) {
  const results = [...queue];
  const statements = [];

  function nextResult(record) {
    const r = results.shift();
    record.result = r;
    // A handler that reads past what the test queued gets a benign empty result
    // rather than a cryptic undefined-property crash.
    if (r === undefined) return { results: [], meta: { changes: 0, last_row_id: 0 } };
    return r;
  }

  const DB = {
    prepare(sql) {
      const record = { sql, binds: [], op: null, result: undefined };
      statements.push(record);
      const stmt = {
        bind(...args) {
          record.binds = args;
          return stmt;
        },
        async run() {
          record.op = "run";
          return nextResult(record);
        },
        async all() {
          record.op = "all";
          return nextResult(record);
        },
      };
      return stmt;
    },
  };

  return { DB, statements };
}

// Build a faithful Request. Passing `email` sets the Cf-Access header (production
// identity); omitting it (and LOCAL_DEV_EMAIL on env) exercises the 401 path.
// `body` is JSON-encoded; `rawBody` is sent verbatim so `.json()` throws — the
// "invalid JSON → 400" path, tested for real, not stubbed.
export function makeRequest({ email, body, rawBody } = {}) {
  const headers = {};
  if (email) headers["Cf-Access-Authenticated-User-Email"] = email;

  const init = { method: "POST", headers };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return new Request("https://example.test/glovebox/api/x", init);
}
