export interface HoverDeps {
  /** Zone id under a client point (a terrain raycast: several ms on the desktop mesh). */
  pick(clientX: number, clientY: number): number;
  /** Shows the hover: id 0 clears the highlight, label and cursor. */
  show(id: number, clientX: number, clientY: number): void;
  /** False while the map is not live or a zone is selected / easing: no picking at all. */
  active(): boolean;
  /** Minimum time between picks. */
  intervalMs: number;
}

export interface Hover {
  /** Latest mouse position over the canvas. */
  move(clientX: number, clientY: number): void;
  /** Pointer left the canvas. */
  end(): void;
  /** Called once per frame; picks the latest position when due. */
  frame(nowMs: number): void;
}

export function createHover(deps: HoverDeps): Hover {
  let at: { x: number; y: number } | null = null;
  let last = -Infinity;
  let shown = 0;

  const show = (id: number, x = 0, y = 0) => {
    if (id === 0 && shown === 0) return;
    shown = id;
    deps.show(id, x, y);
  };

  return {
    move(x, y) {
      at = { x, y };
    },
    end() {
      at = null;
      show(0);
    },
    frame(now) {
      if (!deps.active()) {
        at = null;
        show(0);
        return;
      }
      if (!at || now - last < deps.intervalMs) return;
      last = now;
      show(deps.pick(at.x, at.y), at.x, at.y);
      at = null;
    },
  };
}
