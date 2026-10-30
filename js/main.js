/**
 * Drinko: entry point.
 * ---------------------------------------------------------------------------
 * 1. Builds every section from config.js
 * 2. Preloads assets behind the loader
 * 3. Plays the intro, then wires up taps, flavor switching, pointer tilt,
 *    sound and scroll effects.
 */
import { BRAND, FLAVORS, INGREDIENTS, FUN_FACTS, SCENE_3D, PHYSICS, LIBS, STORY, ANATOMY } from './config.js';
import {
  flavorAssets, decorAssets, collectPreloadUrls, createCanButton, createCanVisual,
  setCanLabel, applyPalette, backgroundGradient, el, img,
} from './render.js';
import { sound } from './sound.js';
import * as fx from './animations.js';
import { liquidWipe, initMagnetic, initCursor, screenDrips } from './polish.js';

window.__drinkoBooted = true; // lets the inline watchdog in index.html know modules loaded

const { gsap, ScrollTrigger } = window;
const hasGsap = Boolean(gsap && ScrollTrigger);

/**
 * WebGL + motion OK -> 3D experience; otherwise the 2D site (the fallback).
 * Only a cheap feature check here: creating a throwaway context costs ~300ms
 * on weak GPUs, and if the real renderer fails, init3D() falls back to 2D anyway.
 */
const wants3D = hasGsap && SCENE_3D.enabled && !fx.prefersReducedMotion() && 'WebGLRenderingContext' in window;
let hero3d = null; // Hero3D instance once loaded

const state = {
  index: 0,          // active hero flavor
  swapping: false,   // a flavor swap animation is running
  pendingIndex: null, // flavor requested mid-swap
  heroTaps: 0,
};

const $ = (selector, root = document) => root.querySelector(selector);
const dom = {
  root: document.documentElement,
  loader: $('#loader'),
  loaderPercent: $('#loaderPercent'),
  loaderFill: $('.loader__fill'),
  bg: $('#bg'),
  ambient: $('#ambient'),
  heroStage: $('#heroStage'),
  heroDecor: $('#heroDecor'),
  heroWord: $('.hero__word'),
  heroSub: $('#heroSub'),
  hint: $('#heroHint'),
  hintText: $('#heroHintText'),
  picker: $('#picker'),
  flavorName: $('#flavorName'),
  flavorTagline: $('#flavorTagline'),
  marqueeTrack: $('#marqueeTrack'),
  flavorGrid: $('#flavorGrid'),
  ingredients: $('#ingredients'),
  facts: $('#facts'),
  floaters: $('#floaters'),
  footerCans: $('#footerCans'),
  cta: $('#ctaCrack'),
  soundToggle: $('#soundToggle'),
  announcer: $('#announcer'),
  themeColor: $('meta[name="theme-color"]'),
  scene3d: $('#scene3d'),
  heroPhysics: $('#heroPhysics'),
  hero: $('.hero'),
  story: $('#story'),
  storyBeats: $('#storyBeats'),
  bgGlow: $('#bgGlow'),
  carousel: $('#carousel'),
  carouselStage: $('#carouselStage'),
  carouselIndex: $('#carouselIndex'),
  carouselTitle: $('#carouselTitle'),
  carouselTagline: $('#carouselTagline'),
  carouselText: $('#carouselText'),
  carouselNotes: $('#carouselNotes'),
  carouselDots: $('#carouselDots'),
  anatomy: $('#anatomy'),
  anatomyInner: $('#anatomyInner'),
  anatomyStage: $('#anatomyStage'),
  anatomyLines: $('#anatomyLines'),
  anatomyCallouts: $('#anatomyCallouts'),
  pour: $('#pour'),
  pourStage: $('#pourStage'),
  pourLevel: $('#pourLevel'),
  heroCan: null,
  bgLayers: [],
  pills: [],
  heroFruit: [],
};

/* ------------------------------------------------------------------------ */
/* Build                                                                     */
/* ------------------------------------------------------------------------ */

/** Decorations orbiting the hero can (positions are % of the can stage). */
const HERO_DECOR = [
  { type: 'fruit', left: '-30%', top: '8%', size: 1, depth: 1.3 },
  { type: 'ice', left: '108%', top: '2%', size: 0.85, depth: 1.8 },
  { type: 'fruit', left: '112%', top: '58%', size: 0.8, depth: 0.9 },
  { type: 'ice', left: '-24%', top: '66%', size: 0.7, depth: 0.6 },
];

/** Floating ice / fruit / bubbles in the ingredients section. */
const FLOATERS = [
  { type: 'ice', left: '3%', top: '6%', size: 96, depth: 1.2 },
  { type: 'fruit', flavor: 0, left: '86%', top: '3%', size: 84, depth: 0.8 },
  { type: 'bubble', left: '72%', top: '20%', size: 44, depth: 1.6 },
  { type: 'fruit', flavor: 1, left: '1%', top: '44%', size: 100, depth: 1.4 },
  { type: 'ice', left: '90%', top: '50%', size: 74, depth: 0.6 },
  { type: 'bubble', left: '14%', top: '78%', size: 30, depth: 1 },
  { type: 'fruit', flavor: 2, left: '82%', top: '82%', size: 90, depth: 1.1 },
  { type: 'bubble', left: '48%', top: '1%', size: 24, depth: 1.8 },
  { type: 'ice', left: '42%', top: '92%', size: 62, depth: 0.9 },
];

