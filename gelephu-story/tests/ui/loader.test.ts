// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createLoader } from '../../src/ui/loader';

describe('createLoader', () => {
  it('shows a white panel with a progress line that follows setProgress (clamped, never backwards)', () => {
    const root = document.createElement('div');
    const l = createLoader(root);
    const panel = root.querySelector<HTMLElement>('.gmc-loader')!;
    const bar = root.querySelector<HTMLElement>('.gmc-loader-bar')!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('progressbar');
    l.setProgress(0.4);
    expect(bar.style.transform).toBe('scaleX(0.4)');
    l.setProgress(0.2);
    expect(bar.style.transform).toBe('scaleX(0.4)');
    l.setProgress(3);
    expect(bar.style.transform).toBe('scaleX(1)');
    expect(panel.getAttribute('aria-valuenow')).toBe('100');
  });

  it('hidePanel fades the panel but keeps the line; done removes the line too', () => {
    const root = document.createElement('div');
    const l = createLoader(root);
    const panel = root.querySelector<HTMLElement>('.gmc-loader')!;
    l.hidePanel();
    expect(panel.classList.contains('is-hidden')).toBe(true);
    expect(root.querySelector('.gmc-loader-line')!.classList.contains('is-hidden')).toBe(false);
    l.done();
    expect(root.querySelector('.gmc-loader-line')!.classList.contains('is-hidden')).toBe(true);
  });

  it('done before hidePanel (terrain before clouds) leaves the panel up', () => {
    const root = document.createElement('div');
    const l = createLoader(root);
    l.done();
    expect(root.querySelector('.gmc-loader')!.classList.contains('is-hidden')).toBe(false);
  });
});
