/**
 * Hero3D: the Three.js can.
 * ---------------------------------------------------------------------------
 * A single fixed, transparent WebGL canvas sits behind the page content.
 * The can is always at the world origin; a "rig" decides where on screen it
 * appears and how the camera looks at it:
 *
 *   rig.anchor 0 -> the can sits exactly where the hero's (invisible) can
 *                   <button> is, at the same size
 *   rig.anchor 1 -> the can sits at (rig.sx, rig.sy) of the viewport at
 *                   rig.size of the viewport height (used by the scroll story)
 *
 * The scroll story (story.js) only tweens numbers on `rig`; taps, spins and
 * drags tween numbers on `pose` / `user`. Every frame those numbers become
 * camera + can transforms. Rendering pauses whenever the can is off-screen.
 *
 * Other 3D sections (carousel, anatomy, pour) are Stages (stage.js) that share
 * this renderer, environment and labels; they render after the hero scene
 * while their section is on screen.
 */
import * as THREE from 'three';
import { buildProceduralCan, loadModelCan, CAN } from './canModel.js';
import { createLabelTexture, createWetMaps } from './labels.js';
import { LiquidParticles } from './particles.js';
import { Condensation } from './condensation.js';
import { Flyers } from './flyers.js';

const { gsap } = window;
const isSmallScreen = () => window.innerWidth < 640;
const lerp = (a, b, t) => a + (b - a) * t;

/** Camera / can pose while sitting in the hero (rig.anchor = 0). */
const HERO_POSE = { zoom: 1, elev: 0.12, orbit: 0, spin: 0, tilt: 0, lookY: 0 };

export class Hero3D {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas  fixed full-screen canvas
   * @param {HTMLElement} opts.anchor        the hero can <button> (size + position source)
   * @param {HTMLElement} [opts.glow]        background glow that follows the can
   * @param {Array} opts.flavors             config.FLAVORS
   * @param {object} opts.config             config.SCENE_3D
   * @param {Function} opts.flavorAssets     render.flavorAssets
   */
  constructor({ canvas, anchor, glow, flavors, config, flavorAssets }) {
    Object.assign(this, { canvas, anchor, glow, flavors, config, flavorAssets });
    this.index = 0;
    this.active = true;     // hero scene on/off (off-screen pause)
    this.systems = [];      // particles, condensation, flyers... each has update(dt, time)
    this.stages = [];       // other 3D sections sharing this renderer
    this.canvasVisible = true;
    // "Shake it": pressure 0..1 builds from shaking, at 1 the can erupts
    this.shake = { pressure: 0, lastInput: 0, erupting: false, leakTimer: 0, lastDir: 0 };
    this.onPressure = null; // (pressure) => void, for the meter UI
    this.onGeyser = null;   // (screenPoint) => void, for page-wide effects

    // Scroll-driven camera rig (tweened by story.js). zoom/elev/orbit/spin/tilt
    // are the *story* values; they blend in from HERO_POSE as `anchor` -> 1.
    this.rig = {
      anchor: 0, sx: 0.5, sy: 0.5, size: 0.6,
      zoom: 1, orbit: 0, elev: 0.2, spin: -0.5, tilt: 0,
      lookY: 0, // camera aims this far above the can's center (lid close-ups)
      exit: 0, opacity: 1, flyers: 0, flyerOpacity: 0,
    };
    // Tap / spin / intro animation channels (tweened by GSAP)
    this.pose = { x: 0, y: 0, rotZ: 0, spin: 0, squashY: 1, squashXZ: 1 };
    // Drag rotation with inertia + subtle pointer tilt
    this.user = { rot: 0, vel: 0, dragging: false, tiltX: 0, tiltZ: 0, yaw: 0, targetX: 0, targetZ: 0, targetYaw: 0 };

    this.screen = { x: 0, y: 0, height: 0 }; // where the can is drawn, in CSS px
    this.lookTarget = new THREE.Vector3();
    this.frameTimes = [];
    this.tick = this.tick.bind(this);
  }

