# Drinko: animated soda product page

A single-page, cinematic product site for **Drinko**, a fictional soft-drink brand.
Plain HTML, CSS and vanilla JavaScript (ES modules), no build step.

- **3D experience** (WebGL + motion allowed): a Three.js can with PBR metal,
  HDR reflections and soft shadows, physically simulated splash and fizz
  particles, condensation sliding down the can, Matter.js ice and fruit, a
  pinned scroll story with Lenis smooth scrolling, a liquid-wipe flavor
  transition, a custom cursor and magnetic buttons. Plus four showpiece
  sections:
  - **Shake it:** shake your phone, wiggle the can, or hold the button until
    the pressure meter fills and the can erupts in a geyser.
  - **3D flavor carousel:** cans on a ring over a glossy floor. Drag, tap
    or use the arrow keys.
  - **Exploded anatomy:** scroll to take the can apart layer by layer, with
    labelled callouts.
  - **The pour:** scroll to tip the can into a glass of ice. Watch it fill,
    fizz and foam.
- **2D fallback** (no WebGL, or `prefers-reduced-motion`): the original
  SVG/GSAP site. Nothing heavy is downloaded in this mode.

**Try it:** tap a can to crack it open. Drag the hero can to spin it (it keeps
its momentum). Double-tap, long-press or press **R** for a 360° spin. Pick a
flavor to flood the page with it.

## Running it

ES modules can't load from `file://` in Chrome, Edge or Safari, so serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. If you double-click `index.html` anyway, the loader
explains this after a few seconds. GSAP, Three.js, Lenis and Matter.js come
from CDNs, so the first load needs an internet connection.

Add `?debug` to the URL to get `window.drinko` (`hero3d`, `physics`,
`carousel`, `anatomy`, `pour`) in the console.

## Page order

Hero (with **Shake it**) → scroll story → marquee → **3D flavor carousel** →
**anatomy** → ingredients → **pour** → footer.

In the 2D fallback, the carousel stays the flat flavor cards, the anatomy is a
list of facts, and the pour is plain copy.

## Project structure

```
index.html              Page shell + import map for Three.js
css/styles.css          All styling (2D + 3D layers, cursor, story, reduced motion)
js/config.js            Flavors, palettes, copy, asset paths, 3D / physics / story settings
js/main.js              Boot, preloading, DOM building, picks 3D vs 2D, event wiring
js/animations.js        2D GSAP animations (tap, spin, swap, bursts, scroll reveals)
js/render.js            "Your file vs generated placeholder" + 2D can DOM
js/placeholders.js      SVG generators for 2D cans, splash, ice, fruit, bubbles
js/sound.js             Toggleable sound with a synthesized fallback
js/story.js             Lenis smooth scroll + pinned ScrollTrigger story
js/sections.js          Pinned scroll timelines for the anatomy + pour sections
js/physics.js           Matter.js ice / fruit / bubbles in the hero
js/polish.js            Liquid wipe, magnetic buttons, custom cursor, lens drips
js/loadScript.js        Lazy loader for UMD libraries
js/three/hero3d.js      Renderer, lights, camera rig, gestures, frame loop
js/three/canModel.js    Procedural lathe can or .glb loader + label morph shader
js/three/labels.js      Generated label textures + wet bump/roughness maps
js/three/particles.js   Instanced splash droplets + GPU point fizz
js/three/condensation.js Sliding condensation beads (instanced)
js/three/flyers.js      Fruit/ice fly-pasts with depth-of-field blur levels
js/three/stage.js       Base class for extra 3D sections sharing the hero's renderer
js/three/carousel.js    3D flavor carousel (ring, glossy floor, drag + snap)
js/three/anatomy.js     Exploded view + live callouts with leader lines
js/three/pour.js        Can-to-glass pour: clipped liquid, rope, ice, bubbles, foam
assets/                 Your files (cans, splash, fruit, decor, audio, env, models)
```

## Swapping in your own assets

Everything is configured in `js/config.js`. A path of `null` means "generate a
placeholder in code"; a string means "use this file". The animation code never
changes.

### 3D can model (.glb)

1. Put the model in `assets/models/`, e.g. `assets/models/can.glb`.
2. Set it in `SCENE_3D`:

   ```js
   export const SCENE_3D = {
     modelSrc: 'assets/models/can.glb',
     // ...
   };
   ```

Naming conventions inside the .glb:

| Name contains | What happens |
|---------------|--------------|
| `label` (mesh **or** material name) | Gets the flavor label texture and the liquid-fill morph on flavor change. Its UVs should wrap the label once around (u = 0.5 facing forward). |
| `tab` (any object) | Pops open on tap by rotating around the object's own origin on X. Put the origin at the rivet. |

The model is auto-scaled to a height of ~1 unit, centered, and stood on the
floor. If the file fails to load, the procedural can is used and the console
says why.

### Label textures (3D)

Each flavor can have its own wrap-around label image:

```js
{ id: 'cherry-comet', /* ... */ labelSrc: 'assets/labels/cherry.png' }
```

