import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { BarChart3, CheckSquare, ExternalLink, Gem, Layers, LayoutGrid, LogOut, Menu, Settings as SettingsIcon, ShoppingBag, ShoppingCart, Star, Ticket, Users, X } from 'lucide-react';
import { get, post, queryClient, setUnauthorizedHandler, type Me } from './api';
import { cx, Loading, ToastProvider, useToast } from './ui';
import { Login } from './pages/Login';

// Each screen loads on first visit, keeping the admin fast to open on a phone.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Orders = lazy(() => import('./pages/Orders').then((m) => ({ default: m.Orders })));
const OrderDetail = lazy(() => import('./pages/OrderDetail').then((m) => ({ default: m.OrderDetail })));
const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail').then((m) => ({ default: m.CustomerDetail })));
const Abandoned = lazy(() => import('./pages/Abandoned').then((m) => ({ default: m.Abandoned })));
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Products = lazy(() => import('./pages/Products').then((m) => ({ default: m.Products })));
const ProductEdit = lazy(() => import('./pages/ProductEdit').then((m) => ({ default: m.ProductEdit })));
const Collections = lazy(() => import('./pages/Collections').then((m) => ({ default: m.Collections })));
const Reviews = lazy(() => import('./pages/Reviews').then((m) => ({ default: m.Reviews })));
const Coupons = lazy(() => import('./pages/Coupons').then((m) => ({ default: m.Coupons })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename="/admin">
          <Gate />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/me'), retry: false, staleTime: 60_000 });
  useEffect(() => setUnauthorizedHandler(() => qc.setQueryData(['me'], null)), [qc]);

  if (me.isPending) return <Loading />;
  if (!me.data) return <Login onDone={() => qc.invalidateQueries({ queryKey: ['me'] })} />;
  return <Shell me={me.data} />;
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/abandoned', label: 'Abandoned', icon: ShoppingCart },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/products', label: 'Products', icon: Gem },
  { to: '/collections', label: 'Collections', icon: Layers },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/coupons', label: 'Coupons', icon: Ticket },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Shell({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const unseen = useLiveAlerts();
  const counts = useQuery({ queryKey: ['orders', 'counts'], queryFn: () => get<{ counts: Record<string, number> }>('/orders?status=paid'), staleTime: 30_000 });
  const newOrders = counts.data?.counts.paid ?? 0;
  const reviewCounts = useQuery({ queryKey: ['reviews', 'counts'], queryFn: () => get<{ counts: Record<string, number> }>('/reviews?status=pending'), staleTime: 30_000 });
  const waitingReviews = reviewCounts.data?.counts.pending ?? 0;
  const badge: Record<string, number> = { '/orders': newOrders, '/reviews': waitingReviews };

  const nav = (
    <nav className="grid gap-0.5" aria-label="Admin">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cx('flex h-10 items-center gap-3 px-3 text-sm transition-colors', isActive ? 'bg-purple text-white' : 'hover:bg-purple-50')}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {badge[to] > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-purple-100 px-1.5 text-[0.65rem] font-medium text-purple">{badge[to]}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col gap-8 p-5">
      <a href="/admin" className="flex items-baseline gap-2">
        <span className="display text-4xl leading-none">jhumka</span>
        <span className="caps !text-[0.55rem]">admin</span>
      </a>
      {nav}
      <div className="mt-auto grid gap-3 border-t border-purple-100 pt-4 text-sm">
        <span className={cx('caps inline-flex w-fit px-2 py-1 !text-[0.55rem]', me.payments.live ? 'bg-purple text-white' : 'border border-dashed border-purple-300')}>
          {me.payments.configured ? (me.payments.live ? 'Razorpay · live' : 'Razorpay · test mode') : 'Razorpay not connected'}
        </span>
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-2 hover:underline">
          <ExternalLink className="size-4" /> View store
        </a>
        <div className="flex items-center justify-between">
          <span className="truncate">
            {me.user.name} <span className="opacity-70">· {me.user.role}</span>
          </span>
          <button
            type="button"
            onClick={async () => {
              await post('/auth/logout');
              queryClient.clear();
              window.location.href = '/admin';
            }}
            className="grid size-8 place-items-center hover:bg-purple-50"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    document.title = `${unseen ? `(${unseen}) ` : ''}Jhumka admin`;
  }, [unseen]);

  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-purple-100 lg:block">{side}</aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-purple-100 bg-white px-4 lg:hidden">
        <button type="button" className="grid size-10 place-items-center" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="display text-3xl">jhumka</span>
        <span className="w-10" />
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-purple/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white">
            <button type="button" className="absolute top-3 right-3 grid size-9 place-items-center" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {side}
          </div>
        </div>
      )}
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard me={me} />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:number" element={<OrderDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="abandoned" element={<Abandoned />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="collections" element={<Collections />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings me={me} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}

/** Live alerts over SSE: toast + chime + title badge, and refresh order data. */
function useLiveAlerts(): number {
  const qc = useQueryClient();
  const toast = useToast();
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    const clear = () => document.visibilityState === 'visible' && setUnseen(0);
    document.addEventListener('visibilitychange', clear);
    const es = new EventSource('/api/admin/events');
    es.addEventListener('order.paid', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      toast(data.message, `/admin/orders/${data.orderNumber}`);
      chime();
      if (document.visibilityState !== 'visible') setUnseen((n) => n + 1);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        new Notification('New Jhumka order', { body: data.message, icon: '/favicon.svg' });
      }
    });
    es.addEventListener('review.new', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      toast(data.message, '/admin/reviews');
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
    es.addEventListener('notification.failed', (e) => toast(JSON.parse((e as MessageEvent).data).message));
    return () => {
      es.close();
      document.removeEventListener('visibilitychange', clear);
    };
  }, [qc, toast]);
  return unseen;
}

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.65);
    });
  } catch {
    /* audio blocked until the first click */
  }
}

