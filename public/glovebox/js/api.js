// Thin fetch wrappers around the Glovebox API. The frontend is a pure API
// client (see docs/v2-plan.md §2) — every server call goes through here.
const BASE = "/glovebox/api";

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch (_) {
      /* non-JSON error body — keep the default message */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

const jsonBody = (method, body) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Fuel
export const getEntries = () => req("/entries");
export const postEntry = (body) => req("/entries", jsonBody("POST", body));

// Account
export const getMe = () => req("/me");

// Maintenance (used from Phase C on)
export const getMaintenance = () => req("/maintenance");
export const createMaintenance = (body) => req("/maintenance", jsonBody("POST", body));
export const updateMaintenance = (id, body) => req(`/maintenance/${id}`, jsonBody("PUT", body));
export const deleteMaintenance = (id) => req(`/maintenance/${id}`, { method: "DELETE" });

// Insurance (used from Phase D on)
export const getInsurance = () => req("/insurance");
export const putInsurance = (body) => req("/insurance", jsonBody("PUT", body));

// Vehicle (used from Phase B on)
export const getVehicle = () => req("/vehicle");

// Charging (v2.1)
export const getCharging = () => req("/charging");
export const createCharging = (body) => req("/charging", jsonBody("POST", body));
export const deleteCharging = (id) => req(`/charging/${id}`, { method: "DELETE" });