function buildPage() {
  const first = FLAVORS[0];
  applyPalette(dom.root, first.palette);
  dom.heroSub.textContent = BRAND.subline;
  dom.flavorName.textContent = first.name;
  dom.flavorTagline.textContent = first.tagline;

  // Background layers, one per flavor (crossfaded with opacity)
  dom.bgLayers = FLAVORS.map((flavor, i) => {
    const layer = el('div', 'bg__layer');
    layer.style.background = backgroundGradient(flavor.palette);
    layer.style.opacity = i === 0 ? '1' : '0';
    dom.bg.append(layer);
    return layer;
  });

  // Hero can
  dom.heroCan = createCanButton(first, 'can--hero');
  dom.heroCan.id = 'heroCan';
  dom.heroStage.insertBefore(dom.heroCan, dom.hint);

  // Hero decorations: outer = pointer parallax, middle = idle float, img = swap
  const { iceSrc } = decorAssets();
  HERO_DECOR.forEach((item) => {
    const outer = el('span', `hero-decor hero-decor--${item.type}`);
    outer.style.left = item.left;
    outer.style.top = item.top;
    outer.style.setProperty('--size', item.size);
    outer.dataset.depth = item.depth;
    const float = el('span', 'hero-decor__float');
    const image = img(item.type === 'ice' ? iceSrc : flavorAssets(first).fruitSrc, 'hero-decor__img');
    float.append(image);
    outer.append(float);
    dom.heroDecor.append(outer);
    if (item.type === 'fruit') dom.heroFruit.push(image);
  });

  // Flavor picker (radio group)
  dom.pills = FLAVORS.map((flavor, i) => {
    const pill = el('button', 'pill', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(i === 0),
      tabindex: i === 0 ? '0' : '-1',
      'aria-label': flavor.name,
    });
    pill.style.setProperty('--dot-primary', flavor.palette.primary);
    pill.style.setProperty('--dot-highlight', flavor.palette.highlight);
    pill.style.setProperty('--dot-dark', flavor.palette.dark);
    pill.innerHTML = `<span class="pill__dot" aria-hidden="true"></span>
      <span class="pill__long" aria-hidden="true">${flavor.name}</span>
      <span class="pill__short" aria-hidden="true">${flavor.short}</span>`;
    dom.picker.append(pill);
    return pill;
  });

  // Marquee: two identical halves so a -50% loop is seamless
  const words = FLAVORS.flatMap((f) => [f.name, 'Ice cold', 'Real fruit']);
  const half = words.map((w) => `<span class="marquee__item">${w}</span><span class="marquee__star">✦</span>`).join('');
  dom.marqueeTrack.innerHTML = `<div class="marquee__half">${half}</div><div class="marquee__half">${half}</div>`;

  // Flavor showcase cards
  FLAVORS.forEach((flavor, i) => dom.flavorGrid.append(buildFlavorCard(flavor, i)));

  // Ingredients + facts
  INGREDIENTS.forEach((item, i) => {
    const li = el('li', 'ingredient');
    li.innerHTML = `<span class="ingredient__num">${String(i + 1).padStart(2, '0')}</span>
      <h3 class="ingredient__title">${item.title}</h3><p class="ingredient__text">${item.text}</p>`;
    dom.ingredients.append(li);
  });
  FUN_FACTS.forEach((fact) => {
    const li = el('li', 'fact');
    li.innerHTML = `<p class="fact__value"><span class="fact__number" data-count="${fact.value}">${fact.value}</span><span class="fact__suffix">${fact.suffix}</span></p>
      <p class="fact__label">${fact.label}</p>`;
    dom.facts.append(li);
  });

  // Floating decor in the ingredients section
  FLOATERS.forEach((item) => {
    const outer = el('span', `floater floater--${item.type}`);
    outer.style.left = item.left;
    outer.style.top = item.top;
    outer.style.setProperty('--size', item.size);
    outer.dataset.depth = item.depth;
    let src = decorAssets().bubbleSrc;
    if (item.type === 'ice') src = decorAssets().iceSrc;
    if (item.type === 'fruit') src = flavorAssets(FLAVORS[item.flavor % FLAVORS.length]).fruitSrc;
    outer.append(img(src, 'floater__img'));
    dom.floaters.append(outer);
  });

  // Scroll story beats
  STORY.forEach((beat) => {
    const article = el('article', 'story__beat');
    article.innerHTML = `<p class="eyebrow">${beat.kicker}</p>
      <h3 class="story__title">${beat.title}</h3><p class="story__text">${beat.text}</p>`;
    dom.storyBeats.append(article);
  });

  // Anatomy callouts (a fact list in 2D, live labels in 3D)
  ANATOMY.forEach((item) => {
    const li = el('li', `callout callout--${item.side}`);
    li.dataset.part = item.part;
    li.innerHTML = `<h3 class="callout__title">${item.title}</h3><p class="callout__text">${item.text}</p>`;
    dom.anatomyCallouts.append(li);
  });

  // Footer cans: one per flavor
  FLAVORS.forEach((flavor) => {
    const can = createCanButton(flavor, 'can--footer');
    can.dataset.flavor = flavor.id;
    dom.footerCans.append(can);
  });
}

