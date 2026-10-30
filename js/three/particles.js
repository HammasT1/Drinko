/**
 * Liquid splash + fizz particles.
 * ---------------------------------------------------------------------------
 * - Droplets: one InstancedMesh (a single draw call). Each droplet has
 *   gravity, air drag and turbulence, is stretched along its velocity, shrinks
 *   as it dies, and flattens into a splat when it hits the floor.
 * - Fizz: one THREE.Points cloud with a custom bubble shader; bubbles rise
 *   with buoyancy, wobble, and pop.
 *
 * Simulation runs on the CPU in typed arrays; dead particles are swap-removed
 * so only live ones are drawn.
 */
import * as THREE from 'three';

const GRAVITY = 9;
const UP = new THREE.Vector3(0, 1, 0);
const rand = (min, max) => min + Math.random() * (max - min);

// Scratch objects reused every frame (no per-frame allocations)
const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _identity = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _bufferSize = new THREE.Vector2();

const BUBBLE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
  }`;

const BUBBLE_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float rim = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d));
    float highlight = 1.0 - smoothstep(0.0, 0.22, length(c - vec2(-0.17, -0.19)));
    float alpha = (rim * 0.85 + 0.1 + highlight * 0.9) * vAlpha;
    gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.72), alpha);
  }`;

