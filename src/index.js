import { json } from "./lib/responses.js";
import {
  getEntries,
  postEntry,
  updateEntry,
  deleteEntry,
} from "./handlers/entries.js";
import { getMe } from "./handlers/me.js";
import { getVehicle } from "./handlers/vehicle.js";
import {
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
} from "./handlers/maintenance.js";
import { getInsurance, putInsurance } from "./handlers/insurance.js";
import {
  getCharging,
  createCharging,
  updateCharging,
  deleteCharging,
} from "./handlers/charging.js";

const API_PREFIX = "/glovebox/api";

// The Worker owns the API only (see docs/v2-plan.md §2). Everything else falls
// through to Workers Static Assets. `index.js` is routing/dispatch only —
// business logic lives in handlers/, shared concerns in lib/.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith(API_PREFIX)) {
      const route = pathname.slice(API_PREFIX.length); // e.g. "/entries"
      const { method } = request;

      if (route === "/me") {
        if (method === "GET") return getMe(request, env);
        return json({ error: "Method not allowed" }, 405);
      }

      if (route === "/entries") {
        if (method === "GET") return getEntries(env);
        if (method === "POST") return postEntry(request, env);
        return json({ error: "Method not allowed" }, 405);
      }

      const entryItem = route.match(/^\/entries\/(\d+)$/);
      if (entryItem) {
        const id = Number(entryItem[1]);
        if (method === "PUT") return updateEntry(request, env, id);
        if (method === "DELETE") return deleteEntry(request, env, id);
        return json({ error: "Method not allowed" }, 405);
      }

      if (route === "/vehicle") {
        if (method === "GET") return getVehicle();
        return json({ error: "Method not allowed" }, 405);
      }

      if (route === "/maintenance") {
        if (method === "GET") return getMaintenance(env);
        if (method === "POST") return createMaintenance(request, env);
        return json({ error: "Method not allowed" }, 405);
      }

      const maintenanceItem = route.match(/^\/maintenance\/(\d+)$/);
      if (maintenanceItem) {
        const id = Number(maintenanceItem[1]);
        if (method === "PUT") return updateMaintenance(request, env, id);
        if (method === "DELETE") return deleteMaintenance(request, env, id);
        return json({ error: "Method not allowed" }, 405);
      }

      if (route === "/insurance") {
        if (method === "GET") return getInsurance(env);
        if (method === "PUT") return putInsurance(request, env);
        return json({ error: "Method not allowed" }, 405);
      }

      if (route === "/charging") {
        if (method === "GET") return getCharging(env);
        if (method === "POST") return createCharging(request, env);
        return json({ error: "Method not allowed" }, 405);
      }

      const chargingItem = route.match(/^\/charging\/(\d+)$/);
      if (chargingItem) {
        const id = Number(chargingItem[1]);
        if (method === "PUT") return updateCharging(request, env, id);
        if (method === "DELETE") return deleteCharging(request, env, id);
        return json({ error: "Method not allowed" }, 405);
      }

      return json({ error: "Not found" }, 404);
    }

    // Fall back to static assets for anything else under /glovebox/*
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
