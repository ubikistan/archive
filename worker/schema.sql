CREATE TABLE IF NOT EXISTS votes (
  page TEXT NOT NULL,
  user TEXT NOT NULL,
  value INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (page, user)
);
CREATE TABLE IF NOT EXISTS remarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  body TEXT NOT NULL,
  at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS remarks_page ON remarks (page);
-- who signed up for which role on which project
CREATE TABLE IF NOT EXISTS crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  role TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  UNIQUE (project, role, user)
);
CREATE INDEX IF NOT EXISTS crew_project ON crew (project);
-- the desk's log: who signed in and what they did, kept for a year, read only by the State Archive
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS log_at ON log (at);
