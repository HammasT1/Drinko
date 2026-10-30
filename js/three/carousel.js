/**
 * 3D flavor carousel (replaces the flat cards in the 3D experience).
 * ---------------------------------------------------------------------------
 * Every flavor's can stands on a ring over a glossy floor (mirrored, faded
 * copies fake the reflection without a second render pass). Drag to turn the
 * ring with inertia and snapping; tap the front can to crack it, tap a side
 * can to bring it forward. The front can steps forward, slowly turns, and the
 * rim lights take its colors.
 */
import * as THREE from 'three';
import { Stage, addStudioLights } from './stage.js';
import { LiquidParticles } from './particles.js';

const { gsap } = window;
const RADIUS = 1.15;
const lerp = (a, b, t) => a + (b - a) * t;

function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class FlavorCarousel extends Stage {
  /**
   * @param {object} hero
   * @param {object} opts
   * @param {HTMLElement} opts.anchor   stage element (drag surface + framing box)
   * @param {Array} opts.flavors
   * @param {Function} opts.onChange   (index) => void when the front can changes
   * @param {Function} [opts.onCrack]  (screenPoint) => void when the front can is cracked
   */
  constructor(hero, { anchor, flavors, onChange, onCrack }) {
    super(hero, anchor);
    Object.assign(this, { flavors, onChange, onCrack });
    this.step = (Math.PI * 2) / flavors.length;
    this.angle = 0;     // ring rotation (tweened / dragged)
    this.velocity = 0;
    this.front = 0;
    this.items = [];
    this.view = { worldHeight: 2.1, zoom: 1, elev: 0.16, orbit: 0 };
    this.target.set(0, 0.62, 0);
  }

  async build() {
    const { scene } = this;
    this.lights = addStudioLights(scene, { shadowSize: window.innerWidth < 640 ? 512 : 1024 });
    this.lights.setPalette(this.flavors[0].palette, true);

    // Soft shadows land on an invisible floor; a dark radial sheen sells "glossy".
    const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    this.ring = new THREE.Group();
    scene.add(this.ring);
    const shadowTex = contactShadowTexture();

    for (let i = 0; i < this.flavors.length; i++) {
      const can = await this.hero.createCan(i);
      const holder = new THREE.Group();   // position on the ring
      const turntable = new THREE.Group(); // per-can spin / crack animation
      const pose = { y: 0, rotZ: 0, squash: 1 };
      turntable.add(can.root);
      holder.add(turntable);

      // Mirrored, faint copy under the floor = reflection. Unlit on purpose:
      // at 16% opacity nobody can tell, and it halves the shading cost.
      const reflection = can.root.clone();
      reflection.scale.y = -1;
      reflection.traverse((node) => {
        if (!node.isMesh) return;
        node.material = new THREE.MeshBasicMaterial({
          map: node.material.map || null,
          color: node.material.map ? 0xffffff : 0xb8bec8,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        node.castShadow = false;
      });
      holder.add(reflection);

      const contact = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }),
      );
      contact.rotation.x = -Math.PI / 2;
      contact.position.y = 0.002;
      holder.add(contact);

      const a = i * this.step;
      holder.position.set(Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS);
      this.ring.add(holder);
      this.items.push({ can, holder, turntable, reflection, contact, pose, spin: 0 });
    }

    this.particles = new LiquidParticles({
      scene,
      renderer: this.hero.renderer,
      floorY: 0,
      counts: window.innerWidth < 640 ? { drops: 120, bubbles: 120 } : { drops: 220, bubbles: 220 },
      palette: this.flavors[0].palette,
    });

    this.bindPointer();
    await (this.hero.renderer.compileAsync?.(scene, this.camera) ?? Promise.resolve());
    return this;
  }

  /* ---------------- Navigation ---------------- */

  /** Rotate the ring so flavor `index` faces the camera (shortest way round). */
  goTo(index) {
    const n = this.flavors.length;
    const current = -this.angle / this.step;
    let delta = (((index - current) % n) + n) % n;
    if (delta > n / 2) delta -= n;
    this.velocity = 0;
    gsap.to(this, { angle: -(current + delta) * this.step, duration: 1, ease: 'power3.inOut', overwrite: true });
  }

  next() { this.goTo(this.front + 1); }

  prev() { this.goTo(this.front - 1); }

  /** Crack the front can: shake, tab pop, splash. */
  crack() {
    const item = this.items[this.front];
    const { pose, can } = item;
    item.tl?.kill();
    item.tl = gsap.timeline()
      .to(pose, { keyframes: { rotZ: [0, -0.15, 0.13, -0.1, 0.07, -0.03, 0], easeEach: 'sine.inOut' }, duration: 0.45 })
      .add(() => {
        gsap.timeline()
          .to(can.tabPivot.rotation, { x: 0.95, duration: 0.12, ease: 'power3.out' })
          .to(can.tabPivot.rotation, { x: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
      }, 0.38)
      .add(() => {
        item.turntable.updateMatrixWorld(true);
        const point = can.opening.clone();
        can.root.localToWorld(point);
        this.particles.burst(point, new THREE.Vector3(0, 1, 0), 0.9);
        this.onCrack?.(this.toScreen(point));
      }, 0.45)
      .to(pose, { y: 0.14, squash: 1.05, duration: 0.2, ease: 'power2.out' }, 0.45)
      .to(pose, { y: 0, squash: 1, duration: 1.1, ease: 'elastic.out(1.05, 0.32)' }, 0.65);
  }

  bindPointer() {
    const el = this.anchor;
    const raycaster = new THREE.Raycaster();
    let down = null;
    let lastX = 0;
    let lastT = 0;
    let dragged = false;

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
      lastX = event.clientX;
      lastT = performance.now();
      dragged = false;
      gsap.killTweensOf(this, 'angle');
    });
    el.addEventListener('pointermove', (event) => {
      if (!down) return;
      if (!dragged && Math.abs(event.clientX - down.x) > 8) {
        dragged = true;
        el.setPointerCapture(event.pointerId);
      }
      if (!dragged) return;
      const now = performance.now();
      const dx = event.clientX - lastX;
      const delta = (dx / Math.max(200, this.rect.width)) * 3.2;
      this.angle += delta;
      this.velocity = lerp(this.velocity, delta / Math.max(0.001, (now - lastT) / 1000), 0.5);
      lastX = event.clientX;
      lastT = now;
    });
    const end = (event) => {
      if (!down) return;
      if (dragged) {
        // Throw with inertia, then settle on the nearest can.
        if (performance.now() - lastT > 90) this.velocity = 0;
        const projected = this.angle + this.velocity * 0.35;
        const index = Math.round(-projected / this.step);
        this.velocity = 0;
        gsap.to(this, { angle: -index * this.step, duration: 0.9, ease: 'power3.out', overwrite: true });
      } else if (event.type === 'pointerup') {
        // Tap: front can cracks, a side can comes forward.
        raycaster.setFromCamera(new THREE.Vector2(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
        ), this.camera);
        const hits = raycaster.intersectObjects(this.items.map((item) => item.turntable), true);
        const owner = (object) => this.items.findIndex((item) => {
          for (let o = object; o; o = o.parent) if (o === item.turntable) return true;
          return false;
        });
        const hit = hits.length ? owner(hits[0].object) : -1;
        if (hit === this.front) this.crack();
        else if (hit !== -1) this.goTo(hit);
      }
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    // Keyboard: arrows rotate, Enter / Space cracks the front can.
    el.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') this.next();
      else if (event.key === 'ArrowLeft') this.prev();
      else if (event.key === 'Enter' || event.key === ' ') this.crack();
      else return;
      event.preventDefault();
    });
  }

  /* ---------------- Frame ---------------- */

  update(dt, time) {
    // Make sure the whole ring fits narrow (portrait) stages too.
    const r = this.anchor.getBoundingClientRect();
    this.view.worldHeight = Math.max(2.1, (3.3 * r.height) / Math.max(1, r.width));
    super.update(dt, time);

    this.ring.rotation.y = this.angle;
    const n = this.flavors.length;
    const front = ((Math.round(-this.angle / this.step) % n) + n) % n;
    if (front !== this.front) {
      this.front = front;
      this.lights.setPalette(this.flavors[front].palette);
      this.particles.setPalette(this.flavors[front].palette);
      this.onChange?.(front);
    }

    this.items.forEach((item, i) => {
      // 1 when facing the camera, 0 at the back of the ring
      const facing = (Math.cos(i * this.step + this.angle) + 1) / 2;
      const scale = lerp(0.72, 1.12, facing ** 2);
      item.holder.scale.setScalar(scale);
      // Front can idles with a slow turn; the others face the viewer
      item.spin = i === this.front ? item.spin + dt * 0.5 : lerp(item.spin, Math.round(item.spin / (Math.PI * 2)) * Math.PI * 2, 1 - Math.exp(-3 * dt));
      item.holder.rotation.y = -this.angle; // cancel the ring's turn so every label faces the viewer
      const { pose } = item;
      const bob = i === this.front ? Math.sin(time * 1.6) * 0.02 + 0.02 : 0;
      item.turntable.rotation.set(0, item.spin, pose.rotZ);
      item.turntable.position.y = pose.y + bob;
      item.turntable.scale.set(1 / Math.sqrt(pose.squash), pose.squash, 1 / Math.sqrt(pose.squash));
      item.contact.material.opacity = 0.55 * Math.max(0.3, 1 - (pose.y + bob) * 2);
    });
    this.particles.update(dt, time);
  }
}