function buildFlavorCard(flavor, index) {
  const card = el('article', 'flavor-card', { 'aria-labelledby': `card-title-${flavor.id}` });
  applyPalette(card, flavor.palette);
  const { fruitSrc } = flavorAssets(flavor);

  card.innerHTML = `
    <div class="flavor-card__visual">
      <span class="flavor-card__glow" aria-hidden="true"></span>
      <img class="flavor-card__fruit flavor-card__fruit--a" src="${fruitSrc}" alt="" draggable="false">
      <img class="flavor-card__fruit flavor-card__fruit--b" src="${fruitSrc}" alt="" draggable="false">
      <div class="flavor-card__parallax"></div>
    </div>
    <div class="flavor-card__body">
      <p class="flavor-card__index">No. ${String(index + 1).padStart(2, '0')}</p>
      <h3 class="flavor-card__title" id="card-title-${flavor.id}">${flavor.name}</h3>
      <p class="flavor-card__tagline">${flavor.tagline}</p>
      <p class="flavor-card__text">${flavor.description}</p>
      <ul class="flavor-card__notes" aria-label="Tasting notes">
        ${flavor.notes.map((n) => `<li>${n}</li>`).join('')}
      </ul>
      <button class="btn btn--accent flavor-card__cta" type="button" data-select="${index}">
        Pick ${flavor.short}
      </button>
    </div>`;

  const can = createCanButton(flavor, 'can--card');
  can.dataset.flavor = flavor.id;
  card.querySelector('.flavor-card__parallax').append(can);
  return card;
}

/* ------------------------------------------------------------------------ */
/* Preload + loader                                                          */
/* ------------------------------------------------------------------------ */

function preload(onProgress, extraTasks = []) {
  const tasks = collectPreloadUrls(FLAVORS).map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => {
      console.warn(`[Drinko] Could not load "${url}". Check the path in js/config.js.`);
      resolve();
    };
    image.src = url;
  }));

  if (document.fonts) {
    tasks.push(
      Promise.all([
        document.fonts.load('900 1em Unbounded'),
        document.fonts.load('800 1em Manrope'),
      ]).then(() => document.fonts.ready).catch(() => {}),
    );
  }

  const all = [...tasks, ...extraTasks];
  let done = 0;
  all.forEach((task) => task.then(() => onProgress(++done / all.length)));

  const minimumShow = new Promise((resolve) => setTimeout(resolve, 900));
  const safetyTimeout = new Promise((resolve) => setTimeout(resolve, 6000));
  // The safety timeout only covers images + fonts. Extra tasks (the 3D scene)
  // are always awaited: revealing the page before the 3D can exists would leave
  // the hero empty. They handle their own failures by falling back to 2D.
  return Promise.all([
    Promise.race([Promise.all([...tasks, minimumShow]), safetyTimeout]),
    ...extraTasks,
  ]);
}

function setLoaderProgress(progress) {
  if (!hasGsap) return;
  const proxy = dom.loader._progress ??= { value: 0 };
  return gsap.to(proxy, {
    value: progress,
    duration: 0.5,
    ease: 'power2.out',
    overwrite: true,
    onUpdate: () => {
      gsap.set(dom.loaderFill, { scaleY: Math.max(0.06, proxy.value) });
      dom.loaderPercent.textContent = Math.round(proxy.value * 100);
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Can interactions (shared by hero, card and footer cans)                   */
/* ------------------------------------------------------------------------ */

const LONG_PRESS_MS = 520;
const DOUBLE_TAP_MS = 320;

const DRAG_THRESHOLD_PX = 8;

/** Sound + bubble scatter + physics shove shared by every tap. */
const tapEffects = {
  onOpen: () => sound.play('open'),
  onFizz: () => sound.play('fizz'),
  onBurst: (origin) => {
    ambient?.scatter(origin);
    physics?.explode(origin);
  },
};

/**
 * Tap → crack open. Double-tap, long-press or "R" → spin.
 * The `click` event covers mouse, touch and keyboard (Enter / Space on a <button>).
 *
 * options.actions  { tap, spin } replace the 2D animations (used by the 3D can)
 * options.drag     { move(dx), end() } enables horizontal drag-to-rotate
 */
function bindCan(button, getFlavor, { onTap, onSpin, actions, drag } = {}) {
  let pressTimer = null;
  let longPressed = false;
  let lastTap = 0;
  let pressed = false;
  let dragging = false;
  let suppressClick = false;
  let startX = 0;
  let lastX = 0;

  const tap = () => {
    if (actions) actions.tap();
    else fx.tapCan(button, { assets: flavorAssets(getFlavor()), ...tapEffects });
    onTap?.();
  };
  const spin = () => {
    if (actions) actions.spin();
    else fx.spinCan(button);
    onSpin?.();
  };

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    longPressed = false;
    suppressClick = false;
    pressed = true;
    dragging = false;
    startX = lastX = event.clientX;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressed = true;
      spin();
    }, LONG_PRESS_MS);
  });

  if (drag) {
    button.addEventListener('pointermove', (event) => {
      if (!pressed) return;
      if (!dragging && Math.abs(event.clientX - startX) > DRAG_THRESHOLD_PX) {
        dragging = true;
        clearTimeout(pressTimer);
        button.setPointerCapture(event.pointerId);
      }
      if (dragging) drag.move(event.clientX - lastX);
      lastX = event.clientX;
    });
  }

  const endPress = () => {
    clearTimeout(pressTimer);
    if (dragging) {
      drag.end();
      suppressClick = true; // the click that follows a drag is not a tap
    }
    pressed = false;
    dragging = false;
  };
  button.addEventListener('pointerup', endPress);
  button.addEventListener('pointercancel', endPress);
  button.addEventListener('pointerleave', () => { if (!dragging) clearTimeout(pressTimer); });

  button.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (longPressed) {
      longPressed = false; // the long-press already spun the can
      return;
    }
    const now = performance.now();
    // event.detail is 0 for keyboard clicks; only pointer taps count toward double-tap.
    if (event.detail > 0 && now - lastTap < DOUBLE_TAP_MS) {
      lastTap = 0;
      spin();
      return;
    }
    lastTap = now;
    tap();
  });

  button.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      spin();
    }
  });

  // Stop the long-press context menu / callout on touch devices.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

