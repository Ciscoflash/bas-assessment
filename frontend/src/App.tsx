import { BookOpen, FileText, HandCoins, Landmark } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { InvoiceDetailPage, InvoiceQuotePage, InvoicesPage } from './pages/Invoices';
import { LedgerPage } from './pages/Ledger';
import { LoanDetailPage } from './pages/LoanDetail';
import { LoansPage } from './pages/Loans';
import { RepaymentsPage } from './pages/Repayments';
import { OriginatePage } from './pages/Originate';
import { StatementPage } from './pages/Statement';

const nav = [
  { to: '/loans', label: 'Term loans', icon: Landmark },
  { to: '/repayments', label: 'Repayments', icon: HandCoins },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/ledger', label: 'Ledger', icon: BookOpen },
];

export function App() {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
          <span className="text-sm font-bold tracking-tight">
            BAS Lending <span className="font-normal text-muted">· Loan desk</span>
          </span>
          <nav aria-label="Main" className="flex gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${isActive ? 'bg-canvas font-semibold text-ink' : 'text-muted hover:text-ink'}`
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted">All amounts NGN · integer kobo end to end</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/loans" replace />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/loans/new" element={<OriginatePage />} />
          <Route path="/loans/:id" element={<LoanDetailPage />} />
          <Route path="/loans/:id/statement" element={<StatementPage />} />
          <Route path="/repayments" element={<RepaymentsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<InvoiceQuotePage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
        </Routes>
      </main>
    </div>
  );
}
