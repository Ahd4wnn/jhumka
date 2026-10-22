import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Download, LayoutList, Columns3, MessageCircle, Truck } from 'lucide-react';
import { get, post, type OrderRow, type OrderStatus } from '../api';
import { ago, inr, phone, STATUS } from '../format';
import { Button, cx, Empty, ErrorBox, Input, Loading, PageHeader, StatusBadge, td, th, useToast } from '../ui';
import { ShipModal } from './OrderDetail';

interface List {
  orders: OrderRow[];
  page: number;
  pages: number;
  total: number;
  counts: Partial<Record<OrderStatus, number>>;
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'open', label: 'To do' },
  { key: 'paid', label: 'New' },
  { key: 'packed', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'all', label: 'All' },
];
const BOARD: OrderStatus[] = ['paid', 'packed', 'shipped', 'delivered'];

export function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('jh:orders-view') as 'list' | 'board') ?? 'list');

  const qs = new URLSearchParams({ status: view === 'board' ? 'all' : status, page: String(page), ...(params.get('q') ? { q: params.get('q')! } : {}) });
  const list = useQuery({ queryKey: ['orders', qs.toString()], queryFn: () => get<List>(`/orders?${qs}`), placeholderData: keepPreviousData, refetchInterval: 30_000 });
  const qc = useQueryClient();
  const toast = useToast();
  const [shipping, setShipping] = useState<OrderRow | null>(null);
  const ship = useMutation({
    mutationFn: (body: Record<string, unknown>) => post(`/orders/${shipping!.number}/actions`, { action: 'status', to: 'shipped', ...body }),
    onSuccess: () => {
      setShipping(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(e.message),
  });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v == null || v === '' ? next.delete(k) : next.set(k, v);
    setParams(next);
  };
  const setViewMode = (v: 'list' | 'board') => {
    setView(v);
    localStorage.setItem('jh:orders-view', v);
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={list.data ? `${list.data.total} ${status === 'open' ? 'orders to handle' : 'orders'}` : undefined}
        actions={
          <>
            <div className="flex border border-purple-200">
              <button type="button" onClick={() => setViewMode('list')} className={cx('grid size-10 place-items-center', view === 'list' && 'bg-purple text-white')} aria-label="List view">
                <LayoutList className="size-4" />
              </button>
              <button type="button" onClick={() => setViewMode('board')} className={cx('grid size-10 place-items-center', view === 'board' && 'bg-purple text-white')} aria-label="Board view">
                <Columns3 className="size-4" />
              </button>
            </div>
            <a href="/api/admin/export/orders.csv">
              <Button variant="outline" size="sm">
                <Download className="size-4" /> CSV
              </Button>
            </a>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {view === 'list' && (
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => set({ status: f.key, page: null })}
                className={cx('h-9 border px-3 text-sm', status === f.key ? 'border-purple bg-purple text-white' : 'border-purple-200 hover:border-purple')}
              >
                {f.label}
                {f.key !== 'open' && f.key !== 'all' && list.data?.counts[f.key as OrderStatus] ? <span className="ml-1.5 opacity-75">{list.data.counts[f.key as OrderStatus]}</span> : null}
              </button>
            ))}
          </div>
        )}
        <form
          className="ml-auto w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q, page: null });
          }}
        >
          <Input type="search" placeholder="Search number, name, phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </form>
      </div>

      <ErrorBox error={list.error} />
      {list.isPending ? (
        <Loading />
      ) : !list.data?.orders.length ? (
        <Empty title="No orders here">Paid orders appear here the moment Razorpay confirms them.</Empty>
      ) : view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((s) => {
            const col = list.data!.orders.filter((o) => o.status === s);
            return (
              <section key={s} className="border border-purple-100 bg-purple-25 p-3">
                <h2 className="caps mb-3 flex justify-between !text-[0.6rem]">
                  {STATUS[s].label} <span>{col.length}</span>
                </h2>
                <div className="grid gap-2">
                  {col.map((o) => (
                    <Link key={o.id} to={`/orders/${o.number}`} className="block border border-purple-100 bg-white p-3 text-sm hover:border-purple">
                      <div className="flex justify-between">
                        <strong className="font-medium">{o.number}</strong>
                        <span className="tabular-nums">{inr(o.totalPaise)}</span>
                      </div>
                      <p className="mt-1">{o.name}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {o.items} {o.items === 1 ? 'piece' : 'pieces'} · {o.city} · {ago(o.paidAt ?? o.createdAt)}
                      </p>
                    </Link>
                  ))}
                  {!col.length && <p className="px-1 py-4 text-xs opacity-70">Nothing here.</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-purple-200">
                <tr>
                  <th className={th}>Order</th>
                  <th className={th}>Customer</th>
                  <th className={th}>City</th>
                  <th className={th}>Pieces</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={`${th} text-right`}>Placed</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100">
                {list.data.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-purple-25">
                    <td className={td}>
                      <Link to={`/orders/${o.number}`} className="font-medium hover:underline">
                        {o.number}
                      </Link>
                    </td>
                    <td className={td}>
                      {o.name}
                      <span className="block text-xs opacity-80">{phone(o.phone)}</span>
                    </td>
                    <td className={td}>{o.city}</td>
                    <td className={td}>{o.items}</td>
                    <td className={td}>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{inr(o.totalPaise)}</td>
                    <td className={`${td} text-right text-xs`}>{ago(o.paidAt ?? o.createdAt)}</td>
                    <td className={`${td} text-right`}>
                      {(o.status === 'paid' || o.status === 'packed') && (
                        <Button variant="outline" size="sm" onClick={() => setShipping(o)}>
                          <Truck className="size-3.5" /> Ship
                        </Button>
                      )}
                      {o.status === 'shipped' && (
                        <Button variant="ghost" size="sm" onClick={() => setShipping(o)}>
                          <MessageCircle className="size-3.5" /> Message
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                Previous
              </Button>
              Page {page} of {list.data.pages}
              <Button variant="outline" size="sm" disabled={page >= list.data.pages} onClick={() => set({ page: String(page + 1) })}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
      {shipping && <ShipModal key={shipping.id} open onClose={() => setShipping(null)} order={shipping} onSubmit={(v) => ship.mutate(v)} busy={ship.isPending} />}
    </>
  );
}
