/**
 * Finishing touches for the 3D experience.
 * ---------------------------------------------------------------------------
 * - liquidWipe():   flavor change floods the background from the can outward
 *                   (shockwave ring + liquid layers), transform/opacity only
 * - initMagnetic(): buttons lean toward the pointer and spring back
 * - initCursor():   dot + trailing ring cursor with contextual labels
 */
const { gsap } = window;

/**
 * Flood the background with a new flavor gradient from a screen point.
 * The circle is scaled up; its inner layer is counter-scaled so the gradient
 * stays locked to the viewport (no jump when the real layer takes over).
 */
export function liquidWipe({ container, origin, background, palette, onCovered }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const radius = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) + 40;
  const box = { left: origin.x - radius, top: origin.y - radius, size: radius * 2 };

  const make = (className, fill) => {
    const node = document.createElement('div');
    node.className = `wipe ${className}`;
    Object.assign(node.style, {
      left: `${box.left}px`, top: `${box.top}px`, width: `${box.size}px`, height: `${box.size}px`,
    });
    if (fill) node.style.background = fill;
    container.append(node);
    return node;
  };

  // Leading "wave" layers in the flavor colors, then the real background
  const waveA = make('wipe__wave', palette.highlight);
  const waveB = make('wipe__wave', palette.primary);
  const fill = make('wipe__fill');
  const inner = document.createElement('div');
  inner.className = 'wipe__inner';
  Object.assign(inner.style, { left: `${-box.left}px`, top: `${-box.top}px`, width: `${w}px`, height: `${h}px`, background });
  fill.append(inner);
  const ring = make('wipe__ring');
  ring.style.color = palette.accent; // border + glow use currentColor

  // Counter-scale around the circle's center, which is `origin` in the inner layer's own coordinates
  inner.style.transformOrigin = `${origin.x}px ${origin.y}px`;

  const tl = gsap.timeline({
    onComplete: () => {
      onCovered?.();
      gsap.to([waveA, waveB, fill, ring], { opacity: 0, duration: 0.35, onComplete: () => [waveA, waveB, fill, ring].forEach((n) => n.remove()) });
    },
  });
  tl.fromTo(ring, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.9, ease: 'expo.out' }, 0)
    .fromTo(waveA, { scale: 0, opacity: 0.55 }, { scale: 1, duration: 0.85, ease: 'power3.inOut' }, 0)
    .fromTo(waveB, { scale: 0, opacity: 0.8 }, { scale: 1, duration: 0.85, ease: 'power3.inOut' }, 0.07)
    .fromTo(fill, { scale: 0.0001 }, {
      scale: 1, duration: 0.85, ease: 'power3.inOut',
      onUpdate: () => gsap.set(inner, { scale: 1 / Math.max(gsap.getProperty(fill, 'scale'), 0.0001) }),
    }, 0.14);
  return tl;
}

/** Buttons drift toward the pointer while hovered, then spring back. */
export function initMagnetic(elements, strength = 0.3) {
  elements.forEach((element) => {
    element.classList.add('is-magnetic');
    const x = gsap.quickTo(element, 'x', { duration: 0.4, ease: 'power3.out' });
    const y = gsap.quickTo(element, 'y', { duration: 0.4, ease: 'power3.out' });
    element.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const r = element.getBoundingClientRect();
      x((event.clientX - (r.left + r.width / 2)) * strength);
      y((event.clientY - (r.top + r.height / 2)) * strength);
    });
    element.addEventListener('pointerleave', () => {
      gsap.to(element, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)', overwrite: true });
    });
  });
}

/**
 * Custom cursor: a dot that tracks exactly, a ring that trails, and a label
 * from the hovered element's data-cursor (e.g. "Drag · Tap" on the hero can).
 */
export function initCursor() {
  const root = document.createElement('div');
  root.className = 'cursor';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<span class="cursor__ring"></span><span class="cursor__label"></span><span class="cursor__dot"></span>';
  document.body.append(root);
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');

  const move = {
    dotX: gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3.out' }),
    dotY: gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3.out' }),
    ringX: gsap.quickTo([ring, label], 'x', { duration: 0.45, ease: 'power3.out' }),
    ringY: gsap.quickTo([ring, label], 'y', { duration: 0.45, ease: 'power3.out' }),
  };

  let shown = false;
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') {
      if (shown) root.classList.remove('is-visible');
      shown = false;
      return;
    }
    if (!shown) {
      shown = true;
      root.classList.add('is-visible');
      document.documentElement.classList.add('has-cursor');
      gsap.set([dot, ring, label], { x: event.clientX, y: event.clientY });
    }
    move.dotX(event.clientX);
    move.dotY(event.clientY);
    move.ringX(event.clientX);
    move.ringY(event.clientY);
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => root.classList.remove('is-visible'));
  document.documentElement.addEventListener('pointerenter', () => { if (shown) root.classList.add('is-visible'); });

  let current = null;
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest('[data-cursor], a, button');
    if (target === current) return;
    current = target;
    const text = target?.dataset.cursor || '';
    label.textContent = text;
    root.classList.toggle('is-hovering', Boolean(target));
    root.classList.toggle('has-label', Boolean(text));
  });
  window.addEventListener('pointerdown', () => root.classList.add('is-pressed'));
  window.addEventListener('pointerup', () => root.classList.remove('is-pressed'));
}

/**
 * Big liquid drops that land on the "camera lens" and slide down the screen
 * after the geyser. Each drop is removed when its tween ends.
 */
export function screenDrips({ layer, src, count = 14 }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const size = gsap.utils.random(22, w < 640 ? 52 : 80);
    const drop = new Image();
    drop.src = src;
    drop.alt = '';
    drop.className = 'lens-drop';
    drop.style.width = `${size}px`;
    layer.append(drop);
    const x = gsap.utils.random(0, w - size);
    const y = gsap.utils.random(-size * 0.5, h * 0.55);
    const delay = gsap.utils.random(0, 0.5);
    gsap.timeline({ delay, onComplete: () => drop.remove() })
      .fromTo(drop, { x, y, scale: 0, opacity: 0.8 }, { scale: 1, duration: 0.25, ease: 'back.out(3)' }) // point up, bead down: a real drip
      // Hang for a moment, then slide down with gravity
      .to(drop, { y: y + gsap.utils.random(160, h * 0.7), scaleY: 1.35, duration: gsap.utils.random(1.8, 3.2), ease: 'power2.in' }, '+=0.3')
      .to(drop, { opacity: 0, duration: 0.6 }, '-=0.6');
  }
}
