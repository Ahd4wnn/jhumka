import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ApiError, del, get, post, put, type Coupon } from '../api';
import { date, fromPaise, inr, toPaise } from '../format';
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Toggle, td, th, useToast } from '../ui';

interface Form {
  id?: string;
  code: string;
  type: 'percent' | 'flat';
  value: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  isActive: boolean;
}
const EMPTY: Form = { code: '', type: 'percent', value: '10', minOrder: '', maxDiscount: '', startsAt: '', endsAt: '', usageLimit: '', isActive: true };
const toForm = (c: Coupon): Form => ({
  id: c.id,
  code: c.code,
  type: c.type,
  value: c.type === 'percent' ? String(c.value) : fromPaise(c.value),
  minOrder: c.minOrderPaise ? fromPaise(c.minOrderPaise) : '',
  maxDiscount: fromPaise(c.maxDiscountPaise),
  startsAt: c.startsAt?.slice(0, 10) ?? '',
  endsAt: c.endsAt?.slice(0, 10) ?? '',
  usageLimit: c.usageLimit ? String(c.usageLimit) : '',
  isActive: c.isActive,
});
const describe = (c: Coupon) => (c.type === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`) + (c.minOrderPaise ? ` over ${inr(c.minOrderPaise)}` : '');

export function Coupons() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['coupons'], queryFn: () => get<{ coupons: Coupon[] }>('/coupons') });
  const [f, setF] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (form: Form) => {
      const body = {
        code: form.code,
        type: form.type,
        value: form.type === 'percent' ? Math.round(Number(form.value)) : (toPaise(form.value) ?? 0),
        minOrderPaise: toPaise(form.minOrder) ?? 0,
        maxDiscountPaise: toPaise(form.maxDiscount),
        startsAt: form.startsAt ? `${form.startsAt}T00:00:00+05:30` : null,
        endsAt: form.endsAt ? `${form.endsAt}T23:59:59+05:30` : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        isActive: form.isActive,
      };
      return form.id ? put(`/coupons/${form.id}`, body) : post('/coupons', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      setF(null);
      toast('Coupon saved');
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fields);
      toast(e.message);
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/coupons/${id}`), onSuccess: () => (qc.invalidateQueries({ queryKey: ['coupons'] }), setF(null)) });

  return (
    <>
      <PageHeader title="Coupons" subtitle="Discount codes customers enter at checkout." actions={<Button onClick={() => (setErrors({}), setF(EMPTY))}><Plus className="size-4" /> New coupon</Button>} />
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !q.data?.coupons.length ? (
        <Empty title="No coupons yet">Create a code like WELCOME10 for new customers or ONAM for a festive sale.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-purple-200">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Discount</th>
                <th className={th}>Valid</th>
                <th className={`${th} text-right`}>Used</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-100">
              {q.data.coupons.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-purple-25" onClick={() => (setErrors({}), setF(toForm(c)))}>
                  <td className={`${td} font-medium tracking-wider`}>{c.code}</td>
                  <td className={td}>{describe(c)}</td>
                  <td className={`${td} text-xs`}>{c.startsAt || c.endsAt ? `${c.startsAt ? date(c.startsAt) : 'Now'} – ${c.endsAt ? date(c.endsAt) : 'no end'}` : 'Always'}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                  </td>
                  <td className={td}>{c.isActive ? 'Active' : 'Off'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!f}
        onClose={() => setF(null)}
        title={f?.id ? 'Edit coupon' : 'New coupon'}
        footer={
          <>
            {f?.id && (
              <Button variant="ghost" className="mr-auto" onClick={() => confirm('Delete this coupon?') && remove.mutate(f.id!)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setF(null)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => f && save.mutate(f)}>
              Save
            </Button>
          </>
        }
      >
        {f && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" error={errors.code} className="sm:col-span-2">
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="WELCOME10" />
            </Field>
            <Field label="Type">
              <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Form['type'] })}>
                <option value="percent">Percentage off</option>
                <option value="flat">Flat amount off (₹)</option>
              </Select>
            </Field>
            <Field label={f.type === 'percent' ? 'Percent' : 'Amount (₹)'} error={errors.value}>
              <Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
            <Field label="Minimum order (₹)" hint="Optional">
              <Input inputMode="decimal" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
            </Field>
            {f.type === 'percent' && (
              <Field label="Maximum discount (₹)" hint="Optional cap">
                <Input inputMode="decimal" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} />
              </Field>
            )}
            <Field label="Starts">
              <Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
            </Field>
            <Field label="Ends" error={errors.endsAt}>
              <Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
            </Field>
            <Field label="Total uses allowed" hint="Leave empty for unlimited">
              <Input inputMode="numeric" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <div className="flex items-end">
              <Toggle checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
