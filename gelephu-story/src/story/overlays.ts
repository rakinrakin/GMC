import type { CaptionId } from './scroll';

const STYLE_ID = 'story-overlays-style';
const CSS = `
.story-overlays { position: fixed; inset: 0; pointer-events: none; z-index: 2; color: #4a5563;
  font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; font-weight: 300; }
.story-caption { position: absolute; left: 0; right: 0; text-align: center; padding: 0 16px;
  opacity: 0; transition: opacity 400ms ease; }
.story-caption.is-on { opacity: 1; }
.story-caption[data-caption="1"] { top: 22vh; }
.story-caption[data-caption="2"] { top: 22vh; font-size: clamp(15px, 1.6vw, 20px); letter-spacing: 0.14em; text-transform: uppercase; }
.story-caption[data-caption="3"] { top: 28px; font-family: Georgia, "Cormorant Garamond", "Times New Roman", serif; font-weight: 400; font-size: clamp(16px, 1.5vw, 20px); letter-spacing: 0.04em; }
.story-title { margin: 0; font-family: Georgia, "Cormorant Garamond", "Times New Roman", serif; font-weight: 400;
  font-size: clamp(32px, 5.2vw, 68px); letter-spacing: 0.01em; line-height: 1.1; }
.story-subtitle { margin: 18px 0 0; font-size: clamp(12px, 1.1vw, 14px); letter-spacing: 0.24em; text-transform: uppercase; }
.story-top { position: absolute; right: 24px; bottom: 24px; pointer-events: none; opacity: 0;
  transition: opacity 400ms ease; font: inherit; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #4a5563; background: rgba(255,255,255,0.72); border: 1px solid rgba(74,85,99,0.35); border-radius: 999px;
  padding: 10px 18px; cursor: pointer; }
.story-top.is-on { opacity: 1; pointer-events: auto; }
.story-top:hover { background: rgba(255,255,255,0.92); }
.story-top:focus-visible { outline: 2px solid #4a5563; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .story-caption, .story-top { transition: none; } }
`;

export interface Overlays {
  setCaption(c: CaptionId): void;
  setPinned(pinned: boolean): void;
  destroy(): void;
}

export function createOverlays(root: HTMLElement, opts: { onBackToTop(): void }): Overlays {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const wrap = document.createElement('div');
  wrap.className = 'story-overlays';

  const caption = (id: CaptionId) => {
    const el = document.createElement('div');
    el.className = 'story-caption';
    el.dataset.caption = String(id);
    el.setAttribute('aria-hidden', 'true');
    wrap.appendChild(el);
    return el;
  };

  const title = caption(1);
  const h1 = document.createElement('h1');
  h1.className = 'story-title';
  h1.textContent = 'Gelephu Mindfulness City';
  const sub = document.createElement('p');
  sub.className = 'story-subtitle';
  sub.textContent = 'Scroll to descend';
  title.append(h1, sub);
  caption(2).textContent = 'Descending into Gelephu';
  caption(3).textContent = 'Gelephu Mindfulness City';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'story-top';
  btn.textContent = 'Back to top';
  btn.tabIndex = -1;
  btn.setAttribute('aria-hidden', 'true');
  btn.addEventListener('click', () => opts.onBackToTop());
  wrap.appendChild(btn);

  root.appendChild(wrap);

  const captions = Array.from(wrap.querySelectorAll<HTMLElement>('.story-caption'));
  let shown: CaptionId | -1 = -1;

  return {
    setCaption(c) {
      if (c === shown) return;
      shown = c;
      for (const el of captions) {
        const on = el.dataset.caption === String(c);
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
    },
    setPinned(pinned) {
      btn.classList.toggle('is-on', pinned);
      btn.tabIndex = pinned ? 0 : -1;
      btn.setAttribute('aria-hidden', pinned ? 'false' : 'true');
      if (!pinned && document.activeElement === btn) btn.blur();
    },
    destroy() {
      wrap.remove();
    },
  };
}
