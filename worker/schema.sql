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
-- the project page as its owner has written it; when a project has none here, its file applies
CREATE TABLE IF NOT EXISTS project_pages (
  project TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  body TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  at TEXT NOT NULL
);
-- privacy-friendly page counts: no cookies, no IP addresses. A visitor is a hash of the day's secret,
-- the address and the browser, kept for two days only to count distinct visitors per day.
CREATE TABLE IF NOT EXISTS stat_days (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS stat_seen (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h));
CREATE TABLE IF NOT EXISTS stat_pages (day TEXT NOT NULL, page TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page));
CREATE TABLE IF NOT EXISTS stat_refs (day TEXT NOT NULL, host TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, host));
CREATE TABLE IF NOT EXISTS stat_countries (day TEXT NOT NULL, cc TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, cc));
-- the forecast service's editions, one row per edition day: what everyone may read and what holders may
CREATE TABLE IF NOT EXISTS editions (
  day TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL,
  title TEXT NOT NULL,
  public_json TEXT NOT NULL,
  holder_json TEXT,
  stored_at TEXT NOT NULL
);
-- Project Red Ripple: the core group's logbook (roles, squads, drops, weekly reviews, settings), and who may use it
CREATE TABLE IF NOT EXISTS ripple (
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  user TEXT NOT NULL,
  handle TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (coll, id)
);
CREATE TABLE IF NOT EXISTS ripple_crew (handle TEXT PRIMARY KEY, at TEXT NOT NULL);
-- the Red Ripple Telegram bot (ripple_bot.js): settings, people, daily counts, recent message text (kept a week), posts on X
CREATE TABLE IF NOT EXISTS tg_cfg (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tg_people (
  tg_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  x_id TEXT,
  x_handle TEXT,
  linked_at TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tg_daily (day TEXT NOT NULL, chat TEXT NOT NULL, tg_id TEXT NOT NULL, msgs INTEGER NOT NULL DEFAULT 0, links INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, chat, tg_id));
CREATE TABLE IF NOT EXISTS tg_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, tg_id TEXT NOT NULL, at TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS x_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT,
  handle TEXT,
  created_at TEXT,
  text TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'post',
  source TEXT NOT NULL,
  shared_by TEXT,
  found_at TEXT NOT NULL,
  metrics TEXT,
  measured_at TEXT,
  impact REAL
);
CREATE INDEX IF NOT EXISTS x_posts_created ON x_posts (created_at);
CREATE INDEX IF NOT EXISTS tg_msgs_at ON tg_msgs (at);
