/**
 * Drinko site configuration
 * ---------------------------------------------------------------------------
 * EVERYTHING visual that you might want to swap lives here: flavors, color
 * palettes, and every image / audio path.
 *
 * Asset paths:
 *   - `null`  -> a stylized placeholder is generated in code (see placeholders.js)
 *   - string  -> your own file is used instead, e.g. 'assets/cans/cherry.png'
 *
 * The animation code never cares which one you use. It only receives elements.
 */

export const BRAND = {
  name: 'Drinko',
  tagline: 'Crack the fizz.',
  subline: 'Ice-cold sparkling soda, loud flavors, real fruit. Tap the can and hear it hiss.',
};

/**
 * Where the pull tab sits on top of the can, as a percentage of the can image box.
 * Tweak these if your own can artwork has its lid in a different spot.
 * Individual flavors can override it with their own `canLayout`.
 */
export const CAN_LAYOUT = {
  aspectRatio: 200 / 380, // width / height of the can artwork
  tabTop: '1.4%',
  tabLeft: '37%',
  tabWidth: '26%',
};

/** Decorations shared by every flavor. */
export const DECOR = {
  bubbleSrc: null, // e.g. 'assets/decor/bubble.png'
  iceSrc: null,    // e.g. 'assets/decor/ice-cube.png'
};

/** Sound effects. Missing / unreadable files fall back to a synthesized sound. */
export const SOUNDS = {
  openSrc: 'assets/audio/can-open.wav',
  fizzSrc: 'assets/audio/fizz.wav',
  volume: 0.6,
};

/**
 * Flavors. Add a new object to this array to add a flavor; every section of
 * the site (hero selector, showcase cards, footer cans, backgrounds) updates.
 *
 * palette:
 *   primary   main can / UI color
 *   dark      deep shade for shadows and label art
 *   highlight bright tint used for gloss + glow
 *   accent    contrasting pop color (sparkles, buttons, focus rings)
 *   bgFrom    page background, outer edge
 *   bgTo      page background, glow behind the can
 *   ink       readable text color on top of `accent`
 */
export const FLAVORS = [
  {
    id: 'cherry-comet',
    name: 'Cherry Comet',
    short: 'Cherry',
    tagline: 'Dark cherry, lit up.',
    description:
      'Black cherry and a pinch of pink pepper, launched on a tail of ultra-fine bubbles. Sweet, bold, a little dangerous.',
    notes: ['Black cherry', 'Pink pepper', 'Vanilla finish'],
    palette: {
      primary: '#e11d48',
      dark: '#6d0820',
      highlight: '#ff8aa1',
      accent: '#ffd36e',
      bgFrom: '#14020a',
      bgTo: '#7a0c26',
      ink: '#2b0710',
    },
    fruit: 'cherry', // placeholder generator to use when fruitSrc is null
    canSrc: null,    // 2D can art (cards, footer, 2D fallback), e.g. 'assets/cans/cherry-comet.png'
    tabSrc: null,    // e.g. 'assets/cans/tab.png'; false = your can art already shows its tab
    labelSrc: null,  // 3D label wrap texture (~2.3:1), e.g. 'assets/labels/cherry.png'. null = generated
    splashSrc: null, // e.g. 'assets/splash/cherry-splash.png'
    dropSrc: null,   // single liquid droplet, e.g. 'assets/splash/cherry-drop.png'
    fruitSrc: null,  // e.g. 'assets/fruit/cherry.png'
  },
  {
    id: 'lime-voltage',
    name: 'Lime Voltage',
    short: 'Lime',
    tagline: 'Zest with a live wire.',
    description:
      'Fresh-cut lime and a flick of ginger, charged until it crackles. The sharpest, brightest can in the fridge.',
    notes: ['Key lime', 'Ginger spark', 'Sea-salt edge'],
    palette: {
      primary: '#7ccf1a',
      dark: '#1f4d0c',
      highlight: '#d8ff7a',
      accent: '#f4ff5e',
      bgFrom: '#030f06',
      bgTo: '#1d5a1c',
      ink: '#132b06',
    },
    fruit: 'lime',
    canSrc: null,
    tabSrc: null,
    labelSrc: null,
    splashSrc: null,
    dropSrc: null,
    fruitSrc: null,
  },
  {
    id: 'citrus-flare',
    name: 'Citrus Flare',
    short: 'Citrus',
    tagline: 'Golden hour, canned.',
    description:
      'Blood orange and sun-ripe tangerine with a soft honey glow. Like the last warm evening of summer, served at 4°C.',
    notes: ['Blood orange', 'Tangerine', 'Wild honey'],
    palette: {
      primary: '#ff7417',
      dark: '#7c2406',
      highlight: '#ffc580',
      accent: '#ffe27a',
      bgFrom: '#160602',
      bgTo: '#86300a',
      ink: '#2e1003',
    },
    fruit: 'orange',
    canSrc: null,
    tabSrc: null,
    labelSrc: null,
    splashSrc: null,
    dropSrc: null,
    fruitSrc: null,
  },
];

