/**
 * Motion engine: Lenis smooth scrolling driven by GSAP's ticker, plus one effect — blocks fade
 * and rise as they enter. Built for Astro's ClientRouter: Lenis lives for the whole visit, while
 * each page's animations live in a gsap.context() that is reverted before the page is swapped.
 */
import { gsap } from 'gsap';
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
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Freeze the page behind open dialogs (menu / bag / search).
  new MutationObserver(() => {
    if (document.documentElement.classList.contains('is-locked')) lenis?.stop();
    else lenis?.start();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/* ───────── Per-page animations ───────── */
function reveals() {
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 92%',
    once: true,
    onEnter: (els) =>
      gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.06, overwrite: true, onComplete: () => els.forEach((e) => e.classList.add('is-in')) }),
  });
}

let ctx: gsap.Context | null = null;

function setupPage() {
  if (reduceMotion) {
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
    return;
  }
  ctx = gsap.context(() => {
    reveals();
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
