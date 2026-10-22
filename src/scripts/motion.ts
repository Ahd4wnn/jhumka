/**
 * Motion engine. Lenis smooth scrolling on GSAP's ticker; GSAP for the first-visit intro timeline and
 * everything tied to scroll (word-by-word headings, photo reveals, parallax, the hero frame opening);
 * Motion springs for the hero's own entrance. Built for Astro's ClientRouter: Lenis lives for the
 * whole visit, each page's animations live in a gsap.context() reverted before the page is swapped.
 */
import { gsap } from 'gsap';
import { animate, stagger, type AnimationPlaybackControls } from 'motion';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Anchors and page changes stop below the sticky header. */
const headerOffset = () => {
  const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 4;
  return -(px * 16 + 16);
};

/* ───────── Lenis (once per visit) ───────── */
let lenis: Lenis | null = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, anchors: { offset: headerOffset() } });
  lenis.on('scroll', ScrollTrigger.update);
  if (document.documentElement.classList.contains('intro')) lenis.stop();
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Freeze the page behind open dialogs (menu / bag / search) and the intro.
  new MutationObserver(() => {
    const html = document.documentElement;
    if (html.classList.contains('is-locked') || html.classList.contains('intro')) lenis?.stop();
    else lenis?.start();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Wraps each word of an element's text (nested markup such as the italic accent is kept) so it can
 * animate: 'chars' → letters (.sc) inside unbreakable words; 'words' → each word in its own mask.
 * Screen readers get the original text through aria-label on `label` (a heading; a bare span can't
 * carry one). Safe to call twice.
 */
function splitText(el: HTMLElement, mode: 'chars' | 'words', label: HTMLElement = el): HTMLElement[] {
  const sel = mode === 'chars' ? '.sc' : '.sm > span';
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>(sel)];
  el.dataset.split = mode;
  if (!label.hasAttribute('aria-label')) label.setAttribute('aria-label', label.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(' ');
        continue;
      }
      const word = document.createElement('span');
      word.className = mode === 'chars' ? 'sw' : 'sm';
      word.setAttribute('aria-hidden', 'true');
      if (mode === 'chars') {
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'sc';
          c.textContent = ch;
          word.append(c);
        }
      } else {
        const inner = document.createElement('span');
        inner.textContent = part;
        word.append(inner);
      }
      frag.append(word);
    }
    node.replaceWith(frag);
  }
  return [...el.querySelectorAll<HTMLElement>(sel)];
}

/* ───────── Scroll reveals (every page) ───────── */
function reveals() {
  // Blocks fade and rise.
  ScrollTrigger.batch('[data-reveal]:not(.section-title)', {
    start: 'top 92%',
    once: true,
    onEnter: (els) =>
      gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true, onComplete: () => els.forEach((e) => e.classList.add('is-in')) }),
  });

  // Section headings rise word by word through their own masks.
  document.querySelectorAll<HTMLElement>('.section-title').forEach((title) => {
    const words = splitText(title, 'words');
    gsap.set(title, { autoAlpha: 1, y: 0 });
    title.classList.add('is-in');
    gsap.set(words, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: title,
      start: 'top 90%',
      once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06 }),
    });
  });

  // Photos unveil from the bottom while easing out of a zoom.
  ScrollTrigger.batch('[data-reveal-media]', {
    start: 'top 92%',
    once: true,
    onEnter: (els) => {
      const imgs = els.flatMap((el) => [...el.querySelectorAll<HTMLElement>('img:not([data-parallax])')]);
      gsap.set(imgs, { transition: 'none' });
      gsap.fromTo(imgs, { scale: 1.3 }, { scale: 1, duration: 1.6, ease: 'expo.out', stagger: 0.08, clearProps: 'transform,transition' });
      gsap.fromTo(
        els,
        { clipPath: 'inset(100% 0% 0% 0% round 14px)' },
        { clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 1.25, ease: 'expo.out', stagger: 0.08, clearProps: 'clipPath', onComplete: () => els.forEach((e) => e.classList.add('is-in')) },
      );
    },
  });

  // A gentle drift for photos marked data-parallax (they are scaled up so the edges never show).
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -7, scale: 1.16 }, { yPercent: 7, scale: 1.16, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ───────── Home hero (Banner.astro) ───────── */
function hero() {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (!root) return;
  const html = document.documentElement;
  const frame = root.querySelector<HTMLElement>('[data-hero-frame]')!;
  const photo = root.querySelector<HTMLElement>('[data-hero-photo]')!;
  const running: AnimationPlaybackControls[] = [];
  const run = (a: AnimationPlaybackControls) => (running.push(a), a);

  // The headline rises letter by letter; set the hidden state in the same frame as the split.
  const chars = [...root.querySelectorAll<HTMLElement>('.hero-line > span')].flatMap((line) => {
    const cs = splitText(line, 'chars', root.querySelector('h1') ?? line);
    line.style.transform = 'none';
    cs.forEach((c) => (c.style.transform = 'translateY(115%) rotate(6deg)'));
    return cs;
  });
  const entrance = (delay: number, settle: number) => {
    run(animate(photo, { scale: [settle, 1] }, { type: 'spring', bounce: 0, visualDuration: 1.4, delay }));
    Promise.all([
      run(animate(chars, { y: ['115%', '0%'], rotate: [6, 0] }, { type: 'spring', bounce: 0.15, visualDuration: 0.9, delay: stagger(0.028, { startDelay: delay + 0.15 }) })).finished,
      run(animate(root.querySelectorAll('[data-hero-fade]'), { opacity: [0, 1], y: [16, 0] }, { type: 'spring', bounce: 0, visualDuration: 0.7, delay: stagger(0.07, { startDelay: delay + 0.3 }) })).finished,
    ]).then(() => root.classList.add('is-in'));
  };

  if (html.classList.contains('intro')) intro(root, frame, () => entrance(0, 1.25));
  else entrance(0, 1.08);

  // On scroll the frame opens to full-bleed while the copy above eases up and fades.
  gsap.fromTo(frame, { '--hero-p': 0 }, { '--hero-p': 1, ease: 'none', scrollTrigger: { trigger: frame, start: 'clamp(top 85%)', end: 'clamp(top 15%)', scrub: true } });
  gsap.to(root.querySelector('[data-hero-copy]'), { yPercent: -18, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'center top', scrub: true } });
  return () => running.forEach((a) => a.stop());
}

