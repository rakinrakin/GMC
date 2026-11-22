// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../../src/config';
import { createScroll, opacityCurves, approach } from '../../src/story/scroll';
import { createOverlays } from '../../src/story/overlays';

describe('opacityCurves', () => {
  it('t = 0: deck solid, no break-up, title caption', () => {
    expect(opacityCurves(0)).toEqual({ deck: 1, breakup: 0, caption: 1 });
  });
  it('t = 0.4: deck fading, break-up fading in, descending caption', () => {
    const c = opacityCurves(0.4);
    expect(c.deck).toBeCloseTo(0.4, 5);
    expect(c.breakup).toBeCloseTo(2 / 3, 5);
    expect(c.caption).toBe(2);
  });
  it('t = 0.9: clear sky, map label', () => {
    expect(opacityCurves(0.9)).toEqual({ deck: 0, breakup: 0, caption: 3 });
  });
  it('break-up holds at 1 between 0.45 and 0.7, captions blank in the gaps', () => {
    expect(opacityCurves(0.6).breakup).toBe(1);
    expect(opacityCurves(0.2).caption).toBe(0);
    expect(opacityCurves(0.65).caption).toBe(0);
    expect(opacityCurves(0.25).deck).toBe(1);
    expect(opacityCurves(0.5).deck).toBe(0);
  });
});

describe('approach', () => {
  it('moves toward the target and snaps when close', () => {
    const v = approach(0, 1, 16, 100);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    expect(approach(0.99995, 1, 16, 100)).toBe(1);
  });
});

/** jsdom has no layout or scrolling: mock window.scrollY / scrollTo and fire scroll events. */
function mockWindow(vh = 800) {
  let y = 0;
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: vh });
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  const scrollTo = vi.fn((a: number | ScrollToOptions, b?: number) => {
    y = typeof a === 'number' ? (b ?? 0) : (a.top ?? y);
    window.dispatchEvent(new Event('scroll'));
  });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  return {
    scrollTo,
    /** Simulates a user scroll (no scrollTo call). */
    userScroll(to: number) {
      y = to;
      window.dispatchEvent(new Event('scroll'));
    },
    get y() { return y; },
  };
}

function wheel(deltaY: number) {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true }));
}

