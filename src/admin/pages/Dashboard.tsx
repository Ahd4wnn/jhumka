import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get, type Me, type OrderStatus } from '../api';
import { ago, inr } from '../format';
import { Card, ErrorBox, Loading, PageHeader, Stat, StatusBadge, td } from '../ui';

interface Dash {
  periods: Record<'today' | '7d' | '30d', { orders: number; revenuePaise: number; aovPaise: number }>;
  series: { day: string; orders: number; revenuePaise: number }[];
  topProducts: { name: string; slug: string; qty: number; revenuePaise: number }[];
  recentOrders: { number: string; status: OrderStatus; name: string; totalPaise: number; paidAt: string; city: string }[];
  toShip: { paid: number; packed: number };
  lowStock: { id: string; name: string; stockQty: number }[];
  repeatRate: number;
  buyers: number;
  abandoned: { count: number; valuePaise: number };
  tasksDue: number;
  reviewsPending: number;
}

export function Dashboard({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dash>('/dashboard'), refetchInterval: 60_000 });
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data;

  return (
    <>
      <PageHeader title={`${greeting}, ${me.user.name.split(' ')[0]}`} subtitle="Here's how Jhumka is doing." />

      {(d.toShip.paid > 0 || d.tasksDue > 0 || d.abandoned.count > 0 || d.reviewsPending > 0) && (
        <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {d.toShip.paid > 0 && (
            <Link to="/orders?status=paid" className="bg-purple px-4 py-3 text-sm text-white">
              <strong className="font-medium">{d.toShip.paid} new {d.toShip.paid === 1 ? 'order' : 'orders'}</strong> to pack →
            </Link>
          )}
          {d.tasksDue > 0 && (
            <Link to="/tasks?view=today" className="border border-purple-200 px-4 py-3 text-sm hover:border-purple">
              <strong className="font-medium">{d.tasksDue} follow-up{d.tasksDue === 1 ? '' : 's'}</strong> due today →
            </Link>
          )}
          {d.abandoned.count > 0 && (
            <Link to="/abandoned" className="border border-purple-200 px-4 py-3 text-sm hover:border-purple">
              <strong className="font-medium">{d.abandoned.count} unfinished checkout{d.abandoned.count === 1 ? '' : 's'}</strong> ({inr(d.abandoned.valuePaise)}) this week →
            </Link>
          )}
          {d.reviewsPending > 0 && (
            <Link to="/reviews" className="border border-purple-200 px-4 py-3 text-sm hover:border-purple">
              <strong className="font-medium">{d.reviewsPending} review{d.reviewsPending === 1 ? '' : 's'}</strong> waiting for approval →
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales today" value={inr(d.periods.today.revenuePaise)} sub={`${d.periods.today.orders} orders`} />
        <Stat label="Last 7 days" value={inr(d.periods['7d'].revenuePaise)} sub={`${d.periods['7d'].orders} orders · avg ${inr(d.periods['7d'].aovPaise)}`} />
        <Stat label="Last 30 days" value={inr(d.periods['30d'].revenuePaise)} sub={`${d.periods['30d'].orders} orders · avg ${inr(d.periods['30d'].aovPaise)}`} />
        <Stat label="Repeat customers" value={`${Math.round(d.repeatRate * 100)}%`} sub={`of ${d.buyers} buyers ordered again`} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
        <Card title="Sales · last 30 days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.series.map((s) => ({ ...s, rupees: s.revenuePaise / 100 }))} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7D46AB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7D46AB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EFE6F6" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(8)} tick={{ fill: '#7D46AB', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} tick={{ fill: '#7D46AB', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v) => [inr(Number(v) * 100), 'Sales']}
                  labelFormatter={(l) => new Date(String(l)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  contentStyle={{ border: '1px solid #E4D8EF', borderRadius: 0, color: '#7D46AB' }}
                />
                <Area type="monotone" dataKey="rupees" stroke="#7D46AB" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Best sellers · 30 days">
          {d.topProducts.length ? (
            <ol className="grid gap-3">
              {d.topProducts.map((p, i) => (
                <li key={p.slug} className="flex items-baseline gap-3">
                  <span className="display w-5 text-xl">{i + 1}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-sm tabular-nums">{p.qty} sold</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm">Your best sellers will appear here after the first orders.</p>
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
        <Card title="Latest orders" actions={<Link to="/orders" className="caps !text-[0.6rem] underline underline-offset-4">All orders</Link>}>
          {d.recentOrders.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-purple-100">
                {d.recentOrders.map((o) => (
                  <tr key={o.number}>
                    <td className={td}>
                      <Link to={`/orders/${o.number}`} className="font-medium hover:underline">
                        {o.number}
                      </Link>
                    </td>
                    <td className={td}>{o.name}</td>
                    <td className={`${td} hidden sm:table-cell`}>{o.city}</td>
                    <td className={td}>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{inr(o.totalPaise)}</td>
                    <td className={`${td} hidden text-right text-xs md:table-cell`}>{ago(o.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm">No orders yet. Once Razorpay is connected, paid orders show up here instantly.</p>
          )}
        </Card>
        <Card title="Low stock">
          {d.lowStock.length ? (
            <ul className="grid gap-2 text-sm">
              {d.lowStock.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <Link to={`/products/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  <span className="tabular-nums">{p.stockQty === 0 ? 'Sold out' : `${p.stockQty} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Everything is well stocked.</p>
          )}
        </Card>
      </div>
    </>
  );
}