/**
 * First visit per tab: velvet, "jhumka" rising letter by letter, a glint of light across the letters,
 * then — once fonts and the hero photo are ready (at least ~2 s, at most ~2.5 s) — the curtain lifts
 * with a curved hem and the hero settles underneath. Click skips.
 */
function intro(root: HTMLElement, frame: HTMLElement, reveal: () => void) {
  const html = document.documentElement;
  const veil = root.querySelector<HTMLElement>('[data-veil]')!;
  const letters = veil.querySelectorAll('[data-veil-word] .veil__ch > span');
  const seconds = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
  const img = root.querySelector<HTMLImageElement>('[data-hero-photo] img');
  const loaded = Promise.race([Promise.all([document.fonts.ready, img?.decode().catch(() => {})]), seconds(2.4)]);

  const tl = gsap.timeline();
  tl.to(veil.querySelector('.veil__glow'), { opacity: 1, x: '35vmax', y: '18vmax', duration: 3.2, ease: 'sine.inOut' }, 0)
    .to(letters, { y: 0, duration: 1.0, ease: 'expo.out', stagger: 0.06 }, 0.1)
    .to(veil.querySelector('[data-veil-tag]'), { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.6)
    .fromTo(veil.querySelector('[data-veil-sheen]'), { maskPosition: '100% 0%', webkitMaskPosition: '100% 0%' }, { maskPosition: '0% 0%', webkitMaskPosition: '0% 0%', duration: 1.1, ease: 'power2.inOut' }, 0.75);

  let leaving = false;
  const leave = () => {
    if (leaving) return;
    leaving = true;
    try {
      sessionStorage.setItem('jh:intro', '1');
    } catch {}
    gsap
      .timeline()
      .to(letters, { yPercent: -115, duration: 0.55, ease: 'power3.in', stagger: 0.03 }, 0.1)
      .to(veil.querySelectorAll('[data-veil-tag], [data-veil-sheen]'), { opacity: 0, duration: 0.3 }, 0.1)
      .fromTo(veil, { clipPath: 'inset(0% 0% 0% 0% round 0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0% round 0% 0% 50% 50%)', duration: 1.0, ease: 'expo.inOut' }, 0.35)
      .add(reveal, 0.55)
      .to(frame, { '--hero-veil': 0, duration: 1.3, ease: 'expo.out' }, 0.6)
      // Scrolling comes back as soon as the curtain is gone.
      .call(() => html.classList.remove('intro'), [], 1.35);
  };
  Promise.all([loaded, seconds(2.1)]).then(leave);
  veil.addEventListener('pointerdown', leave, { once: true });
}

let ctx: gsap.Context | null = null;

function setupPage() {
  if (reduceMotion) {
    document.querySelectorAll('[data-reveal], [data-reveal-media]').forEach((el) => el.classList.add('is-in'));
    document.querySelector('[data-hero]')?.classList.add('is-in');
    return;
  }
  ctx = gsap.context(() => {
    reveals();
    return hero();
  });
  lenis?.resize();
  ScrollTrigger.refresh();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

document.addEventListener('astro:page-load', setupPage);
document.addEventListener('astro:before-swap', () => {
  ctx?.revert();
  ctx = null;
});
document.addEventListener('astro:after-swap', () => {
  // New page: start at the top (or its #anchor) without a smooth scroll from the old position.
  const hash = location.hash && document.querySelector(location.hash);
  if (hash) lenis?.scrollTo(hash as HTMLElement, { immediate: true, offset: headerOffset() });
  else lenis?.scrollTo(0, { immediate: true });
});
