import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Eye, EyeOff, ExternalLink, MessageSquareReply, Star, Trash2 } from 'lucide-react';
import { mediaUrl } from '@/lib/media';
import { del, get, patch, type Review, type ReviewStatus } from '../api';
import { ago, dateTime } from '../format';
import { Button, cx, Empty, ErrorBox, Loading, Modal, PageHeader, Textarea, useToast } from '../ui';

interface ReviewList {
  reviews: Review[];
  hasMore: boolean;
  counts: Record<ReviewStatus, number>;
  average: number | null;
}

const TABS: { key: ReviewStatus; label: string }[] = [
  { key: 'pending', label: 'Waiting' },
  { key: 'published', label: 'Published' },
  { key: 'hidden', label: 'Hidden' },
];

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cx('inline-flex gap-0.5', className)} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cx('size-3.5', n <= rating ? 'fill-purple text-purple' : 'fill-purple-100 text-purple-100')} aria-hidden="true" />
      ))}
    </span>
  );
}

export function Reviews() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as ReviewStatus) || 'pending';
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['reviews', status, page], queryFn: () => get<ReviewList>(`/reviews?status=${status}&page=${page}`) });
  const counts = q.data?.counts;

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle={
          counts
            ? `${counts.published} published${q.data?.average != null ? ` · average ${q.data.average.toFixed(1)} ★` : ''}${counts.pending ? ` · ${counts.pending} waiting for you` : ''}`
            : 'What customers say about their pieces.'
        }
      />
      <div className="mb-6 flex flex-wrap gap-1.5" role="tablist" aria-label="Review status">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => (setPage(1), setParams({ status: t.key }))}
            className={cx('h-9 border px-3 text-sm transition-colors', status === t.key ? 'border-purple bg-purple text-white' : 'border-purple-200 hover:border-purple')}
          >
            {t.label}
            {counts && <span className="ml-1.5 tabular-nums opacity-80">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !q.data?.reviews.length ? (
        <Empty title={status === 'pending' ? 'All caught up' : status === 'published' ? 'No published reviews yet' : 'Nothing hidden'}>
          {status === 'pending'
            ? 'Customers can review their pieces from their order page once the order has shipped. New reviews wait here for you.'
            : status === 'published'
              ? 'Published reviews appear on the piece’s page and add star ratings to the shop.'
              : 'Reviews you hide stay here, off the site. You can publish them again any time.'}
        </Empty>
      ) : (
        <>
          <div className="grid gap-3">
            {q.data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
          {(page > 1 || q.data.hasMore) && (
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <Button variant="outline" size="sm" disabled={!q.data.hasMore} onClick={() => setPage((p) => p + 1)}>
                Older
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ReviewCard({ review: r }: { review: Review }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.reply ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reviews'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const update = useMutation({
    mutationFn: (body: { status?: ReviewStatus; reply?: string | null }) => patch<{ review: Review }>(`/reviews/${r.id}`, body),
    onSuccess: (_, body) => {
      refresh();
      if (body.status) toast(body.status === 'published' ? 'Review published' : body.status === 'hidden' ? 'Review hidden from the site' : 'Moved back to waiting');
      else {
        toast(body.reply ? 'Reply saved' : 'Reply removed');
        setReplying(false);
      }
    },
    onError: (e) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: () => del(`/reviews/${r.id}`),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      toast('Review deleted');
    },
    onError: (e) => toast(e.message),
  });

  return (
    <article className="grid gap-5 border border-purple-100 p-5 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars rating={r.rating} />
          <span className="text-xs">{ago(r.createdAt)}</span>
          {r.status === 'published' && <span className="caps bg-purple-100 px-2 py-0.5 !text-[0.55rem]">On the site</span>}
          {r.status === 'hidden' && <span className="caps border border-dashed border-purple-200 px-2 py-0.5 !text-[0.55rem]">Hidden</span>}
        </div>
        {r.title && <h2 className="display mt-3 text-2xl leading-tight">{r.title}</h2>}
        <p className="mt-2 max-w-3xl text-sm leading-relaxed whitespace-pre-line">{r.body}</p>

        {r.images.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {r.images.map((im, i) => (
              <li key={im.path}>
                <a href={mediaUrl(im.path, 1600, 'webp')} target="_blank" rel="noopener" className="block size-20 overflow-hidden bg-purple-50" aria-label={`Open photo ${i + 1} full size`}>
                  <img src={mediaUrl(im.path, 480, 'webp')} alt="" className="size-full object-cover" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs">
          <strong className="font-medium">{r.authorName}</strong>
          {r.customerId && r.customerName && (
            <>
              {' '}
              ·{' '}
              <Link to={`/customers/${r.customerId}`} className="underline underline-offset-2">
                {r.customerName}
              </Link>
            </>
          )}
          {' · '}
          <a href={`/products/${r.product.slug}/#reviews`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline underline-offset-2">
            {r.product.name} <ExternalLink className="size-3" />
          </a>
          {r.orderNumber && (
            <>
              {' · '}
              <Link to={`/orders/${r.orderNumber}`} className="underline underline-offset-2">
                {r.orderNumber}
              </Link>
            </>
          )}
          {' · '}
          {dateTime(r.createdAt)}
        </p>

        {r.reply && !replying && (
          <div className="mt-4 border-l border-purple-300 pl-4 text-sm">
            <p className="caps !text-[0.55rem]">Your public reply · {ago(r.repliedAt)}</p>
            <p className="mt-1 whitespace-pre-line">{r.reply}</p>
          </div>
        )}
        {replying && (
          <div className="mt-4 grid max-w-2xl gap-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="Thank the customer or answer their question. Your reply is shown under the review." autoFocus />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => update.mutate({ reply: reply.trim() || null })} disabled={update.isPending}>
                Save reply
              </Button>
              {r.reply && (
                <Button size="sm" variant="outline" onClick={() => update.mutate({ reply: null })} disabled={update.isPending}>
                  Remove reply
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => (setReplying(false), setReply(r.reply ?? ''))}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap content-start gap-2 lg:w-44 lg:flex-col">
        {r.status !== 'published' && (
          <Button size="sm" onClick={() => update.mutate({ status: 'published' })} disabled={update.isPending}>
            <Eye className="size-3.5" /> Publish
          </Button>
        )}
        {r.status !== 'hidden' && (
          <Button size="sm" variant="outline" onClick={() => update.mutate({ status: 'hidden' })} disabled={update.isPending}>
            <EyeOff className="size-3.5" /> Hide
          </Button>
        )}
        {!replying && (
          <Button size="sm" variant="outline" onClick={() => setReplying(true)}>
            <MessageSquareReply className="size-3.5" /> {r.reply ? 'Edit reply' : 'Reply'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete review?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button onClick={() => remove.mutate()} disabled={remove.isPending}>
              Delete for good
            </Button>
          </>
        }
      >
        <p className="text-sm">
          This removes {r.authorName}’s review{r.images.length ? ` and its ${r.images.length} photo${r.images.length === 1 ? '' : 's'}` : ''} permanently. To take it off the site but keep it, use
          Hide instead.
        </p>
      </Modal>
    </article>
  );
}
