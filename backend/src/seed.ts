/**
 * Demo data: open loans with instalments already due, so repayment can be tried straight away.
 *
 *   npm run seed            add demo data (skipped if loans already exist)
 *   npm run seed -- --reset delete the database first (stop the dev server before resetting)
 *
 * Everything goes through the services, so the ledger is posted exactly as the app would.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import { openDb } from './db/connection.js';
import { today } from './lib/clock.js';
import { addDays, addMonths } from './money/index.js';
import { createServices } from './services/index.js';

const reset = process.argv.includes('--reset');
if (config.dbPath === ':memory:') throw new Error('DB_PATH is :memory:, so there is nothing to seed');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
  console.log(`Deleted ${config.dbPath}`);
}
if (!existsSync(dirname(config.dbPath))) mkdirSync(dirname(config.dbPath), { recursive: true });

const db = openDb(config.dbPath);
const s = createServices(db);

if (s.loans.list().length > 0) {
  console.log('Loans already exist; nothing added. Use `npm run seed -- --reset` to start fresh.');
  process.exit(0);
}

const now = today();

// Worked Example 1, disbursed 3 months ago: instalment 1 paid on time, 2 and 3 now overdue.
const ada = s.loans.originate({ borrowerName: 'Ada Okafor', principal: '120000000', annualRatePct: '18', termMonths: 6, startDate: addMonths(now, -3) });
const first = s.loans.view(ada.loanId, now).schedule.rows[0]!;
s.repayments.postPayment(ada.loanId, first.payment, first.dueDate);

// A fresh 12-month loan, disbursed last month: instalment 1 falls due today.
s.loans.originate({ borrowerName: 'Chinedu Bello', principal: '50000000', annualRatePct: '24', termMonths: 12, startDate: addMonths(now, -1) });

// An invoice funded 40 days ago, due in 20 days.
s.invoices.advance({ clientName: 'Acme Ltd', debtorName: 'Big Retail Plc', faceValue: '100000000', fundingDate: addDays(now, -40), dueDate: addDays(now, 20) });

console.log(`Seeded ${config.dbPath}: 2 active loans (one with overdue instalments), 1 invoice, 1 repayment.`);
console.log(`Trial balance level: ${s.ledger.trialBalance().balanced}`);
db.close();
