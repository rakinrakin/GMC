// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { watchContextLoss, CONTEXT_RESTORE_MS } from '../../src/ui/contextLoss';

afterEach(() => vi.useRealTimers());

describe('watchContextLoss', () => {
  it('prevents default on loss and gives up after the grace period', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onGiveUp = vi.fn();
    watchContextLoss(canvas, onGiveUp);
    const e = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(CONTEXT_RESTORE_MS - 1);
    expect(onGiveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the context is restored in time', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onGiveUp = vi.fn();
    watchContextLoss(canvas, onGiveUp);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    vi.advanceTimersByTime(1000);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(10000);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('stop() removes the listeners and the pending timer', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onGiveUp = vi.fn();
    const stop = watchContextLoss(canvas, onGiveUp);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    stop();
    vi.advanceTimersByTime(10000);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});
