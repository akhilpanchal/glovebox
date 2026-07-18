const API_PREFIX = "/glovebox/api";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleGetEntries(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM fuel_entries ORDER BY date DESC, id DESC"
  ).all();
  return json(results);
}

async function handlePostEntry(request, env) {
  const addedBy =
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    (env.LOCAL_DEV_EMAIL ? env.LOCAL_DEV_EMAIL : null);

  if (!addedBy) {
    return json(
      { error: "Unauthorized: no authenticated user email found" },
      401
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { date, odometer, volume, notes } = body;

  if (
    !date ||
    odometer === undefined ||
    odometer === null ||
    volume === undefined ||
    volume === null
  ) {
    return json(
      { error: "Missing required fields: date, odometer, volume" },
      400
    );
  }

  const odometerNum = Number(odometer);
  const volumeNum = Number(volume);

  if (!Number.isFinite(odometerNum) || !Number.isFinite(volumeNum)) {
    return json({ error: "odometer and volume must be numbers" }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO fuel_entries (date, odometer, volume, added_by, notes)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(date, odometerNum, volumeNum, addedBy, notes || null)
    .run();

  const insertedId = result.meta.last_row_id;
  const { results } = await env.DB.prepare(
    "SELECT * FROM fuel_entries WHERE id = ?"
  )
    .bind(insertedId)
    .all();

  return json(results[0], 201);
}

async function handleGetMe(request, env) {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    (env.LOCAL_DEV_EMAIL ? env.LOCAL_DEV_EMAIL : null);

  if (!email) {
    return json({ error: "Unauthorized" }, 401);
  }

  return json({ email });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === `${API_PREFIX}/me`) {
      if (request.method === "GET") {
        return handleGetMe(request, env);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === `${API_PREFIX}/entries`) {
      if (request.method === "GET") {
        return handleGetEntries(env);
      }
      if (request.method === "POST") {
        return handlePostEntry(request, env);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname.startsWith(API_PREFIX)) {
      return json({ error: "Not found" }, 404);
    }

    // Fall back to static assets for anything else under /glovebox/*
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
