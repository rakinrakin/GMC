import { CONFIG } from '../config';

export type ScrollState = 'scrolling' | 'pinned';
/** 0 none, 1 title, 2 "Descending into Gelephu", 3 map label. */
export type CaptionId = 0 | 1 | 2 | 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 at a, 1 at b (linear, clamped). */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export function opacityCurves(t: number): { deck: number; breakup: number; caption: CaptionId } {
  const deck = 1 - ramp(t, 0.25, 0.5);
  const breakup = Math.min(ramp(t, 0.3, 0.45), 1 - ramp(t, 0.7, 0.85));
  const caption: CaptionId = t < 0.15 ? 1 : t >= 0.3 && t < 0.5 ? 2 : t >= 0.8 ? 3 : 0;
  return { deck, breakup, caption };
}

/** Frame-rate independent exponential approach (time constant tauMs); snaps within 1e-4. */
export function approach(current: number, target: number, dtMs: number, tauMs: number): number {
  const next = target + (current - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
  return Math.abs(next - target) < 1e-4 ? target : next;
}

export interface SelectionLike {
  deselect(): void;
  /** Selected zone id; 0 when nothing is selected. */
  current(): number;
}

export interface ScrollOptions {
  trackEl: HTMLElement;
  onT(t: number): void;
  onEnd(): void;
  onLeaveEnd(): void;
  selection: SelectionLike;
  reducedMotion?: boolean;
  /** Clock for wheel gesture grouping (tests). */
  now?: () => number;
}

export interface Scroll {
  t(): number;
  state(): ScrollState;
  scrollToStart(): void;
  destroy(): void;
}

/** Wheel events closer together than this belong to one gesture (trackpad momentum). */
const GESTURE_GAP_MS = 250;
/** Finger travel (px, downward = scroll up) that counts as an upward touch gesture. */
const TOUCH_THRESHOLD = 30;
/** How far up the page moves when an upward gesture unpins it. */
const UNPIN_NUDGE_PX = 80;
/** t at or above this counts as the end of the track. */
const END_T = 0.9995;

export function createScroll(opts: ScrollOptions): Scroll {
  const { trackEl, selection } = opts;
  const now = opts.now ?? (() => performance.now());
  const reduced = opts.reducedMotion ?? false;
  const body = document.body;

  let state: ScrollState = 'scrolling';
  let armed = true;
  let t = 0;
  let lastWheel = -Infinity;
  let gestureUsed = false;
  let touchY: number | null = null;
  let touchUsed = false;

  const trackHeight = () => window.innerHeight * CONFIG.scrollVh;
  const maxScroll = () => Math.max(1, trackHeight() - window.innerHeight);
  const readT = () => clamp01(window.scrollY / maxScroll());

  function layout() {
    trackEl.style.height = `${trackHeight()}px`;
  }

  function pin() {
    state = 'pinned';
    armed = false;
    body.style.overflow = 'hidden';
    opts.onEnd();
  }

  function unpin() {
    if (state !== 'pinned') return;
    state = 'scrolling';
    body.style.overflow = '';
    opts.onLeaveEnd();
  }

  function onScroll() {
    if (state === 'pinned') {
      // Hold at the track end.
      if (Math.abs(window.scrollY - maxScroll()) > 0.5) {
        window.scrollTo(0, maxScroll());
        return;
      }
      t = 1;
      return;
    }
    t = readT();
    opts.onT(t);
    if (t < END_T) armed = true;
    else if (armed) pin();
  }

  /** One upward gesture while pinned: deselect first, otherwise unpin. */
  function upwardGesture() {
    if (state !== 'pinned') return;
    if (selection.current() !== 0) {
      selection.deselect();
      return;
    }
    unpin();
    window.scrollTo(0, Math.max(0, maxScroll() - UNPIN_NUDGE_PX));
  }

  function onWheel(e: WheelEvent) {
    if (state !== 'pinned') return;
    const time = now();
    const fresh = time - lastWheel > GESTURE_GAP_MS;
    lastWheel = time;
    if (fresh) gestureUsed = false;
    if (e.deltaY >= 0 || gestureUsed) return;
    gestureUsed = true;
    upwardGesture();
  }

  function onTouchStart(e: TouchEvent) {
    touchY = e.touches[0]?.clientY ?? null;
    touchUsed = false;
  }
  function onTouchMove(e: TouchEvent) {
    if (state !== 'pinned' || touchY === null || touchUsed) return;
    const y = e.touches[0]?.clientY;
    if (y !== undefined && y - touchY > TOUCH_THRESHOLD) {
      touchUsed = true;
      upwardGesture();
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') upwardGesture();
  }

  function onResize() {
    const keep = state === 'pinned' ? 1 : t;
    layout();
    window.scrollTo(0, keep * maxScroll());
  }

  layout();
  t = readT();
  opts.onT(t);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  return {
    t: () => t,
    state: () => state,
    scrollToStart() {
      if (selection.current() !== 0) selection.deselect();
      unpin();
      armed = false; // re-arms once t drops below the end
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    },
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      body.style.overflow = '';
    },
  };
}