/* ------------------------------------------------------------------------ */
/* Flavor switching                                                          */
/* ------------------------------------------------------------------------ */

function updatePicker(index) {
  dom.pills.forEach((pill, i) => {
    const active = i === index;
    pill.setAttribute('aria-checked', String(active));
    pill.tabIndex = active ? 0 : -1;
  });
}

function setFlavor(requested) {
  const index = (requested + FLAVORS.length) % FLAVORS.length;

  if (state.swapping) {
    // Remember the latest request and run it when the current swap lands.
    state.pendingIndex = index;
    updatePicker(index);
    return;
  }
  if (index === state.index) {
    updatePicker(index);
    return;
  }

  const previous = state.index;
  const flavor = FLAVORS[index];
  state.index = index;

  updatePicker(index);
  applyPalette(dom.root, flavor.palette);
  dom.themeColor?.setAttribute('content', flavor.palette.bgFrom);
  setCanLabel(dom.heroCan, flavor);
  dom.announcer.textContent = `${flavor.name} selected`;

  if (!hasGsap) {
    // Static fallback: instant swap.
    fx.currentVisual(dom.heroCan).replaceWith(createCanVisual(flavor));
    dom.bgLayers.forEach((layer, i) => { layer.style.opacity = i === index ? '1' : '0'; });
    dom.flavorName.textContent = flavor.name;
    dom.flavorTagline.textContent = flavor.tagline;
    return;
  }

  state.swapping = true;
  const direction = index > previous ? 1 : -1;
  const assets = flavorAssets(flavor);

  if (hero3d) {
    // 3D: the label fills with the new print while lights + background morph.
    fx.currentVisual(dom.heroCan).replaceWith(createCanVisual(flavor));
    hero3d.setFlavor(index);
    // Background floods outward from the can; the real layer takes over underneath.
    liquidWipe({
      container: dom.bg,
      origin: { x: hero3d.screen.x, y: hero3d.screen.y },
      background: backgroundGradient(flavor.palette),
      palette: flavor.palette,
      onCovered: () => dom.bgLayers.forEach((layer, i) => gsap.set(layer, { opacity: i === index ? 1 : 0 })),
    });
    physics?.setFruit(assets.fruitSrc);
    anatomy?.setFlavor(index);
    pour?.setFlavor(index);
    fx.swapText(dom.flavorName, flavor.name);
    fx.swapText(dom.flavorTagline, flavor.tagline);
    gsap.delayedCall(1.2, finishSwap);
    return;
  }

  fx.swapCanVisual(dom.heroCan, createCanVisual(flavor), direction, finishSwap);
  fx.crossfadeLayers(dom.bgLayers, dom.bgLayers[index]);
  fx.swapDecorImages(dom.heroFruit, assets.fruitSrc);
  fx.swapText(dom.flavorName, flavor.name);
  fx.swapText(dom.flavorTagline, flavor.tagline);

  // A little celebratory fizz as the new can lands.
  gsap.delayedCall(0.95, () => {
    if (FLAVORS[state.index] !== flavor) return;
    fx.fizzBurst(fx.burstOrigin(dom.heroCan), assets.bubbleSrc, 10);
  });
}

/** Runs when a swap animation lands; plays any flavor picked mid-swap. */
function finishSwap() {
  state.swapping = false;
  const next = state.pendingIndex;
  state.pendingIndex = null;
  if (next !== null && next !== state.index) setFlavor(next);
}

function bindPicker() {
  dom.pills.forEach((pill, i) => pill.addEventListener('click', () => setFlavor(i)));

  // Radio-group keyboard pattern: arrows move + select, Home/End jump.
  dom.picker.addEventListener('keydown', (event) => {
    const current = dom.pills.indexOf(document.activeElement);
    if (current < 0) return;
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next = null;
    if (event.key in keys) next = (current + keys[event.key] + FLAVORS.length) % FLAVORS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = FLAVORS.length - 1;
    if (next === null) return;
    event.preventDefault();
    dom.pills[next].focus();
    setFlavor(next);
  });

  // "Pick X" buttons in the showcase cards
  dom.flavorGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select]');
    if (!button) return;
    scrollToTop().then(() => setFlavor(Number(button.dataset.select)));
  });
}

