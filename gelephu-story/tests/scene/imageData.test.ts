// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadImageData } from '../../src/scene/imageData';

const px = { width: 2, height: 1, data: new Uint8ClampedArray(8) } as unknown as ImageData;
const ctx2d = () => ({ drawImage: vi.fn(), getImageData: vi.fn(() => px) });

function stubCommon() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x']) })));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadImageData', () => {
  it('uses OffscreenCanvas when available', async () => {
    stubCommon();
    const ctx = ctx2d();
    vi.stubGlobal('OffscreenCanvas', class { width = 2; height = 1; getContext() { return ctx; } });
    const create = vi.spyOn(document, 'createElement');
    expect(await loadImageData('x.png')).toBe(px);
    expect(create).not.toHaveBeenCalledWith('canvas');
  });

  it('falls back to a DOM canvas when OffscreenCanvas is missing (Safari < 16.4)', async () => {
    stubCommon();
    vi.stubGlobal('OffscreenCanvas', undefined);
    const ctx = ctx2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    expect(await loadImageData('x.png')).toBe(px);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('falls back to a DOM canvas when the OffscreenCanvas 2d context is unavailable', async () => {
    stubCommon();
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return null; } });
    const ctx = ctx2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    expect(await loadImageData('x.png')).toBe(px);
  });

  it('rejects when no 2d context exists anywhere', async () => {
    stubCommon();
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(loadImageData('x.png')).rejects.toThrow();
  });
});
