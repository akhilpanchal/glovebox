CREATE TABLE charging_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                    -- YYYY-MM-DD
  odometer INTEGER NOT NULL,             -- MILES (canonical); aligns a charge to a fuel window
  kwh REAL NOT NULL,                     -- energy delivered (ChargePoint) — exact
  miles_added REAL,                      -- ChargePoint's estimated range added — electric-miles proxy
  notes TEXT,
  added_by TEXT NOT NULL,                -- from Cf-Access-Authenticated-User-Email
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_charging_date ON charging_sessions (date DESC, id DESC);
