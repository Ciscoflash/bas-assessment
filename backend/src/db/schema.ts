/**
 * Database schema. Money columns are 64-bit INTEGER kobo. The journal tables are
 * append-only: triggers reject UPDATE and DELETE, so corrections must be reversing entries.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','INCOME'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY,
  borrower_name TEXT NOT NULL,
  principal INTEGER NOT NULL CHECK (principal > 0),
  annual_rate_pct TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  instalment INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The schedule as originated. Never changes after disbursement.
CREATE TABLE IF NOT EXISTS instalments (
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  opening_balance INTEGER NOT NULL,
  payment INTEGER NOT NULL,
  due_penalty INTEGER NOT NULL DEFAULT 0,
  due_fee INTEGER NOT NULL DEFAULT 0,
  due_interest INTEGER NOT NULL,
  due_principal INTEGER NOT NULL,
  closing_balance INTEGER NOT NULL,
  PRIMARY KEY (loan_id, number)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  loan_id INTEGER REFERENCES loans(id),
  invoice_id INTEGER REFERENCES invoices(id),
  reverses_id INTEGER UNIQUE REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  account TEXT NOT NULL REFERENCES accounts(code),
  debit INTEGER NOT NULL CHECK (debit >= 0),
  credit INTEGER NOT NULL CHECK (credit >= 0),
  CHECK ((debit = 0) <> (credit = 0))
);
CREATE INDEX IF NOT EXISTS journal_lines_entry ON journal_lines(entry_id);

-- Payments and payoffs, with how each was allocated (the loan subledger).
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  kind TEXT NOT NULL CHECK (kind IN ('PAYMENT','PAYOFF')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  unapplied_credit INTEGER NOT NULL,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id)
);
CREATE TABLE IF NOT EXISTS payment_allocations (
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  loan_id INTEGER NOT NULL,
  instalment_number INTEGER NOT NULL,
  penalty INTEGER NOT NULL, fee INTEGER NOT NULL, interest INTEGER NOT NULL, principal INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payoff_waivers (
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  loan_id INTEGER NOT NULL,
  instalment_number INTEGER NOT NULL,
  penalty INTEGER NOT NULL, fee INTEGER NOT NULL, interest INTEGER NOT NULL, principal INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  client_name TEXT NOT NULL,
  debtor_name TEXT NOT NULL DEFAULT '',
  face_value INTEGER NOT NULL CHECK (face_value > 0),
  funding_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  tenor_days INTEGER NOT NULL,
  advance INTEGER NOT NULL,
  reserve INTEGER NOT NULL,
  discount_fee INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ADVANCED','SETTLED')),
  settlement_date TEXT,
  days_overdue INTEGER,
  penalty INTEGER,
  total_charges INTEGER,
  client_receives INTEGER,
  client_owes INTEGER
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key, route)
);

-- The ledger is append-only. Corrections are reversing entries.
CREATE TRIGGER IF NOT EXISTS journal_entries_no_update BEFORE UPDATE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'journal entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_entries_no_delete BEFORE DELETE ON journal_entries
BEGIN SELECT RAISE(ABORT, 'journal entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_lines_no_update BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_lines_no_delete BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal lines are immutable'); END;
`;
