import type { DB } from '../db/connection.js';
import { createTx } from '../db/transaction.js';
import { stringify } from '../http/json.js';
import { createIdempotencyRepository } from '../repositories/idempotency.repository.js';
import { createInvoiceRepository } from '../repositories/invoice.repository.js';
import { createLedgerRepository } from '../repositories/ledger.repository.js';
import { createLoanRepository } from '../repositories/loan.repository.js';
import { createPaymentRepository } from '../repositories/payment.repository.js';
import { createIdempotencyService } from './idempotency.service.js';
import { createInvoiceService } from './invoice.service.js';
import { createLedgerService } from './ledger.service.js';
import { createLoanService } from './loan.service.js';
import { createRepaymentService } from './repayment.service.js';
import { createStatementService } from './statement.service.js';

/** Composition root: wire repositories into services. The only place that knows every dependency. */
export function createServices(db: DB) {
  const tx = createTx(db);

  const ledger = createLedgerService({ ledgerRepo: createLedgerRepository(db), tx });
  const paymentRepo = createPaymentRepository(db);
  const loans = createLoanService({ loanRepo: createLoanRepository(db), paymentRepo, ledger, tx });

  return {
    ledger,
    loans,
    repayments: createRepaymentService({ loans, paymentRepo, ledger, tx }),
    statements: createStatementService({ loans, ledger }),
    invoices: createInvoiceService({ invoiceRepo: createInvoiceRepository(db), ledger, tx }),
    idempotency: createIdempotencyService({ repo: createIdempotencyRepository(db), tx, serialize: stringify }),
  };
}

export type Services = ReturnType<typeof createServices>;
