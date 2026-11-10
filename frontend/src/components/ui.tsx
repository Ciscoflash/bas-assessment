import { formatKobo, formatNaira, type Kobo } from '../money';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Money is always displayed from bigint kobo. `kobo` adds the raw kobo underneath for auditability. */
export function Money({ value, kobo = false, className }: { value: Kobo; kobo?: boolean; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', className)} title={`${formatKobo(value)} kobo`}>
      {formatNaira(value)}
      {kobo && <span className="block text-[11px] text-muted">{formatKobo(value)} kobo</span>}
    </span>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-brand-ink hover:bg-brand/90',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-canvas',
        variant === 'danger' && 'bg-bad text-white hover:bg-bad/90',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  prefix,
  suffix,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: ReactNode; prefix?: string; suffix?: string }) {
  const id = `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div
        className={cx(
          'flex min-h-[40px] items-center rounded-md border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-brand',
          error ? 'border-bad' : 'border-line',
        )}
      >
        {prefix && <span className="pl-3 text-sm text-muted">{prefix}</span>}
        <input
          id={id}
          name={name}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className="w-full min-w-0 bg-transparent px-3 py-2 text-sm outline-none"
          {...input}
        />
        {suffix && <span className="pr-3 text-sm text-muted">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'good' && 'border-good/30 bg-good/10 text-good',
        tone === 'bad' && 'border-bad/30 bg-bad/10 text-bad',
        tone === 'warn' && 'border-warn/30 bg-warn/10 text-warn',
        tone === 'info' && 'border-line bg-canvas text-muted',
      )}
    >
      {children}
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-base font-semibold">{children}</span>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'neutral'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'good' && 'bg-good/10 text-good',
        tone === 'bad' && 'bg-bad/10 text-bad',
        tone === 'warn' && 'bg-warn/10 text-warn',
        tone === 'neutral' && 'bg-canvas text-muted',
      )}
    >
      {children}
    </span>
  );
}

export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th scope="col" className={cx('whitespace-nowrap px-3 py-2 text-xs font-medium text-muted', right ? 'text-right' : 'text-left')}>
    {children}
  </th>
);
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cx('whitespace-nowrap px-3 py-2', right && 'text-right', className)}>{children}</td>
);

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr:hover]:bg-canvas/60 [&_tfoot_tr]:border-t-2 [&_tfoot_tr]:border-line">
        {children}
      </table>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  return message ? <Banner tone="bad">{message}</Banner> : null;
}
