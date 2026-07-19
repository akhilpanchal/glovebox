CREATE TABLE insurance (
  id INTEGER PRIMARY KEY CHECK (id = 1),       -- singleton: one current policy
  insurer_name TEXT,
  policy_number TEXT,
  expiry_date TEXT,                             -- YYYY-MM-DD
  policy_pdf_url TEXT,
  emergency_phones TEXT NOT NULL DEFAULT '[]',  -- JSON array of {label, number}
  updated_by TEXT,                             -- from Cf-Access-Authenticated-User-Email
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