function scrollToTop() {
  return new Promise((resolve) => {
    if (window.scrollY < 4) return resolve();
    if (lenis) {
      lenis.scrollTo(0, { duration: 1.4, onComplete: resolve });
      return;
    }
    const behavior = fx.prefersReducedMotion() ? 'auto' : 'smooth';
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('scrollend', done);
      resolve();
    };
    window.addEventListener('scrollend', done, { once: true });
    setTimeout(done, 1400); // browsers without `scrollend`
    window.scrollTo({ top: 0, behavior });
  });
}

/* ------------------------------------------------------------------------ */
/* Pointer parallax (desktop only)                                           */
/* ------------------------------------------------------------------------ */

function bindPointerParallax() {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!finePointer || fx.prefersReducedMotion()) return;

  const tilt = hero3d
    ? { update: (nx, ny) => hero3d.pointer(nx, ny), reset: () => hero3d.pointer(0, 0) }
    : fx.createPointerTilt(() => fx.currentVisual(dom.heroCan).querySelector('.can__tilt'));
  const decor = hero3d ? [] : [...dom.heroDecor.children].map((node) => ({
    depth: Number(node.dataset.depth),
    x: gsap.quickTo(node, 'x', { duration: 0.9, ease: 'power3.out' }),
    y: gsap.quickTo(node, 'y', { duration: 0.9, ease: 'power3.out' }),
  }));

  let heroVisible = true;
  new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(dom.heroStage);

  window.addEventListener('pointermove', (event) => {
    if (!heroVisible || event.pointerType !== 'mouse') return;
    const rect = dom.heroCan.getBoundingClientRect();
    const nx = gsap.utils.clamp(-1, 1, (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2));
    const ny = gsap.utils.clamp(-1, 1, (event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2));
    tilt.update(nx, ny);
    decor.forEach((d) => {
      d.x(nx * 28 * d.depth);
      d.y(ny * 20 * d.depth);
    });
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    tilt.reset();
    decor.forEach((d) => { d.x(0); d.y(0); });
  });
}

