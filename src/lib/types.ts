export const PRODUCT_TYPES = ['necklace', 'bracelet', 'ring', 'earrings', 'set'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const STOCK_STATUSES = ['in_stock', 'low_stock', 'sold_out'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export interface ProductImage {
  /** Media key of an uploaded photo (served from /media), or `local:…` for bundled dev photos. */
  path: string;
  alt?: string;
  w?: number;
  h?: number;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  cover_path: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  price_inr: number | null;
  compare_at_price_inr: number | null;
  collection_id: string | null;
  product_type: ProductType;
  material: string | null;
  images: ProductImage[];
  sku: string | null;
  /** null = stock not tracked. */
  stock_qty: number | null;
  stock_status: StockStatus;
  /** Published customer reviews; absent or null when there are none. */
  rating?: { average: number; count: number } | null;
  is_featured: boolean;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** A product joined with its collection, as used by pages. */
export interface CatalogProduct extends Product {
  collection: Pick<Collection, 'id' | 'slug' | 'name'> | null;
}

export const TYPE_LABELS: Record<ProductType, string> = {
  necklace: 'Necklaces',
  bracelet: 'Bracelets',
  ring: 'Rings',
  earrings: 'Earrings',
  set: 'Sets',
};

export const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low_stock: 'Only a few left',
  sold_out: 'Sold out',
};
