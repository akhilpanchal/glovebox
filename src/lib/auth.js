// Identity always comes from the Cloudflare Access header in production. Local
// dev has no Access, so fall back to LOCAL_DEV_EMAIL from .dev.vars. If neither
// is present, return null and let the caller respond 401 — never silently
// default to a hardcoded email, because this same path runs in production and a
// silent default would mask a misconfigured Access application.
export function authedEmail(request, env) {
  return (
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    (env.LOCAL_DEV_EMAIL ? env.LOCAL_DEV_EMAIL : null)
  );
}
