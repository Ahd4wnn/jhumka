import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { get, patch, type Collection, type Product } from '../api';
import { inr } from '../format';
import { Button, Empty, ErrorBox, Input, Loading, PageHeader, Select, Toggle, td, th, useToast } from '../ui';
import { mediaUrl } from '@/lib/media';

export function Products() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<{ products: Product[] }>('/products') });
  const cols = useQuery({ queryKey: ['collections'], queryFn: () => get<{ collections: Collection[] }>('/collections') });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const quick = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => patch(`/products/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => toast(e.message),
  });

  const colName = new Map(cols.data?.collections.map((c) => [c.id, c.name]));
  const rows = (q.data?.products ?? []).filter((p) => {
    if (search && !`${p.name} ${p.sku ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'live') return p.isPublished;
    if (filter === 'draft') return !p.isPublished;
    if (filter === 'low') return p.stockQty != null && p.stockQty <= 3;
    return true;
  });

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={q.data ? `${q.data.products.length} pieces · ${q.data.products.filter((p) => p.isPublished).length} live` : undefined}
        actions={
          <Button onClick={() => nav('/products/new')}>
            <Plus className="size-4" /> New product
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <Input type="search" placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-72" aria-label="Search products" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto" aria-label="Filter">
          <option value="all">All pieces</option>
          <option value="live">Live</option>
          <option value="draft">Drafts</option>
          <option value="low">Low stock</option>
        </Select>
      </div>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <Empty title="No pieces here">Create your first product and it appears in the shop as soon as it's live.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-purple-200">
              <tr>
                <th className={th}>Piece</th>
                <th className={th}>Collection</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Stock</th>
                <th className={th}>Featured</th>
                <th className={th}>Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-100">
              {rows.map((p) => {
                const img = p.images[0]?.path;
                return (
                  <tr key={p.id} className="hover:bg-purple-25">
                    <td className={td}>
                      <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                        <span className="mesh mesh--velvet relative h-14 w-11 shrink-0 overflow-hidden">
                          {img && !img.startsWith('local:') && <img src={mediaUrl(img, 480, 'webp')} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                        </span>
                        <span>
                          <span className="font-medium hover:underline">{p.name}</span>
                          <span className="block text-xs opacity-80">{p.images.length ? `${p.images.length} photo${p.images.length > 1 ? 's' : ''}` : 'No photos yet'}{p.sku && ` · ${p.sku}`}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={td}>{p.collectionId ? colName.get(p.collectionId) : '—'}</td>
                    <td className={`${td} text-right tabular-nums`}>{inr(p.pricePaise)}</td>
                    <td className={`${td} text-right tabular-nums`}>{p.stockQty == null ? '∞' : p.stockQty === 0 ? 'Sold out' : p.stockQty}</td>
                    <td className={td}>
                      <Toggle checked={p.isFeatured} onChange={(v) => quick.mutate({ id: p.id, isFeatured: v })} label={<span className="sr-only">Featured</span>} />
                    </td>
                    <td className={td}>
                      <Toggle checked={p.isPublished} onChange={(v) => quick.mutate({ id: p.id, isPublished: v })} label={<span className="sr-only">Live</span>} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
