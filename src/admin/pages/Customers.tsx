import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { get, type Customer } from '../api';
import { ago, inr, phone } from '../format';
import { Button, cx, Empty, ErrorBox, Input, Loading, PageHeader, Select, Tag, td, th } from '../ui';

interface List {
  customers: Customer[];
  page: number;
  pages: number;
  total: number;
  tags: { tag: string; n: number }[];
}

export function Customers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1);
  const qs = new URLSearchParams({ page: String(page), sort: params.get('sort') ?? 'recent' });
  for (const k of ['q', 'tag']) if (params.get(k)) qs.set(k, params.get(k)!);
  const list = useQuery({ queryKey: ['customers', qs.toString()], queryFn: () => get<List>(`/customers?${qs}`), placeholderData: keepPreviousData });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v == null || v === '' ? next.delete(k) : next.set(k, v);
    next.delete('page');
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={list.data ? `${list.data.total} customers` : undefined}
        actions={
          <a href="/api/admin/export/customers.csv">
            <Button variant="outline" size="sm">
              <Download className="size-4" /> CSV
            </Button>
          </a>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form
          className="w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q });
          }}
        >
          <Input type="search" placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </form>
        <Select className="!w-auto" value={params.get('sort') ?? 'recent'} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
          <option value="recent">Recent orders</option>
          <option value="value">Highest spend</option>
          <option value="orders">Most orders</option>
          <option value="new">Newest customers</option>
        </Select>
        {list.data?.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {list.data.tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => set({ tag: params.get('tag') === t.tag ? null : t.tag })}
                className={cx('h-8 border px-2.5 text-xs', params.get('tag') === t.tag ? 'border-purple bg-purple text-white' : 'border-purple-200')}
              >
                {t.tag} <span className="opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ErrorBox error={list.error} />
      {list.isPending ? (
        <Loading />
      ) : !list.data?.customers.length ? (
        <Empty title="No customers yet">Everyone who completes a paid order appears here with their full history.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-purple-200">
                <tr>
                  <th className={th}>Customer</th>
                  <th className={th}>City</th>
                  <th className={th}>Tags</th>
                  <th className={`${th} text-right`}>Orders</th>
                  <th className={`${th} text-right`}>Spent</th>
                  <th className={`${th} text-right`}>Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100">
                {list.data.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-purple-25">
                    <td className={td}>
                      <Link to={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs opacity-80">{phone(c.phone)}</span>
                    </td>
                    <td className={td}>{c.defaultAddress?.city ?? '—'}</td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{c.ordersCount}</td>
                    <td className={`${td} text-right tabular-nums`}>{inr(c.totalSpentPaise)}</td>
                    <td className={`${td} text-right text-xs`}>{ago(c.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams((p) => (p.set('page', String(page - 1)), p))}>
                Previous
              </Button>
              Page {page} of {list.data.pages}
              <Button variant="outline" size="sm" disabled={page >= list.data.pages} onClick={() => setParams((p) => (p.set('page', String(page + 1)), p))}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
