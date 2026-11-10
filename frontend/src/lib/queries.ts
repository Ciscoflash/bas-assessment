import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { loanSummaryWire, loanViewWire, paymentViewWire, statementWire } from '../money';
import { api } from './api';

// Every key starts with 'loans', so invalidating ['loans'] after a post refreshes all of them.

export const useLoans = () =>
  useQuery({ queryKey: ['loans', 'list'], queryFn: () => api('GET', '/loans', { schema: z.array(loanSummaryWire) }) });

export const useLoan = (id: number) =>
  useQuery({ queryKey: ['loans', id], queryFn: () => api('GET', `/loans/${id}`, { schema: loanViewWire }) });

export const useStatement = (id: number) =>
  useQuery({ queryKey: ['loans', id, 'statement'], queryFn: () => api('GET', `/loans/${id}/statement`, { schema: statementWire }) });

/** Payment history for one loan, or for all loans when `loanId` is omitted. */
export const usePayments = (loanId?: number) =>
  useQuery({
    queryKey: loanId === undefined ? ['loans', 'payments'] : ['loans', loanId, 'payments'],
    queryFn: () => api('GET', loanId === undefined ? '/payments' : `/loans/${loanId}/payments`, { schema: z.array(paymentViewWire) }),
  });