export class LiquidParticles {
  constructor({ scene, renderer, floorY, counts, palette }) {
    this.renderer = renderer;
    this.floorY = floorY;
    this.object = new THREE.Group(); // hidden during can snapshots

    /* Droplets */
    this.maxDrops = counts.drops;
    this.dropCount = 0;
    this.dPos = new Float32Array(this.maxDrops * 3);
    this.dVel = new Float32Array(this.maxDrops * 3);
    this.dLife = new Float32Array(this.maxDrops);
    this.dMaxLife = new Float32Array(this.maxDrops);
    this.dSize = new Float32Array(this.maxDrops);
    this.dSplat = new Float32Array(this.maxDrops); // < 0 flying, >= 0 seconds since splat

    this.dropMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.primary,
      emissive: palette.primary,
      emissiveIntensity: 0.18,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.8,
    });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.dropMaterial, this.maxDrops);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.drops.castShadow = true;

    /* Fizz bubbles */
    this.maxBubbles = counts.bubbles;
    this.bubbleCount = 0;
    this.bPos = new Float32Array(this.maxBubbles * 3);
    this.bVel = new Float32Array(this.maxBubbles * 3);
    this.bLife = new Float32Array(this.maxBubbles);
    this.bMaxLife = new Float32Array(this.maxBubbles);
    this.bBaseSize = new Float32Array(this.maxBubbles);
    this.bPhase = new Float32Array(this.maxBubbles);
    this.bSize = new Float32Array(this.maxBubbles);
    this.bAlpha = new Float32Array(this.maxBubbles);

    const geometry = new THREE.BufferGeometry();
    this.bPosAttr = new THREE.BufferAttribute(this.bPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.bSizeAttr = new THREE.BufferAttribute(this.bSize, 1).setUsage(THREE.DynamicDrawUsage);
    this.bAlphaAttr = new THREE.BufferAttribute(this.bAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.bPosAttr);
    geometry.setAttribute('aSize', this.bSizeAttr);
    geometry.setAttribute('aAlpha', this.bAlphaAttr);
    geometry.setDrawRange(0, 0);
    this.bubbleUniforms = {
      uScale: { value: 1 },
      uTint: { value: new THREE.Color(palette.highlight) },
    };
    this.bubbles = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERTEX,
      fragmentShader: BUBBLE_FRAGMENT,
      uniforms: this.bubbleUniforms,
      transparent: true,
      depthWrite: false,
    }));
    this.bubbles.frustumCulled = false;

    this.object.add(this.drops, this.bubbles);
    scene.add(this.object);
    this.streams = [];
  }

  setPalette(palette, immediate) {
    const targets = [
      [this.dropMaterial.color, new THREE.Color(palette.primary)],
      [this.dropMaterial.emissive, new THREE.Color(palette.primary)],
      [this.bubbleUniforms.uTint.value, new THREE.Color(palette.highlight)],
    ];
    targets.forEach(([color, to]) => {
      if (immediate) color.copy(to);
      else window.gsap.to(color, { r: to.r, g: to.g, b: to.b, duration: 1, ease: 'power2.inOut' });
    });
  }

  /* ---------------- Emitters ---------------- */

  addDrop(px, py, pz, vx, vy, vz, size, life) {
    if (this.dropCount >= this.maxDrops) return;
    const i = this.dropCount++;
    this.dPos.set([px, py, pz], i * 3);
    this.dVel.set([vx, vy, vz], i * 3);
    this.dSize[i] = size;
    this.dLife[i] = this.dMaxLife[i] = life;
    this.dSplat[i] = -1;
  }

  addBubble(px, py, pz, vx, vy, vz, size, life) {
    if (this.bubbleCount >= this.maxBubbles) return;
    const i = this.bubbleCount++;
    this.bPos.set([px, py, pz], i * 3);
    this.bVel.set([vx, vy, vz], i * 3);
    this.bBaseSize[i] = size;
    this.bLife[i] = this.bMaxLife[i] = life;
    this.bPhase[i] = Math.random() * Math.PI * 2;
  }

  /** Eruption from the can opening along `up` (world space). */
  burst(origin, up, strength = 1) {
    _side.set(1, 0, 0).cross(up).normalize(); // any vector perpendicular to up
    const drops = Math.round(this.maxDrops * 0.35 * strength);
    for (let n = 0; n < drops; n++) {
      // Most liquid goes up in a tight jet, some sprays wide and low (crown).
      const wide = Math.random() < 0.3;
      // Tilted outward so drops land around the can rather than through it;
      // speeds peak at roughly half a can height above the lid.
      const cone = wide ? rand(0.6, 1.15) : rand(0.18, 0.5);
      const spin = Math.random() * Math.PI * 2;
      _dir.copy(up).applyAxisAngle(_side, cone).applyAxisAngle(up, spin);
      const speed = (wide ? rand(0.9, 1.6) : rand(1.5, 2.5)) * strength;
      this.addDrop(
        origin.x + rand(-0.03, 0.03), origin.y, origin.z + rand(-0.03, 0.03),
        _dir.x * speed, _dir.y * speed, _dir.z * speed,
        rand(0.0035, 0.012), rand(1.1, 1.9),
      );
    }
    const bubbles = Math.round(this.maxBubbles * 0.48 * strength);
    for (let n = 0; n < bubbles; n++) {
      this.addBubble(
        origin.x + rand(-0.04, 0.04), origin.y + rand(0, 0.05), origin.z + rand(-0.04, 0.04),
        rand(-0.7, 0.7) + up.x * rand(0.6, 2), up.y * rand(0.6, 2.2), rand(-0.7, 0.7) + up.z * rand(0.6, 2),
        rand(0.008, 0.026), rand(0.7, 1.7),
      );
    }
  }

  /** Crown splash on the floor (used when the can lands). */
  ring(center, radius, strength = 1) {
    const drops = Math.round(this.maxDrops * 0.26 * strength);
    for (let n = 0; n < drops; n++) {
      const a = Math.random() * Math.PI * 2;
      const out = rand(0.8, 2.2) * strength;
      this.addDrop(
        center.x + Math.cos(a) * radius, center.y + 0.01, center.z + Math.sin(a) * radius,
        Math.cos(a) * out, rand(1.6, 3.4) * strength, Math.sin(a) * out,
        rand(0.003, 0.01), rand(0.9, 1.5),
      );
    }
    const bubbles = Math.round(this.maxBubbles * 0.22 * strength);
    for (let n = 0; n < bubbles; n++) {
      const a = Math.random() * Math.PI * 2;
      this.addBubble(
        center.x + Math.cos(a) * radius, center.y + 0.05, center.z + Math.sin(a) * radius,
        Math.cos(a) * 0.4, rand(0.4, 1.2), Math.sin(a) * 0.4,
        rand(0.01, 0.03), rand(0.6, 1.4),
      );
    }
  }

  /**
   * Continuous jet (geyser, pour). `getSource()` is called every frame and
   * returns { point, dir } in world space, so the jet follows a moving can.
   * Returns a handle with stop().
   */
  stream({ getSource, duration = Infinity, dropsPerSec = 120, bubblesPerSec = 0, speed = [2, 3], spread = 0.12, size = [0.004, 0.012], life = [0.8, 1.4] }) {
    const jet = { getSource, duration, dropsPerSec, bubblesPerSec, speed, spread, size, life, age: 0, dropDebt: 0, bubbleDebt: 0, stopped: false };
    this.streams.push(jet);
    return { stop: () => { jet.stopped = true; } };
  }

  emitStreams(dt) {
    this.streams = this.streams.filter((jet) => !jet.stopped && (jet.age += dt) < jet.duration);
    this.streams.forEach((jet) => {
      const { point, dir } = jet.getSource();
      _side.set(1, 0, 0).cross(dir);
      if (_side.lengthSq() < 1e-6) _side.set(0, 0, 1).cross(dir);
      _side.normalize();
      jet.dropDebt += jet.dropsPerSec * dt;
      for (; jet.dropDebt >= 1; jet.dropDebt--) {
        _dir.copy(dir).applyAxisAngle(_side, rand(0, jet.spread)).applyAxisAngle(dir, rand(0, Math.PI * 2));
        const v = rand(jet.speed[0], jet.speed[1]);
        this.addDrop(point.x, point.y, point.z, _dir.x * v, _dir.y * v, _dir.z * v, rand(jet.size[0], jet.size[1]), rand(jet.life[0], jet.life[1]));
      }
      jet.bubbleDebt += jet.bubblesPerSec * dt;
      for (; jet.bubbleDebt >= 1; jet.bubbleDebt--) {
        const v = rand(jet.speed[0], jet.speed[1]) * 0.5;
        this.addBubble(point.x + rand(-0.03, 0.03), point.y, point.z + rand(-0.03, 0.03),
          dir.x * v + rand(-0.4, 0.4), dir.y * v, dir.z * v + rand(-0.4, 0.4), rand(0.008, 0.026), rand(0.6, 1.3));
      }
    });
  }

  /* ---------------- Simulation ---------------- */

  removeDrop(i) {
    const last = --this.dropCount;
    if (i === last) return;
    this.dPos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.dVel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.dLife[i] = this.dLife[last];
    this.dMaxLife[i] = this.dMaxLife[last];
    this.dSize[i] = this.dSize[last];
    this.dSplat[i] = this.dSplat[last];
  }

  removeBubble(i) {
    const last = --this.bubbleCount;
    if (i === last) return;
    this.bPos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.bVel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.bLife[i] = this.bLife[last];
    this.bMaxLife[i] = this.bMaxLife[last];
    this.bBaseSize[i] = this.bBaseSize[last];
    this.bPhase[i] = this.bPhase[last];
  }

  updateDrops(dt, time) {
    const { dPos: p, dVel: v } = this;
    const drag = 1 - 0.35 * dt;
    for (let i = 0; i < this.dropCount; i++) {
      const i3 = i * 3;
      this.dLife[i] -= dt;
      if (this.dSplat[i] >= 0) {
        this.dSplat[i] += dt;
        if (this.dSplat[i] > 0.45) { this.removeDrop(i--); continue; }
      } else {
        // Gravity + turbulence + drag
        v[i3 + 1] -= GRAVITY * dt;
        v[i3] += Math.sin(time * 9 + i * 1.7) * 0.9 * dt;
        v[i3 + 2] += Math.cos(time * 7.3 + i * 2.3) * 0.9 * dt;
        v[i3] *= drag; v[i3 + 1] *= drag; v[i3 + 2] *= drag;
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
        if (p[i3 + 1] < this.floorY + 0.004 && v[i3 + 1] < 0) {
          p[i3 + 1] = this.floorY + 0.003;
          this.dSplat[i] = 0;
        }
        if (this.dLife[i] <= 0) { this.removeDrop(i--); continue; }
      }

      const size = this.dSize[i];
      _pos.set(p[i3], p[i3 + 1], p[i3 + 2]);
      if (this.dSplat[i] >= 0) {
        // Flatten into a spreading, shrinking splat
        const t = this.dSplat[i] / 0.45;
        const spread = size * 1.8 * (1 + t * 2.5) * (1 - t);
        _scale.set(spread, size * 0.15 * (1 - t), spread);
        _quat.copy(_identity);
      } else {
        // Stretch along velocity; fade by shrinking near end of life
        _vel.set(v[i3], v[i3 + 1], v[i3 + 2]);
        const speed = _vel.length();
        _quat.setFromUnitVectors(UP, speed > 1e-4 ? _vel.divideScalar(speed) : UP);
        const fade = Math.min(1, (this.dLife[i] / this.dMaxLife[i]) * 3);
        const s = size * fade;
        _scale.set(s, s * (1 + Math.min(speed * 0.55, 2.4)), s);
      }
      _matrix.compose(_pos, _quat, _scale);
      this.drops.setMatrixAt(i, _matrix);
    }
    this.drops.count = this.dropCount;
    this.drops.instanceMatrix.needsUpdate = true;
  }

  updateBubbles(dt, time) {
    const { bPos: p, bVel: v } = this;
    const drag = 1 - 1.6 * dt;
    for (let i = 0; i < this.bubbleCount; i++) {
      const i3 = i * 3;
      this.bLife[i] -= dt;
      if (this.bLife[i] <= 0) { this.removeBubble(i--); continue; }
      v[i3 + 1] += 2.4 * dt; // buoyancy
      v[i3] *= drag; v[i3 + 1] *= drag; v[i3 + 2] *= drag;
      const wobble = Math.sin(time * 14 + this.bPhase[i]) * 0.12;
      p[i3] += (v[i3] + wobble) * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += (v[i3 + 2] + Math.cos(time * 11 + this.bPhase[i]) * 0.1) * dt;

      const age = this.bMaxLife[i] - this.bLife[i];
      const fadeIn = Math.min(1, age * 10);
      const pop = Math.min(1, this.bLife[i] * 5);
      this.bAlpha[i] = fadeIn * pop;
      this.bSize[i] = this.bBaseSize[i] * (1 + (1 - pop) * 0.6) * (0.6 + 0.4 * fadeIn);
    }
    this.bubbles.geometry.setDrawRange(0, this.bubbleCount);
    this.bPosAttr.needsUpdate = true;
    this.bSizeAttr.needsUpdate = true;
    this.bAlphaAttr.needsUpdate = true;
  }

  update(dt, time) {
    if (this.streams.length) this.emitStreams(dt);
    if (this.dropCount) this.updateDrops(dt, time);
    else this.drops.count = 0;
    if (this.bubbleCount) {
      // World size -> pixels for gl_PointSize (14° = half of the hero camera's 28° fov)
      this.renderer.getDrawingBufferSize(_bufferSize);
      this.bubbleUniforms.uScale.value = _bufferSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(14)));
      this.updateBubbles(dt, time);
    } else {
      this.bubbles.geometry.setDrawRange(0, 0);
    }
  }
}
