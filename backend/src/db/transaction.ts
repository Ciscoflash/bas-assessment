import type { DB } from './connection.js';

/** Runs `fn` atomically. Nested calls become savepoints, so services can compose. */
export type Tx = <T>(fn: () => T) => T;

export const createTx =
  (db: DB): Tx =>
  (fn) =>
    db.transaction(fn).immediate();
