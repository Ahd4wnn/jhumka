import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Copy, FileText } from 'lucide-react';
import { get, post, type OrderStatus } from '../api';
import { dateTime, fromPaise, inr, phone, STATUS, toPaise } from '../format';
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, StatusBadge, Tag, Textarea, useToast } from '../ui';
import { mediaUrl } from '@/lib/media';

interface Address {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
}
interface Detail {
  order: {
    id: string;
    number: string;
    status: OrderStatus;
    name: string;
    phone: string;
    email: string | null;
    shippingAddress: Address;
    customerNote: string | null;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    totalPaise: number;
    refundedPaise: number;
    couponCode: string | null;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    paymentMethod: string | null;
    paidAt: string | null;
    invoiceNo: number | null;
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    createdAt: string;
    customerLink: string;
  };
  items: { id: string; name: string; slug: string; imagePath: string | null; unitPricePaise: number; qty: number; lineTotalPaise: number }[];
  events: { id: number; type: string; message: string; createdAt: string; actor: string | null }[];
  customer: { id: string; name: string; ordersCount: number; totalSpentPaise: number; tags: string[] } | null;
  next: OrderStatus[];
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = { packed: 'Mark packed', shipped: 'Mark shipped', delivered: 'Mark delivered', paid: 'Move back to new', cancelled: 'Cancel order' };

export function OrderDetail() {
  const { number = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['orders', 'detail', number], queryFn: () => get<Detail>(`/orders/${number}`) });
  const [ship, setShip] = useState(false);
  const [refund, setRefund] = useState(false);
  const [note, setNote] = useState('');

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(`/orders/${number}/actions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(e.message),
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { order: o, items, events, customer, next } = q.data;
  const a = o.shippingAddress;
  const addressText = [a.name, a.line1, a.line2, a.landmark && `Near ${a.landmark}`, `${a.city}, ${a.state} ${a.pincode}`, a.phone].filter(Boolean).join('\n');
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`));

  const statusButton = (to: OrderStatus) => {
    if (to === 'shipped') return <Button key={to} onClick={() => setShip(true)}>{ACTION_LABEL[to]}</Button>;
    if (to === 'cancelled')
      return (
        <Button
          key={to}
          variant="outline"
          onClick={() => {
            if (confirm(`Cancel ${o.number}? Stock goes back to inventory. Refund the payment separately if needed.`)) act.mutate({ action: 'status', to });
          }}
        >
          {ACTION_LABEL[to]}
        </Button>
      );
    return (
      <Button key={to} variant={to === 'paid' ? 'ghost' : 'primary'} onClick={() => act.mutate({ action: 'status', to })} disabled={act.isPending}>
        {ACTION_LABEL[to] ?? STATUS[to].label}
      </Button>
    );
  };

  return (
    <>
      <Link to="/orders" className="caps mb-4 inline-flex items-center gap-2 !text-[0.6rem] hover:underline">
        <ArrowLeft className="size-3.5" /> Orders
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-4">
            {o.number} <StatusBadge status={o.status} />
          </span>
        }
        subtitle={`Placed ${dateTime(o.createdAt)}${o.paidAt ? ` · paid ${dateTime(o.paidAt)}` : ''}`}
        actions={
          <>
            {next.filter((s) => s !== 'cancelled').map(statusButton)}
            {o.invoiceNo && (
              <a href={`/api/admin/orders/${o.number}/invoice`} target="_blank" rel="noopener">
                <Button variant="outline">
                  <FileText className="size-4" /> Invoice
                </Button>
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-4">
          <Card title={`Pieces · ${items.reduce((n, i) => n + i.qty, 0)}`}>
            <ul className="divide-y divide-purple-100">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 py-3">
                  <div className="mesh mesh--velvet relative h-16 w-13 shrink-0 overflow-hidden">
                    {i.imagePath && !i.imagePath.startsWith('local:') && <img src={mediaUrl(i.imagePath, 480, 'webp')} alt="" className="absolute inset-0 size-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <a href={`/products/${i.slug}/`} target="_blank" rel="noopener" className="hover:underline">
                      {i.name}
                    </a>
                    <p className="text-xs">
                      {i.qty} × {inr(i.unitPricePaise)}
                    </p>
                  </div>
                  <span className="tabular-nums">{inr(i.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-y-1.5 text-sm">
              <dt>Subtotal</dt>
              <dd className="text-right tabular-nums">{inr(o.subtotalPaise)}</dd>
              {o.discountPaise > 0 && (
                <>
                  <dt>Discount {o.couponCode && <Tag>{o.couponCode}</Tag>}</dt>
                  <dd className="text-right tabular-nums">−{inr(o.discountPaise)}</dd>
                </>
              )}
              <dt>Shipping</dt>
              <dd className="text-right tabular-nums">{o.shippingPaise ? inr(o.shippingPaise) : 'Free'}</dd>
              <dt className="border-t border-purple-200 pt-2 font-medium">Total</dt>
              <dd className="border-t border-purple-200 pt-2 text-right text-lg tabular-nums">{inr(o.totalPaise)}</dd>
              {o.refundedPaise > 0 && (
                <>
                  <dt>Refunded</dt>
                  <dd className="text-right tabular-nums">−{inr(o.refundedPaise)}</dd>
                </>
              )}
            </dl>
          </Card>

          {o.customerNote && (
            <Card title="Note from the customer">
              <p className="whitespace-pre-line">{o.customerNote}</p>
            </Card>
          )}

          <Card title="Timeline">
            <ol className="grid gap-3 border-l border-purple-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[1.36rem] size-2 rounded-full bg-purple" />
                  <p>{e.message}</p>
                  <p className="text-xs opacity-75">
                    {dateTime(e.createdAt)}
                    {e.actor && ` · ${e.actor}`}
                  </p>
                </li>
              ))}
            </ol>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                act.mutate({ action: 'note', body: note }, { onSuccess: () => setNote('') });
              }}
            >
              <Input placeholder="Add an internal note" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" variant="outline">
                Add
              </Button>
            </form>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Customer">
            {customer ? (
              <Link to={`/customers/${customer.id}`} className="display text-2xl hover:underline">
                {customer.name}
              </Link>
            ) : (
              <p className="display text-2xl">{o.name}</p>
            )}
            <p className="mt-2 text-sm">
              <a href={`tel:${o.phone}`} className="hover:underline">
                {phone(o.phone)}
              </a>
              {o.email && (
                <>
                  <br />
                  <a href={`mailto:${o.email}`} className="hover:underline">
                    {o.email}
                  </a>
                </>
              )}
            </p>
            {customer && (
              <p className="mt-3 text-xs">
                {customer.ordersCount} paid {customer.ordersCount === 1 ? 'order' : 'orders'} · {inr(customer.totalSpentPaise)} lifetime
                {customer.tags.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{customer.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span>}
              </p>
            )}
          </Card>

          <Card title="Ship to" actions={<button type="button" onClick={() => copy(addressText, 'Address')} className="grid size-8 place-items-center hover:bg-purple-50" aria-label="Copy address"><Copy className="size-4" /></button>}>
            <address className="text-sm leading-relaxed whitespace-pre-line not-italic">{addressText}</address>
            {(o.courier || o.trackingNumber) && (
              <p className="mt-3 border-t border-purple-100 pt-3 text-sm">
                {o.courier} {o.trackingNumber && <strong className="font-medium">{o.trackingNumber}</strong>}
                {o.trackingUrl && (
                  <>
                    {' · '}
                    <a href={o.trackingUrl} target="_blank" rel="noopener" className="underline">
                      track
                    </a>
                  </>
                )}
              </p>
            )}
          </Card>

          <Card title="Payment">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt>Method</dt>
              <dd>{o.paymentMethod ? o.paymentMethod.toUpperCase() : o.paidAt ? 'Razorpay' : '—'}</dd>
              <dt>Payment ID</dt>
              <dd className="break-all">{o.razorpayPaymentId ?? '—'}</dd>
              <dt>Razorpay order</dt>
              <dd className="break-all">{o.razorpayOrderId ?? '—'}</dd>
              <dt>Invoice</dt>
              <dd>{o.invoiceNo ?? '—'}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {o.razorpayPaymentId && o.refundedPaise < o.totalPaise && (
                <Button variant="outline" size="sm" onClick={() => setRefund(true)}>
                  Refund
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => copy(location.origin + o.customerLink, 'Customer order link')}>
                <Copy className="size-3.5" /> Customer link
              </Button>
              {next.includes('cancelled') && statusButton('cancelled')}
            </div>
          </Card>
        </div>
      </div>

      <ShipModal open={ship} onClose={() => setShip(false)} initial={o} onSubmit={(v) => act.mutate({ action: 'status', to: 'shipped', ...v }, { onSuccess: () => setShip(false) })} busy={act.isPending} />
      <RefundModal
        open={refund}
        onClose={() => setRefund(false)}
        maxPaise={o.totalPaise - o.refundedPaise}
        busy={act.isPending}
        onSubmit={(amountPaise, reason) => act.mutate({ action: 'refund', amountPaise, reason }, { onSuccess: () => { setRefund(false); toast('Refund started with Razorpay'); } })}
      />
    </>
  );
}

function ShipModal({ open, onClose, initial, onSubmit, busy }: { open: boolean; onClose: () => void; initial: { courier: string | null; trackingNumber: string | null; trackingUrl: string | null }; onSubmit: (v: { courier: string; trackingNumber: string; trackingUrl: string | null }) => void; busy: boolean }) {
  const [courier, setCourier] = useState(initial.courier ?? '');
  const [trackingNumber, setTracking] = useState(initial.trackingNumber ?? '');
  const [trackingUrl, setUrl] = useState(initial.trackingUrl ?? '');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as shipped"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => onSubmit({ courier, trackingNumber, trackingUrl: trackingUrl || null })}>
            Mark shipped
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Courier" hint="e.g. India Post, Delhivery, DTDC">
          <Input value={courier} onChange={(e) => setCourier(e.target.value)} list="couriers" />
          <datalist id="couriers">
            {['India Post', 'Delhivery', 'DTDC', 'Blue Dart', 'Xpressbees', 'Ekart', 'Shiprocket'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Tracking number">
          <Input value={trackingNumber} onChange={(e) => setTracking(e.target.value)} />
        </Field>
        <Field label="Tracking link (optional)" hint="Shown to the customer on their order page.">
          <Input type="url" placeholder="https://" value={trackingUrl} onChange={(e) => setUrl(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RefundModal({ open, onClose, maxPaise, onSubmit, busy }: { open: boolean; onClose: () => void; maxPaise: number; onSubmit: (paise: number, reason: string) => void; busy: boolean }) {
  const [amount, setAmount] = useState(fromPaise(maxPaise));
  const [reason, setReason] = useState('');
  const paise = toPaise(amount);
  const invalid = paise == null || paise <= 0 || paise > maxPaise;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refund payment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || invalid} onClick={() => paise && onSubmit(paise, reason)}>
            Refund {paise ? inr(paise) : ''}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm">The money goes back to the customer's original payment method through Razorpay (usually 5–7 working days).</p>
        <Field label="Amount (₹)" hint={`Up to ${inr(maxPaise)}`} error={amount && invalid ? `Enter an amount up to ${inr(maxPaise)}.` : undefined}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason (internal)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
        </Field>
      </div>
    </Modal>
  );
}
