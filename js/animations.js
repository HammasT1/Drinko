/**
 * Reusable animation functions (GSAP + ScrollTrigger).
 * ---------------------------------------------------------------------------
 * Rules followed throughout:
 *   - only transform + opacity are animated
 *   - every particle is removed from the DOM when its tween completes
 *   - each transform layer has exactly one "owner" so tweens never fight
 *   - prefers-reduced-motion swaps heavy motion for gentle fades
 *
 * Nothing in here knows about config.js. Callers pass in elements and URLs,
 * which is what keeps custom PNG/SVG assets a config-only change.
 */
const { gsap } = window;
const random = (min, max) => gsap.utils.random(min, max);

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedQuery.matches;

const MAX_PARTICLES = 160;
const isSmallScreen = () => window.innerWidth < 640;

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

let fxLayer = null;
/** Fixed, pointer-transparent layer that hosts all short-lived particles. */
function getFxLayer() {
  fxLayer ??= document.querySelector('.fx-layer');
  return fxLayer;
}

/** The visible (non-leaving) can visual inside a can button. */
export function currentVisual(canButton) {
  return canButton.querySelector('.can__swap:not(.is-leaving)');
}

function canParts(canButton) {
  const visual = currentVisual(canButton);
  return {
    visual,
    motion: visual.querySelector('.can__motion'),
    tab: visual.querySelector('.can__tab'),
    beam: visual.querySelector('.can__beam'),
    shadow: canButton.querySelector('.can__shadow'),
  };
}

/** Kill any running tap/spin on this can and reset its pose. */
function resetCan(canButton) {
  canButton._timeline?.kill();
  canButton._timeline = null;
  const { motion, shadow } = canParts(canButton);
  gsap.set(motion, { x: 0, y: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1 });
  gsap.set(shadow, { scale: 1, opacity: 1 });
}

/** Screen position of the pull tab (where bubbles + splash erupt from). */
export function burstOrigin(canButton) {
  const { visual, tab } = canParts(canButton);
  const tabRect = tab.getBoundingClientRect();
  const canRect = visual.getBoundingClientRect();
  return {
    x: tabRect.left + tabRect.width / 2,
    y: tabRect.top + tabRect.height / 2,
    scale: gsap.utils.clamp(0.55, 1.4, canRect.width / 220),
  };
}

function spawnImage(src, className, size) {
  const node = new Image();
  node.src = src;
  node.alt = '';
  node.className = className;
  node.draggable = false;
  node.style.width = `${size}px`;
  return node;
}

/* ------------------------------------------------------------------------ */
/* Can interactions                                                          */
/* ------------------------------------------------------------------------ */

