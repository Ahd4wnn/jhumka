/**
 * Review form on the order page: star picker, photo picker (shrunk in the browser so uploads are
 * quick on mobile data), and multipart submit to /api/reviews.
 */
const WORDS = ['Tap a star', 'Not for me', 'Could be better', 'It’s nice', 'Really like it', 'Love it'];
const MAX_BYTES = 12 * 1024 * 1024;

interface Picked {
  blob: Blob;
  url: string;
  name: string;
}

/** Downscale to 2000 px JPEG; keeps the original when it can't be decoded or is already smaller. */
async function shrink(file: File): Promise<{ blob: Blob; name: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
    if (blob && blob.size < file.size) return { blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg` };
  } catch {
    /* the server will decode it */
  }
  return { blob: file, name: file.name };
}

export function initReviewForm() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-review-dialog]');
  const root = document.querySelector<HTMLElement>('[data-order]');
  if (!dialog || !root || dialog.dataset.ready) return;
  dialog.dataset.ready = '1';

  const form = dialog.querySelector<HTMLFormElement>('[data-review-form]')!;
  const thanks = dialog.querySelector<HTMLElement>('[data-review-thanks]')!;
  const title = dialog.querySelector<HTMLElement>('[data-review-product]')!;
  const error = form.querySelector<HTMLElement>('[data-review-error]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-review-submit]')!;
  const stars = [...form.querySelectorAll<HTMLElement>('[data-star]')];
  const word = form.querySelector<HTMLElement>('[data-rating-word]')!;
  const list = form.querySelector<HTMLElement>('[data-photo-list]')!;
  const addTile = form.querySelector<HTMLElement>('[data-photo-add]')!;
  const input = form.querySelector<HTMLInputElement>('[data-photo-input]')!;
  const max = Number(dialog.dataset.maxPhotos) || 4;
  let photos: Picked[] = [];
  let opener: HTMLElement | null = null;

  const showError = (msg: string) => {
    error.textContent = msg;
    error.hidden = !msg;
  };

  /* Stars */
  const rating = () => Number(form.querySelector<HTMLInputElement>('input[name="rating"]:checked')?.value ?? 0);
  const paint = (n: number) => stars.forEach((s, i) => s.toggleAttribute('data-on', i < n));
  stars.forEach((s, i) => {
    s.addEventListener('pointerenter', () => paint(i + 1));
    s.addEventListener('pointerleave', () => paint(rating()));
  });
  form.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name !== 'rating') return;
    paint(rating());
    word.textContent = WORDS[rating()];
  });

  /* Photos */
  const renderPhotos = () => {
    list.querySelectorAll('[data-photo]').forEach((li) => li.remove());
    photos.forEach((p, i) => {
      const li = document.createElement('li');
      li.dataset.photo = '';
      li.className = 'relative size-20 overflow-hidden rounded-[10px] sm:size-24';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = `Photo ${i + 1}`;
      img.className = 'size-full object-cover';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'absolute top-1 right-1 grid size-7 place-items-center bg-white text-xs';
      remove.setAttribute('aria-label', `Remove photo ${i + 1}`);
      remove.textContent = '✕';
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(p.url);
        photos.splice(i, 1);
        renderPhotos();
      });
      li.append(img, remove);
      list.insertBefore(li, addTile);
    });
    addTile.hidden = photos.length >= max;
  };

  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    showError(files.length > max - photos.length ? `You can add up to ${max} photos.` : '');
    for (const file of files.slice(0, max - photos.length)) {
      const { blob, name } = await shrink(file);
      if (blob.size > MAX_BYTES) {
        showError('That photo is too large. Please choose one under 12 MB.');
        continue;
      }
      photos.push({ blob, name, url: URL.createObjectURL(blob) });
    }
    renderPhotos();
  });

  /* Open / close */
  const open = (btn: HTMLElement) => {
    opener = btn;
    form.reset();
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderPhotos();
    paint(0);
    word.textContent = WORDS[0];
    showError('');
    form.hidden = false;
    thanks.hidden = true;
    (form.elements.namedItem('productId') as HTMLInputElement).value = btn.dataset.productId ?? '';
    title.textContent = btn.dataset.productName ?? '';
    dialog.showModal();
  };
  root.querySelectorAll<HTMLElement>('[data-review-open]').forEach((b) => b.addEventListener('click', () => open(b)));
  dialog.querySelectorAll('[data-review-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));

  /* Submit */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (!rating()) return showError('Choose a star rating.');
    if (String(data.get('body') ?? '').trim().length < 10) return showError('Tell us a little more (at least 10 characters).');
    if (!String(data.get('authorName') ?? '').trim()) return showError('Add the name to show with your review.');
    data.set('number', root.dataset.number ?? '');
    data.set('token', root.dataset.token ?? '');
    photos.forEach((p) => data.append('photos', p.blob, p.name));

    showError('');
    submit.disabled = true;
    submit.textContent = 'Posting…';
    try {
      const res = await fetch('/api/reviews', { method: 'POST', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
      form.hidden = true;
      thanks.hidden = false;
      const done = document.createElement('p');
      done.className = 'mt-3 text-xs opacity-80';
      done.textContent = body.review?.status === 'published' ? 'Your review is live' : 'Review sent · thank you';
      opener?.replaceWith(done);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Post review';
    }
  });

  // Came from "Write a review" on the product page: open the form for that piece.
  const auto = root.querySelector<HTMLElement>('[data-review-open][data-autoopen]');
  if (auto) open(auto);
}
