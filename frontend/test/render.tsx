import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

export function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (body: unknown, headers: Record<string, string>) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>;

/** Minimal fetch mock keyed by "METHOD /path". Records every call. */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: { key: string; body: unknown; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ key, body, headers });
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: `no mock for ${key}` }), { status: 404 });
    const { status, json } = await h(body, headers);
    return new Response(JSON.stringify(json), { status });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