/** Idle floating for the hero decorations. */
function startHeroDecorFloat() {
  if (fx.prefersReducedMotion()) return;
  dom.heroDecor.querySelectorAll('.hero-decor__float').forEach((node) => {
    gsap.to(node, {
      y: gsap.utils.random(-18, 18),
      rotation: gsap.utils.random(-20, 20),
      duration: gsap.utils.random(2.4, 4),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Hero hint, sound toggle, CTA                                              */
/* ------------------------------------------------------------------------ */

function onHeroTap() {
  state.heroTaps += 1;
  if (state.heroTaps === 1) fx.swapText(dom.hintText, 'Nice! Now double-tap to spin');
}

function onHeroSpin() {
  if (dom.hint.dataset.hidden) return;
  dom.hint.dataset.hidden = 'true';
  gsap.to(dom.hint, { opacity: 0, y: 12, duration: 0.5, delay: 1.2, ease: 'power2.in' });
}

function bindSoundToggle() {
  const stateLabel = dom.soundToggle.querySelector('.sound-toggle__state');
  dom.soundToggle.addEventListener('click', async () => {
    const turnOn = dom.soundToggle.getAttribute('aria-pressed') !== 'true';
    dom.soundToggle.setAttribute('aria-pressed', String(turnOn));
    stateLabel.textContent = turnOn ? 'On' : 'Off';
    if (turnOn) {
      await sound.enable();
      sound.play('open');
    } else {
      sound.disable();
    }
  });
}

function bindCta() {
  dom.cta.addEventListener('click', async () => {
    await scrollToTop();
    dom.heroCan.focus({ preventScroll: true });
    dom.heroCan.click();
  });
}

/** Resolve when the browser has a quiet moment (or after a short timeout). */
const idle = () => new Promise((resolve) => (
  window.requestIdleCallback ? window.requestIdleCallback(resolve, { timeout: 1500 }) : setTimeout(resolve, 200)
));

/** Lazy-load Matter.js and drop ice / fruit / bubbles into the hero. */
async function initPhysics() {
  if (!hero3d || !PHYSICS.enabled) return;
  try {
    const { createHeroPhysics } = await import('./physics.js');
    const { iceSrc, bubbleSrc } = decorAssets();
    physics = await createHeroPhysics({
      container: dom.hero,
      canvas: dom.heroPhysics,
      getObstacles: () => [
        { el: dom.heroCan, shape: 'can' },
        { el: $('.hero__copy'), shape: 'box' },
        { el: $('.hero__panel'), shape: 'box' },
      ],
      sprites: { ice: iceSrc, bubble: bubbleSrc, fruit: flavorAssets(FLAVORS[state.index]).fruitSrc },
      counts: PHYSICS,
      matterSrc: LIBS.matter,
    });
  } catch (err) {
    console.warn('[Drinko] Physics unavailable.', err);
  }
}

/* ------------------------------------------------------------------------ */
/* Shake it                                                                  */
/* ------------------------------------------------------------------------ */

/** Meter, hold-to-shake button, device motion, and the page-wide eruption. */
function bindShake() {
  const button = $('#shakeBtn');
  const fill = $('#shakeFill');
  const label = $('#shakeLabel');
  const help = $('#shakeHelp');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const canMotion = 'DeviceMotionEvent' in window && coarse;
  if (canMotion) help.textContent = 'or shake your phone';

  // Meter + label follow the pressure
  const setFill = gsap.quickSetter(fill, 'scaleX');
  hero3d.onPressure = (p) => {
    setFill(p);
    const level = p > 0.8 ? 'critical' : p > 0.4 ? 'hot' : '';
    if (button.dataset.level !== level) {
      button.dataset.level = level;
      label.textContent = level === 'critical' ? "It's gonna blow!" : level === 'hot' ? 'Keep going…' : 'Hold to shake';
    }
  };

  // Hold the button (pointer or keyboard) to build pressure
  let holding = false;
  gsap.ticker.add((time, deltaMs) => {
    if (holding) hero3d.addPressure(0.75 * Math.min(deltaMs, 50) / 1000);
  });
  const start = (event) => {
    event.preventDefault();
    holding = true;
    if (canMotion) enableMotion();
  };
  const stop = () => { holding = false; };
  button.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => button.addEventListener(t, stop));
  button.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') start(event);
  });
  button.addEventListener('keyup', stop);
  button.addEventListener('contextmenu', (event) => event.preventDefault());

  // Real shaking on phones (iOS asks for permission on the first press)
  let motionOn = false;
  async function enableMotion() {
    if (motionOn) return;
    motionOn = true;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function' && (await DeviceMotionEvent.requestPermission()) !== 'granted') return;
    } catch { return; }
    let last = null;
    window.addEventListener('devicemotion', (event) => {
      if (!hero3d.active || hero3d.rig.anchor > 0.5) return; // only while the hero can is on screen
      const a = event.acceleration;
      let force;
      if (a && a.x !== null) {
        force = Math.hypot(a.x, a.y, a.z);
      } else {
        const g = event.accelerationIncludingGravity;
        if (!g) return;
        force = last ? Math.hypot(g.x - last.x, g.y - last.y, g.z - last.z) : 0;
        last = { x: g.x, y: g.y, z: g.z };
      }
      if (force > 13) hero3d.addPressure(Math.min(0.08, (force - 13) * 0.006));
    });
  }
  if (canMotion && typeof DeviceMotionEvent.requestPermission !== 'function') enableMotion();

  // Kaboom: everything on the page reacts
  hero3d.onGeyser = (origin) => {
    const flavor = FLAVORS[state.index];
    holding = false;
    sound.play('open');
    sound.play('fizz');
    ambient?.scatter(origin);
    physics?.explode(origin);
    physics?.explode(origin);
    gsap.fromTo([dom.scene3d, '.hero__copy', '.hero__panel'], { x: 0, y: 0 }, {
      keyframes: { x: [0, -14, 12, -10, 8, -5, 3, 0], y: [0, 8, -10, 6, -5, 3, -1, 0] },
      duration: 0.6,
      ease: 'none',
    });
    liquidWipe({
      container: dom.bg,
      origin,
      background: backgroundGradient(flavor.palette),
      palette: flavor.palette,
    });
    gsap.delayedCall(0.5, () => screenDrips({ layer: $('.fx-layer'), src: flavorAssets(flavor).dropSrc }));
    dom.announcer.textContent = 'Kaboom! The can erupted.';
  };
}

/** Show the carousel's front flavor in the info panel. */
function renderCarouselInfo(index, immediate = false) {
  const flavor = FLAVORS[index];
  const { palette } = flavor;
  dom.carousel.style.setProperty('--carousel-primary', palette.primary);
  dom.carousel.style.setProperty('--carousel-accent', palette.accent);
  dom.carousel.style.setProperty('--carousel-highlight', palette.highlight);
  dom.carouselIndex.textContent = `No. ${String(index + 1).padStart(2, '0')}`;
  dom.carouselText.textContent = flavor.description;
  dom.carouselNotes.innerHTML = flavor.notes.map((n) => `<li>${n}</li>`).join('');
  $('#carouselPick').textContent = `Pick ${flavor.short}`;
  [...dom.carouselDots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  if (immediate) {
    dom.carouselTitle.textContent = flavor.name;
    dom.carouselTagline.textContent = flavor.tagline;
  } else {
    fx.swapText(dom.carouselTitle, flavor.name);
    fx.swapText(dom.carouselTagline, flavor.tagline);
    gsap.fromTo([dom.carouselText, dom.carouselNotes], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' });
    gsap.fromTo('.carousel__glow', { opacity: 0.15 }, { opacity: 0.45, duration: 0.9, ease: 'power2.out' });
  }
}

/** Build the 3D flavor carousel and swap it in for the flat cards. */
async function initCarousel() {
  try {
    const { FlavorCarousel } = await import('./three/carousel.js');
    const stage = await new FlavorCarousel(hero3d, {
      anchor: dom.carouselStage,
      flavors: FLAVORS,
      onChange: (i) => renderCarouselInfo(i),
      onCrack: (origin) => {
        sound.play('open');
        sound.play('fizz');
        ambient?.scatter(origin);
      },
    }).build();
    carousel = hero3d.addStage(stage);

    dom.carouselDots.innerHTML = FLAVORS.map((f, i) => `<button type="button" aria-label="Show ${f.name}" data-i="${i}"></button>`).join('');
    dom.carouselDots.addEventListener('click', (event) => {
      const dot = event.target.closest('[data-i]');
      if (dot) carousel.goTo(Number(dot.dataset.i));
    });
    $('#carouselPrev').addEventListener('click', () => carousel.prev());
    $('#carouselNext').addEventListener('click', () => carousel.next());
    $('#carouselPick').addEventListener('click', () => {
      const index = carousel.front;
      scrollToTop().then(() => setFlavor(index));
    });
    renderCarouselInfo(0, true);
    dom.carouselStage.dataset.cursor = 'Drag · Tap';

    document.documentElement.classList.add('has-carousel');
    const trigger = ScrollTrigger.create({
      trigger: dom.carousel,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => { carousel.active = self.isActive; },
    });
    ScrollTrigger.refresh();
    carousel.active = trigger.isActive;
  } catch (err) {
    console.warn('[Drinko] 3D carousel unavailable; keeping the flavor cards.', err);
  }
}

/** Render a stage only while its section is (nearly) on screen. */
function activateWithSection(stage, section) {
  const trigger = ScrollTrigger.create({
    // A pinned section's own box ends after one screen; its pin spacer spans the whole pin.
    trigger: section.closest('.pin-spacer') || section,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      stage.active = self.isActive;
      if (!self.isActive) stage.onDeactivate?.();
    },
  });
  stage.active = trigger.isActive;
}

/** Scroll state shared by the pinned timelines (created at boot) and the stages (built later). */
const anatomyState = { tab: 0, lid: 0, base: 0, sleeve: 0, wall: 0, spin: 0 };
const pourState = { enter: 0, tilt: 0, fill: 0, foam: 0, exit: 0 };

/** Build the exploded-view stage and hook its callouts + leader lines up. */
async function initAnatomy() {
  try {
    const { AnatomyStage } = await import('./three/anatomy.js');
    const svgNS = 'http://www.w3.org/2000/svg';
    const callouts = [...dom.anatomyCallouts.children].map((li) => {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('class', 'anatomy__line');
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('class', 'anatomy__dot');
      dot.setAttribute('r', '4');
      dom.anatomyLines.append(line, dot);
      const item = ANATOMY.find((a) => a.part === li.dataset.part);
      return { part: item.part, side: item.side, el: li, line, dot };
    });
    window.addEventListener('resize', () => callouts.forEach((c) => { c.width = 0; })); // re-measure
    anatomy = hero3d.addStage(await new AnatomyStage(hero3d, {
      anchor: dom.anatomyStage,
      container: dom.anatomyInner,
      state: anatomyState,
      callouts,
      lines: dom.anatomyLines,
    }).build(state.index));
    activateWithSection(anatomy, dom.anatomy);
  } catch (err) {
    console.warn('[Drinko] Anatomy view unavailable.', err);
  }
}

/** Build the pour stage. */
async function initPour() {
  try {
    const { PourStage } = await import('./three/pour.js');
    let shown = -1;
    pour = hero3d.addStage(await new PourStage(hero3d, {
      anchor: dom.pourStage,
      state: pourState,
      onLevel: (fill) => {
        const percent = Math.round(fill * 100);
        if (percent !== shown) dom.pourLevel.textContent = shown = percent;
      },
    }).build(state.index));
    activateWithSection(pour, dom.pour);
  } catch (err) {
    console.warn('[Drinko] Pour scene unavailable.', err);
  }
}

/**
 * Swap the 2D card + footer cans for renders of the 3D can, so every can on
 * the page is the same can. (The 2D fallback keeps its 2D cans.)
 */
function useRenderedCans() {
  const renders = FLAVORS.map((_, i) => hero3d.snapshot(i));
  document.querySelectorAll('.can--card, .can--footer').forEach((button) => {
    const i = FLAVORS.findIndex((f) => f.id === button.dataset.flavor);
    const rendered = { ...FLAVORS[i], canSrc: renders[i], tabSrc: false, canLayout: { tabTop: '10%' } };
    fx.currentVisual(button).replaceWith(createCanVisual(rendered));
  });
}

/* ------------------------------------------------------------------------ */
/* Boot                                                                      */
/* ------------------------------------------------------------------------ */

let ambient = null;
let physics = null; // Matter.js toys (3D experience only)
let lenis = null;   // smooth scroll (3D experience only)
let carousel = null; // 3D flavor carousel stage
let anatomy = null;  // exploded-view stage
let pour = null;     // pour stage

/** In-page links glide with Lenis instead of jumping. */
function bindAnchorLinks() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !lenis) return;
    const target = link.getAttribute('href') === '#top' ? 0 : document.querySelector(link.getAttribute('href'));
    if (target === null) return;
    event.preventDefault();
    lenis.scrollTo(target, { duration: 1.4 });
  });
}

