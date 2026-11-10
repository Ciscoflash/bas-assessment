import Database from 'better-sqlite3';
import { ACCOUNTS } from '../money/index.js';
import { SCHEMA } from './schema.js';

export type DB = Database.Database;

/**
 * Open (or create) the database. Integers come back as BigInt (defaultSafeIntegers),
 * so kobo never passes through a JS float.
 */
export function openDb(path = ':memory:'): DB {
  const db = new Database(path);
  db.defaultSafeIntegers(true);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seedAccounts(db);
  return db;
}

function seedAccounts(db: DB) {
  const insert = db.prepare('INSERT OR IGNORE INTO accounts (code, name, type) VALUES (?, ?, ?)');
  for (const [code, a] of Object.entries(ACCOUNTS)) insert.run(code, a.name, a.type);
}
