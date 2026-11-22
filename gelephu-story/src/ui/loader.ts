const STYLE_ID = 'gmc-loader-style';
const CSS = `
.gmc-loader { position: fixed; inset: 0; z-index: 10; background: #fff; transition: opacity 600ms ease; }
.gmc-loader.is-hidden { opacity: 0; pointer-events: none; }
.gmc-loader-line { position: fixed; left: 0; right: 0; top: 0; height: 2px; z-index: 11; pointer-events: none;
  transition: opacity 600ms ease; }
.gmc-loader-line.is-hidden { opacity: 0; }
.gmc-loader-bar { height: 100%; background: rgba(74,85,99,0.55); transform-origin: 0 50%; transform: scaleX(0);
  transition: transform 250ms ease; }
@media (prefers-reduced-motion: reduce) { .gmc-loader, .gmc-loader-line, .gmc-loader-bar { transition: none; } }
`;

export interface Loader {
  /** 0..1; never moves backwards. */
  setProgress(f: number): void;
  /** Fade the white panel (sky and clouds are ready); the line keeps showing terrain progress. */
  hidePanel(): void;
  /** The terrain is in (or given up): fade and remove the line. The panel is hidePanel's alone. */
  done(): void;
}

/** Full-screen white panel with a thin progress line along the top edge. */
export function createLoader(root: HTMLElement): Loader {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const panel = document.createElement('div');
  panel.className = 'gmc-loader';
  panel.setAttribute('role', 'progressbar');
  panel.setAttribute('aria-label', 'Loading');
  panel.setAttribute('aria-valuemin', '0');
  panel.setAttribute('aria-valuemax', '100');
  panel.setAttribute('aria-valuenow', '0');
  const line = document.createElement('div');
  line.className = 'gmc-loader-line';
  line.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div');
  bar.className = 'gmc-loader-bar';
  line.appendChild(bar);
  root.append(panel, line);

  let shown = 0;
  const removeLater = (el: HTMLElement) => window.setTimeout(() => el.remove(), 700);

  return {
    setProgress(f) {
      const v = Math.min(1, Math.max(shown, Number.isFinite(f) ? f : 0));
      if (v === shown && bar.style.transform) return;
      shown = v;
      bar.style.transform = `scaleX(${+v.toFixed(4)})`;
      panel.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    },
    hidePanel() {
      if (panel.classList.contains('is-hidden')) return;
      panel.classList.add('is-hidden');
      panel.setAttribute('aria-hidden', 'true');
      removeLater(panel);
    },
    done() {
      if (line.classList.contains('is-hidden')) return;
      line.classList.add('is-hidden');
      removeLater(line);
    },
  };
}
