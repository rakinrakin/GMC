import { CONFIG, ACCURACY_NOTE } from '../config';

const STYLE_ID = 'gmc-fallback-style';
const CSS = `
.gmc-fallback { position: fixed; inset: 0; z-index: 20; overflow-y: auto; background: #ECEEF2; color: #3c4552;
  font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; font-weight: 300; }
.gmc-fallback-inner { max-width: 1100px; margin: 0 auto; padding: 32px 16px 48px; }
.gmc-fallback h1 { margin: 0 0 20px; font-family: Georgia, "Cormorant Garamond", "Times New Roman", serif;
  font-weight: 400; font-size: clamp(26px, 4vw, 44px); color: #3c4552; }
.gmc-fallback img { display: block; width: 100%; height: auto; border-radius: 2px; }
.gmc-fallback h2 { margin: 28px 0 10px; font-size: 13px; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; }
.gmc-fallback ul { margin: 0; padding: 0; list-style: none; columns: 14em; column-gap: 24px; font-size: 14px; line-height: 1.8; }
.gmc-fallback li { color: #4A0E16; break-inside: avoid; }
.gmc-fallback-note { margin: 28px 0 0; font-size: 12px; line-height: 1.5; color: rgba(74,85,99,0.8); }
`;

/** WebGL is usable: the constructor exists and a context can actually be created. */
export function webglAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) return false;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    // Give the probe context back at once (browsers cap live contexts).
    gl.getExtension?.('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Static page for browsers without WebGL (or when the 3D scene fails): frame 3, zone list, note. */
export function showFallback(root: HTMLElement): HTMLElement {
  const existing = document.querySelector<HTMLElement>('.gmc-fallback');
  if (existing) return existing;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const el = document.createElement('main');
  el.className = 'gmc-fallback';
  const inner = document.createElement('div');
  inner.className = 'gmc-fallback-inner';

  const h1 = document.createElement('h1');
  h1.textContent = 'Gelephu Mindfulness City';
  const img = document.createElement('img');
  img.src = `${import.meta.env?.BASE_URL ?? '/'}fallback.webp`;
  img.alt = 'Plaster relief of Gelephu with the Mindfulness City zones in maroon';
  img.width = 1600;
  img.height = 900;
  const h2 = document.createElement('h2');
  h2.textContent = 'Zones';
  const ul = document.createElement('ul');
  for (const z of CONFIG.zones) {
    const li = document.createElement('li');
    li.textContent = z.name;
    ul.appendChild(li);
  }
  const note = document.createElement('p');
  note.className = 'gmc-fallback-note';
  note.textContent = ACCURACY_NOTE;

  inner.append(h1, img, h2, ul, note);
  el.appendChild(inner);
  root.appendChild(el);
  // The story's scroll track and pin no longer apply.
  document.body.style.overflow = 'hidden';
  return el;
}
