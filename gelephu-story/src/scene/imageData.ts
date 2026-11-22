/** Fetches an image and returns its raw, un-premultiplied, colour-unmanaged pixels. */
export async function loadImageData(url: string): Promise<ImageData> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const { width, height } = bitmap;
  // OffscreenCanvas 2D is missing before Safari 16.4: fall back to a DOM canvas.
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      ctx = null;
    }
  }
  if (!ctx) {
    const dom = document.createElement('canvas');
    dom.width = width;
    dom.height = height;
    canvas = dom;
    ctx = dom.getContext('2d', { willReadFrequently: true });
  }
  if (!canvas || !ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}
