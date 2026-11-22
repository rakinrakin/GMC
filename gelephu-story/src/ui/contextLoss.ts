/** How long a lost WebGL context gets to come back before the static page takes over. */
export const CONTEXT_RESTORE_MS = 4000;

/**
 * Watches a canvas for WebGL context loss. The loss is cancelled (so the browser may restore the
 * context); if it is not restored within CONTEXT_RESTORE_MS, `onGiveUp` runs. Returns a stop function.
 */
export function watchContextLoss(canvas: HTMLCanvasElement, onGiveUp: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    clear();
    timer = setTimeout(() => {
      timer = null;
      onGiveUp();
    }, CONTEXT_RESTORE_MS);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', clear);
  return () => {
    clear();
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', clear);
  };
}