/** Pull tab flips up and snaps back. */
export function popTab(tab) {
  return gsap.timeline()
    .set(tab, { transformOrigin: '50% 90%' })
    .to(tab, { yPercent: -55, rotation: -26, scaleY: 0.7, duration: 0.14, ease: 'power3.out' })
    .to(tab, { yPercent: 0, rotation: 0, scaleY: 1, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
}

/**
 * Tap: squash, shake, tab pop, fizz + splash, hop, elastic settle.
 * @param {HTMLElement} canButton
 * @param {{assets:{bubbleSrc,splashSrc,dropSrc}, onOpen?, onFizz?, onBurst?}} options
 */
export function tapCan(canButton, { assets, onOpen, onFizz, onBurst } = {}) {
  resetCan(canButton);
  const { motion, tab, shadow } = canParts(canButton);

  const erupt = () => {
    const origin = burstOrigin(canButton);
    fizzBurst(origin, assets.bubbleSrc);
    if (!prefersReducedMotion()) splashBurst(origin, assets);
    onFizz?.();
    onBurst?.(origin);
  };

  if (prefersReducedMotion()) {
    // Gentle version: a soft pulse and a handful of bubbles.
    canButton._timeline = gsap.timeline()
      .to(motion, { scale: 1.04, duration: 0.18, ease: 'power1.out', yoyo: true, repeat: 1 })
      .add(() => { popTab(tab); onOpen?.(); }, 0)
      .add(erupt, 0.15);
    return canButton._timeline;
  }

  const tl = gsap.timeline({ onComplete: () => { canButton._timeline = null; } });
  canButton._timeline = tl;

  tl.set(motion, { transformOrigin: '50% 100%' })
    // Anticipation squash
    .to(motion, { scaleY: 0.93, scaleX: 1.05, duration: 0.09, ease: 'power2.out' })
    // Shake
    .to(motion, {
      keyframes: { rotation: [0, -9, 8, -7, 6, -4, 3, 0], x: [0, -7, 7, -6, 5, -3, 2, 0], easeEach: 'sine.inOut' },
      scaleX: 1,
      scaleY: 1,
      duration: 0.5,
    }, 0.05)
    .add(() => { popTab(tab); onOpen?.(); }, 0.42)
    .add(erupt, 0.5)
    // Hop up as the gas escapes...
    .to(motion, { y: -36, scaleY: 1.06, scaleX: 0.96, duration: 0.22, ease: 'power2.out' }, 0.5)
    .to(shadow, { scale: 0.7, opacity: 0.45, duration: 0.22, ease: 'power2.out' }, 0.5)
    // ...and settle with an elastic bounce.
    .to(motion, { y: 0, scaleX: 1, scaleY: 1, duration: 1.15, ease: 'elastic.out(1.05, 0.32)' }, 0.72)
    .to(shadow, { scale: 1, opacity: 1, duration: 1.15, ease: 'elastic.out(1.05, 0.32)' }, 0.72);

  return tl;
}

/** Light sweep across the can surface (masked to the can silhouette). */
export function sweepLight(canButton) {
  const { beam } = canParts(canButton);
  return gsap.timeline()
    .fromTo(beam, { xPercent: -230, skewX: -18, opacity: 0 }, { xPercent: 230, duration: 0.9, ease: 'power2.inOut' })
    .to(beam, { opacity: 1, duration: 0.25, ease: 'power1.out' }, 0)
    .to(beam, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 0.65);
}

/** Double-tap / long-press: hop, 360° spin with overshoot, light sweep. */
export function spinCan(canButton) {
  resetCan(canButton);
  const { motion, shadow } = canParts(canButton);

  if (prefersReducedMotion()) {
    canButton._timeline = sweepLight(canButton);
    return canButton._timeline;
  }

  const tl = gsap.timeline({
    onComplete: () => {
      gsap.set(motion, { rotation: 0 });
      canButton._timeline = null;
    },
  });
  canButton._timeline = tl;

  tl.set(motion, { transformOrigin: '50% 50%' })
    .to(motion, { y: -60, scale: 1.06, duration: 0.32, ease: 'power2.out' })
    .to(shadow, { scale: 0.55, opacity: 0.35, duration: 0.32, ease: 'power2.out' }, 0)
    // back.out overshoots past 360° and eases back
    .to(motion, { rotation: 360, duration: 1.1, ease: 'back.out(1.8)' }, 0.06)
    .add(() => sweepLight(canButton), 0.3)
    .to(motion, { y: 0, scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, 0.62)
    .to(shadow, { scale: 1, opacity: 1, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, 0.62);

  return tl;
}

/**
 * Replace the can visual inside a button: the old one flies out, the new one
 * swings in from the opposite side.
 */
export function swapCanVisual(canButton, newVisual, direction = 1, onComplete) {
  const old = currentVisual(canButton);
  canButton._timeline?.kill();
  canButton._timeline = null;
  old.classList.add('is-leaving');
  canButton.append(newVisual);
  const shadow = canButton.querySelector('.can__shadow');

  const tl = gsap.timeline({ onComplete: () => { old.remove(); onComplete?.(); } });

  if (prefersReducedMotion()) {
    tl.to(old, { opacity: 0, duration: 0.3 })
      .fromTo(newVisual, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    return tl;
  }

  tl.to(old, { xPercent: -direction * 140, rotation: -direction * 28, opacity: 0, duration: 0.55, ease: 'power3.in' })
    .to(shadow, { scaleX: 0.35, opacity: 0.3, duration: 0.45, ease: 'sine.inOut' }, 0)
    .fromTo(newVisual,
      { xPercent: direction * 140, y: -40, rotation: direction * 32, opacity: 0 },
      { xPercent: 0, y: 0, rotation: 0, opacity: 1, duration: 0.95, ease: 'back.out(1.35)' }, 0.32)
    .to(shadow, { scaleX: 1, opacity: 1, duration: 0.7, ease: 'back.out(2)' }, 0.6);
  return tl;
}

/** Crossfade between stacked background layers. */
export function crossfadeLayers(layers, activeLayer) {
  layers.forEach((layer) => {
    gsap.to(layer, {
      opacity: layer === activeLayer ? 1 : 0,
      duration: prefersReducedMotion() ? 0.3 : 1.1,
      ease: 'power2.inOut',
      overwrite: true,
    });
  });
}

/** Swap decorative images (e.g. hero fruit) with a pop-out / pop-in. */
export function swapDecorImages(images, newSrc) {
  if (prefersReducedMotion()) {
    images.forEach((node) => { node.src = newSrc; });
    return;
  }
  images.forEach((node, i) => {
    gsap.timeline({ delay: i * 0.06 })
      .to(node, { scale: 0, rotation: '-=90', opacity: 0, duration: 0.3, ease: 'back.in(2)' })
      .add(() => { node.src = newSrc; })
      .to(node, { scale: 1, rotation: '+=90', opacity: 1, duration: 0.7, ease: 'back.out(2.2)' });
  });
}

/** Text swap: slide current copy up and out, new copy in from below. */
export function swapText(element, newText) {
  if (prefersReducedMotion()) {
    element.textContent = newText;
    return;
  }
  gsap.timeline()
    .to(element, { yPercent: -60, opacity: 0, duration: 0.25, ease: 'power2.in' })
    .add(() => { element.textContent = newText; })
    .fromTo(element, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
}

/* ------------------------------------------------------------------------ */
/* Particles                                                                 */
/* ------------------------------------------------------------------------ */

/** Bubbles erupting upward from a point, removed when done. */
export function fizzBurst(origin, bubbleSrc, count) {
  const layer = getFxLayer();
  if (!layer || layer.childElementCount > MAX_PARTICLES) return;

  const reduced = prefersReducedMotion();
  const total = count ?? (reduced ? 6 : isSmallScreen() ? 16 : 28);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < total; i++) {
    const size = random(6, 22) * origin.scale;
    const bubble = spawnImage(bubbleSrc, 'fx-bubble', size);
    fragment.append(bubble);

    const angle = random(-1.15, 1.15); // radians from vertical
    const distance = random(110, 320) * origin.scale * (reduced ? 0.4 : 1);
    const duration = random(0.8, 1.5);

    gsap.set(bubble, { x: origin.x - size / 2, y: origin.y - size / 2, scale: 0 });
    gsap.timeline({ onComplete: () => bubble.remove() })
      .to(bubble, { scale: 1, duration: 0.25, ease: 'back.out(3)' }, 0)
      .to(bubble, {
        x: `+=${Math.sin(angle) * distance}`,
        y: `-=${Math.cos(angle) * distance}`,
        duration,
        ease: 'power3.out',
      }, 0)
      .to(bubble, { opacity: 0, scale: 0.6, duration: 0.35, ease: 'power1.in' }, duration - 0.35);
  }
  layer.append(fragment);
}

/** Crown splash + droplets that arc and fall with "gravity". */
export function splashBurst(origin, { splashSrc, dropSrc }) {
  const layer = getFxLayer();
  if (!layer || layer.childElementCount > MAX_PARTICLES) return;

  // Splash crown (artwork is 3:2 and anchored at its bottom center)
  const width = 250 * origin.scale;
  const splash = spawnImage(splashSrc, 'fx-splash', width);
  layer.append(splash);
  gsap.set(splash, { x: origin.x - width / 2, y: origin.y - width * (2 / 3) + 6, transformOrigin: '50% 100%' });
  gsap.timeline({ onComplete: () => splash.remove() })
    .fromTo(splash, { scale: 0.1, opacity: 1 }, { scale: 1, duration: 0.45, ease: 'expo.out' })
    .to(splash, { scaleY: 1.15, scaleX: 1.1, opacity: 0, duration: 0.45, ease: 'power2.in' }, 0.3);

  // Individual droplets
  const fragment = document.createDocumentFragment();
  const total = isSmallScreen() ? 8 : 14;
  for (let i = 0; i < total; i++) {
    const size = random(9, 20) * origin.scale;
    const drop = spawnImage(dropSrc, 'fx-drop', size);
    fragment.append(drop);

    const driftX = random(-190, 190) * origin.scale;
    const rise = random(70, 230) * origin.scale;
    const fall = random(180, 360) * origin.scale;
    const upTime = random(0.3, 0.45);
    const downTime = random(0.55, 0.8);

    gsap.set(drop, { x: origin.x - size / 2, y: origin.y - size, rotation: driftX > 0 ? 25 : -25, scale: 0.4 });
    gsap.timeline({ onComplete: () => drop.remove() })
      .to(drop, { x: `+=${driftX}`, duration: upTime + downTime, ease: 'power1.out' }, 0)
      .to(drop, { scale: 1, duration: 0.2 }, 0)
      .to(drop, { y: `-=${rise}`, duration: upTime, ease: 'power2.out' }, 0)
      .to(drop, { y: `+=${rise + fall}`, rotation: driftX > 0 ? 160 : -160, duration: downTime, ease: 'power2.in' }, upTime)
      .to(drop, { opacity: 0, duration: 0.25 }, upTime + downTime - 0.25);
  }
  layer.append(fragment);
}

/* ------------------------------------------------------------------------ */
/* Ambient background bubbles                                                */
/* ------------------------------------------------------------------------ */

/**
 * Bubbles drifting up the viewport forever. Returns a controller with
 * `scatter(origin)` (push bubbles away from a point) and `rebuild()`.
 *
 * Each bubble has two layers: the outer one drifts, the inner one is free for
 * the scatter offset, so the two motions add up instead of overwriting.
 */
export function createAmbientBubbles(container, bubbleSrc) {
  let items = [];

  function destroy() {
    items.forEach(({ outer, tweens }) => {
      tweens.forEach((t) => t.kill());
      outer.remove();
    });
    items = [];
  }

  function build() {
    destroy();
    const reduced = prefersReducedMotion();
    const count = reduced ? 8 : isSmallScreen() ? 12 : 22;
    const travel = window.innerHeight + 120;

    for (let i = 0; i < count; i++) {
      const size = random(8, 38);
      const outer = document.createElement('span');
      outer.className = 'amb-bubble';
      outer.style.left = `${random(0, 100)}%`;
      outer.style.width = `${size}px`;
      outer.style.height = `${size}px`;
      outer.style.opacity = String(random(0.25, 0.75));
      const inner = spawnImage(bubbleSrc, 'amb-bubble__img', size);
      outer.append(inner);
      container.append(outer);

      const tweens = [];
      if (reduced) {
        // Static sprinkle, no drifting.
        gsap.set(outer, { y: -random(0, travel) });
      } else {
        tweens.push(
          gsap.fromTo(outer, { y: 40 }, { y: -travel, duration: random(9, 22), ease: 'none', repeat: -1 })
            .progress(Math.random()),
          gsap.to(outer, { x: random(-45, 45), duration: random(2, 4.5), ease: 'sine.inOut', yoyo: true, repeat: -1 }),
        );
      }
      items.push({ outer, inner, tweens });
    }
  }

  function scatter(origin) {
    if (prefersReducedMotion()) return;
    // Read all positions first, then write (avoids layout thrashing).
    const rects = items.map(({ inner }) => inner.getBoundingClientRect());
    items.forEach(({ inner }, i) => {
      const r = rects[i];
      const dx = r.left + r.width / 2 - origin.x;
      const dy = r.top + r.height / 2 - origin.y;
      const distance = Math.hypot(dx, dy) || 1;
      const force = Math.max(0, 1 - distance / 700) * 190;
      if (force < 4) return;
      gsap.timeline()
        .to(inner, { x: (dx / distance) * force, y: (dy / distance) * force, duration: 0.45, ease: 'power3.out', overwrite: true })
        .to(inner, { x: 0, y: 0, duration: 1.8, ease: 'elastic.out(1, 0.45)' });
    });
  }

  build();
  return { scatter, rebuild: build };
}

/* ------------------------------------------------------------------------ */
/* Pointer tilt                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Smoothly tilts whatever `getTarget()` returns toward the pointer.
 * Uses quickTo setters, re-created when the target element changes
 * (e.g. after a flavor swap).
 */
export function createPointerTilt(getTarget, { maxRotateX = 10, maxRotateY = 16, shift = 12 } = {}) {
  let target = null;
  let setters = null;

  function ensureSetters() {
    const current = getTarget();
    if (current === target && setters) return setters;
    target = current;
    gsap.set(target, { transformPerspective: 900 });
    const opts = { duration: 0.6, ease: 'power3.out' };
    setters = {
      rx: gsap.quickTo(target, 'rotationX', opts),
      ry: gsap.quickTo(target, 'rotationY', opts),
      x: gsap.quickTo(target, 'x', opts),
    };
    return setters;
  }

  return {
    /** nx / ny are -1..1 offsets from the target's center. */
    update(nx, ny) {
      const s = ensureSetters();
      s.ry(nx * maxRotateY);
      s.rx(-ny * maxRotateX);
      s.x(nx * shift);
    },
    reset() {
      if (setters) this.update(0, 0);
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Intro + scroll effects                                                    */
/* ------------------------------------------------------------------------ */

/** Wrap each word in two spans so it can slide up from a clipped line. */
export function splitWords(element) {
  const words = element.textContent.trim().split(/\s+/);
  element.setAttribute('aria-label', element.textContent.trim());
  element.innerHTML = words
    .map((word) => `<span class="word" aria-hidden="true"><span class="word__inner">${word}</span></span>`)
    .join(' ');
  return element.querySelectorAll('.word__inner');
}

/** Loader exit + hero entrance. */
export function playIntro({ loader, heroCan, heroWord, revealItems, hint }) {
  const reduced = prefersReducedMotion();
  const tl = gsap.timeline();

  tl.to(loader, {
    yPercent: reduced ? 0 : -100,
    opacity: reduced ? 0 : 1,
    duration: reduced ? 0.4 : 0.9,
    ease: 'power4.inOut',
    onComplete: () => loader.remove(),
  });

  if (reduced) {
    tl.fromTo([heroCan, heroWord, ...revealItems, hint].filter(Boolean), { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.05 }, '-=0.1');
    return tl;
  }

  tl.from(heroWord, { scale: 1.25, opacity: 0, duration: 1.4, ease: 'expo.out' }, '-=0.35');
  if (heroCan) tl.from(heroCan, { yPercent: -120, rotation: -18, opacity: 0, duration: 1.3, ease: 'elastic.out(1, 0.55)' }, '<0.1');
  tl.from(revealItems, { y: 40, opacity: 0, duration: 0.8, stagger: 0.07, ease: 'power3.out' }, '<0.2')
    .from(hint, { y: 16, opacity: 0, duration: 0.6, ease: 'back.out(2)' }, '-=0.3');
  return tl;
}

/** Infinite marquee whose speed reacts to scroll velocity. */
export function createMarquee(track) {
  if (prefersReducedMotion()) return;
  const loop = gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
  const { ScrollTrigger } = window;
  let speedTl = null;
  ScrollTrigger.create({
    trigger: track,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const boost = gsap.utils.clamp(1, 5, 1 + Math.abs(self.getVelocity()) / 400);
      speedTl?.kill();
      speedTl = gsap.timeline()
        .to(loop, { timeScale: boost, duration: 0.2 })
        .to(loop, { timeScale: 1, duration: 1.2, ease: 'power2.out' });
    },
  });
}

/** Count a number up (or down to zero) once it scrolls into view. */
function countUp(element) {
  const target = Number(element.dataset.count);
  const counter = { value: target === 0 ? 100 : 0 };
  element.textContent = counter.value;
  gsap.to(counter, {
    value: target,
    duration: 1.6,
    ease: 'power2.out',
    scrollTrigger: { trigger: element, start: 'top 85%', once: true },
    onUpdate: () => { element.textContent = Math.round(counter.value); },
  });
}

/** All ScrollTrigger-driven effects. */
export function initScrollEffects({ heroStage, heroWord, headings, cards, floaters, revealGroups, counters }) {
  const { ScrollTrigger } = window;
  const reduced = prefersReducedMotion();

  counters.forEach(countUp);

  if (reduced) {
    // Simple fades only.
    revealGroups.forEach((group) => {
      gsap.from(group, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: group, start: 'top 85%', once: true } });
    });
    return;
  }

  // Hero drifts away as you scroll past it (2D only; the 3D rig does its own thing).
  if (heroStage) {
    gsap.to(heroStage, {
      yPercent: 18, scale: 0.86, ease: 'none',
      scrollTrigger: { trigger: heroStage, start: 'top top', end: 'bottom top', scrub: true },
    });
  }
  gsap.to(heroWord, {
    xPercent: -12, ease: 'none',
    scrollTrigger: { trigger: heroWord, start: 'top top', end: '+=800', scrub: true },
  });

  // Headings: words slide up out of a clipped line.
  headings.forEach((heading) => {
    gsap.from(splitWords(heading), {
      yPercent: 110, rotation: 6, duration: 0.9, ease: 'power4.out', stagger: 0.06,
      scrollTrigger: { trigger: heading, start: 'top 85%', once: true },
    });
  });

  // Flavor cards: rise in, can parallax inside each card.
  cards.forEach((card, i) => {
    gsap.from(card, {
      y: 90, opacity: 0, rotation: i % 2 ? 2 : -2, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: card, start: 'top 88%', once: true },
    });
    const parallax = card.querySelector('.flavor-card__parallax');
    gsap.fromTo(parallax, { yPercent: 14 }, {
      yPercent: -14, ease: 'none',
      scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    card.querySelectorAll('.flavor-card__fruit').forEach((fruit, j) => {
      gsap.fromTo(fruit, { yPercent: 60 + j * 30, rotation: -30 }, {
        yPercent: -60 - j * 40, rotation: 40, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  });

  // Floating ice, fruit and bubbles: depth-based parallax + spin.
  floaters.forEach((item) => {
    const depth = Number(item.dataset.depth || 1);
    gsap.fromTo(item, { y: depth * 160, rotation: -depth * 25 }, {
      y: -depth * 160, rotation: depth * 35, ease: 'none',
      scrollTrigger: { trigger: item.closest('section'), start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    });
    // Idle bob on the inner image so it never fights the scroll tween.
    gsap.to(item.firstElementChild, {
      y: random(-14, 14), rotation: random(-10, 10), duration: random(2.5, 4),
      ease: 'sine.inOut', yoyo: true, repeat: -1,
    });
  });

  // Staggered reveals for groups of cards / facts.
  revealGroups.forEach((group) => {
    gsap.from(group.children, {
      y: 50, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: group, start: 'top 85%', once: true },
    });
  });

  // Recalculate positions once fonts / images settle.
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
