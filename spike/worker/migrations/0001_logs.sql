-- スパイク用: ログを1リクエスト1行、value を JSON 文字列で持つ
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  value TEXT NOT NULL
);
CREATE INDEX logs_ts ON logs (ts);
