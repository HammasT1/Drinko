/**
 * Shop: pack builder, cart drawer, free-shipping meter.
 * ---------------------------------------------------------------------------
 * State lives in `cart` (persisted to localStorage). Everything is rendered
 * from SHOP + FLAVORS in config.js. Checkout goes to SHOP.checkoutUrl when set.
 */
import { SHOP, FLAVORS } from './config.js';

const { gsap } = window;
const $ = (id) => document.getElementById(id);
const KEY = 'drinko-cart-v1';

const money = (n) => new Intl.NumberFormat(SHOP.locale, { style: 'currency', currency: SHOP.currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved.filter((i) => i && i.id && i.qty > 0 && SHOP.packs.some((p) => p.size === i.size)) : [];
  } catch { return []; }
}

export function initShop({ reducedMotion = false } = {}) {
  let cart = load();
  let size = SHOP.packs[1]?.size ?? SHOP.packs[0].size;
  let mix = Object.fromEntries(FLAVORS.map((f) => [f.id, 0]));
  const flavorOf = (id) => FLAVORS.find((f) => f.id === id);
  const priceOf = (s) => SHOP.packs.find((p) => p.size === s).price;
  const filled = () => Object.values(mix).reduce((a, b) => a + b, 0);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* private mode */ } };

  $('shopFree').textContent = money(SHOP.freeShippingOver);

  // ---- Pack builder ----
  const packs = $('packs');
  packs.innerHTML = SHOP.packs.map((p) => `
    <button class="pack" type="button" role="radio" data-size="${p.size}" aria-checked="false">
      ${p.tag ? `<span class="pack__tag">${p.tag}</span>` : ''}
      <strong>${p.size}</strong><span>cans</span><em>${money(p.price)}</em>
    </button>`).join('');
  packs.addEventListener('click', (e) => {
    const b = e.target.closest('.pack');
    if (!b) return;
    size = +b.dataset.size;
    let over = filled() - size;
    for (const f of FLAVORS) { // trim back to the new size
      const cut = Math.min(over, mix[f.id]);
      if (cut > 0) { mix[f.id] -= cut; over -= cut; }
    }
    renderBuilder();
  });

  const mixer = $('mixer');
  mixer.innerHTML = FLAVORS.map((f) => `
    <li class="mix" style="--c:${f.palette.primary}">
      <span class="mix__dot"></span>
      <span class="mix__name">${f.name}</span>
      <span class="mix__step">
        <button type="button" data-id="${f.id}" data-d="-1" aria-label="Fewer ${f.name}">&minus;</button>
        <output id="mix-${f.id}">0</output>
        <button type="button" data-id="${f.id}" data-d="1" aria-label="More ${f.name}">+</button>
      </span>
    </li>`).join('');
  mixer.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const next = mix[b.dataset.id] + +b.dataset.d;
    if (next < 0 || (+b.dataset.d > 0 && filled() >= size)) return;
    mix[b.dataset.id] = next;
    renderBuilder();
  });

  const fill = (even) => {
    mix = Object.fromEntries(FLAVORS.map((f) => [f.id, 0]));
    for (let i = 0; i < size; i++) mix[FLAVORS[even ? i % FLAVORS.length : Math.floor(Math.random() * FLAVORS.length)].id]++;
    renderBuilder();
  };
  $('mixAuto').addEventListener('click', () => fill(false));

  function renderBuilder() {
    packs.querySelectorAll('.pack').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.size === size)));
    FLAVORS.forEach((f) => { $(`mix-${f.id}`).textContent = mix[f.id]; });
    const n = filled();
    $('packCount').textContent = `${n} / ${size}`;
    $('summaryName').textContent = `${size}-pack`;
    $('summaryPrice').textContent = money(priceOf(size));
    $('summaryEach').textContent = `${money(priceOf(size) / size)} per can`;
    $('addToCart').disabled = n !== size;
    $('addToCart').textContent = n === size ? 'Add to cart' : `Pick ${size - n} more`;
    $('miniPack').innerHTML = FLAVORS.flatMap((f) => Array.from({ length: mix[f.id] }, () => `<i style="--c:${f.palette.primary}"></i>`)).join('')
      || '<i class="is-empty"></i>'.repeat(3);
  }

  // ---- Cart ----
  const drawer = $('drawer');
  const scrim = $('drawerScrim');
  const setOpen = (open) => {
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.inert = !open;
    scrim.hidden = !open;
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) $('drawerClose').focus(); else $('cartBtn').focus({ preventScroll: true });
  };
  $('cartBtn').addEventListener('click', () => setOpen(true));
  $('drawerClose').addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false); });

  const subtotal = () => cart.reduce((t, i) => t + priceOf(i.size) * i.qty, 0);
  const count = () => cart.reduce((t, i) => t + i.qty, 0);

  function renderCart() {
    const sub = subtotal();
    $('cartCount').textContent = count();
    $('cartCount').classList.toggle('is-empty', count() === 0);
    $('cartEmpty').hidden = cart.length > 0;
    $('cartSub').textContent = money(sub);
    $('checkout').disabled = !cart.length;
    const left = SHOP.freeShippingOver - sub;
    $('shipMsg').textContent = !cart.length ? `Free shipping over ${money(SHOP.freeShippingOver)}`
      : left > 0 ? `${money(left)} away from free shipping` : 'You unlocked free shipping';
    $('shipBar').style.transform = `scaleX(${Math.min(sub / SHOP.freeShippingOver, 1)})`;
    $('cartItems').innerHTML = cart.map((it, idx) => `
      <li class="line">
        <div class="line__minis">${Object.entries(it.mix).flatMap(([id, q]) => Array.from({ length: q }, () => `<i style="--c:${flavorOf(id)?.palette.primary}"></i>`)).join('')}</div>
        <div class="line__body">
          <strong>${it.size}-pack</strong>
          <span>${Object.entries(it.mix).filter(([, q]) => q).map(([id, q]) => `${q} ${flavorOf(id)?.name ?? id}`).join(', ')}</span>
          <div class="line__qty">
            <button type="button" data-i="${idx}" data-d="-1" aria-label="Fewer">&minus;</button><output>${it.qty}</output><button type="button" data-i="${idx}" data-d="1" aria-label="More">+</button>
          </div>
        </div>
        <span class="line__price">${money(priceOf(it.size) * it.qty)}</span>
      </li>`).join('');
    save();
  }
  $('cartItems').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = cart[+b.dataset.i];
    it.qty += +b.dataset.d;
    if (it.qty <= 0) cart.splice(+b.dataset.i, 1);
    renderCart();
  });

  $('addToCart').addEventListener('click', () => {
    if (filled() !== size) return;
    const snapshot = Object.fromEntries(Object.entries(mix).filter(([, q]) => q));
    const id = `${size}:${Object.entries(snapshot).map(([k, q]) => `${k}=${q}`).join(',')}`;
    const found = cart.find((i) => i.id === id);
    if (found) found.qty++; else cart.push({ id, size, mix: snapshot, qty: 1 });
    renderCart();
    flyToCart();
  });

  $('checkout').addEventListener('click', () => {
    if (SHOP.checkoutUrl) { window.location.href = SHOP.checkoutUrl; return; }
    $('checkoutNote').textContent = 'Demo store: set SHOP.checkoutUrl in config.js to enable real checkout.';
  });

  // Little cans fly from the summary into the cart button
  function flyToCart() {
    const target = $('cartBtn');
    const pop = () => gsap?.fromTo(target, { scale: 1 }, { scale: 1.25, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' });
    if (!gsap || reducedMotion) { pop(); return; }
    const from = $('addToCart').getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const colors = FLAVORS.filter((f) => mix[f.id]).map((f) => f.palette.primary);
    colors.slice(0, 3).forEach((color, i) => {
      const dot = document.createElement('i');
      dot.className = 'fly-can';
      dot.style.background = color;
      document.body.append(dot);
      gsap.fromTo(dot, { x: from.left + from.width / 2, y: from.top + from.height / 2, scale: 1, rotation: 0 }, {
        x: to.left + to.width / 2 - 8, y: to.top + to.height / 2 - 14, scale: 0.4, rotation: 360, duration: 0.8, delay: i * 0.1, ease: 'power3.in',
        onComplete: () => { dot.remove(); if (i === 0) pop(); },
      });
    });
  }

  fill(true);
  renderCart();
}
