import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaUrl } from '@/lib/media';
import { ApiError, del, get, patch, post, put, type MediaRef, type Me } from '../api';
import { ago, date, dateTime, fromPaise, toPaise } from '../format';
import { Button, Card, cx, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, useToast } from '../ui';

interface StoreSettings {
  shipping: { flatPaise: number; freeAbovePaise: number | null };
  business: { name: string; legalName: string; address: string; email: string; phone: string; gstin: string | null; state: string };
  invoice: { prefix: string };
  inventory: { lowStockThreshold: number };
  alerts: { telegramEnabled: boolean; telegramBotToken: string; telegramChatIds: string };
  reviews: { autoPublish: boolean };
}

export function Settings({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<{ settings: StoreSettings }>('/settings') });
  const owner = me.user.role === 'owner';
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data.settings;
  return (
    <>
      <PageHeader title="Settings" subtitle={owner ? undefined : 'Only the owner can change store settings.'} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Alerts initial={s.alerts} owner={owner} />
        <InstagramFeed owner={owner} />
        <Shipping initial={s.shipping} owner={owner} />
        <Business initial={s.business} invoice={s.invoice} owner={owner} />
        <Inventory initial={s.inventory} owner={owner} />
        <ReviewSettings initial={s.reviews} owner={owner} />
        <Payments me={me} />
        {owner ? <Team me={me} /> : <ChangePassword me={me} />}
      </div>
    </>
  );
}

function useSave<T>(section: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (value: T) => put('/settings', { section, value }),
    onSuccess: () => {
      setErrors({});
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast('Settings saved');
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k.replace(/^value\./, ''), v])));
      toast(e.message);
    },
  });
  return { ...m, errors };
}

