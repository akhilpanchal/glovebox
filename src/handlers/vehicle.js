import { json } from "../lib/responses.js";
import { VEHICLE } from "../config/vehicle.js";

// Vehicle info is static config — no DB, no auth needed beyond the Access gate
// that already fronts /glovebox*.
export function getVehicle() {
  return json(VEHICLE);
}