/**
 * 3D hero (Three.js). Used when WebGL works and reduced motion is off;
 * otherwise the 2D can above is shown instead.
 */
export const SCENE_3D = {
  enabled: true,
  modelSrc: null, // e.g. 'assets/models/can.glb' (see README for naming). null = procedural can
  hdrSrc: 'assets/env/studio_small_09_1k.hdr', // reflections; lazy-loaded after first frame
  maxPixelRatio: 2,
  labelResolution: { desktop: 2048, mobile: 1024 }, // label texture width in px
  particles: { desktop: { drops: 560, bubbles: 480 }, mobile: { drops: 260, bubbles: 240 } }, // pools; the geyser needs the headroom
  condensation: { desktop: 70, mobile: 40 },
  flyers: { desktop: 18, mobile: 10 }, // fruit / ice flying past the camera during the story
};

/** Matter.js toys in the hero: counts are halved-ish on small screens. */
export const PHYSICS = {
  enabled: true,
  ice: 5,
  fruit: 4,
  bubbles: 9,
  mobileScale: 0.6,
};

/** Pinned scroll story beats (the 3D can rotates / zooms between them). */
export const STORY = [
  { kicker: '01 · Cold open', title: 'Brushed aluminum, chilled to 4°C.', text: 'Every can is sealed cold so the first crack sounds like a starting pistol.' },
  { kicker: '02 · Under pressure', title: 'Millions of tiny bubbles.', text: 'Fine carbonation that fizzes up your nose and settles into a long, clean finish.' },
  { kicker: '03 · Real fruit', title: 'Squeezed, not simulated.', text: 'Fruit juice, botanicals and a whisper of cane sugar. That\'s the whole list.' },
];

/**
 * Exploded "anatomy" view callouts. `part` is which piece of the 3D can the
 * leader line points at: tab | lid | sleeve | wall | liquid | base.
 * `side` is where the label sits on wide screens.
 */
export const ANATOMY = [
  { part: 'tab', side: 'left', title: 'Stay-on tab', text: 'Pops, folds back, never ends up on the beach.' },
  { part: 'lid', side: 'right', title: 'Rolled rim', text: 'A smooth double seam, so every sip skips the sharp edge.' },
  { part: 'sleeve', side: 'left', title: 'Printed sleeve', text: 'Low-ink print over brushed metal. The shine is the can itself.' },
  { part: 'wall', side: 'right', title: '100% recyclable', text: 'Aluminum thinner than a hair, and back on the shelf as a new can.' },
  { part: 'liquid', side: 'left', title: 'The good stuff', text: '330 ml · 12% real juice · 2.4 volumes of fizz.' },
  { part: 'base', side: 'right', title: 'Domed base', text: 'Shaped like an arch to hold the pressure of all that fizz.' },
];

/** External libraries (lazy-loaded only in the 3D experience). Three.js is mapped in index.html's import map. */
export const LIBS = {
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js',
  matter: 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
};

/** Ingredient cards + fun facts shown in the "Inside" section. */
export const INGREDIENTS = [
  { title: 'Sparkling water', text: 'Triple-filtered, then chilled before carbonation so the bubbles stay tiny and sharp.' },
  { title: 'Real fruit juice', text: 'Squeezed fruit, not flavor "notes". You can taste the pulp-side of the orchard.' },
  { title: 'Cane sugar, lightly', text: 'Just enough to round the edges. Never syrups, never sweeteners.' },
  { title: 'Botanical spark', text: 'Pepper, ginger and honey accents that make each flavor finish clean.' },
];

export const FUN_FACTS = [
  { value: 12, suffix: '%', label: 'real fruit juice' },
  { value: 4, suffix: '°C', label: 'perfect serve temp' },
  { value: 330, suffix: 'ml', label: 'of pure fizz' },
  { value: 0, suffix: '', label: 'artificial colors' },
];
