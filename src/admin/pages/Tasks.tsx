import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Check, Trash2 } from 'lucide-react';
import { del, get, patch, post, type Task } from '../api';
import { date } from '../format';
import { Button, cx, Empty, ErrorBox, Input, Loading, PageHeader, useToast } from '../ui';

const VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Done' },
];

export function Tasks() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'open';
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['tasks', view], queryFn: () => get<{ tasks: Task[] }>(`/tasks?view=${view}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const [form, setForm] = useState({ title: '', due: '', order: '' });

  const create = useMutation({
    mutationFn: () => post('/tasks', { title: form.title, dueAt: form.due ? new Date(`${form.due}T10:00:00+05:30`).toISOString() : null, orderNumber: form.order || null }),
    onSuccess: () => (setForm({ title: '', due: '', order: '' }), refresh()),
    onError: (e) => toast(e.message),
  });
  const toggle = useMutation({ mutationFn: (t: Task) => patch(`/tasks/${t.id}`, { done: !t.doneAt }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (t: Task) => del(`/tasks/${t.id}`), onSuccess: refresh });
  const overdue = (t: Task) => !t.doneAt && t.dueAt && new Date(t.dueAt) < new Date();

  return (
    <>
      <PageHeader title="Tasks" subtitle="Follow-ups for customers and orders." />
      <form
        className="mb-6 grid gap-2 border border-purple-100 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.title.trim()) create.mutate();
        }}
      >
        <Input placeholder="What needs doing?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Task" />
        <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} aria-label="Due date" />
        <Input placeholder="Order (optional) JH-…" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} aria-label="Order number" />
        <Button type="submit" disabled={create.isPending}>
          Add task
        </Button>
      </form>

      <div className="mb-4 flex gap-1">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => setParams({ view: v.key })} className={cx('h-9 border px-3 text-sm', view === v.key ? 'border-purple bg-purple text-white' : 'border-purple-200')}>
            {v.label}
          </button>
        ))}
      </div>

      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !q.data?.tasks.length ? (
        <Empty title={view === 'done' ? 'Nothing completed yet' : 'All clear'}>Add follow-ups here or from a customer's profile.</Empty>
      ) : (
        <ul className="divide-y divide-purple-100 border-y border-purple-100">
          {q.data.tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-3">
              <button
                type="button"
                onClick={() => toggle.mutate(t)}
                className={cx('mt-0.5 grid size-5 shrink-0 place-items-center border', t.doneAt ? 'border-purple bg-purple text-white' : 'border-purple-300')}
                aria-label={t.doneAt ? 'Mark not done' : 'Mark done'}
              >
                {t.doneAt && <Check className="size-3.5" />}
              </button>
              <div className="flex-1">
                <p className={cx(t.doneAt && 'line-through opacity-60')}>{t.title}</p>
                <p className="mt-0.5 text-xs">
                  {t.dueAt && <span className={cx(overdue(t) && 'font-medium')}>{overdue(t) ? 'Overdue · ' : 'Due '}{date(t.dueAt)}</span>}
                  {t.customerName && (
                    <>
                      {' · '}
                      <Link to={`/customers/${t.customerId}`} className="underline underline-offset-2">
                        {t.customerName}
                      </Link>
                    </>
                  )}
                  {t.orderNumber && (
                    <>
                      {' · '}
                      <Link to={`/orders/${t.orderNumber}`} className="underline underline-offset-2">
                        {t.orderNumber}
                      </Link>
                    </>
                  )}
                  {t.assignee && ` · ${t.assignee}`}
                </p>
              </div>
              <button type="button" onClick={() => remove.mutate(t)} className="grid size-8 place-items-center opacity-60 hover:bg-purple-50 hover:opacity-100" aria-label="Delete task">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
