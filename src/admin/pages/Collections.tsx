import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ApiError, del, get, post, put, uploadPhoto, type Collection } from '../api';
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Textarea, Toggle, useToast } from '../ui';
import { slugify } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

type Draft = Omit<Collection, 'id' | 'productCount'> & { id?: string };
const EMPTY: Draft = { name: '', slug: '', tagline: '', description: '', coverPath: null, sortOrder: 0, isPublished: true };

export function Collections() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['collections'], queryFn: () => get<{ collections: Collection[] }>('/collections') });
  const [edit, setEdit] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const { id, ...body } = d;
      return id ? put(`/collections/${id}`, body) : post('/collections', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      setEdit(null);
      toast('Collection saved');
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fields);
      toast(e.message);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/collections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      setEdit(null);
    },
  });

  return (
    <>
      <PageHeader
        title="Collections"
        actions={
          <Button onClick={() => (setErrors({}), setEdit({ ...EMPTY, sortOrder: (q.data?.collections.length ?? 0) + 1 }))}>
            <Plus className="size-4" /> New collection
          </Button>
        }
      />
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : !q.data?.collections.length ? (
        <Empty title="No collections yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {q.data.collections.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => (setErrors({}), setEdit(c))} className="block w-full border border-purple-100 p-3 text-left hover:border-purple">
                <div className="mesh mesh--velvet arch relative aspect-[3/4] overflow-hidden">
                  {c.coverPath && <img src={mediaUrl(c.coverPath, 480, 'webp')} alt="" className="absolute inset-0 size-full object-cover" />}
                </div>
                <p className="display mt-3 text-2xl">{c.name}</p>
                <p className="text-xs">
                  {c.productCount ?? 0} pieces · {c.isPublished ? 'Live' : 'Hidden'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit collection' : 'New collection'}
        footer={
          <>
            {edit?.id && (
              <Button variant="ghost" className="mr-auto" onClick={() => confirm(`Delete “${edit.name}”? Its pieces stay in the shop without a collection.`) && remove.mutate(edit.id!)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button disabled={save.isPending || uploading} onClick={() => edit && save.mutate(edit)}>
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-4">
            <Field label="Name" error={errors.name}>
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} />
            </Field>
            <Field label="Web address" hint={`/collections/${edit.slug || '…'}/`} error={errors.slug}>
              <Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />
            </Field>
            <Field label="Tagline">
              <Input value={edit.tagline ?? ''} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="min-h-20" />
            </Field>
            <Field label="Cover photo" hint="Shown in the arched window on the homepage.">
              <div className="flex items-center gap-3">
                <div className="mesh mesh--velvet arch relative h-24 w-18 shrink-0 overflow-hidden">
                  {edit.coverPath && <img src={mediaUrl(edit.coverPath, 480, 'webp')} alt="" className="absolute inset-0 size-full object-cover" />}
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    try {
                      const { media } = await uploadPhoto(f, 'collections');
                      setEdit((d) => d && { ...d, coverPath: media.path });
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Upload failed');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>
            </Field>
            <div className="flex items-center justify-between gap-4">
              <Toggle checked={edit.isPublished} onChange={(v) => setEdit({ ...edit, isPublished: v })} label="Live in the shop" />
              <Field label="Order" className="w-24">
                <Input inputMode="numeric" value={String(edit.sortOrder)} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) || 0 })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