function Alerts({ initial, owner }: { initial: StoreSettings['alerts']; owner: boolean }) {
  const [v, setV] = useState(initial);
  const save = useSave<StoreSettings['alerts']>('alerts');
  const toast = useToast();
  const log = useQuery({ queryKey: ['alerts-log'], queryFn: () => get<{ notifications: { id: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null }[] }>('/alerts') });
  const test = useMutation({ mutationFn: () => post('/alerts'), onSuccess: () => toast('Test alert sent — check Telegram'), onError: (e) => toast(e.message) });
  const find = useMutation({ mutationFn: () => get<{ chats: { id: string; title: string }[] }>('/telegram'), onError: (e) => toast(e.message) });
  const addChat = (id: string) => setV({ ...v, telegramChatIds: [...new Set([...v.telegramChatIds.split(/[\s,]+/).filter(Boolean), id])].join(', ') });
  return (
    <Card title="Order alerts on Telegram">
      <div className="grid gap-4">
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          <li>
            In Telegram, open <strong className="font-medium">@BotFather</strong>, send <em>/newbot</em>, choose a name and a username ending in <em>bot</em>, and copy the token it sends you.
          </li>
          <li>Create a group (for example "Jhumka Orders"), add your co-founders and the bot, then send <em>/start</em> in the group.</li>
          <li>
            Paste the token below and press Save, then <strong className="font-medium">Find chats</strong> and pick the group. Turn alerts on, Save again, and send a test.
          </li>
        </ol>
        <Toggle checked={v.telegramEnabled} onChange={(x) => setV({ ...v, telegramEnabled: x })} label="Send a Telegram alert for every paid order" disabled={!owner} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bot token" error={save.errors.telegramBotToken}>
            <Input value={v.telegramBotToken} onChange={(e) => setV({ ...v, telegramBotToken: e.target.value })} disabled={!owner} autoComplete="off" placeholder="123456789:AAH…" />
          </Field>
          <Field label="Chat ids" hint="A group id covers everyone in it. Separate several with commas." error={save.errors.telegramChatIds}>
            <Input value={v.telegramChatIds} onChange={(e) => setV({ ...v, telegramChatIds: e.target.value })} disabled={!owner} placeholder="-1001234567890" />
          </Field>
        </div>
        {find.data &&
          (find.data.chats.length ? (
            <div className="flex flex-wrap gap-2">
              {find.data.chats.map((c) => (
                <Button key={c.id} variant="outline" size="sm" onClick={() => addChat(c.id)}>
                  {c.title} · {c.id}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm">No chats yet. Send /start in the group (or to the bot) and try again within a day.</p>
          ))}
        {owner && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate(v)} disabled={save.isPending}>
              Save
            </Button>
            <Button variant="outline" onClick={() => find.mutate()} disabled={find.isPending || !initial.telegramBotToken}>
              Find chats
            </Button>
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !initial.telegramBotToken || !initial.telegramChatIds}>
              Send test alert
            </Button>
          </div>
        )}
        {log.data?.notifications.length ? (
          <ul className="mt-2 grid gap-1 border-t border-purple-100 pt-3 text-xs">
            {log.data.notifications.slice(0, 6).map((n) => (
              <li key={n.id} className="flex justify-between gap-3">
                <span>{dateTime(n.createdAt)}</span>
                <span className={cx(n.status === 'failed' && 'font-medium')} title={n.lastError ?? ''}>
                  {n.status === 'sent' ? `Delivered ${ago(n.sentAt)}` : n.status === 'failed' ? `Failed after ${n.attempts} tries` : `Retrying (${n.attempts})`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs">Tip: keep this admin open on your phone (Add to Home screen) for instant pop-ups with a chime as well.</p>
      </div>
    </Card>
  );
}

function Shipping({ initial, owner }: { initial: StoreSettings['shipping']; owner: boolean }) {
  const [flat, setFlat] = useState(fromPaise(initial.flatPaise));
  const [free, setFree] = useState(fromPaise(initial.freeAbovePaise));
  const save = useSave<StoreSettings['shipping']>('shipping');
  return (
    <Card title="Shipping">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shipping fee (₹)" hint="0 for free shipping on every order" error={save.errors.flatPaise}>
          <Input inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} disabled={!owner} />
        </Field>
        <Field label="Free shipping above (₹)" hint="Leave empty for none" error={save.errors.freeAbovePaise}>
          <Input inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value)} disabled={!owner} />
        </Field>
      </div>
      {owner && (
        <Button className="mt-4" onClick={() => save.mutate({ flatPaise: toPaise(flat) ?? 0, freeAbovePaise: toPaise(free) })} disabled={save.isPending}>
          Save
        </Button>
      )}
    </Card>
  );
}

function Business({ initial, invoice, owner }: { initial: StoreSettings['business']; invoice: StoreSettings['invoice']; owner: boolean }) {
  const [v, setV] = useState({ ...initial, gstin: initial.gstin ?? '' });
  const [prefix, setPrefix] = useState(invoice.prefix);
  const save = useSave<StoreSettings['business']>('business');
  const saveInvoice = useSave<StoreSettings['invoice']>('invoice');
  return (
    <Card title="Business details (invoices)">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand name">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={!owner} />
        </Field>
        <Field label="Legal name">
          <Input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} disabled={!owner} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className="min-h-20" disabled={!owner} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} disabled={!owner} />
        </Field>
        <Field label="Email">
          <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} disabled={!owner} />
        </Field>
        <Field label="State" hint="Decides CGST+SGST vs IGST once you have a GSTIN.">
          <Input value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })} disabled={!owner} />
        </Field>
        <Field label="GSTIN (optional)" hint="Empty = plain retail invoices. Add it later and invoices switch to GST tax invoices." error={save.errors.gstin}>
          <Input value={v.gstin} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} disabled={!owner} />
        </Field>
        <Field label="Invoice number prefix">
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!owner} />
        </Field>
      </div>
      {owner && (
        <Button
          className="mt-4"
          onClick={() => {
            save.mutate({ ...v, gstin: v.gstin.trim() || null });
            if (prefix !== invoice.prefix) saveInvoice.mutate({ prefix });
          }}
          disabled={save.isPending}
        >
          Save
        </Button>
      )}
    </Card>
  );
}

function Inventory({ initial, owner }: { initial: StoreSettings['inventory']; owner: boolean }) {
  const [n, setN] = useState(String(initial.lowStockThreshold));
  const save = useSave<StoreSettings['inventory']>('inventory');
  return (
    <Card title="Inventory">
      <Field label="“Only a few left” below" hint="Pieces at or below this stock show a low-stock badge and appear on the dashboard.">
        <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} disabled={!owner} className="!w-28" />
      </Field>
      {owner && (
        <Button className="mt-4" onClick={() => save.mutate({ lowStockThreshold: Number(n) || 0 })} disabled={save.isPending}>
          Save
        </Button>
      )}
    </Card>
  );
}