Use a ~2.4 : 1 image (e.g. 2048 × 860). The left and right edges meet at the
back of the can, and the center faces the viewer. Leave it `null` to get a
generated label in the flavor's palette.

### Reflections (HDR)

`SCENE_3D.hdrSrc` points to an equirectangular `.hdr` (the bundled one is
Poly Haven's CC0 *studio_small_09*). It is lazy-loaded after the intro. Until
then, and if it fails to load, a painted studio environment is used.

### 2D cans, splash, fruit, decor, sound

These are used by the 2D fallback and as sprites in the 3D experience:

```js
canSrc:    'assets/cans/cherry-comet.png', // 2D can art. In 3D mode the cards/footer show renders of the 3D can instead
tabSrc:    'assets/cans/tab.png',          // false = your can art already includes a tab
splashSrc: 'assets/splash/cherry-splash.png',
dropSrc:   'assets/splash/cherry-drop.png',
fruitSrc:  'assets/fruit/cherry.png',      // also used by physics + 3D fly-pasts
```

Shared images live in `DECOR` (`bubbleSrc`, `iceSrc`, also used by physics and
fly-pasts) and sounds in `SOUNDS`. All images should have transparent
backgrounds. `CAN_LAYOUT` (or a per-flavor `canLayout`) positions the 2D tab
on your can art.

### Libraries

Three.js is mapped in the import map at the top of `index.html`. Lenis and
Matter.js URLs live in `LIBS` in `config.js`.

## Adding a new flavor

Add an object to `FLAVORS` in `js/config.js`:

```js
{
  id: 'grape-galaxy',
  name: 'Grape Galaxy',
  short: 'Grape',
  tagline: 'Purple, but louder.',
  description: 'Concord grape and blackcurrant…',
  notes: ['Concord grape', 'Blackcurrant', 'Lavender'],
  palette: {
    primary: '#8b3dff', dark: '#2e0b66', highlight: '#d2b3ff', accent: '#7cf5ff',
    bgFrom: '#0b0418', bgTo: '#3b1478', ink: '#08151a',
  },
  fruit: 'cherry', // placeholder fruit drawing: 'cherry' | 'lime' | 'orange'
  canSrc: null, tabSrc: null, splashSrc: null, dropSrc: null, fruitSrc: null, labelSrc: null,
}
```

The picker, 3D label, lights, particles, backgrounds, cards, footer and
marquee all pick it up.

## Tuning

| Setting (`config.js`) | Controls |
|-----------------------|----------|
| `SCENE_3D.enabled` | `false` forces the 2D site |
| `SCENE_3D.maxPixelRatio` | Render resolution cap (default 2; drops further automatically if frames run slow) |
| `SCENE_3D.labelResolution` | Label texture width, desktop / mobile |
| `SCENE_3D.particles`, `.condensation`, `.flyers` | Particle budgets, desktop / mobile |
| `PHYSICS` | Number of ice cubes, fruit and bubbles; `mobileScale` |
| `STORY` | The scroll-story beats (kicker, title, text) |
| `ANATOMY` | Exploded-view callouts: `part` (`tab`, `lid`, `sleeve`, `wall`, `liquid`, `base`), `side` (`left`/`right`), title, text |

## How the extra 3D sections work

There is still **one** WebGL canvas and context. The carousel, anatomy and pour
are *stages* (`js/three/stage.js`): each has its own scene and camera, and its
camera is fitted every frame so the scene lands inside a DOM element (e.g.
`#carouselStage`). The canvas is fixed, but each scene scrolls with its section.
A stage only renders while its section is on screen, and stages share the
hero's shader cache, label textures and HDR reflections.

The pinned scroll timelines (`js/sections.js`) are created at page load and
just tween plain state objects. The stages are built afterwards, in idle time,
and read those objects.

To change the shake sensitivity, see `addPressure()` / `trackShakeDrag()` in
`hero3d.js` and the device-motion handler in `bindShake()` (`main.js`).
On iPhone, motion access is requested the first time "Hold to shake" is
pressed.

## Performance & accessibility

- **One loop:** a single rAF (GSAP's ticker) drives Lenis, Three.js and Matter.js.
- **Pausing:** WebGL stops rendering once the scroll story has scrolled away, and physics only steps while the hero is visible.
- **Draw calls:** droplets and condensation are instanced (one draw call each), and fizz is one point cloud.
- **Adaptive quality:** the pixel ratio is capped at 2 and stepped down toward 1 if frames run slow. If frames are still slow at 1×, real-time soft shadows switch off in every 3D scene.
- **Lazy loading:** Three.js, Lenis and Matter.js load only in the 3D experience. Other flavor labels, the HDR, physics and the card renders load after the intro, during idle time.
- **DOM effects:** they animate only `transform` and `opacity`.
- **Accessibility:** the hero can is still a real `<button>` (keyboard: Enter/Space to open, R to spin). The carousel stage takes arrow keys and Enter, with real prev/next/dot buttons beside it. "Hold to shake" works with a held Space or Enter. The flavor picker is an ARIA radio group, and flavor changes are announced.
- **Fallback:** reduced motion, or no WebGL, gets the lightweight 2D site.
