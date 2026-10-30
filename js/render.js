/**
 * Asset resolution + DOM builders.
 * ---------------------------------------------------------------------------
 * This is the only place that decides "real file vs generated placeholder".
 * Everything returned from here is a plain element or URL, so animation code
 * works the same for both.
 */
import { CAN_LAYOUT, DECOR } from './config.js';
import {
  canSVG, tabSVG, splashSVG, dropSVG, bubbleSVG, iceSVG, fruitSVG, svgToDataURI,
} from './placeholders.js';

let uidCounter = 0;
const nextUid = () => `dk${++uidCounter}`;

const assetCache = new Map();

/**
 * URLs for every image a flavor needs (except the can itself, which may be
 * inline SVG). Results are cached per flavor.
 */
export function flavorAssets(flavor) {
  if (assetCache.has(flavor.id)) return assetCache.get(flavor.id);
  const p = flavor.palette;
  const assets = {
    splashSrc: flavor.splashSrc || svgToDataURI(splashSVG(p)),
    dropSrc: flavor.dropSrc || svgToDataURI(dropSVG(p)),
    fruitSrc: flavor.fruitSrc || svgToDataURI(fruitSVG(flavor.fruit, p)),
    bubbleSrc: decorAssets().bubbleSrc,
  };
  assetCache.set(flavor.id, assets);
  return assets;
}

let decorCache = null;
export function decorAssets() {
  decorCache ??= {
    bubbleSrc: DECOR.bubbleSrc || svgToDataURI(bubbleSVG()),
    iceSrc: DECOR.iceSrc || svgToDataURI(iceSVG()),
  };
  return decorCache;
}

/** Collect every user-provided file path so the loader can preload them. */
export function collectPreloadUrls(flavors) {
  const urls = new Set();
  for (const f of flavors) {
    [f.canSrc, f.tabSrc, f.splashSrc, f.dropSrc, f.fruitSrc].forEach((u) => typeof u === 'string' && urls.add(u));
  }
  [DECOR.bubbleSrc, DECOR.iceSrc].forEach((u) => u && urls.add(u));
  return [...urls];
}

/** Tiny element helper. */
export function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function img(src, className = '', alt = '') {
  const node = el('img', className, { src, alt, draggable: 'false', decoding: 'async' });
  return node;
}

/**
 * One visual can: body + pull tab + light-sweep overlay, wrapped in the
 * transform layers the animations use:
 *
 *   .can__swap    slide in/out when the flavor changes
 *    .can__tilt   pointer-follow tilt
 *     .can__motion  tap shake / spin
 *       .can__body, .can__tab (tab pop), .can__sweep (light sweep)
 */
export function createCanVisual(flavor) {
  const layout = { ...CAN_LAYOUT, ...flavor.canLayout };
  const uid = nextUid();

  const swap = el('span', 'can__swap');
  swap.dataset.flavor = flavor.id;
  swap.style.setProperty('--tab-top', layout.tabTop);
  swap.style.setProperty('--tab-left', layout.tabLeft);
  swap.style.setProperty('--tab-width', layout.tabWidth);

  const tilt = el('span', 'can__tilt');
  const motion = el('span', 'can__motion');
  const body = el('span', 'can__body');
  const tab = el('span', 'can__tab');
  const sweep = el('span', 'can__sweep');
  sweep.append(el('span', 'can__beam'));

  // Body: real file, or inline SVG so it can use the page's web fonts.
  let maskUrl;
  if (flavor.canSrc) {
    body.append(img(flavor.canSrc));
    maskUrl = flavor.canSrc;
  } else {
    body.innerHTML = canSVG(flavor, uid);
    maskUrl = svgToDataURI(canSVG(flavor, `${uid}m`));
  }
  // The sweep is masked to the can's silhouette so the light never spills outside it.
  // Absolute URL: a relative url() inside a custom property would resolve against css/.
  sweep.style.setProperty('--mask', `url("${new URL(maskUrl, document.baseURI).href}")`);

  // tabSrc: string = your tab art, null = generated tab, false = artwork already
  // includes a tab (the empty layer still marks where bursts erupt from).
  if (flavor.tabSrc) tab.append(img(flavor.tabSrc));
  else if (flavor.tabSrc !== false) tab.innerHTML = tabSVG(uid);
  else tab.classList.add('can__tab--hidden');

  motion.append(body, tab, sweep);
  tilt.append(motion);
  swap.append(tilt);
  return swap;
}

/** A can as an accessible <button>. */
export function createCanButton(flavor, extraClass = '') {
  const button = el('button', `can ${extraClass}`.trim(), { type: 'button' });
  button.style.setProperty('--can-ratio', String(CAN_LAYOUT.aspectRatio));
  setCanLabel(button, flavor);
  button.append(el('span', 'can__shadow', { 'aria-hidden': 'true' }), createCanVisual(flavor));
  return button;
}

export function setCanLabel(button, flavor) {
  button.setAttribute(
    'aria-label',
    `${flavor.name} can. Press to crack it open. Double-press, long-press or press R to spin it.`,
  );
}

/** CSS custom properties for a palette, applied to any element. */
export function applyPalette(target, palette) {
  const map = {
    '--primary': palette.primary,
    '--dark': palette.dark,
    '--highlight': palette.highlight,
    '--accent': palette.accent,
    '--ink': palette.ink,
    '--bg-from': palette.bgFrom,
    '--bg-to': palette.bgTo,
  };
  for (const [key, value] of Object.entries(map)) target.style.setProperty(key, value);
}

/** Background layer for a flavor (crossfaded with opacity only). */
export function backgroundGradient(palette) {
  return `radial-gradient(38% 32% at 50% 40%, ${palette.primary}55 0%, transparent 100%),
          radial-gradient(120% 90% at 50% 38%, ${palette.bgTo} 0%, ${palette.bgFrom} 62%),
          ${palette.bgFrom}`;
}
