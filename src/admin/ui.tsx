/** Admin UI kit — the storefront's purple/white system, laid out densely for daily work. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import type { OrderStatus } from './api';
import { STATUS } from './format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[2.75rem] leading-none sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost'; size?: 'sm' | 'md' };
export function Button({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 border text-[0.7rem] font-medium tracking-[0.16em] uppercase transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-9 px-3' : 'h-11 px-5',
        variant === 'primary' && 'border-purple bg-purple text-white hover:border-purple-700 hover:bg-purple-700',
        variant === 'outline' && 'border-purple-200 bg-white text-purple hover:border-purple',
        variant === 'ghost' && 'border-transparent bg-transparent text-purple hover:bg-purple-50',
        className,
      )}
    />
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="caps !text-[0.62rem]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-xs font-medium">⚠ {error}</span> : hint ? <span className="mt-1 block text-xs opacity-80">{hint}</span> : null}
    </label>
  );
}

const control = 'w-full border border-purple-200 bg-white px-3 text-sm text-purple placeholder:text-purple/45 focus:border-purple focus:outline-none aria-[invalid=true]:border-purple aria-[invalid=true]:bg-purple-25';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(control, 'h-11', className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(control, 'min-h-28 py-2.5', className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(control, 'h-11', className)} />;

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-3 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full border transition-colors', checked ? 'border-purple bg-purple' : 'border-purple-200 bg-white')}
      >
        <span className={cx('absolute top-0.5 size-4.5 rounded-full transition-all', checked ? 'left-[1.4rem] bg-white' : 'left-0.5 bg-purple-300')} />
      </button>
      {label}
    </label>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center px-2 text-[0.62rem] font-medium tracking-[0.12em] whitespace-nowrap uppercase',
        s.tone === 'solid' && 'bg-purple text-white',
        s.tone === 'soft' && 'bg-purple-100 text-purple',
        s.tone === 'outline' && 'border border-purple-200 text-purple',
        s.tone === 'muted' && 'border border-dashed border-purple-200 text-purple/80',
      )}
    >
      {s.label}
    </span>
  );
}

export const Tag = ({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) => (
  <span className="inline-flex h-6 items-center gap-1 bg-purple-50 px-2 text-xs">
    {children}
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label="Remove tag" className="opacity-60 hover:opacity-100">
        <X className="size-3" />
      </button>
    )}
  </span>
);

export const Card = ({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) => (
  <section className={cx('border border-purple-100 bg-white p-5', className)}>
    {(title || actions) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        {title && <h2 className="caps !text-[0.66rem]">{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="border border-purple-100 bg-white p-5">
    <p className="caps !text-[0.62rem]">{label}</p>
    <p className="mt-3 text-3xl tabular-nums">{value}</p>
    {sub && <p className="mt-1 text-xs">{sub}</p>}
  </div>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="grid place-items-center gap-3 border border-dashed border-purple-200 px-6 py-16 text-center">
    <p className="display text-3xl">{title}</p>
    {children && <div className="max-w-md text-sm">{children}</div>}
  </div>
);

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <p className="caps py-10 text-center opacity-70">{label}</p>;

export const ErrorBox = ({ error }: { error: unknown }) =>
  error ? <p className="border border-purple-200 bg-purple-25 px-4 py-3 text-sm" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null;

export const th = 'caps !text-[0.6rem] py-3 pr-4 text-left font-medium whitespace-nowrap';
export const td = 'py-3 pr-4 align-middle';

/* ───────── Modal ───────── */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-auto w-[calc(100vw-2rem)] border border-purple-100 bg-white p-0 text-purple backdrop:bg-purple/40', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      <div className="flex items-center justify-between border-b border-purple-100 px-6 py-4">
        <h2 className="display text-3xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center hover:bg-purple-50">
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-purple-100 px-6 py-4">{footer}</div>}
    </dialog>
  );
}

/* ───────── Toasts ───────── */
interface ToastItem {
  id: number;
  text: string;
  href?: string;
}
const ToastCtx = createContext<(text: string, href?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, href?: string) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, href }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), href ? 9000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-[60] grid w-[min(24rem,calc(100vw-2rem))] gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 bg-purple px-4 py-3 text-sm text-white shadow-lg">
            <span>{t.text}</span>
            {t.href && (
              <a href={t.href} className="caps !text-[0.6rem] underline underline-offset-4">
                Open
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
