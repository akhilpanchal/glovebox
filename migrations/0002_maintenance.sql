CREATE TABLE maintenance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                        -- YYYY-MM-DD, service date
  odometer INTEGER NOT NULL,                 -- MILES (canonical), like fuel_entries
  shop_name TEXT,                            -- where serviced
  total_cost REAL,                           -- grand total on the statement (nullable)
  categories TEXT NOT NULL DEFAULT '[]',     -- JSON array of tag strings
  line_items TEXT NOT NULL DEFAULT '[]',     -- JSON array of {description, cost}
  invoice_number TEXT,                       -- RO / invoice number, nullable
  document_urls TEXT NOT NULL DEFAULT '[]',  -- JSON array of {url, label}
  notes TEXT,
  added_by TEXT NOT NULL,                    -- from Cf-Access-Authenticated-User-Email
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT                            -- set on edit
);

CREATE INDEX idx_maintenance_date ON maintenance_entries (date DESC, id DESC);
