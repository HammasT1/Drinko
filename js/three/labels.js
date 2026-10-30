/**
 * Canvas-generated textures for the 3D can.
 * ---------------------------------------------------------------------------
 * - createLabelTexture(): the printed wrap label for a flavor (or the image at
 *   flavor.labelSrc when set in config.js)
 * - createWetMaps(): shared bump + roughness maps that make the label look
 *   beaded with condensation
 *
 * Label layout (u = 0..1 around the can): u = 0.5 faces the camera.
 */
import * as THREE from 'three';

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${src}`));
  image.src = src;
});

function finishTexture(texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

function sparkle(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.12, -size * 0.12, size, 0);
  ctx.quadraticCurveTo(size * 0.12, size * 0.12, 0, size);
  ctx.quadraticCurveTo(-size * 0.12, size * 0.12, -size, 0);
  ctx.quadraticCurveTo(-size * 0.12, -size * 0.12, 0, -size);
  ctx.fill();
  ctx.restore();
}

/** Wave across the full width with whole periods, so the seam at u = 0/1 lines up. */
function wavePath(ctx, w, baseY, amp, periods, phase = 0) {
  ctx.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const y = baseY + Math.sin((x / w) * Math.PI * 2 * periods + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/**
 * @param {object} flavor   entry from config.FLAVORS
 * @param {object} options  { renderer, width, fruitSrc, index }
 */
export async function createLabelTexture(flavor, { renderer, width, fruitSrc, index }) {
  if (flavor.labelSrc) {
    try {
      return finishTexture(new THREE.Texture(await loadImage(flavor.labelSrc)), renderer);
    } catch (err) {
      console.warn(`[Drinko] ${err.message}. Using a generated label for ${flavor.name}.`);
    }
  }

  const p = flavor.palette;
  const w = width;
  const h = Math.round(width * 0.42); // circumference : printed height of the body
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const u = (n) => n * w; // helpers in label space
  const v = (n) => n * h;

  // Base color with a soft vertical falloff
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, p.primary);
  base.addColorStop(0.65, p.primary);
  base.addColorStop(1, p.dark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Wave band + accent line
  ctx.fillStyle = p.dark;
  ctx.globalAlpha = 0.65;
  wavePath(ctx, w, v(0.74), v(0.05), 3);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = v(0.012);
  wavePath(ctx, w, v(0.69), v(0.05), 3);
  ctx.stroke();

  // Thin print edges top + bottom
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, v(0.012));
  ctx.fillRect(0, h - v(0.012), w, v(0.012));

  const display = (size) => `900 ${size}px Unbounded, "Arial Black", sans-serif`;
  const body = (weight, size) => `${weight} ${size}px Manrope, system-ui, sans-serif`;

  // FRONT: vertical brand mark
  ctx.save();
  ctx.translate(u(0.5), v(0.47));
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = display(v(0.2));
  const brandWidth = v(0.66);
  ctx.fillStyle = p.dark;
  ctx.globalAlpha = 0.7;
  ctx.fillText('DRINKO', v(0.012), v(0.012), brandWidth);
  ctx.globalAlpha = 1;
  const logo = ctx.createLinearGradient(-brandWidth / 2, 0, brandWidth / 2, 0);
  logo.addColorStop(0, '#ffffff');
  logo.addColorStop(1, p.highlight);
  ctx.fillStyle = logo;
  ctx.fillText('DRINKO', 0, 0, brandWidth);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = body(800, v(0.045));
  ctx.letterSpacing = `${v(0.012)}px`;
  ctx.fillText(flavor.name.toUpperCase(), u(0.5), v(0.075));
  ctx.font = body(700, v(0.032));
  ctx.globalAlpha = 0.85;
  ctx.fillText('SPARKLING SODA · 330 ML', u(0.5), v(0.95));
  ctx.globalAlpha = 1;

  sparkle(ctx, u(0.455), v(0.2), v(0.03), p.accent);
  sparkle(ctx, u(0.548), v(0.62), v(0.024), p.accent);
  sparkle(ctx, u(0.54), v(0.16), v(0.014), '#fff');

  // LEFT SIDE: fruit illustration + flavor name
  try {
    const fruit = await loadImage(fruitSrc);
    const size = v(0.34);
    ctx.drawImage(fruit, u(0.27) - size / 2, v(0.2), size, size);
  } catch { /* decoration only */ }
  ctx.font = display(v(0.075));
  ctx.fillStyle = '#ffffff';
  ctx.fillText(flavor.short.toUpperCase(), u(0.27), v(0.68), u(0.16));
  ctx.font = body(700, v(0.032));
  ctx.fillStyle = p.accent;
  ctx.fillText(`No. ${String(index + 1).padStart(2, '0')}`, u(0.27), v(0.12));

  // RIGHT SIDE: tasting notes + barcode
  ctx.textAlign = 'left';
  ctx.font = body(800, v(0.036));
  ctx.fillStyle = p.accent;
  ctx.fillText('TASTING NOTES', u(0.66), v(0.18));
  ctx.font = body(600, v(0.034));
  ctx.fillStyle = '#ffffff';
  flavor.notes.forEach((note, i) => ctx.fillText(`· ${note}`, u(0.66), v(0.26 + i * 0.065)));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(u(0.66), v(0.5), u(0.07), v(0.14));
  ctx.fillStyle = '#111';
  for (let x = 0, i = 0; x < u(0.064); i++) {
    const bar = ((i * 7) % 5) + 1;
    ctx.fillRect(u(0.663) + x, v(0.515), bar * w * 0.0006, v(0.1));
    x += bar * w * 0.0006 + w * 0.0009;
  }

  return finishTexture(new THREE.CanvasTexture(canvas), renderer);
}

/**
 * Bump + roughness maps for beaded condensation, shared by every flavor.
 * Wet beads are raised (bump) and glossier (roughness) than the dry print.
 */
export function createWetMaps(renderer, width) {
  const w = width;
  const h = Math.round(width * 0.42);
  const bump = document.createElement('canvas');
  const rough = document.createElement('canvas');
  bump.width = rough.width = w;
  bump.height = rough.height = h;
  const b = bump.getContext('2d');
  const r = rough.getContext('2d');

  b.fillStyle = '#000';
  b.fillRect(0, 0, w, h);
  r.fillStyle = 'rgb(92,92,92)'; // ~0.36 roughness for the dry print
  r.fillRect(0, 0, w, h);

  const scale = w / 2048;
  const drops = Math.round(1400 * scale * scale + 400);
  for (let i = 0; i < drops; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rad = (Math.random() ** 2.2 * 9 + 1.5) * scale;
    const g = b.createRadialGradient(x - rad * 0.2, y - rad * 0.2, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = g;
    b.beginPath();
    b.ellipse(x, y, rad, rad * 1.15, 0, 0, Math.PI * 2);
    b.fill();

    r.fillStyle = 'rgb(10,10,10)';
    r.beginPath();
    r.ellipse(x, y, rad * 0.85, rad, 0, 0, Math.PI * 2);
    r.fill();
  }
  // A few run-off trails
  for (let i = 0; i < 26 * scale + 8; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    const len = (60 + Math.random() * 180) * scale;
    const width = (2 + Math.random() * 3) * scale;
    b.fillStyle = 'rgba(255,255,255,0.35)';
    b.fillRect(x, y, width, len);
    r.fillStyle = 'rgb(30,30,30)';
    r.fillRect(x, y, width, len);
  }

  const make = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };
  return { bumpMap: make(bump), roughnessMap: make(rough) };
}
