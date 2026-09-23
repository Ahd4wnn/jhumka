import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowLeftRight, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import { ApiError, del, get, post, put, uploadPhoto, type Collection, type MediaRef, type Product } from '../api';
import { fromPaise, toPaise } from '../format';
import { Button, Card, cx, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, Toggle, useToast } from '../ui';
import { slugify } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

type Draft = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
const EMPTY: Draft = {
  name: '',
  slug: '',
  sku: null,
  shortDescription: '',
  description: '',
  pricePaise: null,
  compareAtPaise: null,
  collectionId: null,
  productType: 'necklace',
  material: 'Gold-plated',
  images: [],
  stockQty: null,
  isFeatured: false,
  isPublished: false,
  sortOrder: 0,
};
const TYPES = [
  ['necklace', 'Necklace'],
  ['bracelet', 'Bracelet'],
  ['ring', 'Ring'],
  ['earrings', 'Earrings'],
  ['set', 'Set'],
] as const;

export function ProductEdit() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => get<{ products: Product[] }>('/products'), enabled: !isNew });
  const cols = useQuery({ queryKey: ['collections'], queryFn: () => get<{ collections: Collection[] }>('/collections') });
  const existing = products.data?.products.find((p) => p.id === id);

  const [p, setP] = useState<Draft>(EMPTY);
  const [price, setPrice] = useState('');
  const [compare, setCompare] = useState('');
  const [stock, setStock] = useState('');
  const [slugEdited, setSlugEdited] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loaded = useRef(false);

  useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true;
      setP(existing);
      setPrice(fromPaise(existing.pricePaise));
      setCompare(fromPaise(existing.compareAtPaise));
      setStock(existing.stockQty == null ? '' : String(existing.stockQty));
    }
  }, [existing]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...p,
        sku: p.sku || null,
        pricePaise: toPaise(price),
        compareAtPaise: toPaise(compare),
        stockQty: stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock))),
      };
      return isNew ? post<{ product: Product }>('/products', body) : put<{ product: Product }>(`/products/${id}`, body);
    },
    onSuccess: (res) => {
      setErrors({});
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(isNew ? 'Product created' : 'Saved — the shop is updated');
      if (isNew) nav(`/products/${res.product.id}`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fields);
      toast(e.message);
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      nav('/products');
    },
    onError: (e) => toast(e.message),
  });

  if (!isNew && products.isPending) return <Loading />;
  if (!isNew && !existing) return <ErrorBox error={products.error ?? 'Product not found.'} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      noValidate
    >
      <Link to="/products" className="caps mb-4 inline-flex items-center gap-2 !text-[0.6rem] hover:underline">
        <ArrowLeft className="size-3.5" /> Products
      </Link>
      <PageHeader
        title={isNew ? 'New product' : p.name || 'Product'}
        actions={
          <>
            {!isNew && p.isPublished && (
              <a href={`/products/${p.slug}/`} target="_blank" rel="noopener">
                <Button variant="ghost">
                  <ExternalLink className="size-4" /> View in shop
                </Button>
              </a>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4">
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Name" error={errors.name}>
                <Input
                  value={p.name}
                  onChange={(e) => {
                    set('name', e.target.value);
                    if (!slugEdited) set('slug', slugify(e.target.value));
                  }}
                  aria-invalid={!!errors.name}
                />
              </Field>
              <Field label="Web address" hint={`/products/${p.slug || 'your-piece'}/`} error={errors.slug}>
                <Input
                  value={p.slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    set('slug', slugify(e.target.value));
                  }}
                  aria-invalid={!!errors.slug}
                />
              </Field>
              <Field label="Short line" hint="One sentence under the name — also used by Google." error={errors.shortDescription}>
                <Input maxLength={200} value={p.shortDescription ?? ''} onChange={(e) => set('shortDescription', e.target.value)} />
              </Field>
              <Field label="Description" error={errors.description}>
                <Textarea value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Photos">
            <PhotoManager images={p.images} onChange={(images) => set('images', images)} />
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Visibility">
            <div className="grid gap-3">
              <Toggle checked={p.isPublished} onChange={(v) => set('isPublished', v)} label="Live in the shop" />
              <Toggle checked={p.isFeatured} onChange={(v) => set('isFeatured', v)} label="Feature on the homepage" />
              {errors.pricePaise && p.isPublished && <p className="text-xs">⚠ {errors.pricePaise}</p>}
              {p.isPublished && !p.images.length && <p className="text-xs">Tip: add at least one photo before going live.</p>}
            </div>
          </Card>

          <Card title="Price & stock">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (₹)" error={errors.pricePaise}>
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="349" />
              </Field>
              <Field label="Was price (₹)" hint="Optional strikethrough" error={errors.compareAtPaise}>
                <Input inputMode="decimal" value={compare} onChange={(e) => setCompare(e.target.value)} />
              </Field>
              <Field label="Stock" hint="Leave empty to not track stock." error={errors.stockQty}>
                <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="SKU (optional)" error={errors.sku}>
                <Input value={p.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Organisation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Collection">
                <Select value={p.collectionId ?? ''} onChange={(e) => set('collectionId', e.target.value || null)}>
                  <option value="">None</option>
                  {cols.data?.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select value={p.productType} onChange={(e) => set('productType', e.target.value as Draft['productType'])}>
                  {TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Finish">
                <Input value={p.material ?? ''} onChange={(e) => set('material', e.target.value)} />
              </Field>
              <Field label="Sort order" hint="Lower numbers show first.">
                <Input inputMode="numeric" value={String(p.sortOrder)} onChange={(e) => set('sortOrder', Number(e.target.value.replace(/[^\d-]/g, '')) || 0)} />
              </Field>
            </div>
          </Card>

          {!isNew && (
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => confirm(`Delete “${p.name}”? Past orders keep their details.`) && remove.mutate()}
            >
              <Trash2 className="size-4" /> Delete product
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function PhotoManager({ images, onChange }: { images: MediaRef[]; onChange: (v: MediaRef[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const latest = useRef(images);
  latest.current = images;

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setError('');
    setBusy(list.length);
    for (const file of list) {
      try {
        const { media } = await uploadPhoto(file, 'products');
        onChange([...latest.current, { ...media, alt: '' }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
      setBusy((n) => n - 1);
    }
  };
  const move = (i: number, j: number) => {
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cx('grid place-items-center gap-2 border border-dashed px-4 py-8 text-center text-sm', over ? 'border-purple bg-purple-50' : 'border-purple-200')}
      >
        <ImagePlus className="size-6" />
        <p>Drop photos here, or</p>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          Choose photos
        </Button>
        <p className="text-xs opacity-80">JPG, PNG or WebP up to 12 MB. Add about 3 per piece: the 1st is the main photo, the 2nd shows when someone hovers the card, and the rest fill the gallery on the piece's page.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && add(e.target.files)} />
        {busy > 0 && <p className="caps">Processing {busy}…</p>}
        {error && <p className="text-xs font-medium">⚠ {error}</p>}
      </div>
      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.path} className="border border-purple-100 p-2">
              <div className="mesh mesh--velvet relative aspect-[4/5] overflow-hidden">
                {!img.path.startsWith('local:') && <img src={mediaUrl(img.path, 480, 'webp')} alt="" className="absolute inset-0 size-full object-cover" />}
                {i === 0 && <span className="caps absolute top-2 left-2 bg-white px-1.5 py-0.5 !text-[0.55rem]">Main</span>}
              </div>
              <Input
                className="mt-2 !h-9 text-xs"
                placeholder="Describe the photo (for Google)"
                value={img.alt ?? ''}
                onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))}
                aria-label={`Alt text for photo ${i + 1}`}
              />
              <div className="mt-2 flex items-center justify-between">
                <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} className="grid size-8 place-items-center hover:bg-purple-50 disabled:opacity-30" aria-label="Move earlier">
                  <ArrowLeftRight className="size-3.5" />
                </button>
                <button type="button" onClick={() => onChange(images.filter((_, k) => k !== i))} className="caps !text-[0.55rem] hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
