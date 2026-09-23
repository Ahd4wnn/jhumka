import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Check, Mail, Phone } from 'lucide-react';
import { get, patch, post, type Customer, type OrderStatus, type Task } from '../api';
import { date, dateTime, inr, phone } from '../format';
import { Button, Card, cx, ErrorBox, Input, Loading, PageHeader, Stat, StatusBadge, Tag, Textarea, useToast } from '../ui';

interface Detail {
  customer: Customer;
  orders: { id: string; number: string; status: OrderStatus; totalPaise: number; createdAt: string; paidAt: string | null }[];
  addresses: { name: string; line1: string; line2?: string; city: string; state: string; pincode: string }[];
  notes: { id: string; body: string; createdAt: string; author: string | null }[];
  tasks: (Omit<Task, 'customerName' | 'orderNumber' | 'assignee'> & { orderId: string | null })[];
}

const SUGGESTED_TAGS = ['vip', 'repeat', 'gift buyer', 'wholesale', 'influencer', 'follow up'];

export function CustomerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['customers', 'detail', id], queryFn: () => get<Detail>(`/customers/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['customers'] });
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [task, setTask] = useState({ title: '', due: '' });

  const saveTags = useMutation({ mutationFn: (tags: string[]) => patch(`/customers/${id}`, { tags }), onSuccess: refresh, onError: (e) => toast(e.message) });
  const addNote = useMutation({ mutationFn: (body: string) => post(`/customers/${id}`, { body }), onSuccess: () => (setNote(''), refresh()), onError: (e) => toast(e.message) });
  const addTask = useMutation({
    mutationFn: () => post('/tasks', { title: task.title, dueAt: task.due ? new Date(`${task.due}T10:00:00+05:30`).toISOString() : null, customerId: id }),
    onSuccess: () => {
      setTask({ title: '', due: '' });
      refresh();
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast(e.message),
  });
  const toggleTask = useMutation({ mutationFn: (t: { id: string; done: boolean }) => patch(`/tasks/${t.id}`, { done: t.done }), onSuccess: () => (refresh(), qc.invalidateQueries({ queryKey: ['tasks'] })) });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { customer: c, orders, addresses, notes, tasks } = q.data;
  const paid = orders.filter((o) => o.paidAt && !['cancelled', 'refunded'].includes(o.status));
  const tags = c.tags;
  const addTag = (t: string) => {
    const clean = t.trim().toLowerCase();
    if (clean && !tags.includes(clean)) saveTags.mutate([...tags, clean]);
    setTag('');
  };

  return (
    <>
      <Link to="/customers" className="caps mb-4 inline-flex items-center gap-2 !text-[0.6rem] hover:underline">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>
      <PageHeader
        title={c.name}
        subtitle={`Customer since ${date(c.createdAt)}`}
        actions={
          <>
            <a href={`tel:${c.phone}`}>
              <Button variant="outline">
                <Phone className="size-4" /> Call
              </Button>
            </a>
            {c.email && (
              <a href={`mailto:${c.email}`}>
                <Button variant="outline">
                  <Mail className="size-4" /> Email
                </Button>
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Lifetime value" value={inr(c.totalSpentPaise)} />
        <Stat label="Paid orders" value={c.ordersCount} sub={c.lastOrderAt ? `Last ${date(c.lastOrderAt)}` : undefined} />
        <Stat label="Average order" value={inr(c.ordersCount ? Math.round(c.totalSpentPaise / c.ordersCount) : 0)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-4">
          <Card title="Orders">
            <ul className="divide-y divide-purple-100 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <Link to={`/orders/${o.number}`} className="w-24 font-medium hover:underline">
                    {o.number}
                  </Link>
                  <StatusBadge status={o.status} />
                  <span className="ml-auto text-xs">{dateTime(o.createdAt)}</span>
                  <span className="w-20 text-right tabular-nums">{inr(o.totalPaise)}</span>
                </li>
              ))}
            </ul>
            {paid.length === 0 && <p className="mt-2 text-xs">No completed purchases yet — this customer only started a checkout.</p>}
          </Card>

          <Card title="Notes">
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) addNote.mutate(note);
              }}
            >
              <Textarea placeholder="Preferences, sizes, anniversaries, what they asked about…" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
              <Button type="submit" variant="outline" size="sm" className="justify-self-end" disabled={addNote.isPending}>
                Save note
              </Button>
            </form>
            <ul className="mt-4 grid gap-3">
              {notes.map((n) => (
                <li key={n.id} className="border-l-2 border-purple-200 pl-3 text-sm">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-xs opacity-75">
                    {dateTime(n.createdAt)}
                    {n.author && ` · ${n.author}`}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Contact">
            <p className="text-sm">
              <a href={`tel:${c.phone}`} className="hover:underline">
                {phone(c.phone)}
              </a>
              {c.email && (
                <>
                  <br />
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </>
              )}
            </p>
            {addresses.length > 0 && (
              <div className="mt-4 grid gap-3 border-t border-purple-100 pt-4 text-sm">
                {addresses.map((a, i) => (
                  <address key={i} className="not-italic">
                    {a.line1}
                    {a.line2 && `, ${a.line2}`}
                    <br />
                    {a.city}, {a.state} {a.pincode}
                  </address>
                ))}
              </div>
            )}
          </Card>

          <Card title="Tags">
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <Tag key={t} onRemove={() => saveTags.mutate(tags.filter((x) => x !== t))}>
                  {t}
                </Tag>
              ))}
              {!tags.length && <span className="text-xs">No tags yet.</span>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTag(tag);
              }}
            >
              <Input placeholder="Add tag" value={tag} onChange={(e) => setTag(e.target.value)} className="!h-9" />
              <Button type="submit" variant="outline" size="sm">
                Add
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                <button key={t} type="button" onClick={() => addTag(t)} className="h-6 border border-dashed border-purple-200 px-2 text-xs hover:border-purple">
                  + {t}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Follow-ups">
            <ul className="grid gap-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => toggleTask.mutate({ id: t.id, done: !t.doneAt })}
                    className={cx('mt-0.5 grid size-5 shrink-0 place-items-center border', t.doneAt ? 'border-purple bg-purple text-white' : 'border-purple-300')}
                    aria-label={t.doneAt ? 'Mark not done' : 'Mark done'}
                  >
                    {t.doneAt && <Check className="size-3.5" />}
                  </button>
                  <span className={cx('flex-1', t.doneAt && 'line-through opacity-60')}>
                    {t.title}
                    {t.dueAt && <span className="block text-xs opacity-80">Due {date(t.dueAt)}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (task.title.trim()) addTask.mutate();
              }}
            >
              <Input placeholder="e.g. Share the new Tulip drop" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} className="!h-9" />
              <div className="flex gap-2">
                <Input type="date" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} className="!h-9" aria-label="Due date" />
                <Button type="submit" variant="outline" size="sm">
                  Add
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
