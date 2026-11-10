/** Chart of accounts, for labelling journal lines the server sends. */
export const ACCOUNTS = {
  CASH: { name: 'Cash', type: 'ASSET' },
  LOANS_RECEIVABLE: { name: 'Loans Receivable', type: 'ASSET' },
  INVOICE_RECEIVABLES: { name: 'Invoice Receivables', type: 'ASSET' },
  CLIENT_RECEIVABLE: { name: 'Client Receivable', type: 'ASSET' },
  INTEREST_INCOME: { name: 'Interest Income', type: 'INCOME' },
  FEE_INCOME: { name: 'Fee Income', type: 'INCOME' },
  PENALTY_INCOME: { name: 'Penalty Income', type: 'INCOME' },
  CLIENT_PAYABLE: { name: 'Client Payable', type: 'LIABILITY' },
  UNAPPLIED_CREDIT: { name: 'Unapplied Credit', type: 'LIABILITY' },
} as const;
export type AccountCode = keyof typeof ACCOUNTS;
