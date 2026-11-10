import { ACCOUNTS, journalEntryWire, koboWire, type AccountCode } from '../money';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { JournalLines } from '../components/finance';
import { Badge, Card, Money, Table, Td, Th } from '../components/ui';
import { api } from '../lib/api';
import { prettyDate } from '../lib/dates';

const tbWire = z.object({
  accounts: z.array(z.object({ account: z.string(), name: z.string(), type: z.string(), debit: koboWire, credit: koboWire })),
  totalDebit: koboWire,
  totalCredit: koboWire,
  balanced: z.boolean(),
});

export function LedgerPage() {
  const tb = useQuery({ queryKey: ['ledger', 'tb'], queryFn: () => api('GET', '/ledger/trial-balance', { schema: tbWire }) });
  const journal = useQuery({ queryKey: ['ledger', 'journal'], queryFn: () => api('GET', '/ledger/journal', { schema: z.array(journalEntryWire) }) });

  return (
    <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
      <Card title="Trial balance" actions={tb.data && <Badge tone={tb.data.balanced ? 'good' : 'bad'}>{tb.data.balanced ? 'Balanced' : 'Out of balance'}</Badge>}>
        {tb.data && (
          <Table>
            <thead>
              <tr><Th>Account</Th><Th right>Debit</Th><Th right>Credit</Th></tr>
            </thead>
            <tbody>
              {tb.data.accounts.map((a) => {
                const net = a.debit - a.credit;
                return (
                  <tr key={a.account}>
                    <Td>{ACCOUNTS[a.account as AccountCode]?.name ?? a.name} <span className="text-[11px] text-muted">{a.type.toLowerCase()}</span></Td>
                    <Td right>{net > 0n ? <Money value={net} /> : null}</Td>
                    <Td right>{net < 0n ? <Money value={-net} /> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold"><Td>Total postings</Td><Td right><Money value={tb.data.totalDebit} /></Td><Td right><Money value={tb.data.totalCredit} /></Td></tr>
            </tfoot>
          </Table>
        )}
      </Card>
      <Card title="Journal (newest first)">
        <div className="flex flex-col gap-6">
          {journal.data?.length === 0 && <p className="text-sm text-muted">Nothing posted yet.</p>}
          {journal.data?.map((e) => (
            <JournalLines key={e.id} lines={e.lines} caption={`#${e.id} · ${e.eventType.replace('_', ' ').toLowerCase()} · ${prettyDate(e.effectiveDate)} · ${e.memo}`} />
          ))}
        </div>
      </Card>
    </div>
  );
}
