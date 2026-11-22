-- One row per request. value holds the whole record as JSON (same shape as the former Deno KV logs).
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  value TEXT NOT NULL
);
CREATE INDEX logs_ts ON logs (ts);