  /* ---------------------------------------------------------------------- */
  /* Setup                                                                  */
  /* ---------------------------------------------------------------------- */

  async init(initialIndex = 0) {
    this.index = initialIndex;
    if (document.fonts) {
      await Promise.all([
        document.fonts.load('900 64px Unbounded'),
        document.fonts.load('800 32px Manrope'),
      ]).catch(() => {});
    }

    // Create the context ourselves: if WebGL is missing we bail quietly (main.js
    // falls back to 2D) instead of Three.js logging errors, and nothing is wasted.
    const attributes = { antialias: true, alpha: true, powerPreference: 'high-performance' };
    const context = this.canvas.getContext('webgl2', attributes) || this.canvas.getContext('webgl', attributes);
    if (!context) throw new Error('WebGL is not available');
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context, ...attributes });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, this.config.maxPixelRatio);
    this.pixelRatio = this.maxPixelRatio;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.05, 60);
    this.scene.add(this.camera); // so camera-attached objects (flyers) render

    // Instant studio reflections from a painted softbox panorama; the real HDR
    // is lazy-loaded later and reuses the same (already compiled) PMREM shaders.
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const studio = this.paintStudio();
    this.scene.environment = this.pmrem.fromEquirectangular(studio).texture;
    studio.dispose();

    this.createLights();

    // Only the visible flavor's label is drawn now; the rest wait for idle time (prepareLabels).
    this.labelWidth = isSmallScreen() ? this.config.labelResolution.mobile : this.config.labelResolution.desktop;
    this.labels = [];
    this.labelJobs = [];
    await this.ensureLabel(initialIndex);
    const wet = createWetMaps(renderer, this.labelWidth);
    this.wet = wet;
    const textures = { map: this.labels[initialIndex], ...wet };

    let can = null;
    if (this.config.modelSrc) {
      try {
        can = await loadModelCan(this.config.modelSrc, textures);
      } catch (err) {
        console.warn(`[Drinko] Could not load model "${this.config.modelSrc}" (${err.message}). Using the procedural can.`);
      }
    }
    this.can = can || buildProceduralCan(textures);

    // pivot (pose / user rotation, centered) > offset (base at y = 0 -> centered) > can
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'ZXY'; // spin around the can's own axis first, then tilt
    this.canOffset = new THREE.Group();
    this.canOffset.position.y = -CAN.height / 2;
    this.canOffset.add(this.can.root);
    this.pivot.add(this.canOffset);
    this.scene.add(this.pivot);
    this.floorY = -CAN.height / 2;

    this.createGround();

    // Splash + fizz particles (world space) and sliding condensation (on the can)
    const small = isSmallScreen();
    const palette = this.flavors[initialIndex].palette;
    this.particles = new LiquidParticles({
      scene: this.scene,
      renderer,
      floorY: this.floorY,
      counts: small ? this.config.particles.mobile : this.config.particles.desktop,
      palette,
    });
    this.condensation = new Condensation({
      parent: this.can.root,
      radius: this.can.radius,
      range: this.can.labelRange,
      count: small ? this.config.condensation.mobile : this.config.condensation.desktop,
    });
    // Fruit + ice that fly past the camera in the scroll story (textures load in the background)
    this.flyers = new Flyers({
      camera: this.camera,
      rig: this.rig,
      getFocus: () => this.focusDistance(),
      getFlavorIndex: () => this.index,
      fruitSources: this.flavors.map((f) => this.flavorAssets(f).fruitSrc),
      iceSource: this.config.iceSrc,
      count: small ? this.config.flyers.mobile : this.config.flyers.desktop,
    });
    this.systems.push(this.particles, this.condensation, this.flyers);

    this.applyFlavorLights(palette, true);

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    // Compile shaders without freezing the loader (parallel compile where supported).
    await (renderer.compileAsync ? renderer.compileAsync(this.scene, this.camera) : renderer.compile(this.scene, this.camera));
    gsap.ticker.add(this.tick);
    return this;
  }

  /** A cheap equirectangular "photo studio": dark room, big soft light boxes. */
  paintStudio() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#3a3a40');
    bg.addColorStop(0.5, '#141418');
    bg.addColorStop(1, '#050506');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 256);
    const softbox = (x, y, w, h, alpha) => {
      ctx.save();
      ctx.filter = 'blur(6px)';
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    };
    softbox(200, 40, 110, 70, 1);   // key, front-top
    softbox(40, 70, 40, 120, 0.85); // strip, left
    softbox(430, 70, 40, 120, 0.7); // strip, right
    softbox(0, 0, 512, 14, 0.5);    // ceiling bounce
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x220a10, 0.6);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.2, 4, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(isSmallScreen() ? 512 : 1024, isSmallScreen() ? 512 : 1024);
    Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 12 });
    key.shadow.radius = 6;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.key = key;

    // Colored rim lights take the flavor palette
    this.rimA = new THREE.DirectionalLight(0xffffff, 3.2);
    this.rimA.position.set(-3, 1.2, -2);
    this.rimB = new THREE.DirectionalLight(0xffffff, 2.6);
    this.rimB.position.set(3, 0.4, -2.2);

    // Point light that sweeps across the can on spin
    this.sweep = new THREE.PointLight(0xffffff, 0, 3, 1.6);
    this.sweep.position.set(-2, 0.2, 1.1);

    this.scene.add(this.hemi, key, key.target, this.rimA, this.rimB, this.sweep);
  }

  createGround() {
    // Real soft shadow from the key light
    // A disc just big enough for the shadow: soft-shadow sampling runs on every
    // pixel of this mesh, so a big plane would cost a lot of fill rate.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.ShadowMaterial({ opacity: 0.32 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = this.floorY;
    ground.receiveShadow = true;
    this.ground = ground;

    // Contact shadow blob that shrinks + fades when the can hops
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.6 }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = this.floorY + 0.002;

    // Shockwave ring that races across the floor on landings + flavor changes
    this.shock = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 96),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }),
    );
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.y = this.floorY + 0.004;
    this.scene.add(ground, this.contact, this.shock);
  }

  /** Floor shockwave + crown splash + loosened condensation. */
  impact(color, strength = 1) {
    const { shock } = this;
    shock.material.color.set(color);
    shock.position.x = this.pivot.position.x;
    gsap.fromTo(shock.scale, { x: 0.35, y: 0.35, z: 0.35 }, { x: 3.4, y: 3.4, z: 3.4, duration: 1.2, ease: 'expo.out', overwrite: true });
    gsap.fromTo(shock.material, { opacity: 0.85 }, { opacity: 0, duration: 1.2, ease: 'power2.out', overwrite: true });
    this.particles?.ring(new THREE.Vector3(this.pivot.position.x, this.floorY, 0), this.can.radius + 0.02, strength);
    this.condensation?.agitate(strength);
  }

  /** Draw a flavor's label texture once (cached). */
  ensureLabel(index) {
    this.labelJobs[index] ??= createLabelTexture(this.flavors[index], {
      renderer: this.renderer,
      width: this.labelWidth,
      fruitSrc: this.flavorAssets(this.flavors[index]).fruitSrc,
      index,
    }).then((texture) => {
      this.labels[index] = texture;
      return texture;
    });
    return this.labelJobs[index];
  }

  /** Draw the remaining labels one per idle slot so no frame takes the hit. */
  async prepareLabels() {
    const idle = () => new Promise((resolve) => (window.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 500 }) : setTimeout(resolve, 60)));
    for (let i = 0; i < this.flavors.length; i++) {
      await idle();
      await this.ensureLabel(i);
    }
  }

  /**
   * A fresh can for another stage, wearing flavor `index`'s label.
   * `procedural: true` guarantees separate parts (the exploded view needs them).
   */
  async createCan(index, { procedural = false } = {}) {
    await this.ensureLabel(index);
    const textures = { map: this.labels[index], ...this.wet };
    if (this.config.modelSrc && !procedural) {
      try {
        return await loadModelCan(this.config.modelSrc, textures);
      } catch { /* fall through to the procedural can */ }
    }
    return buildProceduralCan(textures);
  }

  addStage(stage) {
    this.stages.push(stage);
    return stage;
  }

  /** Lazy-load the HDR environment (heavy) once the scene is already on screen. */
  async loadEnvironment() {
    if (!this.config.hdrSrc) return;
    try {
      const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
      const hdr = await new RGBELoader().loadAsync(this.config.hdrSrc);
      const envMap = this.pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      const previous = this.scene.environment;
      this.scene.environment = envMap;
      previous?.dispose();
    } catch (err) {
      console.info(`[Drinko] HDR "${this.config.hdrSrc}" unavailable (${err.message}); keeping the studio environment.`);
    }
  }

  applyFlavorLights(palette, immediate = false) {
    const targets = [
      [this.rimA.color, new THREE.Color(palette.highlight)],
      [this.rimB.color, new THREE.Color(palette.primary)],
      [this.hemi.groundColor, new THREE.Color(palette.dark)],
    ];
    targets.forEach(([color, to]) => {
      if (immediate) color.copy(to);
      else gsap.to(color, { r: to.r, g: to.g, b: to.b, duration: 1.2, ease: 'power2.inOut' });
    });
    this.systems.forEach((s) => s.setPalette?.(palette, immediate));
  }

  /* ---------------------------------------------------------------------- */
  /* Intro                                                                  */
  /* ---------------------------------------------------------------------- */

  /** Park the can above the frame until intro() drops it in. */
  prepareIntro() {
    this.pose.y = 4;
  }

  /** Drop in with a bouncing landing, squash, splash and shockwave. */
  intro({ onImpact } = {}) {
    const p = this.pose;
    const duration = 1.3;
    const firstHit = duration * 0.364; // first contact of GSAP's bounce.out
    return gsap.timeline()
      .fromTo(p, { y: 4 }, { y: 0, duration, ease: 'bounce.out' })
      .fromTo(this.user, { rot: -2.4 }, { rot: 0, duration: duration + 0.4, ease: 'power3.out' }, 0)
      .add(() => {
        this.impact(this.flavors[this.index].palette.accent, 0.9);
        onImpact?.(this.openingScreenPoint());
      }, firstHit)
      .to(p, { squashY: 0.86, squashXZ: 1.07, duration: 0.07, ease: 'power2.out' }, firstHit)
      .to(p, { squashY: 1, squashXZ: 1, duration: 0.7, ease: 'elastic.out(1, 0.35)' }, firstHit + 0.07);
  }

  /* ---------------------------------------------------------------------- */
  /* Interaction                                                            */
  /* ---------------------------------------------------------------------- */

  /** Drag rotation (dx in CSS px). */
  dragBy(dx) {
    const now = performance.now();
    const dt = Math.max(1, now - (this.user.lastDrag || now - 16)) / 1000;
    const delta = dx * 0.012;
    this.user.rot += delta;
    this.user.vel = lerp(this.user.vel, delta / dt, 0.6);
    this.user.lastDrag = now;
    this.user.dragging = true;
    this.trackShakeDrag(dx);
  }

  release() {
    this.user.dragging = false;
    // Ignore stale velocity if the finger rested before lifting.
    if (performance.now() - (this.user.lastDrag || 0) > 90) this.user.vel = 0;
    this.user.vel = THREE.MathUtils.clamp(this.user.vel, -22, 22);
  }

  /** Subtle tilt toward the pointer (nx, ny in -1..1). */
  pointer(nx, ny) {
    this.user.targetX = ny * 0.16;
    this.user.targetZ = -nx * 0.1;
    this.user.targetYaw = nx * 0.3;
  }

  popTab() {
    const tab = this.can.tabPivot.rotation;
    gsap.timeline()
      .to(tab, { x: 0.95, duration: 0.12, ease: 'power3.out' })
      .to(tab, { x: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
  }

  /* ---------------------------------------------------------------------- */
  /* Shake it                                                               */
  /* ---------------------------------------------------------------------- */

  /** Add shake pressure (0..1). Reaching 1 sets off the geyser. */
  addPressure(amount) {
    const s = this.shake;
    if (s.erupting) return;
    s.pressure = Math.min(1, s.pressure + amount);
    s.lastInput = performance.now();
    if (s.pressure >= 1) this.geyser();
  }

  /** Called from dragBy: fast back-and-forth drags count as shaking. */
  trackShakeDrag(dx) {
    const dir = Math.sign(dx);
    if (dir && dir !== this.shake.lastDir && Math.abs(dx) > 5) this.addPressure(0.07);
    if (dir) this.shake.lastDir = dir;
  }

  /** Pressure decay, trembling and little leaks of fizz while pressurised. */
  updateShake(dt, time) {
    const s = this.shake;
    if (!s.erupting && performance.now() - s.lastInput > 350 && s.pressure > 0) {
      s.pressure = Math.max(0, s.pressure - 0.22 * dt);
    }
    if (s.pressure !== s.reported) {
      s.reported = s.pressure;
      this.onPressure?.(s.pressure);
    }
    if (s.pressure > 0.45 && !s.erupting) {
      s.leakTimer -= dt;
      if (s.leakTimer <= 0) {
        s.leakTimer = 0.28 - s.pressure * 0.18;
        this.erupt(0.06 + s.pressure * 0.06);
      }
    }
    // Tremble amount grows faster than linear so the last stretch feels tense
    const amp = s.pressure ** 1.6 * 0.045;
    return {
      x: Math.sin(time * 71) * amp,
      y: Math.abs(Math.sin(time * 93)) * amp * 0.6,
      rotZ: Math.sin(time * 53) * amp * 1.6,
    };
  }

  /** Full-pressure eruption: a tall jet for ~2s while the can bucks and settles. */
  geyser() {
    const s = this.shake;
    s.erupting = true;
    this.actionTl?.kill();
    this.popTab();
    this.onGeyser?.(this.openingScreenPoint());
    this.impact(this.flavors[this.index].palette.accent, 1);
    this.particles.stream({
      getSource: () => {
        const { point, up } = this.openingWorld();
        return { point, dir: up };
      },
      duration: 1.9,
      dropsPerSec: isSmallScreen() ? 150 : 280,
      bubblesPerSec: isSmallScreen() ? 90 : 170,
      speed: [4.5, 7.5],
      spread: 0.22,
      size: [0.005, 0.016],
      life: [1.2, 2],
    });
    const p = this.pose;
    this.actionTl = gsap.timeline({ onComplete: () => { s.erupting = false; } })
      .to(p, { squashY: 0.85, squashXZ: 1.08, duration: 0.08, ease: 'power2.out' })
      .to(p, { y: 0.32, squashY: 1.08, squashXZ: 0.95, duration: 0.25, ease: 'power3.out' })
      .to(p, { keyframes: { rotZ: [0, 0.12, -0.1, 0.08, -0.06, 0.04, 0], easeEach: 'sine.inOut' }, duration: 1.4 }, 0.1)
      .to(p, { y: 0, squashY: 1, squashXZ: 1, duration: 1.3, ease: 'elastic.out(1, 0.3)' }, 0.4)
      .to(s, { pressure: 0, duration: 1.9, ease: 'power2.in' }, 0);
  }

  /** World-space point + direction for liquid leaving the opening. */
  openingWorld() {
    this.pivot.updateMatrixWorld(true);
    const point = this.can.opening.clone();
    this.canOffset.localToWorld(point);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.pivot.getWorldQuaternion(new THREE.Quaternion()));
    return { point, up };
  }

  /** Opening position in CSS pixels (for DOM effects + physics). */
  openingScreenPoint() {
    const { point } = this.openingWorld();
    point.project(this.camera);
    return {
      x: (point.x * 0.5 + 0.5) * window.innerWidth,
      y: (-point.y * 0.5 + 0.5) * window.innerHeight,
      scale: THREE.MathUtils.clamp(this.screen.height / 380, 0.55, 1.4),
    };
  }

  /** Splash + fizz from the opening (particle systems hook in here). */
  erupt(strength = 1) {
    const { point, up } = this.openingWorld();
    this.particles?.burst(point, up, strength);
    this.condensation?.agitate(strength);
  }

  tap({ onOpen, onFizz, onBurst } = {}) {
    this.actionTl?.kill();
    const p = this.pose;
    gsap.set(p, { x: 0, y: 0, rotZ: 0, squashY: 1, squashXZ: 1 });
    this.actionTl = gsap.timeline()
      .to(p, { squashY: 0.93, squashXZ: 1.04, duration: 0.09, ease: 'power2.out' })
      .to(p, {
        keyframes: {
          rotZ: [0, -0.16, 0.14, -0.12, 0.1, -0.06, 0.035, 0],
          x: [0, -0.035, 0.035, -0.028, 0.022, -0.012, 0.006, 0],
          easeEach: 'sine.inOut',
        },
        squashY: 1,
        squashXZ: 1,
        duration: 0.5,
      }, 0.05)
      .add(() => { this.popTab(); onOpen?.(); }, 0.42)
      .add(() => {
        this.erupt(1);
        onFizz?.();
        onBurst?.(this.openingScreenPoint());
      }, 0.5)
      .to(p, { y: 0.15, squashY: 1.05, squashXZ: 0.97, duration: 0.22, ease: 'power2.out' }, 0.5)
      .to(p, { y: 0, squashY: 1, squashXZ: 1, duration: 1.15, ease: 'elastic.out(1.05, 0.32)' }, 0.72);
    return this.actionTl;
  }

  spin() {
    this.actionTl?.kill();
    const p = this.pose;
    gsap.set(p, { x: 0, rotZ: 0, squashY: 1, squashXZ: 1 });
    p.spin %= Math.PI * 2;
    this.actionTl = gsap.timeline({ onComplete: () => { p.spin = 0; } })
      .to(p, { y: 0.28, duration: 0.32, ease: 'power2.out' })
      .to(p, { spin: Math.PI * 2, duration: 1.1, ease: 'back.out(1.8)' }, 0.06)
      .fromTo(this.sweep.position, { x: -2.2 }, { x: 2.2, duration: 1, ease: 'power2.inOut' }, 0.25)
      .fromTo(this.sweep, { intensity: 0 }, { intensity: 14, duration: 0.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.3)
      .to(p, { y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, 0.62);
    return this.actionTl;
  }

  /**
   * Morph to another flavor: label fills up with the new print (liquid level
   * line), rim lights + particles recolor. Returns the GSAP timeline.
   */
  setFlavor(index) {
    if (index === this.index) return gsap.timeline();
    if (!this.labels[index]) {
      // Picked before its label was drawn: draw it now, then morph.
      this.awaitingLabel = index;
      this.ensureLabel(index).then(() => {
        if (this.awaitingLabel === index) this.setFlavor(index);
      });
      return gsap.timeline();
    }
    this.awaitingLabel = null;
    const { morph, labelMaterial } = this.can;
    // If a morph is mid-way, commit it first.
    this.morphTl?.progress(1);
    this.index = index;
    morph.uniforms.uMapNext.value = this.labels[index];
    morph.uniforms.uMix.value = 0;
    this.applyFlavorLights(this.flavors[index].palette);
    this.impact(this.flavors[index].palette.accent, 0.5);
    this.morphTl = gsap.timeline({
      onComplete: () => {
        labelMaterial.map = this.labels[index];
        morph.uniforms.uMix.value = 0;
      },
    })
      .to(morph.uniforms.uMix, { value: 1, duration: 1.15, ease: 'power2.inOut' })
      // A little celebratory hop + quarter turn while the label fills
      .to(this.pose, { y: 0.08, duration: 0.3, ease: 'power2.out' }, 0)
      .to(this.pose, { y: 0, duration: 0.9, ease: 'bounce.out' }, 0.3)
      .to(this.user, { rot: `+=${Math.PI * 2}`, duration: 1.3, ease: 'power3.inOut' }, 0);
    return this.morphTl;
  }

  /**
   * Render one flavor's can, front-on and bottom-aligned in the 2D can box
   * (200:380), and return it as a PNG data URL. Lets the flavor cards and
   * footer show exactly the same can as the 3D hero.
   * Runs synchronously, so the on-screen canvas never shows the temporary size.
   * Call after prepareLabels().
   */
  snapshot(index, width = 400) {
    const { renderer, can, pivot, scene } = this;
    const height = Math.round((width * 380) / 200);
    const saved = {
      map: can.labelMaterial.map,
      mix: can.morph.uniforms.uMix.value,
      rotation: pivot.rotation.clone(),
      position: pivot.position.clone(),
      scale: pivot.scale.clone(),
      tab: can.tabPivot.rotation.x,
      pixelRatio: renderer.getPixelRatio(),
    };
    const hidden = [this.ground, this.contact, ...this.systems.map((s) => s.object)].filter(Boolean);
    hidden.forEach((o) => { o.visible = false; });

    can.labelMaterial.map = this.labels[index];
    can.morph.uniforms.uMix.value = 0;
    pivot.rotation.set(0, 0.12, 0); // near-front, a hint of three-quarter
    pivot.position.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    can.tabPivot.rotation.x = 0;

    // Orthographic, 0.64 wide, base sitting just above the bottom edge.
    const bottom = -0.57;
    const camera = new THREE.OrthographicCamera(-0.32, 0.32, bottom + 0.64 * (380 / 200), bottom, 0.1, 20);
    camera.position.setFromSphericalCoords(6, Math.PI / 2 - 0.12, 0);
    camera.lookAt(0, 0, 0);

    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.clear();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');

    can.labelMaterial.map = saved.map;
    can.morph.uniforms.uMix.value = saved.mix;
    pivot.rotation.copy(saved.rotation);
    pivot.position.copy(saved.position);
    pivot.scale.copy(saved.scale);
    can.tabPivot.rotation.x = saved.tab;
    hidden.forEach((o) => { o.visible = true; });
    renderer.setPixelRatio(saved.pixelRatio);
    this.onResize();
    return url;
  }

  /* ---------------------------------------------------------------------- */
  /* Frame loop                                                             */
  /* ---------------------------------------------------------------------- */

  /** Hero scene on/off (the canvas itself stays up while any stage is active). */
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (this.glow) this.glow.style.visibility = active ? 'visible' : 'hidden';
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.systems.forEach((s) => s.resize?.(w, h));
  }

  /**
   * Adaptive quality for slower GPUs, in two tiers:
   *   1. step the pixel ratio down toward 1
   *   2. still slow at 1x: drop real-time soft shadows in every scene
   *      (contact-shadow blobs keep the cans grounded)
   */
  adaptQuality(deltaMs) {
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg <= 22) return;
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.onResize();
    } else if (!this.lowPower) {
      this.lowPower = true;
      [this.scene, ...this.stages.map((stage) => stage.scene)].forEach((scene) => scene.traverse((node) => {
        if (node.isDirectionalLight) node.castShadow = false;
        if (node.material?.isShadowMaterial) node.visible = false;
      }));
    }
  }

  /** Where on screen (CSS px) and how tall the can should be this frame. */
  computeScreenTarget() {
    const { rig } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = this.anchor.getBoundingClientRect();
    const t = rig.anchor;
    this.screen.x = lerp(a.left + a.width / 2, w * rig.sx, t);
    this.screen.y = lerp(a.top + a.height / 2, h * rig.sy, t) - rig.exit * h * 1.3;
    this.screen.height = Math.max(40, lerp(a.height, h * rig.size, t));
  }

  /** Story rig value blended with the hero pose by rig.anchor. */
  blended(name) {
    return lerp(HERO_POSE[name], this.rig[name], this.rig.anchor);
  }

  /** Distance from camera to the can (used as the flyers' focus plane). */
  focusDistance() {
    return this.camera.position.distanceTo(this.lookTarget);
  }

  updateCamera() {
    const { camera, screen } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // Distance at which the can is exactly screen.height pixels tall
    const distance = (CAN.height * h) / (2 * Math.tan(halfFov) * screen.height) * this.blended('zoom');
    // Orbit around the look target; that target is what lands on screen.x/y.
    this.lookTarget.set(0, this.blended('lookY'), 0);
    camera.position.setFromSphericalCoords(distance, Math.PI / 2 - this.blended('elev'), this.blended('orbit'))
      .add(this.lookTarget);
    camera.lookAt(this.lookTarget);
    camera.updateProjectionMatrix();
    // Shift the projection so the view axis (and therefore the can) lands on screen.x/y
    const ndcX = (screen.x / w) * 2 - 1;
    const ndcY = 1 - (screen.y / h) * 2;
    camera.projectionMatrix.elements[8] = -ndcX;
    camera.projectionMatrix.elements[9] = -ndcY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  updateCan(dt, time) {
    const { pose, user, pivot } = this;
    // Inertia
    if (!user.dragging) {
      user.rot += user.vel * dt;
      user.vel *= Math.exp(-2.4 * dt);
    }
    // Smooth pointer tilt
    const k = 1 - Math.exp(-5 * dt);
    user.tiltX = lerp(user.tiltX, user.targetX, k);
    user.tiltZ = lerp(user.tiltZ, user.targetZ, k);
    user.yaw = lerp(user.yaw, user.targetYaw, k);

    const idleSway = Math.sin(time * 0.6) * 0.22;
    const tremble = this.updateShake(dt, time);
    pivot.rotation.set(
      user.tiltX,
      user.rot + user.yaw + this.blended('spin') + pose.spin + idleSway,
      pose.rotZ + this.blended('tilt') + user.tiltZ + tremble.rotZ,
    );
    pivot.scale.set(pose.squashXZ, pose.squashY, pose.squashXZ);
    // Squash from the base, not the center
    pivot.position.set(pose.x + tremble.x, pose.y + tremble.y - (1 - pose.squashY) * CAN.height * 0.5, 0);

    // Contact shadow reacts to height
    const lift = Math.max(0, pose.y);
    const s = Math.max(0.35, 1 - lift * 1.6);
    this.contact.scale.set(s, s, 1);
    this.contact.material.opacity = 0.6 * s;
  }

  updateGlow() {
    if (!this.glow) return;
    const { x, y, height } = this.screen;
    const size = height * 1.5;
    this.glow.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${size / 100})`;
    this.glow.style.opacity = String(this.rig.opacity * 0.9);
  }

  tick(time, deltaMs) {
    const visible = this.active || this.stages.some((s) => s.active);
    if (visible !== this.canvasVisible) {
      this.canvasVisible = visible;
      this.canvas.style.visibility = visible ? 'visible' : 'hidden';
    }
    if (!visible) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    this.adaptQuality(deltaMs);
    const { renderer } = this;
    renderer.autoClear = false;
    renderer.clear();

    if (this.active) {
      if (this.can.morph) this.can.morph.uniforms.uTime.value = time;
      this.computeScreenTarget();
      this.updateCan(dt, time);
      this.updateCamera();
      this.systems.forEach((s) => s.update(dt, time));
      this.updateGlow();
      renderer.render(this.scene, this.camera);
    }
    for (const stage of this.stages) {
      if (!stage.active) continue;
      stage.update(dt, time);
      renderer.clearDepth();
      renderer.render(stage.scene, stage.camera);
    }
  }
}
