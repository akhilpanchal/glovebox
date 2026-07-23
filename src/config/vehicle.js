// Read-only vehicle info for the single shared car. Config-seeded (no table):
// to change it, edit this file and deploy. Served via GET /glovebox/api/vehicle.
export const VEHICLE = {
  nickname: "", // optional; header falls back to `${year} ${make} ${model}`
  year: 2019,
  make: "Honda",
  model: "Clarity",
  trim: "PHEV Touring",
  color: "Gray",
  vin: "JHMZC5F33KC005237",
  license_plate: "8NNK865",
  in_service_date: "2019-10-01", // first retail delivery (Carfax PDI, 3 mi); starts Honda warranty/bulletin clocks
  purchase_date: "2023-04-07", // YYYY-MM-DD; bought pre-owned at 27,378 mi from Lexus of Oxnard
  purchase_odometer: 27378, // miles at purchase; previous owner's records run 0–27,215 mi (see Carfax)
};
