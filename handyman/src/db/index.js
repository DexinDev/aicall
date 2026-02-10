const Database = require('better-sqlite3');
const { DATABASE_PATH } = require('../config');

const db = new Database(DATABASE_PATH);

db.pragma('journal_mode = WAL');

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    service_date TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_session_id TEXT,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`
).run();

module.exports = db;

