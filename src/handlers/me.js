import { json } from "../lib/responses.js";
import { authedEmail } from "../lib/auth.js";

export async function getMe(request, env) {
  const email = authedEmail(request, env);
  if (!email) return json({ error: "Unauthorized" }, 401);
  return json({ email });
}