interface InstagramStatus {
  connected: boolean;
  username: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  posts: { id: string; permalink: string; image: MediaRef }[];
}
type InstagramAction = { action: 'connect'; token: string } | { action: 'sync' } | { action: 'disconnect' };

function InstagramFeed({ owner }: { owner: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [token, setToken] = useState('');
  const q = useQuery({ queryKey: ['instagram'], queryFn: () => get<InstagramStatus>('/instagram') });
  const act = useMutation({
    mutationFn: (b: InstagramAction) => post<InstagramStatus & { result?: { added: number } }>('/instagram', b),
    onSuccess: (d, b) => {
      qc.setQueryData(['instagram'], d);
      setToken('');
      toast(b.action === 'disconnect' ? 'Instagram disconnected' : b.action === 'connect' ? `Connected to @${d.username} · ${d.posts.length} posts` : `Synced · ${d.result?.added ?? 0} new posts`);
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['instagram'] });
      toast(e.message);
    },
  });
  const s = q.data;
  const error = s?.lastError && <p className="mt-3 border border-purple-200 bg-purple-25 px-3 py-2 text-sm" role="alert">{s.lastError}</p>;

  return (
    <Card title="Instagram feed">
      <ErrorBox error={q.error} />
      {!s ? (
        q.isPending && <Loading />
      ) : s.connected ? (
        <>
          <p className="text-sm">
            Connected to{' '}
            <a href={`https://www.instagram.com/${s.username}/`} target="_blank" rel="noopener" className="underline underline-offset-2">
              @{s.username}
            </a>{' '}
            · {s.posts.length} posts on the home page · synced {ago(s.lastSyncAt)}. New posts appear within 30 minutes.
          </p>
          {error}
          {s.posts.length > 0 && (
            <ul className="mt-4 grid grid-cols-6 gap-1">
              {s.posts.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <a href={p.permalink} target="_blank" rel="noopener" className="block aspect-square overflow-hidden bg-purple-50">
                    <img src={mediaUrl(p.image.path, 480, 'webp')} alt="" className="size-full object-cover" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs">The connection renews itself every week{s.tokenExpiresAt ? ` (currently valid until ${date(s.tokenExpiresAt)})` : ''}.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => act.mutate({ action: 'sync' })} disabled={act.isPending}>
              {act.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
            {owner && (
              <Button size="sm" variant="ghost" onClick={() => act.mutate({ action: 'disconnect' })} disabled={act.isPending}>
                Disconnect
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">Show your latest Instagram posts on the home page. One-time setup, about 10 minutes:</p>
          <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm">
            <li>
              In the Instagram app: Settings → Account type and tools → <strong className="font-medium">Switch to professional account</strong> (Creator or Business; free).
            </li>
            <li>
              On{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" className="underline underline-offset-2">
                developers.facebook.com
              </a>
              : <strong className="font-medium">Create app</strong> → type <strong className="font-medium">Business</strong> → add the <strong className="font-medium">Instagram</strong> product.
            </li>
            <li>
              Under Instagram → <strong className="font-medium">API setup with Instagram login</strong>, add your account and press <strong className="font-medium">Generate token</strong>. Sign in and
              copy the token.
            </li>
            <li>Paste it below and press Connect.</li>
          </ol>
          {error}
          {owner ? (
            <div className="mt-4 flex gap-2">
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the access token" autoComplete="off" spellCheck={false} />
              <Button onClick={() => act.mutate({ action: 'connect', token })} disabled={act.isPending || token.trim().length < 20}>
                {act.isPending ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm">Ask the owner to connect Instagram.</p>
          )}
        </>
      )}
    </Card>
  );
}

function ReviewSettings({ initial, owner }: { initial: StoreSettings['reviews']; owner: boolean }) {
  const save = useSave<StoreSettings['reviews']>('reviews');
  return (
    <Card title="Reviews">
      <Toggle
        checked={initial.autoPublish}
        disabled={!owner || save.isPending}
        onChange={(autoPublish) => save.mutate({ autoPublish })}
        label="Publish new reviews straight away"
      />
      <p className="mt-3 text-sm">
        {initial.autoPublish
          ? 'New reviews appear on the site as soon as a customer posts them. You can still hide or delete any review.'
          : 'New reviews wait in Reviews until you publish them. Recommended, since customers can add photos.'}{' '}
        Only customers with a shipped or delivered order can write a review.
      </p>
    </Card>
  );
}

function Payments({ me }: { me: Me }) {
  return (
    <Card title="Payments">
      <p className="text-sm">
        {me.payments.configured
          ? me.payments.live
            ? 'Razorpay is connected in live mode — real payments are being collected.'
            : 'Razorpay is connected in test mode. Use test UPI (success@razorpay) or test cards; no real money moves.'
          : 'Razorpay is not connected yet. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET to the server environment.'}
      </p>
      <p className="mt-3 text-xs">
        Webhook URL for the Razorpay dashboard: <code className="break-all">{location.origin}/api/webhooks/razorpay</code> — events: payment.captured, order.paid, payment.failed, refund.processed.
      </p>
    </Card>
  );
}

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  isActive: boolean;
  lastLoginAt: string | null;
}

function Team({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['users'], queryFn: () => get<{ users: TeamUser[] }>('/users') });
  const [invite, setInvite] = useState<{ email: string; name: string; role: 'owner' | 'staff'; password: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const create = useMutation({
    mutationFn: () => post('/users', invite),
    onSuccess: () => (setInvite(null), refresh(), toast('Team member added — share the password with them privately')),
    onError: (e) => (e instanceof ApiError && setErrors(e.fields), toast(e.message)),
  });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => patch(`/users/${id}`, b), onSuccess: refresh, onError: (e) => toast(e.message) });
  const remove = useMutation({ mutationFn: (id: string) => del(`/users/${id}`), onSuccess: refresh });

  return (
    <Card title="Team" actions={<Button size="sm" variant="outline" onClick={() => (setErrors({}), setInvite({ email: '', name: '', role: 'staff', password: '' }))}>Add person</Button>}>
      {q.isPending ? (
        <Loading />
      ) : (
        <ul className="divide-y divide-purple-100 text-sm">
          {q.data?.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="flex-1">
                {u.name} {u.id === me.user.id && <span className="text-xs">(you)</span>}
                <span className="block text-xs opacity-80">
                  {u.email} · last seen {ago(u.lastLoginAt)}
                </span>
              </span>
              {u.id !== me.user.id ? (
                <>
                  <Select className="!h-9 !w-auto" value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="owner">Owner</option>
                  </Select>
                  <Toggle checked={u.isActive} onChange={(v) => update.mutate({ id: u.id, isActive: v })} label={<span className="text-xs">Active</span>} />
                  <button type="button" className="caps !text-[0.55rem] hover:underline" onClick={() => confirm(`Remove ${u.name}?`) && remove.mutate(u.id)}>
                    Remove
                  </button>
                </>
              ) : (
                <span className="caps !text-[0.55rem]">{u.role}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!invite}
        onClose={() => setInvite(null)}
        title="Add team member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvite(null)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Add
            </Button>
          </>
        }
      >
        {invite && (
          <div className="grid gap-4">
            <Field label="Name" error={errors.name}>
              <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as 'owner' | 'staff' })}>
                <option value="staff">Staff — orders, customers, products</option>
                <option value="owner">Owner — everything, including settings and team</option>
              </Select>
            </Field>
            <Field label="First password" hint="At least 10 characters. Share it privately; they can change it in Settings." error={errors.password}>
              <Input type="password" autoComplete="new-password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function ChangePassword({ me }: { me: Me }) {
  const toast = useToast();
  const [v, setV] = useState({ currentPassword: '', password: '' });
  const m = useMutation({ mutationFn: () => patch(`/users/${me.user.id}`, v), onSuccess: () => (setV({ currentPassword: '', password: '' }), toast('Password changed')), onError: (e) => toast(e.message) });
  return (
    <Card title="Your password">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" hint="At least 10 characters">
          <Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        </Field>
      </div>
      <Button className="mt-4" onClick={() => m.mutate()} disabled={m.isPending}>
        Change password
      </Button>
    </Card>
  );
}