describe('createScroll', () => {
  let trackEl: HTMLElement;
  let clock = 0;
  const now = () => clock;
  beforeEach(() => {
    trackEl = document.createElement('div');
    document.body.appendChild(trackEl);
    document.body.style.overflow = '';
    clock = 1000;
  });
  afterEach(() => {
    trackEl.remove();
  });

  function setup(selected = 0) {
    const win = mockWindow(800);
    const onT = vi.fn();
    const onEnd = vi.fn();
    const onLeaveEnd = vi.fn();
    let current = selected;
    const selection = {
      deselect: vi.fn(() => { current = 0; }),
      current: () => current,
    };
    const scroll = createScroll({ trackEl, onT, onEnd, onLeaveEnd, selection, now, reducedMotion: false });
    const max = 800 * CONFIG.scrollVh - 800;
    return { win, onT, onEnd, onLeaveEnd, selection, scroll, max, select: (id: number) => { current = id; } };
  }

  it('sizes the track to scrollVh viewports and maps scroll position to t', () => {
    const { win, scroll, max, onT } = setup();
    expect(trackEl.style.height).toBe(`${800 * CONFIG.scrollVh}px`);
    win.userScroll(max / 2);
    expect(scroll.t()).toBeCloseTo(0.5, 5);
    expect(onT).toHaveBeenLastCalledWith(scroll.t());
    win.userScroll(-50);
    expect(scroll.t()).toBe(0);
    scroll.destroy();
  });

  it('scrolling to the bottom calls onEnd once and pins the page', () => {
    const { win, scroll, max, onEnd } = setup();
    win.userScroll(max * 0.8);
    win.userScroll(max);
    win.userScroll(max);
    win.userScroll(max + 10);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(scroll.state()).toBe('pinned');
    expect(document.body.style.overflow).toBe('hidden');
    scroll.destroy();
    expect(document.body.style.overflow).toBe('');
  });

  it('a resize keeps t() within ±0.01', () => {
    const { win, scroll, max } = setup();
    win.userScroll(max * 0.37);
    const before = scroll.t();
    window.innerHeight = 600;
    window.dispatchEvent(new Event('resize'));
    expect(trackEl.style.height).toBe(`${600 * CONFIG.scrollVh}px`);
    expect(Math.abs(scroll.t() - before)).toBeLessThanOrEqual(0.01);
    expect(win.y).toBeCloseTo(0.37 * (600 * CONFIG.scrollVh - 600), 0);
    scroll.destroy();
  });

  it('upward wheel while a zone is selected deselects and stays pinned; the next one unpins', () => {
    const { win, scroll, max, selection, onLeaveEnd } = setup(5);
    win.userScroll(max);
    expect(scroll.state()).toBe('pinned');

    wheel(-40);
    expect(selection.deselect).toHaveBeenCalledTimes(1);
    expect(scroll.state()).toBe('pinned');
    expect(document.body.style.overflow).toBe('hidden');

    // Same gesture (trackpad momentum) is swallowed.
    clock += 50;
    wheel(-40);
    expect(scroll.state()).toBe('pinned');

    clock += 1000;
    wheel(-40);
    expect(scroll.state()).toBe('scrolling');
    expect(document.body.style.overflow).toBe('');
    expect(onLeaveEnd).toHaveBeenCalledTimes(1);
    expect(scroll.t()).toBeLessThan(1);
    scroll.destroy();
  });

  it('downward wheel while pinned does nothing; upward with nothing selected unpins at once', () => {
    const { win, scroll, max, selection } = setup(0);
    win.userScroll(max);
    wheel(40);
    expect(scroll.state()).toBe('pinned');
    wheel(-40);
    expect(selection.deselect).not.toHaveBeenCalled();
    expect(scroll.state()).toBe('scrolling');
    scroll.destroy();
  });

  it('onEnd re-arms after unpinning', () => {
    const { win, scroll, max, onEnd } = setup(0);
    win.userScroll(max);
    wheel(-40);
    expect(scroll.state()).toBe('scrolling');
    win.userScroll(max * 0.5);
    win.userScroll(max);
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(scroll.state()).toBe('pinned');
    scroll.destroy();
  });

  it('scrollToStart does not re-pin on a scroll event still at the end (smooth scroll start)', () => {
    const { win, scroll, max, onEnd } = setup(0);
    win.userScroll(max);
    win.scrollTo.mockImplementationOnce(() => {});
    scroll.scrollToStart();
    win.userScroll(max);
    expect(scroll.state()).toBe('scrolling');
    expect(onEnd).toHaveBeenCalledTimes(1);
    scroll.destroy();
  });

  it('scrollToStart deselects, unpins and scrolls to 0', () => {
    const { win, scroll, max, selection, onLeaveEnd } = setup(3);
    win.userScroll(max);
    scroll.scrollToStart();
    expect(selection.deselect).toHaveBeenCalledTimes(1);
    expect(scroll.state()).toBe('scrolling');
    expect(document.body.style.overflow).toBe('');
    expect(onLeaveEnd).toHaveBeenCalledTimes(1);
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    expect(scroll.t()).toBe(0);
    scroll.destroy();
  });
});

describe('createOverlays', () => {
  it('shows one caption at a time and the back-to-top button only when pinned', () => {
    const root = document.createElement('div');
    const onBackToTop = vi.fn();
    const o = createOverlays(root, { onBackToTop });
    const title = root.querySelector<HTMLElement>('[data-caption="1"]')!;
    const desc = root.querySelector<HTMLElement>('[data-caption="2"]')!;
    const label = root.querySelector<HTMLElement>('[data-caption="3"]')!;
    expect(title.textContent).toContain('Gelephu Mindfulness City');
    expect(title.textContent).toContain('Scroll to descend');
    expect(desc.textContent).toBe('Descending into Gelephu');
    expect(label.textContent).toBe('Gelephu Mindfulness City');

    o.setCaption(2);
    expect(desc.classList.contains('is-on')).toBe(true);
    expect(title.classList.contains('is-on')).toBe(false);

    const btn = root.querySelector<HTMLButtonElement>('button')!;
    expect(btn.textContent).toBe('Back to top');
    expect(btn.classList.contains('is-on')).toBe(false);
    expect(btn.tabIndex).toBe(-1);
    o.setPinned(true);
    expect(btn.classList.contains('is-on')).toBe(true);
    expect(btn.tabIndex).toBe(0);
    btn.click();
    expect(onBackToTop).toHaveBeenCalledTimes(1);
    o.destroy();
    expect(root.children.length).toBe(0);
  });
});
