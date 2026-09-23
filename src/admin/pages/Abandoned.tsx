import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Copy, Phone } from 'lucide-react';
import { get, post } from '../api';
import { ago, inr, phone } from '../format';
import { Button, cx, Empty, ErrorBox, Loading, PageHeader, useToast } from '../ui';

interface Checkout {
  id: string;
  number: string;
  status: 'pending_payment' | 'payment_failed';
  name: string;
  phone: string;
  email: string | null;
  totalPaise: number;
  createdAt: string;
  contactedAt: string | null;
  items: string | null;
  recovered: boolean;
  recoveryLink: string;
}

export function Abandoned() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['abandoned'], queryFn: () => get<{ checkouts: Checkout[] }>('/abandoned') });
  const contacted = useMutation({
    mutationFn: (number: string) => post(`/orders/${number}/actions`, { action: 'contacted' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['abandoned'] }),
  });

  const open = q.data?.checkouts.filter((c) => !c.recovered) ?? [];
  const value = open.reduce((s, c) => s + c.totalPaise, 0);

  return (
    <>
      <PageHeader
        title="Abandoned checkouts"
        subtitle={q.data ? `${open.length} unfinished · ${inr(value)} waiting` : 'People who entered their details but did not complete payment.'}
      />
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !q.data?.checkouts.length ? (
        <Empty title="Nothing abandoned">When someone starts checkout but doesn't pay, they show up here after 30 minutes so you can follow up.</Empty>
      ) : (
        <div className="grid gap-2">
          {q.data.checkouts.map((c) => (
            <article key={c.id} className={cx('grid gap-3 border p-4 md:grid-cols-[1.2fr_1.5fr_auto] md:items-center', c.recovered ? 'border-dashed border-purple-200 opacity-70' : 'border-purple-100')}>
              <div>
                <p className="font-medium">
                  {c.name} <span className="text-xs font-normal">· {ago(c.createdAt)}</span>
                </p>
                <p className="text-sm">
                  <a href={`tel:${c.phone}`} className="hover:underline">
                    {phone(c.phone)}
                  </a>
                  {c.email && ` · ${c.email}`}
                </p>
                <p className="mt-1 text-xs">
                  {c.recovered ? 'Recovered — they paid for a later order' : c.status === 'payment_failed' ? 'Payment failed' : 'Did not pay'}
                  {c.contactedAt && ` · contacted ${ago(c.contactedAt)}`}
                </p>
              </div>
              <div className="text-sm">
                <p>{c.items}</p>
                <p className="mt-1 tabular-nums">
                  <strong className="font-medium">{inr(c.totalPaise)}</strong> ·{' '}
                  <Link to={`/orders/${c.number}`} className="underline underline-offset-2">
                    {c.number}
                  </Link>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(c.recoveryLink).then(() => toast('Payment link copied — send it to the customer'))}
                >
                  <Copy className="size-3.5" /> Payment link
                </Button>
                <a href={`tel:${c.phone}`}>
                  <Button variant="outline" size="sm">
                    <Phone className="size-3.5" /> Call
                  </Button>
                </a>
                {!c.contactedAt && !c.recovered && (
                  <Button size="sm" onClick={() => contacted.mutate(c.number)}>
                    Mark contacted
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
