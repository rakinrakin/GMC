import { describe, it, expect, vi } from 'vitest';
import { createHover } from '../../src/interact/hover';

function setup() {
  let active = true;
  const pick = vi.fn(() => 7);
  const show = vi.fn();
  const hover = createHover({ pick, show, active: () => active, intervalMs: 50 });
  return { hover, pick, show, setActive: (v: boolean) => { active = v; } };
}

describe('createHover', () => {
  it('picks the latest position at most every intervalMs', () => {
    const { hover, pick, show } = setup();
    hover.move(10, 20);
    hover.frame(100);
    expect(pick).toHaveBeenCalledWith(10, 20);
    expect(show).toHaveBeenLastCalledWith(7, 10, 20);
    hover.move(30, 40);
    hover.frame(120);
    expect(pick).toHaveBeenCalledTimes(1);
    hover.frame(160);
    expect(pick).toHaveBeenCalledTimes(2);
    hover.frame(300); // nothing new
    expect(pick).toHaveBeenCalledTimes(2);
  });

  it('Fix 6: skips picking while a zone is selected or easing, and clears the hover', () => {
    const { hover, pick, show, setActive } = setup();
    hover.move(10, 20);
    hover.frame(100);
    setActive(false);
    hover.move(11, 21);
    hover.frame(200);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenLastCalledWith(0, 0, 0);
    // A stale position is not picked when the map comes back.
    setActive(true);
    hover.frame(300);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('end() hides the hover', () => {
    const { hover, show } = setup();
    hover.move(1, 1);
    hover.frame(100);
    hover.end();
    expect(show).toHaveBeenLastCalledWith(0, 0, 0);
  });
});
