// Read-only vehicle info for the single shared car. Config-seeded (no table):
// to change it, edit this file and deploy. Served via GET /glovebox/api/vehicle.
export const VEHICLE = {
  nickname: "", // optional; header falls back to `${year} ${make} ${model}`
  year: 2019,
  make: "Honda",
  model: "Clarity",
  trim: "PHEV Touring",
  color: "Gray",
  vin: "",
  license_plate: "8NNK865",
  purchase_date: "", // YYYY-MM-DD
};
