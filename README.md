# Drinko: Animated Soda Product Page

A single-page, cinematic product site for **Drinko**, a fictional soft-drink brand.

**Built with:** HTML, CSS, Vanilla JavaScript (ES Modules), Three.js, GSAP, Lenis, and Matter.js.

## Website Preview

![Drinko Website Preview](assets/%22drinko_website-preview.gif%22)

---

## Features

### 3D Experience

A cinematic WebGL experience featuring a Three.js can with PBR metal, HDR reflections, and soft shadows.

- Physically simulated splash and fizz particles.
- Condensation sliding down the can.
- Matter.js ice and fruit physics.
- Pinned scroll story with Lenis smooth scrolling.
- Liquid-wipe flavor transitions.
- Custom cursor and magnetic buttons.

### Four Showpiece Sections

**1. Shake It**

Shake your phone, wiggle the can, or hold the button until the pressure meter fills and the can erupts in a geyser.

**2. 3D Flavor Carousel**

Cans arranged on a 3D ring over a glossy floor. Drag, tap, or use the arrow keys to navigate.

**3. Exploded Anatomy**

Scroll to take the can apart layer by layer, with labelled callouts explaining its components.

**4. The Pour**

Scroll to tip the can into a glass of ice. Watch it fill, fizz, and foam.

### 2D Fallback

When WebGL is unavailable or `prefers-reduced-motion` is enabled, Drinko automatically switches to the original lightweight SVG/GSAP experience.

Nothing heavy is downloaded in this mode.

---

## Try It Yourself

- Tap the can to crack it open.
- Drag the hero can to spin it. It keeps its momentum.
- Double-tap, long-press, or press **R** for a 360° spin.
- Pick a flavor to flood the page with its colors.

---

## Running Locally

ES modules cannot load directly from `file://` in Chrome, Edge, or Safari. You need to serve the project folder using a local development server.

**Option 1: Using npx**

```bash
npx serve .
```

**Option 2: Using Python**

```bash
python3 -m http.server 8000
```

Then open the URL printed in your terminal.

If you double-click `index.html`, the loader explains the issue after a few seconds.

**Note:** GSAP, Three.js, Lenis, and Matter.js are loaded from CDNs, so an internet connection is required on the first load.

### Debug Mode

Add `?debug` to the URL to access `window.drinko` in the browser console:

- `hero3d`
- `physics`
- `carousel`
- `anatomy`
- `pour`

---

## Page Structure

Hero (with **Shake It**) → Scroll Story → Marquee → **3D Flavor Carousel** → **Anatomy** → Ingredients → **Pour** → Footer.

In the 2D fallback:

- Carousel becomes flat flavor cards.
- Anatomy becomes a list of facts.
- Pour becomes plain descriptive content.

---

## Project Structure

```text
index.html              Page shell + import map for Three.js
css/styles.css          All styling (2D + 3D layers, cursor, story, reduced motion)
js/config.js            Flavors, palettes, copy, asset paths, 3D / physics / story settings
js/main.js              Boot, preloading, DOM building, picks 3D vs 2D, event wiring
js/animations.js        2D GSAP animations (tap, spin, swap, bursts, scroll reveals)
js/render.js            Your file vs generated placeholder + 2D can DOM
js/placeholders.js      SVG generators for 2D cans, splash, ice, fruit, bubbles
js/sound.js             Toggleable sound with a synthesized fallback
js/story.js             Lenis smooth scroll + pinned ScrollTrigger story
js/sections.js          Pinned scroll timelines for anatomy + pour sections
js/physics.js            Matter.js ice / fruit / bubbles in the hero
js/polish.js             Liquid wipe, magnetic buttons, custom cursor, lens drips
js/loadScript.js         Lazy loader for UMD libraries
js/three/hero3d.js       Renderer, lights, camera rig, gestures, frame loop
js/three/canModel.js     Procedural lathe can or .glb loader + label morph shader
js/three/labels.js       Generated label textures + wet bump/roughness maps
js/three/particles.js    Instanced splash droplets + GPU point fizz
js/three/condensation.js Sliding condensation beads (instanced)
js/three/flyers.js       Fruit/ice fly-pasts with depth-of-field blur levels
js/three/stage.js        Base class for extra 3D sections sharing the hero's renderer
js/three/carousel.js     3D flavor carousel (ring, glossy floor, drag + snap)
js/three/anatomy.js      Exploded view + live callouts with leader lines
js/three/pour.js         Can-to-glass pour: clipped liquid, rope, ice, bubbles, foam
assets/                 Your files (cans, splash, fruit, decor, audio, env, models)
```

---

## Swapping in Your Own Assets

Everything is configured in `js/config.js`.

- A path of `null` means generate a placeholder in code.
- A string means use the specified asset file.

The animation code never changes.

### 3D Can Model (.glb)

1. Put your model in `assets/models/`, for example `assets/models/can.glb`.
2. Configure it in `SCENE_3D`:

```js
export const SCENE_3D = {
  modelSrc: 'assets/models/can.glb',
  // ...
};
```

Naming conventions inside the `.glb`:

| Name Contains | What Happens |
|---|---|
| `label` (mesh or material name) | Gets the flavor label texture and liquid-fill morph on flavor change. UVs should wrap the label once around. |
| `tab` (any object) | Pops open on tap by rotating around its own X axis. Put the origin at the rivet. |

