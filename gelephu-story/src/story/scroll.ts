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

/** Caption to show: none while a zone is selected (the vision owns the sky), else the curve's. */
export function captionFor(t: number, selected: boolean): CaptionId {
  return selected ? 0 : opacityCurves(t).caption;
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
  /** Clock for wheel/key gesture grouping (tests). */
  now?: () => number;
  /** Scroll to this t on creation (dev ?t=); pins at once if it is the end. */
  initialT?: number;
  /**
   * Asked on each upward wheel event while pinned. false means the map used it (zooming out,
   * a pinch, a wheel over the zone panel); that whole gesture then neither deselects nor
   * unpins. Absent: always accepted.
   */
  acceptUpwardWheel?: () => boolean;
}

export interface Scroll {
  t(): number;
  state(): ScrollState;
  scrollToStart(): void;
  destroy(): void;
}

/** Wheel or key events closer together than this belong to one gesture (trackpad momentum). */
const GESTURE_GAP_MS = 250;
/** How far up the page moves when an upward gesture unpins it. */
const UNPIN_NUDGE_PX = 80;
/** t at or above this counts as the end of the track. */
const END_T = 0.9995;

export function createScroll(opts: ScrollOptions): Scroll {
  const { trackEl, selection } = opts;
  const now = opts.now ?? (() => performance.now());
  const reduced = opts.reducedMotion ?? false;
  const body = document.body;
  const html = document.documentElement;

  let state: ScrollState = 'scrolling';
  let armed = true;
  let t = 0;
  let lastMax = 0;
  const wheelGesture = { last: -Infinity, used: false };
  const keyGesture = { last: -Infinity, used: false };

  const trackHeight = () => window.innerHeight * CONFIG.scrollVh;
  const maxScroll = () => Math.max(1, trackHeight() - window.innerHeight);
  const readT = () => clamp01(window.scrollY / maxScroll());

  function layout() {
    trackEl.style.height = `${trackHeight()}px`;
    lastMax = maxScroll();
  }

  function setLocked(locked: boolean) {
    const v = locked ? 'none' : '';
    body.style.overflow = locked ? 'hidden' : '';
    html.style.overscrollBehavior = v;
    body.style.overscrollBehavior = v;
  }

  function pin() {
    state = 'pinned';
    armed = false;
    t = 1;
    setLocked(true);
    opts.onEnd();
  }

  function unpin() {
    if (state !== 'pinned') return;
    state = 'scrolling';
    setLocked(false);
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

  /** True for the first event of a gesture (events < GESTURE_GAP_MS apart are one gesture). */
  function claimGesture(g: { last: number; used: boolean }): boolean {
    const time = now();
    if (time - g.last > GESTURE_GAP_MS) g.used = false;
    g.last = time;
    if (g.used) return false;
    g.used = true;
    return true;
  }

  function onWheel(e: WheelEvent) {
    if (state !== 'pinned') return;
    if (e.deltaY >= 0) {
      wheelGesture.last = now();
      return;
    }
    if (opts.acceptUpwardWheel && !opts.acceptUpwardWheel()) {
      // The map consumed it: the rest of this gesture (momentum) belongs to the map too.
      wheelGesture.last = now();
      wheelGesture.used = true;
      return;
    }
    if (claimGesture(wheelGesture)) upwardGesture();
  }

  // No touch handling: touch input while pinned belongs to the map. On touch devices the ways
  // back are the Back to top button and the selection panel's own close control.

  function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT' || target.getAttribute('contenteditable') === 'true';
  }

  function onKey(e: KeyboardEvent) {
    if (state !== 'pinned') return;
    if (e.key !== 'ArrowUp' && e.key !== 'PageUp' && e.key !== 'Home') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isEditable(e.target)) return;
    if (e.repeat) {
      keyGesture.last = now();
      return;
    }
    if (claimGesture(keyGesture)) upwardGesture();
  }

  function onResize() {
    if (state === 'pinned') {
      layout(); // updates lastMax
      if (Math.abs(window.scrollY - lastMax) > 0.5) window.scrollTo(0, lastMax);
      return;
    }
    const keep = t;
    layout();
    window.scrollTo(0, keep * lastMax);
  }

  layout();
  if (opts.initialT !== undefined) window.scrollTo(0, clamp01(opts.initialT) * maxScroll());
  t = readT();
  opts.onT(t);
  if (t >= END_T) pin();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
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
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      setLocked(false);
    },
  };
}
