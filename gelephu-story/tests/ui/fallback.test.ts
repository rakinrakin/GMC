// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CONFIG, ACCURACY_NOTE } from '../../src/config';
import { webglAvailable, showFallback } from '../../src/ui/fallback';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('webglAvailable', () => {
  it('is false when context creation returns null', () => {
    (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function () {};
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(webglAvailable()).toBe(false);
  });
  it('is false when WebGLRenderingContext is missing', () => {
    delete (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext;
    expect(webglAvailable()).toBe(false);
  });
  it('is true when a context is created', () => {
    (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function () {};
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    expect(webglAvailable()).toBe(true);
  });
  it('is false when getContext throws', () => {
    (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function () {};
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('no'); });
    expect(webglAvailable()).toBe(false);
  });
});

describe('showFallback', () => {
  it('renders the frame-3 image, one <li> per zone and the accuracy note', () => {
    const el = showFallback(document.body);
    const img = el.querySelector('img')!;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toMatch(/fallback\.webp$/);
    expect(img.getAttribute('alt')).toBeTruthy();
    const items = Array.from(el.querySelectorAll('li')).map((li) => li.textContent);
    expect(items).toHaveLength(CONFIG.zones.length);
    expect(items).toEqual(CONFIG.zones.map((z) => z.name));
    expect(el.textContent).toContain(ACCURACY_NOTE);
  });
  it('is idempotent: a second call returns the same element', () => {
    const a = showFallback(document.body);
    const b = showFallback(document.body);
    expect(a).toBe(b);
    expect(document.querySelectorAll('.gmc-fallback')).toHaveLength(1);
  });
});
