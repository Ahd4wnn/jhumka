/**
 * Checkout page: renders the server-priced summary, applies discount codes, fills city/state
 * from the pincode, validates the form, then opens Razorpay Checkout and verifies payment.
 */
import { $cart, cartPayload, clearCart, syncCart } from '@/lib/cart';
import { mediaUrl } from '@/lib/media';

type Totals = { subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number };
type Line = { slug: string; name: string; imagePath: string | null; unitPricePaise: number; qty: number; lineTotalPaise: number };
type Quote = { lines: Line[]; issues: { slug: string; message: string }[]; totals: Totals; coupon: string | null; couponError: string | null };
type PayParams = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  token?: string;
  prefill: { name: string; email: string; contact: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
  }
}

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong. Please try again.'), { details: data.details });
  return data as T;
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'));
    document.head.append(s);
  });
}

function init() {
  const root = document.querySelector<HTMLElement>('[data-checkout]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const body = $('[data-body]');
  const empty = $('[data-empty]');
  const form = $<HTMLFormElement>('[data-form]');
  const payBtn = $<HTMLButtonElement>('[data-pay]');
  const formError = $('[data-form-error]');
  const paymentsReady = root.dataset.paymentsReady === '1';

  // One summary node, moved between the desktop sidebar and the phone <details>.
  const summary = ($<HTMLTemplateElement>('template[data-summary-template]').content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  const place = () => (window.matchMedia('(min-width: 1024px)').matches ? $('[data-summary-slot]') : $('[data-summary-slot-mobile]')).append(summary);
  place();
  window.matchMedia('(min-width: 1024px)').addEventListener('change', place);
  const s = <T extends Element = HTMLElement>(sel: string) => summary.querySelector<T>(sel)!;

  let coupon = '';
  let current: Quote | null = null;
  let pending: PayParams | null = null;

  const render = (q: Quote) => {
    current = q;
    const list = s('[data-lines]');
    list.replaceChildren(
      ...q.lines.map((l) => {
        const li = document.createElement('li');
        li.className = 'flex gap-4 py-4';
        const thumb = document.createElement('div');
        thumb.className = 'mesh mesh--velvet relative h-20 w-16 shrink-0 overflow-hidden rounded-[10px]';
        if (l.imagePath && !l.imagePath.startsWith('local:')) {
          const img = document.createElement('img');
          img.src = mediaUrl(l.imagePath, 480, 'webp');
          img.alt = '';
          img.className = 'absolute inset-0 size-full object-cover';
          thumb.append(img);
        }
        const text = document.createElement('div');
        text.className = 'flex-1';
        const name = document.createElement('p');
        name.className = 'text-[0.95rem] font-medium leading-snug';
        name.textContent = l.name;
        const qty = document.createElement('p');
        qty.className = 'mt-1 text-xs opacity-70';
        qty.textContent = `Qty ${l.qty} · ${inr(l.unitPricePaise)}`;
        text.append(name, qty);
        const price = document.createElement('p');
        price.className = 'text-sm tabular-nums';
        price.textContent = inr(l.lineTotalPaise);
        li.append(thumb, text, price);
        return li;
      }),
    );
    s('[data-subtotal]').textContent = inr(q.totals.subtotalPaise);
    const hasDiscount = q.totals.discountPaise > 0;
    s('[data-discount]').hidden = s('[data-discount-label]').hidden = !hasDiscount;
    s('[data-discount-label]').textContent = q.coupon ? `Discount (${q.coupon})` : 'Discount';
    s('[data-discount]').textContent = `−${inr(q.totals.discountPaise)}`;
    s('[data-shipping]').textContent = q.totals.shippingPaise ? inr(q.totals.shippingPaise) : 'Free';
    s('[data-total]').textContent = inr(q.totals.totalPaise);
    $('[data-total-mobile]').textContent = inr(q.totals.totalPaise);
    payBtn.textContent = paymentsReady ? `Pay ${inr(q.totals.totalPaise)} securely` : 'Payments coming soon';

    const msg = s('[data-coupon-msg]');
    if (q.couponError) {
      msg.hidden = false;
      msg.textContent = q.couponError;
    } else if (q.coupon) {
      msg.hidden = false;
      msg.textContent = `Code ${q.coupon} applied.`;
    } else msg.hidden = true;
  };

  const refresh = async () => {
    const items = cartPayload();
    const has = items.length > 0;
    empty.hidden = has;
    body.hidden = !has;
    if (!has) return;
    try {
      const q = await api<Quote>('/api/checkout/quote', { items, couponCode: coupon || undefined });
      syncCart(q.lines);
      if (!q.lines.length) {
        empty.hidden = false;
        body.hidden = true;
        return;
      }
      render(q);
      if (q.issues.length) showError(q.issues.map((i) => i.message).join(' '));
    } catch (err) {
      showError((err as Error).message);
    }
  };

  const showError = (message: string) => {
    formError.hidden = !message;
    formError.textContent = message;
  };

  s('[data-apply-coupon]').addEventListener('click', () => {
    coupon = s<HTMLInputElement>('[data-coupon]').value.trim();
    pending = null;
    refresh();
  });
  s<HTMLInputElement>('[data-coupon]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      s<HTMLButtonElement>('[data-apply-coupon]').click();
    }
  });

  // Pincode → city/state.
  const pin = form.elements.namedItem('pincode') as HTMLInputElement;
  pin.addEventListener('input', async () => {
    pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
    if (pin.value.length !== 6) return;
    const res = await fetch(`/api/pincode/${pin.value}`).then((r) => r.json()).catch(() => null);
    if (res?.found) {
      const city = form.elements.namedItem('city') as HTMLInputElement;
      const state = form.elements.namedItem('state') as HTMLInputElement;
      if (!city.value) city.value = res.city;
      if (!state.value) state.value = res.state;
    }
  });

  const fieldError = (name: string, message: string) => {
    const input = form.elements.namedItem(name) as HTMLInputElement | null;
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    let note = input.closest('label')?.querySelector<HTMLElement>('[data-field-error]');
    if (!note) {
      note = document.createElement('span');
      note.dataset.fieldError = '';
      note.className = 'mt-1 block text-sm';
      input.closest('label')?.append(note);
    }
    note.textContent = message;
  };
  const clearFieldErrors = () => {
    form.querySelectorAll('[data-field-error]').forEach((n) => n.remove());
    form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  };
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    t.removeAttribute('aria-invalid');
    t.closest('label')?.querySelector('[data-field-error]')?.remove();
  });

  const openPayment = async (p: PayParams) => {
    await loadRazorpay();
    await new Promise<void>((resolve) => {
      const rzp = new window.Razorpay!({
        key: p.keyId,
        amount: p.amount,
        currency: p.currency,
        order_id: p.razorpayOrderId,
        name: 'Jhumka',
        description: `Order ${p.orderNumber}`,
        image: new URL('/favicon.svg', location.origin).toString(),
        prefill: p.prefill,
        theme: { color: '#7D46AB' },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          payBtn.textContent = 'Confirming your payment…';
          try {
            const done = await api<{ redirect: string }>('/api/checkout/verify', r);
            clearCart();
            location.assign(done.redirect);
          } catch (err) {
            showError((err as Error).message);
            payBtn.disabled = false;
          }
          resolve();
        },
        modal: {
          ondismiss: () => {
            payBtn.disabled = false;
            if (current) payBtn.textContent = `Pay ${inr(current.totals.totalPaise)} securely`;
            showError('Payment was not completed. You can try again — nothing has been charged.');
            resolve();
          },
        },
      });
      rzp.on('payment.failed', (r) => {
        showError(r.error?.description ? `Payment failed: ${r.error.description}. You can try again.` : 'Payment failed. You can try again.');
        if (p.token) api('/api/checkout/resume', { number: p.orderNumber, token: p.token, failed: r.error?.description ?? 'failed' }).catch(() => {});
      });
      rzp.open();
    });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!paymentsReady) return;
    clearFieldErrors();
    showError('');
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    payBtn.disabled = true;
    payBtn.textContent = 'Opening secure payment…';
    try {
      const params = new URLSearchParams(location.search);
      const utm = Object.fromEntries([...params].filter(([k]) => k.startsWith('utm_')));
      // Reuse the order we already created if the customer is simply retrying.
      pending ??= await api<PayParams>('/api/checkout', {
        items: cartPayload(),
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        address: { line1: data.line1, line2: data.line2, landmark: data.landmark, city: data.city, state: data.state, pincode: data.pincode },
        note: data.note || undefined,
        couponCode: coupon || undefined,
        utm: Object.keys(utm).length ? utm : undefined,
      });
      await openPayment(pending);
    } catch (err) {
      const e2 = err as Error & { details?: { fields?: Record<string, string> } };
      const fields = e2.details?.fields ?? {};
      for (const [k, msg] of Object.entries(fields)) fieldError(k.replace(/^address\./, ''), msg);
      showError(e2.message);
      payBtn.disabled = false;
      if (current) payBtn.textContent = `Pay ${inr(current.totals.totalPaise)} securely`;
      const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    }
  });

  // Details changed after an order was created → start a fresh one on the next attempt.
  form.addEventListener('change', () => (pending = null));
  $cart.listen(() => {
    pending = null;
    refresh();
  });
  refresh();
}

document.addEventListener('astro:page-load', init);
