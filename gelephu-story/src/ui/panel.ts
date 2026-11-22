import type { ZoneDef } from '../config';

const STYLE_ID = 'map-ui-style';
const CSS = `
.map-ui { position: fixed; inset: 0; pointer-events: none; z-index: 3; color: #3c4552;
  font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; font-weight: 300; }
.zone-panel { position: absolute; left: 24px; bottom: 24px; width: min(340px, calc(100vw - 48px));
  box-sizing: border-box; padding: 20px 22px 22px; background: rgba(255,255,255,0.82);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  border: 1px solid rgba(74,85,99,0.18); border-radius: 4px; opacity: 0; transform: translateY(8px);
  transition: opacity 400ms ease, transform 400ms ease; pointer-events: none; }
.zone-panel.is-on { opacity: 1; transform: none; pointer-events: auto; }
.zone-panel h2 { margin: 0 32px 10px 0; font-family: Georgia, "Cormorant Garamond", "Times New Roman", serif;
  font-weight: 400; font-size: 22px; letter-spacing: 0.01em; color: #4A0E16; }
.zone-panel p { margin: 0; font-size: 14px; line-height: 1.55; }
.zone-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; padding: 0;
  border: 0; border-radius: 50%; background: transparent; color: #4a5563; font: inherit; font-size: 20px;
  line-height: 32px; cursor: pointer; }
.zone-close:hover { background: rgba(74,85,99,0.1); }
.zone-close:focus-visible, .zone-nav button:focus-visible { outline: 2px solid #4a5563; outline-offset: 2px; }
.zone-label { position: absolute; left: 0; top: 0; padding: 4px 9px; font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase; white-space: nowrap; background: rgba(255,255,255,0.86); border-radius: 2px;
  color: #4A0E16; opacity: 0; transition: opacity 150ms ease; pointer-events: none; }
.zone-label.is-on { opacity: 1; }
/* Keyboard access: one real button per zone, visible only while it has focus. */
.zone-nav button { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  padding: 9px 16px; font: inherit; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase;
  color: #4A0E16; background: rgba(255,255,255,0.92); border: 1px solid rgba(74,14,22,0.35); border-radius: 999px;
  opacity: 0; pointer-events: none; }
.zone-nav button:focus { opacity: 1; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .zone-panel, .zone-label { transition: none; } }
`;

export interface MapUi {
  /** Show the panel for a zone (name, copy, close button). */
  open(zone: ZoneDef): void;
  close(): void;
  /** Hover label near the pointer; pass null to hide. */
  label(text: string | null, clientX?: number, clientY?: number): void;
  /** Zone buttons are tabbable only while the map is live. */
  setActive(active: boolean): void;
  root: HTMLElement;
  destroy(): void;
}

export interface MapUiOptions {
  zones: ZoneDef[];
  onClose(): void;
  onSelect(id: number): void;
  /** Keyboard focus on a zone button (id) or off all of them (0). */
  onFocusZone(id: number): void;
}

export function createMapUi(parent: HTMLElement, opts: MapUiOptions): MapUi {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'map-ui';

  const nav = document.createElement('nav');
  nav.className = 'zone-nav';
  nav.setAttribute('aria-label', 'Project zones');
  const buttons = [...opts.zones].sort((a, b) => a.id - b.id).map((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = z.name;
    b.dataset.zone = String(z.id);
    b.tabIndex = -1;
    b.addEventListener('click', () => opts.onSelect(z.id));
    b.addEventListener('focus', () => opts.onFocusZone(z.id));
    b.addEventListener('blur', () => opts.onFocusZone(0));
    nav.appendChild(b);
    return b;
  });

  const panel = document.createElement('section');
  panel.className = 'zone-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-hidden', 'true');
  const h2 = document.createElement('h2');
  const copy = document.createElement('p');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'zone-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.tabIndex = -1;
  close.addEventListener('click', () => opts.onClose());
  panel.append(close, h2, copy);

  const label = document.createElement('div');
  label.className = 'zone-label';
  label.setAttribute('aria-hidden', 'true');

  root.append(nav, panel, label);
  parent.appendChild(root);

  let openId = 0;

  return {
    root,
    open(zone) {
      openId = zone.id;
      h2.textContent = zone.name;
      copy.textContent = zone.copy;
      panel.classList.add('is-on');
      panel.setAttribute('aria-hidden', 'false');
      close.tabIndex = 0;
    },
    close() {
      const hadFocus = panel.contains(document.activeElement);
      panel.classList.remove('is-on');
      panel.setAttribute('aria-hidden', 'true');
      close.tabIndex = -1;
      // Return keyboard focus to the zone it came from.
      if (hadFocus) buttons.find((b) => b.dataset.zone === String(openId))?.focus();
      openId = 0;
    },
    label(text, x = 0, y = 0) {
      if (!text) {
        label.classList.remove('is-on');
        return;
      }
      label.textContent = text;
      label.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
      label.classList.add('is-on');
    },
    setActive(active) {
      for (const b of buttons) {
        b.tabIndex = active ? 0 : -1;
        if (!active && document.activeElement === b) b.blur();
      }
    },
    destroy() {
      root.remove();
    },
  };
}
