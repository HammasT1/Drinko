/**
 * The Pour: a can tips into a glass of ice as you scroll.
 * ---------------------------------------------------------------------------
 * Scroll (sections.js) tweens `state` { enter, tilt, fill, foam, exit } 0..1.
 *
 *  - Glass: lathe geometry, glossy see-through material (not transmission,
 *    which would sample the transparent canvas and turn the glass dark)
 *  - Liquid: lathe of the glass interior, cut at the fill level by a clipping
 *    plane; a wobbling surface disc rides on top
 *  - Stream: a liquid "rope" from the can lip to the surface plus droplets
 *    that splat on the surface (the particle floor follows the level)
 *  - Ice cubes float once the liquid reaches them; bubbles rise; foam forms
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Stage, addStudioLights } from './stage.js';
import { LiquidParticles } from './particles.js';
import { CAN } from './canModel.js';

const rand = (min, max) => min + Math.random() * (max - min);
const DOWN = new THREE.Vector3(-0.12, -1, 0).normalize();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Glass interior (radius by height), base of the liquid at y = INNER_BOTTOM
const INNER_BOTTOM = 0.1;
const INNER_TOP = 0.96;
const innerRadius = (y) => lerp(0.285, 0.343, (y - INNER_BOTTOM) / (INNER_TOP - INNER_BOTTOM));

export class PourStage extends Stage {
  /**
   * @param {object} hero
   * @param {object} opts
   * @param {HTMLElement} opts.anchor   box the glass is framed into
   * @param {object} opts.state        { enter, tilt, fill, foam, exit } tweened by scroll
   * @param {Function} [opts.onLevel]  (fill 0..1) => void, for the % readout
   */
  constructor(hero, { anchor, state, onLevel }) {
    super(hero, anchor);
    Object.assign(this, { state, onLevel });
    this.view = { worldHeight: 2.5, zoom: 1, elev: 0.18, orbit: 0.25 };
    this.target.set(0.15, 0.85, 0);
    this.agitation = 0;
    this.lastFill = 0;
    this.flow = 0; // smoothed pour rate
  }

  async build(index) {
    const { scene } = this;
    const small = window.innerWidth < 640;
    this.hero.renderer.localClippingEnabled = true;
    this.lights = addStudioLights(scene, { shadowSize: small ? 512 : 1024 });

    const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 48), new THREE.ShadowMaterial({ opacity: 0.3 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    this.buildGlass();
    this.buildLiquid();
    this.buildIce();
    this.buildFoam(small ? 90 : 160);

    // The can that pours, hinged exactly at its opening so it tips over the lip.
    // Turned so the opening faces the glass (left) while some label stays visible.
    this.can = await this.hero.createCan(index);
    this.canPivot = new THREE.Group();
    const turn = -1.1;
    const opening = this.can.opening.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    this.can.root.rotation.y = turn;
    this.can.root.position.copy(opening.negate());
    this.canPivot.add(this.can.root);
    this.can.root.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    scene.add(this.canPivot);

    this.particles = new LiquidParticles({
      scene,
      renderer: this.hero.renderer,
      floorY: INNER_BOTTOM,
      counts: small ? { drops: 140, bubbles: 120 } : { drops: 260, bubbles: 200 },
      palette: this.hero.flavors[index].palette,
    });

    this.setFlavor(index, true);
    await (this.hero.renderer.compileAsync?.(scene, this.camera) ?? Promise.resolve());
    return this;
  }

  buildGlass() {
    const profile = [
      [0, 0], [0.29, 0], [0.305, 0.02], [0.36, 1.0], [0.356, 1.012], [0.347, 1.0],
      [innerRadius(INNER_TOP), INNER_TOP], [0.285, INNER_BOTTOM], [0, INNER_BOTTOM],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      roughness: 0.04,
      metalness: 0.1,
      clearcoat: 1,
      envMapIntensity: 2.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    this.glass.renderOrder = 2; // after the liquid and ice inside it
    this.scene.add(this.glass);
  }

  buildLiquid() {
    this.levelPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), INNER_BOTTOM);
    this.liquidMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.8, envMapIntensity: 1.3,
      clippingPlanes: [this.levelPlane], side: THREE.DoubleSide,
    });
    const steps = 12;
    const profile = [new THREE.Vector2(0, INNER_BOTTOM + 0.002)];
    for (let i = 0; i <= steps; i++) {
      const y = lerp(INNER_BOTTOM + 0.002, INNER_TOP - 0.01, i / steps);
      profile.push(new THREE.Vector2(innerRadius(y) - 0.004, y));
    }
    this.liquid = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), this.liquidMaterial);
    this.liquid.renderOrder = 1;

    // Wobbling surface: a disc whose vertices ripple from the stream impact
    this.surfaceUniforms = { uTime: { value: 0 }, uAgitation: { value: 0 } };
    this.surfaceMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.95, envMapIntensity: 1.8,
    });
    this.surfaceMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.surfaceUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAgitation;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float r = length(position.xz);
          transformed.y += (sin(r * 26.0 - uTime * 9.0) * 0.012 + sin(position.x * 9.0 + uTime * 3.0) * 0.006) * uAgitation * r;`);
    };
    this.surfaceMaterial.customProgramCacheKey = () => 'drinko-pour-surface';
    this.surface = new THREE.Mesh(new THREE.CircleGeometry(1, 64, 0, Math.PI * 2), this.surfaceMaterial);
    this.surface.geometry.rotateX(-Math.PI / 2); // lie flat (the ripple shader displaces along y)
    this.surface.renderOrder = 1;

    // Liquid rope from the can lip to the surface
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), this.liquidMaterial.clone());
    this.rope.material.clippingPlanes = [];
    this.rope.material.opacity = 0.95;

    // Bubbles rising through the liquid
    const count = 120;
    this.bubbleSeeds = Array.from({ length: count }, () => ({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()), y: Math.random(), speed: rand(0.08, 0.3) }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.stroke();
    this.bubbles = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c), size: 0.02, transparent: true, depthWrite: false, opacity: 0.75,
    }));
    this.bubbles.renderOrder = 1;

    this.scene.add(this.liquid, this.surface, this.rope, this.bubbles);
  }

  buildIce() {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xeaf7ff, roughness: 0.06, clearcoat: 1, transparent: true, opacity: 0.6, envMapIntensity: 2.2,
    });
    const geometry = new RoundedBoxGeometry(0.16, 0.16, 0.16, 3, 0.03);
    this.ice = [[-0.1, 0.06], [0.11, -0.04], [0.0, 0.1]].map(([x, z], i) => {
      const cube = new THREE.Mesh(geometry, material);
      cube.renderOrder = 1;
      cube.castShadow = true;
      const rest = INNER_BOTTOM + 0.08 + i * 0.13; // stacked when the glass is empty
      cube.userData = { x, z, rest, phase: i * 2.1, spin: rand(-0.6, 0.6) };
      cube.position.set(x, rest, z);
      cube.rotation.set(rand(0, 1), rand(0, 1), rand(0, 1));
      this.scene.add(cube);
      return cube;
    });
  }

  buildFoam(count) {
    this.foam = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.6 }),
      count,
    );
    this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foam.frustumCulled = false;
    this.foam.renderOrder = 1;
    this.foamSeeds = Array.from({ length: count }, () => ({
      a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()), size: rand(0.012, 0.03), lift: rand(0, 0.03), delay: Math.random(),
    }));
    this.scene.add(this.foam);
  }

  setFlavor(index, immediate = false) {
    const { palette } = this.hero.flavors[index];
    this.hero.ensureLabel(index).then(() => {
      this.can.labelMaterial.map = this.hero.labels[index];
      this.can.morph.uniforms.uMapNext.value = this.hero.labels[index];
    });
    const color = new THREE.Color(palette.primary).lerp(new THREE.Color(palette.dark), 0.3); // a touch deeper than the can
    [this.liquidMaterial, this.rope.material].forEach((m) => {
      m.color.copy(color);
      m.emissive = color.clone();
      m.emissiveIntensity = 0.22;
    });
    this.surfaceMaterial.color.set(palette.highlight).lerp(color, 0.5);
    this.particles.setPalette(palette, immediate);
    this.lights.setPalette(palette, immediate);
  }

  /** World position of the can's opening (where the stream leaves). */
  lipPoint() {
    this.canPivot.updateMatrixWorld(true);
    return this.can.root.localToWorld(this.can.opening.clone());
  }

  update(dt, time) {
    super.update(dt, time);
    const s = this.state;
    const level = lerp(INNER_BOTTOM + 0.004, INNER_TOP - 0.06, s.fill);
    const hasLiquid = s.fill > 0.002;

    // Can: slides in from the upper right, tips over the glass, then leaves
    const enter = 1 - (1 - s.enter) ** 3;
    this.canPivot.position.set(lerp(1.6, 0.2, enter) + s.exit * 1.4, lerp(2.4, 1.32, enter) + s.exit * 0.9, 0);
    this.canPivot.rotation.z = s.tilt * 2.05 + Math.sin(time * 2) * 0.02 * s.tilt;
    this.canPivot.visible = s.exit < 0.999;

    // Liquid volume + surface
    this.levelPlane.constant = level;
    this.liquid.visible = hasLiquid;
    this.surface.visible = hasLiquid;
    this.surface.position.y = level;
    this.surface.scale.setScalar(innerRadius(level) - 0.004);

    // Pour rate follows how fast the level is rising (stops when scrolling stops)
    const rate = Math.max(0, s.fill - this.lastFill) / Math.max(dt, 1e-3);
    this.lastFill = s.fill;
    const pouring = s.tilt > 0.85 && s.fill < 0.995 && s.exit < 0.01;
    this.flow = lerp(this.flow, pouring ? clamp01(0.35 + rate * 2.5) : 0, 1 - Math.exp(-6 * dt));
    this.agitation = lerp(this.agitation, this.flow * 1.2 + 0.15, 1 - Math.exp(-3 * dt));
    this.surfaceUniforms.uTime.value = time;
    this.surfaceUniforms.uAgitation.value = this.agitation;

    // Stream: rope from lip to surface + droplets that splat on the surface
    const lip = this.lipPoint();
    const impact = new THREE.Vector3(lerp(lip.x, 0, 0.3), level, lip.z * 0.5);
    this.rope.visible = this.flow > 0.05;
    if (this.rope.visible) {
      const mid = lip.clone().add(impact).multiplyScalar(0.5);
      const length = lip.distanceTo(impact);
      this.rope.position.copy(mid);
      this.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lip.clone().sub(impact).normalize());
      const thickness = 0.012 + this.flow * 0.014 + Math.sin(time * 30) * 0.0015;
      this.rope.scale.set(thickness, length, thickness);
      if (!this.jet) {
        this.jet = this.particles.stream({
          getSource: () => ({ point: this.lipPoint(), dir: DOWN }),
          dropsPerSec: window.innerWidth < 640 ? 50 : 90,
          speed: [0.6, 1.4],
          spread: 0.18,
          size: [0.004, 0.009],
          life: [0.6, 1],
        });
      }
    } else if (this.jet) {
      this.jet.stop();
      this.jet = null;
    }
    this.particles.floorY = hasLiquid ? level : INNER_BOTTOM;
    this.particles.update(dt, time);

    // Ice: rests stacked until the liquid lifts it, then bobs at the surface
    this.ice.forEach((cube) => {
      const u = cube.userData;
      const floatY = level - 0.05 + Math.sin(time * 1.6 + u.phase) * 0.012 * (1 + this.agitation);
      const y = Math.max(u.rest * (1 - s.fill * 0.15), floatY);
      cube.position.set(u.x + Math.sin(time * 0.8 + u.phase) * 0.015, y, u.z);
      if (y === floatY) cube.rotation.y += u.spin * dt;
    });

    // Bubbles rise through whatever liquid there is
    const positions = this.bubbles.geometry.attributes.position.array;
    this.bubbles.visible = hasLiquid;
    this.bubbleSeeds.forEach((b, i) => {
      b.y = (b.y + b.speed * dt * (1 + this.agitation)) % 1;
      const y = lerp(INNER_BOTTOM + 0.01, level - 0.01, b.y);
      const r = b.r * (innerRadius(y) - 0.03);
      positions[i * 3] = Math.cos(b.a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(b.a) * r;
    });
    this.bubbles.geometry.attributes.position.needsUpdate = true;

    // Foam head grows on the surface at the end
    const radius = innerRadius(level) - 0.02;
    this.foamSeeds.forEach((f, i) => {
      const grow = clamp01((s.foam - f.delay * 0.6) / 0.4);
      const size = f.size * grow * (1 + Math.sin(time * 3 + i) * 0.08);
      _pos.set(Math.cos(f.a) * f.r * radius, level + f.lift * grow + size * 0.3, Math.sin(f.a) * f.r * radius);
      _scale.set(size, size * 0.8, size);
      _matrix.compose(_pos, _quat, _scale);
      this.foam.setMatrixAt(i, _matrix);
    });
    this.foam.instanceMatrix.needsUpdate = true;
    this.foam.visible = s.foam > 0.001;

    this.onLevel?.(s.fill);
  }
}
