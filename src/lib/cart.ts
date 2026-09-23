/** The bag: a tiny persistent store in localStorage, shared across tabs. */
import { computed } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

export interface CartItem {
  slug: string;
  name: string;
  price: number | null;
  qty: number;
  /** Media key of the piece's first photo, filled in by the server when the bag re-prices. */
  image?: string | null;
}

export const MAX_QTY = 10;

export const $cart = persistentJSON<CartItem[]>('jhumka:bag', []);

export const $cartCount = computed($cart, (items) => items.reduce((n, it) => n + it.qty, 0));
export const $cartTotal = computed($cart, (items) => items.reduce((sum, it) => sum + (it.price ?? 0) * it.qty, 0));

export function addToCart(item: Omit<CartItem, 'qty'>, qty = 1) {
  const items = $cart.get();
  const existing = items.find((it) => it.slug === item.slug);
  if (existing) {
    $cart.set(items.map((it) => (it.slug === item.slug ? { ...it, ...item, qty: Math.min(MAX_QTY, it.qty + qty) } : it)));
  } else {
    $cart.set([...items, { ...item, qty: Math.min(MAX_QTY, qty) }]);
  }
}

export function setQty(slug: string, qty: number) {
  if (qty <= 0) return removeFromCart(slug);
  $cart.set($cart.get().map((it) => (it.slug === slug ? { ...it, qty: Math.min(MAX_QTY, qty) } : it)));
}

export function removeFromCart(slug: string) {
  $cart.set($cart.get().filter((it) => it.slug !== slug));
}

export function clearCart() {
  $cart.set([]);
}

/** Replaces bag names/prices/quantities with the server's (removes pieces no longer sold). */
export function syncCart(lines: { slug: string; name: string; unitPricePaise: number; qty: number; imagePath?: string | null }[]) {
  const current = $cart.get();
  const next = lines.map((l) => ({ slug: l.slug, name: l.name, price: l.unitPricePaise / 100, qty: l.qty, image: l.imagePath ?? null }));
  const changed =
    next.length !== current.length || next.some((n) => {
      const c = current.find((x) => x.slug === n.slug);
      return !c || c.qty !== n.qty || c.price !== n.price || c.name !== n.name || (c.image ?? null) !== n.image;
    });
  if (changed) $cart.set(next);
}

export const cartPayload = () => $cart.get().map((it) => ({ slug: it.slug, qty: it.qty }));
