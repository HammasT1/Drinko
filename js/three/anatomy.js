/**
 * Exploded "anatomy" view.
 * ---------------------------------------------------------------------------
 * A procedural can split into its real parts: tab, lid, printed sleeve, the
 * aluminum wall (two halves), the liquid core with rising bubbles, and the
 * domed base. Scroll (sections.js) tweens `state` 0 -> 1 per part; this stage
 * turns those numbers into offsets, and pins DOM callouts + SVG leader lines
 * to projected 3D points every frame.
 */
import * as THREE from 'three';
import { Stage, addStudioLights } from './stage.js';
import { CAN } from './canModel.js';

const isNarrow = () => window.innerWidth < 900;

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(22, 22, 6, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export class AnatomyStage extends Stage {
  /**
   * @param {object} hero
   * @param {object} opts
   * @param {HTMLElement} opts.anchor     box the can is framed into
   * @param {HTMLElement} opts.container  pinned section box (callout coordinates)
   * @param {object} opts.state          { tab, lid, base, sleeve, wall, spin } tweened 0..1 by scroll
   * @param {Array} opts.callouts        [{ part, side, el }] DOM callouts
   * @param {SVGElement} opts.lines      SVG for leader lines
   */
  constructor(hero, { anchor, container, state, callouts, lines }) {
    super(hero, anchor);
    Object.assign(this, { container, state, callouts, lines });
    this.view = { worldHeight: 2.35, zoom: 1, elev: 0.14, orbit: 0 };
    this.target.set(0, 0.05, 0);
  }

  async build(index) {
    const { scene } = this;
    this.lights = addStudioLights(scene, { shadows: false });
    const can = await this.hero.createCan(index, { procedural: true });
    this.can = can;
    const { body, bottom, top, score, rivet, tabPivot } = can.parts;
    const R = can.radius;
    const [y0, y1] = can.labelRange;

    // Everything hangs off `assembly`, centered on the can's middle
    this.assembly = new THREE.Group();
    this.assembly.position.y = -CAN.height / 2;
    scene.add(this.assembly);

    this.lid = new THREE.Group();
    this.lid.add(top, score, rivet);
    this.tab = new THREE.Group();
    this.tab.add(tabPivot);
    this.base = new THREE.Group();
    this.base.add(bottom);
    this.sleeve = new THREE.Group();
    this.sleeve.add(body);

    // The label becomes see-through as the sleeve lifts away
    const label = can.labelMaterial;
    label.transparent = true;
    this.labelMaterial = label;

    // Aluminum wall under the print, in two halves that part like doors
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd5d9e0, metalness: 1, roughness: 0.32, side: THREE.DoubleSide });
    const half = (start) => new THREE.Mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.985, y1 - y0, 64, 1, true, start, Math.PI), wallMaterial);
    this.wallRight = new THREE.Group();
    this.wallRight.add(half(0));
    this.wallLeft = new THREE.Group();
    this.wallLeft.add(half(Math.PI));
    [this.wallRight, this.wallLeft].forEach((g) => { g.position.y = (y0 + y1) / 2; });

    // Liquid core + rising bubbles
    this.liquidMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.88, envMapIntensity: 1.4,
    });
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.94, R * 0.94, (y1 - y0) * 0.96, 64), this.liquidMaterial);
    this.liquid.position.y = (y0 + y1) / 2;
    const count = 140;
    const positions = new Float32Array(count * 3);
    this.bubbleSeeds = Array.from({ length: count }, () => ({
      a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * R * 0.85, y: Math.random(), speed: 0.08 + Math.random() * 0.2,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.bubbles = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: bubbleTexture(), size: 0.022, transparent: true, depthWrite: false, opacity: 0.8,
    }));
    this.bubbleRange = [y0 + 0.02, y1 - 0.04];

    this.assembly.add(this.lid, this.tab, this.base, this.sleeve, this.wallRight, this.wallLeft, this.liquid, this.bubbles);
    this.setFlavor(index, true);
    await (this.hero.renderer.compileAsync?.(scene, this.camera) ?? Promise.resolve());
    return this;
  }

  /** Recolor to another flavor (label print + liquid + lights). */
  async setFlavor(index, immediate = false) {
    const palette = this.hero.flavors[index].palette;
    await this.hero.ensureLabel(index);
    this.labelMaterial.map = this.hero.labels[index];
    this.can.morph.uniforms.uMapNext.value = this.hero.labels[index];
    this.liquidMaterial.color.set(palette.primary);
    this.liquidMaterial.emissive = new THREE.Color(palette.primary);
    this.liquidMaterial.emissiveIntensity = 0.25;
    this.lights.setPalette(palette, immediate);
  }

  /** Projected point of a part for its callout, in container coordinates. */
  anchorPoint(part) {
    const R = this.can.radius;
    const local = {
      tab: [this.tab, new THREE.Vector3(0, 1.0, -0.06)],
      lid: [this.lid, new THREE.Vector3(R * 0.92, 1.0, 0)],
      sleeve: [this.sleeve, new THREE.Vector3(-R * 1.05, 0.76, 0)],
      wall: [this.wallRight, new THREE.Vector3(R * 0.9, 0.12, R * 0.3)],
      liquid: [this.liquid, new THREE.Vector3(-R * 0.6, -0.26, R * 0.6)],
      base: [this.base, new THREE.Vector3(R * 0.85, 0.03, 0)],
    }[part];
    const point = local[1].clone();
    local[0].localToWorld(point);
    return this.toScreen(point);
  }

  update(dt, time) {
    super.update(dt, time);
    const s = this.state;
    const R = this.can.radius;

    // Explode
    this.tab.position.set(0, s.tab * 0.95, s.tab * 0.12);
    this.tab.children[0].rotation.x = s.tab * 0.9;
    this.lid.position.y = s.lid * 0.55;
    this.base.position.y = -s.base * 0.42;
    const grow = 1 + s.sleeve * 0.2;
    this.sleeve.scale.set(grow, 1, grow);
    this.sleeve.position.y = s.sleeve * 0.08;
    this.labelMaterial.opacity = 1 - s.sleeve * 0.72;
    this.labelMaterial.depthWrite = s.sleeve < 0.05;
    // The assembly turns, but the wall halves always part to screen left/right
    // with their open side facing the camera (so the liquid is never hidden).
    const turn = time * 0.18 + s.spin * Math.PI * 0.6;
    this.assembly.rotation.y = turn;
    const d = s.wall * R * 1.5;
    this.wallRight.position.set(Math.cos(turn) * d, this.wallRight.position.y, Math.sin(turn) * d);
    this.wallLeft.position.set(-Math.cos(turn) * d, this.wallLeft.position.y, -Math.sin(turn) * d);
    this.wallRight.rotation.y = this.wallLeft.rotation.y = -turn; // cancel the turn: right half stays on screen right
    // Frame the whole exploded height
    this.view.elev = 0.14 + s.lid * 0.12;
    this.view.worldHeight = 2.35 + s.tab * 0.45 + s.base * 0.35;
    this.target.y = 0.05 + s.tab * 0.22 - s.base * 0.12;

    // Bubbles rise through the liquid core
    const [b0, b1] = this.bubbleRange;
    const positions = this.bubbles.geometry.attributes.position.array;
    this.bubbleSeeds.forEach((b, i) => {
      b.y = (b.y + b.speed * dt) % 1;
      positions[i * 3] = Math.cos(b.a + time * 0.6) * b.r;
      positions[i * 3 + 1] = b0 + b.y * (b1 - b0);
      positions[i * 3 + 2] = Math.sin(b.a + time * 0.6) * b.r;
    });
    this.bubbles.geometry.attributes.position.needsUpdate = true;

    this.updateCallouts();
  }

  /** Off screen: hide the DOM callouts too (they're only updated while active). */
  onDeactivate() {
    this.callouts.forEach((c) => {
      c.el.classList.remove('is-visible');
      c.line.setAttribute('visibility', 'hidden');
      c.dot.setAttribute('visibility', 'hidden');
    });
  }

  /** Show callouts whose part has come apart; point leader lines at the parts. */
  updateCallouts() {
    const s = this.state;
    const box = this.container.getBoundingClientRect();
    const shown = {
      tab: s.tab > 0.6, lid: s.lid > 0.6, base: s.base > 0.6, sleeve: s.sleeve > 0.6, wall: s.wall > 0.6, liquid: s.wall > 0.85,
    };
    const narrow = isNarrow();
    // Narrow screens: one caption at a time (the part that came apart most recently), no leader lines
    const order = ['tab', 'lid', 'base', 'sleeve', 'wall', 'liquid'];
    const newest = narrow ? [...order].reverse().find((part) => shown[part]) : null;
    const latest = this.callouts.find((c) => c.part === newest);

    this.callouts.forEach((c) => {
      const visible = narrow ? c === latest : shown[c.part];
      c.el.classList.toggle('is-visible', visible);
      if (narrow) {
        c.line.setAttribute('visibility', 'hidden');
        return;
      }
      const p = this.anchorPoint(c.part);
      const px = p.x - box.left;
      const py = p.y - box.top;
      const gap = 70;
      const width = (c.width ||= c.el.offsetWidth); // measured once: no layout reads per frame
      const x = c.side === 'right' ? px + gap : px - gap - width;
      c.el.style.transform = `translate3d(${x}px, ${py - 18}px, 0)`;
      c.line.setAttribute('x1', px);
      c.line.setAttribute('y1', py);
      c.line.setAttribute('x2', c.side === 'right' ? px + gap - 8 : px - gap + 8);
      c.line.setAttribute('y2', py);
      c.line.setAttribute('visibility', visible ? 'visible' : 'hidden');
      c.dot.setAttribute('cx', px);
      c.dot.setAttribute('cy', py);
      c.dot.setAttribute('visibility', visible ? 'visible' : 'hidden');
    });
  }
}