The model is automatically scaled to approximately one unit in height, centered, and placed on the floor.

If loading fails, the procedural can is used instead, and the console explains why.

### Label Textures (3D)

Each flavor can have its own wrap-around label image:

```js
{
  id: 'cherry-comet',
  // ...
  labelSrc: 'assets/labels/cherry.png'
}
```

Recommended dimensions: approximately 2048 × 860 pixels (2.4:1 ratio).

The left and right edges meet at the back of the can, and the center faces the viewer.

Set `labelSrc` to `null` to generate a label using the flavor's palette.

### Reflections (HDR)

`SCENE_3D.hdrSrc` points to an equirectangular `.hdr` file.

The bundled environment uses Poly Haven's CC0 `studio_small_09`.

It loads lazily after the intro. Until then, or if loading fails, a painted studio environment is used.

### 2D Cans, Splash, Fruit, Decor & Sound

These assets are configured in `js/config.js`:

```js
canSrc:    'assets/cans/cherry-comet.png',
tabSrc:    'assets/cans/tab.png',
splashSrc: 'assets/splash/cherry-splash.png',
dropSrc:   'assets/splash/cherry-drop.png',
fruitSrc:  'assets/fruit/cherry.png',
```

These are used by the 2D fallback and as sprites in the 3D experience.

Shared images live in `DECOR` (`bubbleSrc`, `iceSrc`) and sounds in `SOUNDS`.

All images should have transparent backgrounds.

`CAN_LAYOUT` (or a per-flavor `canLayout`) controls the positioning of the 2D tab on your can artwork.

### Libraries

- Three.js is mapped through the import map at the top of `index.html`.
- Lenis and Matter.js URLs are configured in `LIBS` inside `config.js`.

---

## Adding a New Flavor

Add a new object to `FLAVORS` in `js/config.js`:

```js
{
  id: 'grape-galaxy',
  name: 'Grape Galaxy',
  short: 'Grape',
  tagline: 'Purple, but louder.',
  description: 'Concord grape and blackcurrant…',
  notes: ['Concord grape', 'Blackcurrant', 'Lavender'],
  palette: {
    primary: '#8b3dff',
    dark: '#2e0b66',
    highlight: '#d2b3ff',
    accent: '#7cf5ff',
    bgFrom: '#0b0418',
    bgTo: '#3b1478',
    ink: '#08151a',
  },
  fruit: 'cherry',
  canSrc: null,
  tabSrc: null,
  splashSrc: null,
  dropSrc: null,
  fruitSrc: null,
  labelSrc: null,
}
```

The picker, 3D label, lights, particles, backgrounds, cards, footer, and marquee automatically pick up the new flavor.

---

## Tuning

| Setting (`config.js`) | Controls |
|---|---|
| `SCENE_3D.enabled` | Set to `false` to force the 2D site. |
| `SCENE_3D.maxPixelRatio` | Render resolution cap (default 2; automatically decreases if frames run slowly). |
| `SCENE_3D.labelResolution` | Label texture width for desktop and mobile. |
| `SCENE_3D.particles`, `.condensation`, `.flyers` | Particle budgets for desktop and mobile. |
| `PHYSICS` | Number of ice cubes, fruit, and bubbles; `mobileScale`. |
| `STORY` | Scroll-story beats (kicker, title, text). |
| `ANATOMY` | Exploded-view callouts: part, side, title, and text. |

---

## How the Extra 3D Sections Work

There is still **one WebGL canvas and context**.

The carousel, anatomy, and pour are stages (`js/three/stage.js`). Each has its own scene and camera, and its camera is fitted every frame so the scene lands inside a DOM element (for example, `#carouselStage`).

The canvas is fixed, but each scene scrolls with its section.

A stage only renders while its section is on screen, and stages share the hero's shader cache, label textures, and HDR reflections.

The pinned scroll timelines (`js/sections.js`) are created at page load and tween plain state objects. The stages are built afterwards, in idle time, and read those objects.

To change shake sensitivity, see `addPressure()` / `trackShakeDrag()` in `hero3d.js` and the device-motion handler in `bindShake()` (`main.js`).

On iPhone, motion access is requested the first time **Hold to shake** is pressed.

---

## Performance & Accessibility

- **One loop:** A single `requestAnimationFrame` (GSAP's ticker) drives Lenis, Three.js, and Matter.js.
- **Pausing:** WebGL stops rendering once the scroll story has moved away, and physics only steps while the hero is visible.
- **Draw calls:** Droplets and condensation are instanced, and fizz uses one point cloud.
- **Adaptive quality:** Pixel ratio is capped at 2 and stepped down toward 1 if frames run slowly. If performance is still slow at 1×, real-time soft shadows are disabled in every 3D scene.
- **Lazy loading:** Three.js, Lenis, and Matter.js load only in the 3D experience. Other flavor labels, HDR, physics, and card renders load after the intro, during idle time.
- **DOM effects:** Animations use only `transform` and `opacity`.
- **Accessibility:** The hero can is a real button (Enter/Space to open, R to spin). The carousel supports arrow keys and Enter, with real previous/next/dot buttons. Hold to shake also works with Space or Enter. The flavor picker is an ARIA radio group, and flavor changes are announced.
- **Fallback:** Reduced motion or unavailable WebGL automatically switches to the lightweight 2D site.

---

**Drinko — A little fizz. A lot of motion.**
