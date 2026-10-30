/**
 * Fruit + ice that fly past the camera during the scroll story.
 * ---------------------------------------------------------------------------
 * Sprites are parented to the camera and travel toward (and past) it as
 * rig.flyers goes 0 -> 1, so perspective gives natural parallax: far ones
 * crawl near the center, near ones rush outward off-screen.
 *
 * Depth of field: every image is pre-rendered at three blur levels, and each
 * sprite picks the level that matches its distance from the focus plane
 * (the can). No post-processing pass needed.
 */
import * as THREE from 'three';

const BLUR_PX = [0, 5, 13];
const TRAVEL = 20;
const rand = (min, max) => min + Math.random() * (max - min);

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** One texture per blur level (canvas `filter` blur; unsupported browsers just skip the blur). */
function blurLevels(image, size = 256) {
  return BLUR_PX.map((blur) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pad = blur * 2; // keep the blurred edge inside the canvas
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, pad, pad, size - pad * 2, size - pad * 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

export class Flyers {
  /**
   * @param {object} opts
   * @param {THREE.Camera} opts.camera
   * @param {object} opts.rig       Hero3D rig (reads flyers + flyerOpacity)
   * @param {Function} opts.getFocus       distance from camera to the can
   * @param {Function} opts.getFlavorIndex current flavor (fruit follows it)
   * @param {string[]} opts.fruitSources   fruit image per flavor
   * @param {string} opts.iceSource
   * @param {number} opts.count
   */
  constructor({ camera, rig, getFocus, getFlavorIndex, fruitSources, iceSource, count }) {
    this.rig = rig;
    this.getFocus = getFocus;
    this.getFlavorIndex = getFlavorIndex;
    this.object = new THREE.Group();
    this.object.visible = false;
    camera.add(this.object);
    this.items = [];
    this.ready = this.load(fruitSources, iceSource, count);
  }

  async load(fruitSources, iceSource, count) {
    const [ice, ...fruits] = await Promise.all([iceSource, ...fruitSources].map(loadImage));
    // Blur levels per flavor's fruit, plus the shared ice cube
    this.fruitLevels = fruits.map((image) => (image ? blurLevels(image) : null));
    this.iceLevels = ice ? blurLevels(ice) : null;
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      // Spread around the view axis, never straight through the can.
      const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const radius = rand(0.85, 2.2);
      const item = {
        sprite,
        kind: i % 3 === 2 && this.iceLevels ? 'ice' : 'fruit',
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.75,
        z0: rand(-TRAVEL - 4, -5),
        size: rand(0.28, 0.6),
        rotation: rand(0, Math.PI * 2),
        spin: rand(-0.8, 0.8),
      };
      sprite.scale.setScalar(item.size);
      this.items.push(item);
      this.object.add(sprite);
    }
  }

  update(dt, time) {
    const { flyers: progress, flyerOpacity } = this.rig;
    this.object.visible = flyerOpacity > 0.001 && this.items.length > 0;
    if (!this.object.visible) return;
    const focus = -this.getFocus();
    const fruitLevels = this.fruitLevels[this.getFlavorIndex()] || this.fruitLevels.find(Boolean);

    this.items.forEach((item) => {
      const z = item.z0 + progress * TRAVEL;
      const { sprite } = item;
      if (z > -0.35) { sprite.visible = false; return; }
      sprite.visible = true;
      sprite.position.set(item.x, item.y, z);

      const offFocus = Math.abs(z - focus);
      const level = offFocus < 1.4 ? 0 : offFocus < 4 ? 1 : 2;
      const levels = item.kind === 'ice' ? this.iceLevels : fruitLevels;
      if (levels && sprite.material.map !== levels[level]) {
        sprite.material.map = levels[level];
        sprite.material.needsUpdate = true;
      }
      const fadeFar = THREE.MathUtils.smoothstep(z, -TRAVEL - 4, -TRAVEL + 2);
      const fadeNear = 1 - THREE.MathUtils.smoothstep(z, -1.6, -0.35);
      sprite.material.opacity = flyerOpacity * fadeFar * fadeNear;
      sprite.material.rotation = item.rotation + time * item.spin;
    });
  }
}