async function init3D() {
  try {
    const { Hero3D } = await import('./three/hero3d.js');
    hero3d = await new Hero3D({
      canvas: dom.scene3d,
      anchor: dom.heroCan,
      glow: dom.bgGlow,
      flavors: FLAVORS,
      config: { ...SCENE_3D, iceSrc: decorAssets().iceSrc },
      flavorAssets,
    }).init(state.index);
    hero3d.prepareIntro();
  } catch (err) {
    console.warn('[Drinko] 3D hero unavailable, using the 2D can instead.', err);
    hero3d = null;
    document.documentElement.classList.remove('is-3d');
  }
}

async function boot() {
  buildPage();

  if (!hasGsap) {
    console.warn('[Drinko] GSAP failed to load (offline?). Showing the static site.');
    document.documentElement.classList.add('no-gsap');
    dom.loader.remove();
    document.body.classList.remove('is-loading');
    bindPicker();
    bindSoundToggle();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  if (wants3D) document.documentElement.classList.add('is-3d');
  setLoaderProgress(0.08);
  const smoothScroll = wants3D
    ? import('./story.js').then((m) => m.initSmoothScroll(LIBS.lenis)).then((l) => { lenis = l; }).catch((err) => {
      console.warn('[Drinko] Smooth scroll unavailable.', err);
    })
    : Promise.resolve();
  await preload((p) => setLoaderProgress(p), wants3D ? [init3D(), smoothScroll] : []);
  await setLoaderProgress(1);

  document.body.classList.remove('is-loading');
  ambient = fx.createAmbientBubbles(dom.ambient, decorAssets().bubbleSrc);

  const intro = fx.playIntro({
    loader: dom.loader,
    heroCan: hero3d ? null : dom.heroCan, // the 3D can has its own drop-in
    heroWord: dom.heroWord,
    revealItems: document.querySelectorAll('.hero .reveal'),
    hint: dom.hint,
  });

  // Heavy extras wait until the intro has played so they can't stutter it:
  // physics, then the other flavor labels (idle time), then HDR reflections,
  // then the card + footer cans are re-rendered from the 3D can.
  // Hooked up immediately: a long setup task below can make GSAP's clock jump
  // past the end of the intro, and onComplete never fires retroactively.
  const afterIntro = async () => {
    await initPhysics();
    if (!hero3d) return;
    await hero3d.prepareLabels();
    await initCarousel();
    await idle();
    await initAnatomy();
    await idle();
    await initPour();
    await idle();
    await hero3d.loadEnvironment();
    await idle();
    useRenderedCans();
  };
  if (intro.progress() === 1) afterIntro();
  else intro.eventCallback('onComplete', afterIntro);

  if (hero3d) {
    // The 3D can drops in as the loader lifts.
    gsap.delayedCall(0.45, () => hero3d.intro({
      onImpact: (origin) => {
        ambient?.scatter(origin);
        sound.play('fizz');
      },
    }));

    bindShake();

    // Pointer polish (mouse / trackpad only)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      dom.heroCan.dataset.cursor = 'Drag · Tap';
      document.querySelectorAll('.can--card, .can--footer').forEach((can) => { can.dataset.cursor = 'Tap'; });
      initCursor();
      initMagnetic(document.querySelectorAll('.btn, .pill, .sound-toggle, .nav__logo, .shake__btn'));
    }
  }


  // Wire every can on the page.
  bindCan(dom.heroCan, () => FLAVORS[state.index], {
    onTap: onHeroTap,
    onSpin: onHeroSpin,
    ...(hero3d && {
      actions: { tap: () => hero3d.tap(tapEffects), spin: () => hero3d.spin() },
      drag: { move: (dx) => hero3d.dragBy(dx), end: () => hero3d.release() },
    }),
  });
  document.querySelectorAll('.can--card, .can--footer').forEach((button) => {
    const flavor = FLAVORS.find((f) => f.id === button.dataset.flavor);
    bindCan(button, () => flavor);
  });

  bindPicker();
  bindSoundToggle();
  bindCta();
  bindPointerParallax();
  startHeroDecorFloat();

  if (hero3d) {
    const { initStory } = await import('./story.js');
    initStory({ hero3d, hero: dom.hero, story: dom.story, nextSection: $('.marquee-wrap') });
    // Pins for the later 3D sections exist from the start; their stages are built in idle time.
    const { initAnatomyScroll, initPourScroll } = await import('./sections.js');
    initAnatomyScroll({ section: dom.anatomy, state: anatomyState });
    initPourScroll({ section: dom.pour, state: pourState, lines: [...document.querySelectorAll('.pour__line')] });
    bindAnchorLinks();
  }

  fx.createMarquee(dom.marqueeTrack);
  fx.initScrollEffects({
    heroStage: hero3d ? null : dom.heroStage, // the 3D rig handles the hero can on scroll
    heroWord: dom.heroWord,
    headings: document.querySelectorAll('[data-split]'),
    cards: document.querySelectorAll('.flavor-card'),
    floaters: document.querySelectorAll('.floater'),
    revealGroups: [dom.ingredients, dom.facts, dom.footerCans, ...(hero3d ? [] : [dom.storyBeats, dom.anatomyCallouts])],
    counters: document.querySelectorAll('[data-count]'),
  });


  // Add ?debug to the URL to poke at the 3D scene from the console.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.drinko = {
      hero3d,
      get physics() { return physics; },
      get carousel() { return carousel; },
      get anatomy() { return anatomy; },
      get pour() { return pour; },
    };
  }


  // Rebuild ambient bubbles only when the width changes (ignores mobile URL-bar resizes).
  let lastWidth = window.innerWidth;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(window.innerWidth - lastWidth) < 80) return;
      lastWidth = window.innerWidth;
      ambient.rebuild();
    }, 250);
  });
}

boot();
