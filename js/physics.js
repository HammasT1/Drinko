/**
 * Hero physics toys (Matter.js).
 * ---------------------------------------------------------------------------
 * Ice cubes and fruit slices rain into the hero, bounce off the can, the
 * headline and the flavor picker, and pile up on the floor. Bubbles float
 * upward through them. Moving the pointer shoves things around; tapping the
 * can blasts them away from the opening.
 *
 * Bodies are drawn on one 2D canvas from pre-rasterized sprites. The engine
 * only steps while the hero is on screen.
 */
import { loadScript } from './loadScript.js';

const { gsap } = window;
const rand = (min, max) => min + Math.random() * (max - min);

const CATEGORY = { wall: 0x1, item: 0x2, bubble: 0x4, obstacle: 0x8 };

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container      the hero section
 * @param {HTMLCanvasElement} opts.canvas   absolutely positioned over the hero
 * @param {Function} opts.getObstacles      -> [{ el, shape: 'can'|'box' }]
 * @param {{ice:string,bubble:string,fruit:string}} opts.sprites  image URLs
 * @param {{ice:number,fruit:number,bubbles:number,mobileScale:number}} opts.counts
 * @param {string} opts.matterSrc           Matter.js script URL
 */
export async function createHeroPhysics({ container, canvas, getObstacles, sprites, counts, matterSrc }) {
  await loadScript(matterSrc);
  const { Engine, Bodies, Body, Composite, Events } = window.Matter;

  const small = window.innerWidth < 640;
  const sizeScale = small ? 0.72 : 1;
  const countScale = small ? counts.mobileScale : 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');

  const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.0011 } });
  const world = engine.world;
  let width = 0;
  let height = 0;
  let walls = [];
  let obstacles = [];
  let visible = true;
  const items = new Set(); // every dynamic body we draw

  /* ---------------- Sprites ---------------- */

  const spriteCache = new Map();
  function sprite(src, size) {
    const px = Math.ceil(size * dpr);
    const key = `${src}|${px}`;
    if (!spriteCache.has(key)) {
      const out = document.createElement('canvas');
      out.width = out.height = px;
      const image = new Image();
      image.onload = () => out.getContext('2d').drawImage(image, 0, 0, px, px);
      image.src = src;
      spriteCache.set(key, out);
    }
    return spriteCache.get(key);
  }

  /* ---------------- Static geometry ---------------- */

  function layout() {
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    Composite.remove(world, [...walls, ...obstacles]);
    const wall = { isStatic: true, collisionFilter: { category: CATEGORY.wall, mask: CATEGORY.item } };
    const t = 100;
    const floor = height - 34; // clear of the tilted marquee that overlaps the hero's bottom edge
    walls = [
      Bodies.rectangle(width / 2, floor + t / 2, width * 2, t, wall),
      Bodies.rectangle(-t / 2, height / 2 - height, t, height * 4, wall),
      Bodies.rectangle(width + t / 2, height / 2 - height, t, height * 4, wall),
    ];

    const box = container.getBoundingClientRect();
    const obstacle = { isStatic: true, collisionFilter: { category: CATEGORY.obstacle, mask: CATEGORY.item | CATEGORY.bubble } };
    obstacles = getObstacles().map(({ el, shape }) => {
      const r = el.getBoundingClientRect();
      const cx = r.left - box.left + r.width / 2;
      const cy = r.top - box.top + r.height / 2;
      if (shape === 'can') {
        // The 3D can is a little wider than its button (real can proportions).
        const w = r.height * 0.58;
        return Bodies.rectangle(cx, cy, w, r.height * 0.98, { ...obstacle, chamfer: { radius: w * 0.22 } });
      }
      return Bodies.rectangle(cx, cy, r.width, r.height, { ...obstacle, chamfer: { radius: 12 } });
    });
    Composite.add(world, [...walls, ...obstacles]);

    // Keep everything inside the new bounds.
    items.forEach((body) => {
      if (body.position.x < 0 || body.position.x > width || body.position.y > height) {
        Body.setPosition(body, { x: rand(40, width - 40), y: -rand(40, 200) });
      }
    });
  }

  /* ---------------- Bodies ---------------- */

  function addBody(kind, src, x, y) {
    let body;
    let size;
    if (kind === 'ice') {
      size = rand(46, 66) * sizeScale;
      // Pointy-top hexagon matches the isometric cube sprite
      body = Bodies.polygon(x, y, 6, size * 0.48, {
        restitution: 0.25, friction: 0.08, density: 0.002,
        collisionFilter: { category: CATEGORY.item, mask: CATEGORY.wall | CATEGORY.item | CATEGORY.obstacle | CATEGORY.bubble },
      });
    } else if (kind === 'fruit') {
      size = rand(52, 74) * sizeScale;
      body = Bodies.circle(x, y, size * 0.45, {
        restitution: 0.45, friction: 0.2, density: 0.0015,
        collisionFilter: { category: CATEGORY.item, mask: CATEGORY.wall | CATEGORY.item | CATEGORY.obstacle | CATEGORY.bubble },
      });
    } else {
      size = rand(16, 36) * sizeScale;
      // Bubbles skip the walls so they can float off the top and wrap around.
      body = Bodies.circle(x, y, size * 0.5, {
        restitution: 0.9, friction: 0, frictionAir: 0.06, density: 0.0003,
        collisionFilter: { category: CATEGORY.bubble, mask: CATEGORY.item | CATEGORY.obstacle | CATEGORY.bubble },
      });
    }
    Body.setAngle(body, rand(0, Math.PI * 2));
    Body.setAngularVelocity(body, rand(-0.08, 0.08));
    body.plugin.view = { kind, src, size, scale: 0, targetScale: 1, remove: false };
    items.add(body);
    Composite.add(world, body);
    return body;
  }

  /** Drop items in from above the hero, staggered by height. */
  function rain(kind, src, count) {
    for (let i = 0; i < count; i++) addBody(kind, src, rand(40, width - 40), -rand(60, 700));
  }

  function spawnBubbles(count) {
    for (let i = 0; i < count; i++) addBody('bubble', sprites.bubble, rand(20, width - 20), rand(height * 0.2, height + 60));
  }

  // Bubbles float up (anti-gravity) and wrap from the top back to the bottom.
  Events.on(engine, 'beforeUpdate', () => {
    const g = engine.gravity.scale;
    items.forEach((body) => {
      if (body.plugin.view.kind !== 'bubble') return;
      Body.applyForce(body, body.position, {
        x: Math.sin(engine.timing.timestamp * 0.002 + body.id) * body.mass * g * 0.15,
        y: -body.mass * g * 1.3,
      });
      if (body.position.y < -60) {
        Body.setPosition(body, { x: rand(20, width - 20), y: height + 40 });
        Body.setVelocity(body, { x: 0, y: 0 });
      }
    });
  });

  /* ---------------- Interaction ---------------- */

  let last = null;
  container.addEventListener('pointermove', (event) => {
    if (!visible) return;
    const box = container.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (last) {
      const vx = x - last.x;
      const vy = y - last.y;
      items.forEach((body) => {
        const dx = body.position.x - x;
        const dy = body.position.y - y;
        const reach = 90 + body.plugin.view.size * 0.5;
        const d = Math.hypot(dx, dy);
        if (d > reach) return;
        const falloff = 1 - d / reach;
        Body.setVelocity(body, {
          x: body.velocity.x + vx * 0.35 * falloff,
          y: body.velocity.y + vy * 0.35 * falloff - 0.6 * falloff,
        });
        Body.setAngularVelocity(body, body.angularVelocity + vx * 0.004 * falloff);
      });
    }
    last = { x, y };
  }, { passive: true });
  container.addEventListener('pointerleave', () => { last = null; });

  /** Radial blast from a viewport point (the can opening). */
  function explode(origin) {
    if (!visible) return;
    const box = container.getBoundingClientRect();
    const ox = origin.x - box.left;
    const oy = origin.y - box.top;
    items.forEach((body) => {
      const dx = body.position.x - ox;
      const dy = body.position.y - oy;
      const d = Math.hypot(dx, dy) || 1;
      const reach = 650;
      if (d > reach) return;
      const power = (1 - d / reach) * 16;
      Body.setVelocity(body, {
        x: body.velocity.x + (dx / d) * power,
        y: body.velocity.y + (dy / d) * power - power * 0.45,
      });
      Body.setAngularVelocity(body, body.angularVelocity + rand(-0.25, 0.25));
    });
  }

  /** Swap fruit: current slices shrink away, new ones rain in. */
  function setFruit(src) {
    sprites.fruit = src;
    let count = 0;
    items.forEach((body) => {
      if (body.plugin.view.kind !== 'fruit') return;
      body.plugin.view.targetScale = 0;
      body.plugin.view.remove = true;
      count++;
    });
    gsap.delayedCall(0.35, () => rain('fruit', src, count || Math.round(counts.fruit * countScale)));
  }

  /* ---------------- Loop ---------------- */

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    items.forEach((body) => {
      const view = body.plugin.view;
      view.scale += (view.targetScale - view.scale) * 0.18;
      if (view.remove && view.scale < 0.02) {
        items.delete(body);
        Composite.remove(world, body);
        return;
      }
      const { x, y } = body.position;
      if (y < -view.size || y > height + view.size) return;
      const s = view.size * view.scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(body.angle);
      if (view.kind === 'bubble') ctx.globalAlpha = 0.75;
      ctx.drawImage(sprite(view.src, view.size), -s / 2, -s / 2, s, s);
      ctx.restore();
    });
  }

  function step(time, deltaMs) {
    if (!visible) return;
    // Two fixed sub-steps keep stacks stable even if a frame runs long.
    const dt = Math.min(deltaMs, 34) / 2;
    Engine.update(engine, dt);
    Engine.update(engine, dt);
    draw();
  }

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(container);
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  }).observe(container);

  layout();
  rain('ice', sprites.ice, Math.round(counts.ice * countScale));
  rain('fruit', sprites.fruit, Math.round(counts.fruit * countScale));
  spawnBubbles(Math.round(counts.bubbles * countScale));
  gsap.ticker.add(step);

  return { explode, setFruit, relayout: layout };
}
