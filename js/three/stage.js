/**
 * Stage: a section-local 3D scene drawn on the shared fixed WebGL canvas.
 * ---------------------------------------------------------------------------
 * Hero3D owns the renderer; every extra 3D section (carousel, anatomy, pour)
 * is a Stage with its own scene + camera. The camera is fitted so that
 * `view.worldHeight` units around `target` fill the stage's DOM anchor
 * element, wherever it currently is on screen. That way a scene scrolls with
 * its section even though the canvas itself is fixed.
 *
 * Stages render only while `active` (set by a ScrollTrigger in main.js), so a
 * section that's off screen costs nothing.
 */
import * as THREE from 'three';

export class Stage {
  /**
   * @param {object} hero     Hero3D (renderer, environment, labels, can factory)
   * @param {HTMLElement} anchor  element whose box the scene is framed into
   */
  constructor(hero, anchor) {
    this.hero = hero;
    this.anchor = anchor;
    this.active = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    this.target = new THREE.Vector3();
    this.view = { worldHeight: 1.4, zoom: 1, elev: 0.15, orbit: 0 };
    this.rect = { x: 0, y: 0, width: 0, height: 0 };
  }

  /** Fit the camera to the anchor's on-screen box (call once per frame). */
  frame() {
    const { camera, view, target } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = this.anchor.getBoundingClientRect();
    this.rect = { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: Math.max(40, r.height) };

    camera.aspect = w / h;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = (view.worldHeight * h) / (2 * Math.tan(halfFov) * this.rect.height) * view.zoom;
    camera.position.setFromSphericalCoords(distance, Math.PI / 2 - view.elev, view.orbit).add(target);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    // Shift the projection so `target` lands on the anchor's center
    camera.projectionMatrix.elements[8] = -((this.rect.x / w) * 2 - 1);
    camera.projectionMatrix.elements[9] = -(1 - (this.rect.y / h) * 2);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /** World point -> CSS pixels (for DOM callouts). */
  toScreen(point, out = { x: 0, y: 0 }) {
    const v = point.clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return out;
  }

  /** Called by Hero3D each frame while active; subclasses extend this. */
  update() {
    this.scene.environment = this.hero.scene.environment; // picks up the HDR once loaded
    this.frame();
  }
}

/**
 * Studio lighting shared by the stages: soft key with shadows, two colored
 * rims that follow a flavor palette, and a hemisphere fill.
 */
export function addStudioLights(scene, { shadows = true, shadowSize = 1024 } = {}) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x220a10, 0.6);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.2, 4, 3.2);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 14 });
    key.shadow.radius = 6;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
  }
  const rimA = new THREE.DirectionalLight(0xffffff, 3);
  rimA.position.set(-3, 1.2, -2);
  const rimB = new THREE.DirectionalLight(0xffffff, 2.4);
  rimB.position.set(3, 0.4, -2.2);
  scene.add(hemi, key, key.target, rimA, rimB);

  return {
    key,
    setPalette(palette, immediate = false) {
      [[rimA.color, palette.highlight], [rimB.color, palette.primary], [hemi.groundColor, palette.dark]].forEach(([color, hex]) => {
        const to = new THREE.Color(hex);
        if (immediate) color.copy(to);
        else window.gsap.to(color, { r: to.r, g: to.g, b: to.b, duration: 0.9, ease: 'power2.inOut', overwrite: true });
      });
    },
  };
}
