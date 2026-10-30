/**
 * Condensation beads that live on the can and slide down it.
 * ---------------------------------------------------------------------------
 * One InstancedMesh parented to the can, so beads turn with it. Each bead
 * grows while resting; once heavy enough it slides down with stick-slip
 * motion (varying speed, short stops), stretches while moving, and respawns
 * near the top when it reaches the bottom of the label.
 */
import * as THREE from 'three';

const rand = (min, max) => min + Math.random() * (max - min);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

const SLIDE_THRESHOLD = 0.0095; // bead radius at which gravity beats surface tension

export class Condensation {
  /**
   * @param {object} opts
   * @param {THREE.Object3D} opts.parent  can root (base at y = 0)
   * @param {number} opts.radius          can radius
   * @param {number[]} opts.range         [bottom, top] y of the label
   * @param {number} opts.count
   */
  constructor({ parent, radius, range, count }) {
    this.radius = radius;
    this.range = range;
    this.count = count;
    this.beads = Array.from({ length: count }, () => this.spawn({}, true));

    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.02,
        metalness: 0,
        transparent: true,
        opacity: 0.42,
        clearcoat: 1,
        envMapIntensity: 2.4,
      }),
      count,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  spawn(bead, anywhere = false) {
    const [bottom, top] = this.range;
    bead.theta = Math.random() * Math.PI * 2;
    bead.y = anywhere ? rand(bottom + 0.05, top - 0.02) : rand(bottom + (top - bottom) * 0.45, top - 0.02);
    bead.size = anywhere ? rand(0.004, 0.012) : 0.003;
    bead.growth = rand(0.0005, 0.002);
    bead.vel = 0;
    bead.rest = rand(0.5, 4);
    return bead;
  }

  /** Shaking the can knocks the heavier beads loose. */
  agitate(strength = 1) {
    this.beads.forEach((bead) => {
      if (bead.size > SLIDE_THRESHOLD * 0.7) {
        bead.rest = 0;
        bead.vel += rand(0.08, 0.3) * strength;
      }
    });
  }

  update(dt) {
    const [bottom] = this.range;
    const r = this.radius + 0.0015;
    this.beads.forEach((bead, i) => {
      if (bead.rest > 0) {
        bead.rest -= dt;
        bead.size = Math.min(0.017, bead.size + bead.growth * dt);
      } else if (bead.size > SLIDE_THRESHOLD || bead.vel > 0) {
        // Heavier beads accelerate more; random "catches" stop them briefly.
        bead.vel = Math.min(0.32, bead.vel + (bead.size - 0.006) * 28 * dt);
        bead.y -= bead.vel * dt;
        bead.size = Math.max(0.005, bead.size - 0.0015 * dt); // leaves a trail behind
        if (Math.random() < 0.5 * dt) {
          bead.vel = 0;
          bead.rest = rand(0.2, 1.4);
        }
      } else {
        bead.rest = rand(0.5, 2);
      }
      if (bead.y < bottom + 0.015) this.spawn(bead);

      _pos.set(Math.sin(bead.theta) * r, bead.y, Math.cos(bead.theta) * r);
      _quat.setFromAxisAngle(Y_AXIS, bead.theta); // local +z = surface normal
      const stretch = 1.2 + Math.min(bead.vel * 4, 1.2);
      _scale.set(bead.size, bead.size * stretch, bead.size * 0.45);
      _matrix.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(i, _matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
