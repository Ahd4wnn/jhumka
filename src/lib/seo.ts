import { FAQS, SITE } from '@/config/site';
import { imagePublicUrl, resolveImage } from './images';
import type { CatalogProduct, Collection } from './types';

export type JsonLd = Record<string, unknown>;

export const abs = (site: URL | string, path = '/') => new URL(path, site).toString();

export function organizationLd(site: URL): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': abs(site, '/#organization'),
    name: SITE.name,
    url: abs(site, '/'),
    logo: abs(site, '/brand/logo-512.png'),
    image: abs(site, '/og-default.png'),
    description: SITE.description,
    slogan: SITE.tagline,
    sameAs: [SITE.instagramUrl],
    currenciesAccepted: SITE.currency,
    areaServed: { '@type': 'Country', name: 'India' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', telephone: `+${SITE.contactPhone}`, areaServed: 'IN' },
  };
}

export function websiteLd(site: URL): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs(site, '/#website'),
    name: SITE.name,
    url: abs(site, '/'),
    inLanguage: SITE.lang,
    publisher: { '@id': abs(site, '/#organization') },
  };
}

export function breadcrumbLd(site: URL, items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(site, it.path),
    })),
  };
}

const AVAILABILITY = {
  in_stock: 'https://schema.org/InStock',
  low_stock: 'https://schema.org/LimitedAvailability',
  sold_out: 'https://schema.org/OutOfStock',
} as const;

interface LdReviews {
  summary: { count: number; average: number };
  reviews: { rating: number; title: string | null; body: string; authorName: string; createdAt: Date }[];
}

export function productLd(site: URL, p: CatalogProduct, r?: LdReviews): JsonLd {
  const images = p.images.map((im) => imagePublicUrl(resolveImage(im.path))).filter(Boolean) as string[];
  const url = abs(site, `/products/${p.slug}/`);
  const rated = r && r.summary.count > 0;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    description: p.description || p.short_description || `${p.name} by ${SITE.name}.`,
    sku: p.sku ?? p.slug,
    url,
    image: images.length ? images.map((src) => abs(site, src)) : [abs(site, '/og-default.png')],
    brand: { '@type': 'Brand', name: SITE.name },
    ...(p.material ? { material: p.material } : {}),
    ...(p.collection ? { category: p.collection.name } : {}),
    ...(rated
      ? {
          aggregateRating: { '@type': 'AggregateRating', ratingValue: r.summary.average.toFixed(1), reviewCount: r.summary.count, bestRating: 5, worstRating: 1 },
          review: r.reviews.slice(0, 5).map((rv) => ({
            '@type': 'Review',
            reviewRating: { '@type': 'Rating', ratingValue: rv.rating, bestRating: 5, worstRating: 1 },
            author: { '@type': 'Person', name: rv.authorName },
            datePublished: rv.createdAt.toISOString().slice(0, 10),
            ...(rv.title ? { name: rv.title } : {}),
            reviewBody: rv.body,
          })),
        }
      : {}),
    ...(p.price_inr != null
      ? {
          offers: {
            '@type': 'Offer',
            url,
            priceCurrency: SITE.currency,
            price: p.price_inr.toFixed(2),
            availability: AVAILABILITY[p.stock_status],
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@id': abs(site, '/#organization') },
          },
        }
      : {}),
  };
}

export function itemListLd(site: URL, name: string, products: CatalogProduct[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(site, `/products/${p.slug}/`),
      name: p.name,
    })),
  };
}

export function collectionPageLd(site: URL, c: Collection, products: CatalogProduct[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${c.name} collection`,
    description: c.description || c.tagline || undefined,
    url: abs(site, `/collections/${c.slug}/`),
    isPartOf: { '@id': abs(site, '/#website') },
    mainEntity: itemListLd(site, `${c.name} collection`, products),
  };
}

export function faqLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Plain-text meta description, trimmed on a word boundary. */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max - 1))}…`;
}
