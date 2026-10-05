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
-- sign-ups, version 2: people, or agents run by a signed-in person (migrates and replaces crew)
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  role TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'person',
  agent TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  UNIQUE (project, role, user, agent)
);
CREATE INDEX IF NOT EXISTS signups_project ON signups (project);
INSERT OR IGNORE INTO signups (project, role, user, handle, provider, kind, agent, link, note, at)
  SELECT project, role, user, handle, provider, 'person', '', '', note, at FROM crew;
DROP TABLE IF EXISTS crew;
-- each project's owner, chosen by the State Archive from its members
CREATE TABLE IF NOT EXISTS project_owners (
  project TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  at TEXT NOT NULL
);
-- roles as the owner has defined them; when a project has none here, its file's roles apply
CREATE TABLE IF NOT EXISTS project_roles (
  project TEXT NOT NULL,
  id TEXT NOT NULL,
  pos INTEGER NOT NULL,
  name TEXT NOT NULL,
  can TEXT NOT NULL,
  wanted INTEGER,
  who TEXT NOT NULL DEFAULT 'anyone',
  PRIMARY KEY (project, id)
);
