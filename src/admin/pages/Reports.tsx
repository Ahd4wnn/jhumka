import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { get } from '../api';
import { inr } from '../format';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, td, th } from '../ui';

interface Report {
  from: string;
  to: string;
  series: { period: string; orders: number; revenuePaise: number; discountPaise: number }[];
  byProduct: { name: string; slug: string; qty: number; revenuePaise: number }[];
  byCollection: { name: string; qty: number; revenuePaise: number }[];
  customers: { newCustomers: number; repeatOrders: number };
  coupons: { code: string; uses: number; discountPaise: number }[];
  totals: { orders: number; revenuePaise: number; discountPaise: number; shippingPaise: number; refundedPaise: number };
}

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);

export function Reports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(istToday());
  const [gran, setGran] = useState<'day' | 'month'>('day');
  const q = useQuery({
    queryKey: ['reports', from, to, gran],
    queryFn: () => get<Report>(`/reports?from=${from}&to=${to}&granularity=${gran}`),
    placeholderData: keepPreviousData,
  });
  const preset = (days: number) => {
    setFrom(daysAgo(days - 1));
    setTo(istToday());
    setGran(days > 92 ? 'month' : 'day');
  };

  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <>
            <a href="/api/admin/export/orders.csv">
              <Button variant="outline" size="sm">
                <Download className="size-4" /> Orders CSV
              </Button>
            </a>
            <a href="/api/admin/export/customers.csv">
              <Button variant="outline" size="sm">
                <Download className="size-4" /> Customers CSV
              </Button>
            </a>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Group by">
          <Select value={gran} onChange={(e) => setGran(e.target.value as 'day' | 'month')}>
            <option value="day">Day</option>
            <option value="month">Month</option>
          </Select>
        </Field>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((d) => (
            <Button key={d} variant="ghost" size="sm" onClick={() => preset(d)}>
              {d === 365 ? '1 year' : `${d} days`}
            </Button>
          ))}
        </div>
      </div>

      <ErrorBox error={q.error} />
      {!q.data ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net sales" value={inr(q.data.totals.revenuePaise)} sub={`${q.data.totals.orders} orders`} />
            <Stat label="Average order" value={inr(q.data.totals.orders ? Math.round(q.data.totals.revenuePaise / q.data.totals.orders) : 0)} />
            <Stat label="Discounts given" value={inr(q.data.totals.discountPaise)} sub={q.data.totals.refundedPaise ? `${inr(q.data.totals.refundedPaise)} refunded` : undefined} />
            <Stat label="New vs repeat" value={`${q.data.customers.newCustomers} / ${q.data.customers.repeatOrders}`} sub="first orders / repeat orders" />
          </div>
          <Card title="Sales">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.series.map((s) => ({ ...s, rupees: s.revenuePaise / 100 }))} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#EFE6F6" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={(v: string) => (gran === 'day' ? v.slice(5) : v)} tick={{ fill: '#7D46AB', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} tick={{ fill: '#7D46AB', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(v) => [inr(Number(v) * 100), 'Sales']} contentStyle={{ border: '1px solid #E4D8EF', borderRadius: 0, color: '#7D46AB' }} cursor={{ fill: '#F6F1FB' }} />
                  <Bar dataKey="rupees" fill="#7D46AB" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="By piece">
              <Table rows={q.data.byProduct} empty="No sales in this period." />
            </Card>
            <Card title="By collection">
              <Table rows={q.data.byCollection} empty="No sales in this period." />
            </Card>
          </div>
          {q.data.coupons.length > 0 && (
            <Card title="Coupons used">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Code</th>
                    <th className={`${th} text-right`}>Uses</th>
                    <th className={`${th} text-right`}>Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-100">
                  {q.data.coupons.map((c) => (
                    <tr key={c.code}>
                      <td className={td}>{c.code}</td>
                      <td className={`${td} text-right`}>{c.uses}</td>
                      <td className={`${td} text-right tabular-nums`}>{inr(c.discountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function Table({ rows, empty }: { rows: { name: string; qty: number; revenuePaise: number }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className={th}>Name</th>
          <th className={`${th} text-right`}>Sold</th>
          <th className={`${th} text-right`}>Sales</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-purple-100">
        {rows.map((r) => (
          <tr key={r.name}>
            <td className={td}>{r.name}</td>
            <td className={`${td} text-right tabular-nums`}>{r.qty}</td>
            <td className={`${td} text-right tabular-nums`}>{inr(r.revenuePaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
