/**
 * Site-wide behaviour: dialogs, the bag and ordering, and toasts (motion lives in motion.ts).
 * The page uses Astro's ClientRouter, so this module runs once. Header, menu, bag and toast
 * are `transition:persist`, so their listeners survive navigation.
 */
import { navigate } from 'astro:transitions/client';
import { $cart, $cartCount, $cartTotal, addToCart, cartPayload, removeFromCart, setQty, syncCart, MAX_QTY, type CartItem } from '@/lib/cart';
import { formatINR } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/* ───────── Toast ───────── */
let toastTimer = 0;
export function toast(message: string) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 3600);
}

/* ───────── Dialogs (menu + bag) ───────── */
function openDialog(id: string) {
  const d = document.getElementById(id) as HTMLDialogElement | null;
  if (!d || d.open) return;
  d.showModal();
  document.documentElement.classList.add('is-locked');
}

function closeAllDialogs() {
  $$<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
}

function initDialogs() {
  $$<HTMLDialogElement>('dialog').forEach((d) => {
    d.addEventListener('close', () => {
      if (!$$<HTMLDialogElement>('dialog').some((x) => x.open)) document.documentElement.classList.remove('is-locked');
    });
    // A click on the backdrop (outside the panel) closes the dialog.
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) d.close();
    });
  });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-open-menu]')) openDialog('menu');
    else if (t.closest('[data-open-bag]')) openDialog('bag');
    else if (t.closest('[data-open-search]')) openDialog('search');
    const closer = t.closest('[data-close-dialog]');
    if (closer) closer.closest('dialog')?.close();
  });
  // Navigating away always closes open sheets.
  document.addEventListener('astro:before-preparation', closeAllDialogs);
}

/* ───────── Bag ───────── */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(label: string, text: string, onClick: () => void, cls: string) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function renderItem(it: CartItem) {
  const li = el('li', 'grid grid-cols-[4.5rem_1fr] gap-4 border-b border-purple-100 py-4 last:border-b-0');

  const thumbLink = el('a', 'block overflow-hidden rounded-[10px]') as HTMLAnchorElement;
  thumbLink.href = `/products/${it.slug}/`;
  thumbLink.tabIndex = -1;
  thumbLink.setAttribute('aria-hidden', 'true');
  // Bundled demo photos (local:) have no /media URL, so they fall back to the velvet tile.
  if (it.image && !it.image.startsWith('local:')) {
    const img = el('img', 'aspect-[4/5] size-full object-cover') as HTMLImageElement;
    img.src = mediaUrl(it.image, 480, 'webp');
    img.alt = '';
    img.loading = 'lazy';
    thumbLink.append(img);
  } else {
    thumbLink.append(el('span', 'mesh mesh--velvet block aspect-[4/5] w-full'));
  }

  const body = el('div', 'min-w-0');
  const top = el('div', 'flex items-start justify-between gap-3');
  const name = el('a', 'font-medium leading-snug hover:underline underline-offset-4', it.name) as HTMLAnchorElement;
  name.href = `/products/${it.slug}/`;
  const line = el('span', 'shrink-0 text-sm tabular-nums', it.price != null ? formatINR(it.price * it.qty) : 'On request');
  top.append(name, line);

  const each = el('p', 'mt-0.5 text-xs opacity-70', it.price != null ? `${formatINR(it.price)} each` : '');

  const controls = el('div', 'mt-3 flex items-center gap-3');
  const stepper = el('div', 'inline-flex items-center rounded-[999px] border border-purple-200');
  const minus = button(`Decrease quantity of ${it.name}`, '−', () => setQty(it.slug, it.qty - 1), 'grid size-8 place-items-center rounded-l-[999px] hover:bg-purple-50');
  const qty = el('span', 'min-w-7 text-center text-sm tabular-nums', String(it.qty));
  const plus = button(`Increase quantity of ${it.name}`, '+', () => setQty(it.slug, it.qty + 1), 'grid size-8 place-items-center rounded-r-[999px] hover:bg-purple-50 disabled:opacity-30');
  plus.disabled = it.qty >= MAX_QTY;
  stepper.append(minus, qty, plus);
  const remove = button(`Remove ${it.name} from bag`, 'Remove', () => removeFromCart(it.slug), 'text-xs underline-offset-4 hover:underline');
  controls.append(stepper, remove);

  body.append(top, each, controls);
  li.append(thumbLink, body);
  return li;
}

/** Re-prices the bag from the server when it opens, so names, prices and stock are current. */
let lastSync = 0;
async function refreshBag() {
  const items = cartPayload();
  if (!items.length || Date.now() - lastSync < 15_000) return;
  lastSync = Date.now();
  try {
    const res = await fetch('/api/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    if (!res.ok) return;
    const q = await res.json();
    syncCart(q.lines);
    if (q.issues?.length) toast(q.issues[0].message);
  } catch {
    /* offline — keep the local bag */
  }
}

function initBag() {
  const list = $('[data-bag-items]');
  const empty = $('[data-bag-empty]');
  const footer = $('[data-bag-footer]');
  const total = $('[data-bag-total]');

  $cart.subscribe((items) => {
    if (!list || !empty || !footer) return;
    const has = items.length > 0;
    list.hidden = !has;
    footer.hidden = !has;
    empty.hidden = has;
    list.replaceChildren(...items.map(renderItem));
  });
  $cartTotal.subscribe((t) => {
    if (total) total.textContent = formatINR(t);
  });
  $cartCount.subscribe((n) => $$('[data-cart-count]').forEach((b) => (b.textContent = String(n))));

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-open-bag]')) refreshBag();

    const add = t.closest<HTMLElement>('[data-add-to-cart], [data-buy-now]');
    if (!add) return;
    const { slug, name, price } = add.dataset;
    if (!slug || !name) return;
    const qtyInput = add.dataset.qtyFrom ? $<HTMLInputElement>(add.dataset.qtyFrom) : null;
    const qty = Math.max(1, Math.min(MAX_QTY, Number(qtyInput?.value) || 1));
    addToCart({ slug, name, price: price ? Number(price) : null }, qty);
    // Buy now: straight to checkout with this piece in the bag.
    if (add.dataset.buyNow != null) navigate('/checkout');
    else if (add.dataset.openBag != null) openDialog('bag');
    else toast(`${name} added to your bag`);
  });
}

initDialogs();
initBag();
document.addEventListener('astro:after-swap', () => document.documentElement.classList.add('js'));
