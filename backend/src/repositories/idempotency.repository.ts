import type { DB } from '../db/connection.js';
import { toNum } from '../db/mappers.js';

export interface IdempotencyRecord {
  key: string;
  scope: string;
  requestHash: string;
  statusCode: number;
  responseJson: string;
}

export function createIdempotencyRepository(db: DB) {
  const stmt = {
    find: db.prepare('SELECT request_hash, status_code, response FROM idempotency_keys WHERE key = ? AND route = ?'),
    insert: db.prepare(
      'INSERT INTO idempotency_keys (key, route, request_hash, status_code, response) VALUES (@key, @scope, @requestHash, @statusCode, @responseJson)',
    ),
  };

  return {
    find(key: string, scope: string): IdempotencyRecord | undefined {
      const row = stmt.find.get(key, scope) as { request_hash: string; status_code: bigint; response: string } | undefined;
      return row && { key, scope, requestHash: row.request_hash, statusCode: toNum(row.status_code), responseJson: row.response };
    },
    insert: (record: IdempotencyRecord) => void stmt.insert.run(record),
  };
}

export type IdempotencyRepository = ReturnType<typeof createIdempotencyRepository>;
