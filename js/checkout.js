/**
 * Checkout: details -> delivery -> payment -> processing -> confirmation.
 * ---------------------------------------------------------------------------
 * Front-end demo: nothing is sent anywhere and card data is never stored or
 * logged (the fields are cleared when the order completes). To take real
 * payments, set SHOP.checkoutUrl or post the order to your own server.
 */
import { SHOP } from './config.js';

const { gsap } = window;
const $ = (id) => document.getElementById(id);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const luhn = (digits) => {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let n = +d;
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  });
  return digits.length >= 13 && sum % 10 === 0;
};
const brandOf = (d) => (/^4/.test(d) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(d) ? 'MASTERCARD' : /^3[47]/.test(d) ? 'AMEX' : 'CARD');

/**
 * @param {object} api
 * @param {() => Array} api.getCart   [{ size, mix, qty }]
 * @param {(n:number)=>string} api.money
 * @param {(size:number)=>number} api.priceOf
 * @param {() => void} api.clearCart
 * @param {(id:string)=>object} api.flavorOf
 */
export function initCheckout({ getCart, money, priceOf, clearCart, flavorOf }) {
  const root = $('co');
  const form = $('coForm');
  const steps = [...form.querySelectorAll('.co__step')];
  let step = 0;
  let promo = 0;
  let shipId = SHOP.shipping[0].id;
  let opener = null;

  // ---- Totals ----
  const subtotal = () => getCart().reduce((t, i) => t + priceOf(i.size) * i.qty, 0);
  const shipPrice = (opt, sub) => (opt.freeOverThreshold && sub >= SHOP.freeShippingOver ? 0 : opt.price);
  const totals = () => {
    const sub = subtotal();
    const disc = +(sub * promo).toFixed(2);
    const ship = shipPrice(SHOP.shipping.find((o) => o.id === shipId), sub - disc);
    const tax = +((sub - disc) * SHOP.taxRate).toFixed(2);
    return { sub, disc, ship, tax, total: sub - disc + ship + tax };
  };
  const shown = {};
  const setText = (id, value, fmt) => {
    const node = $(id);
    if (!gsap || reduced() || shown[id] === undefined) { node.textContent = fmt(value); shown[id] = value; return; }
    const o = { v: shown[id] };
    shown[id] = value;
    gsap.to(o, { v: value, duration: 0.5, ease: 'power2.out', onUpdate: () => { node.textContent = fmt(o.v); } });
  };
  const money2 = (n) => new Intl.NumberFormat(SHOP.locale, { style: 'currency', currency: SHOP.currency }).format(n);
  function renderTotals() {
    const t = totals();
    setText('tSub', t.sub, money2);
    $('tDiscRow').hidden = !t.disc;
    setText('tDisc', -t.disc, money2);
    setText('tShip', t.ship, (v) => (v === 0 ? 'Free' : money2(v)));
    setText('tTax', t.tax, money2);
    setText('tTotal', t.total, money2);
    $('coNext').textContent = step === steps.length - 1 ? `Pay ${money2(t.total)}` : 'Continue';
  }

  function renderItems() {
    const list = $('coItems');
    list.replaceChildren(...getCart().map((it) => {
      const li = document.createElement('li');
      const minis = document.createElement('span');
      minis.className = 'co__mini';
      Object.entries(it.mix).forEach(([id, q]) => {
        for (let k = 0; k < Math.min(q, 6); k++) {
          const i = document.createElement('i');
          i.style.setProperty('--c', flavorOf(id)?.palette.primary);
          minis.append(i);
        }
      });
      const text = document.createElement('span');
      text.innerHTML = '<strong></strong><small></small>';
      text.firstChild.textContent = `${it.size}-pack × ${it.qty}`;
      text.lastChild.textContent = Object.entries(it.mix).map(([id, q]) => `${q} ${flavorOf(id)?.short ?? id}`).join(' · ');
      const price = document.createElement('b');
      price.textContent = money(priceOf(it.size) * it.qty);
      li.append(minis, text, price);
      return li;
    }));
  }

  // ---- Delivery options ----
  const shipBox = $('coShip');
  function renderShip() {
    const sub = subtotal() - subtotal() * promo;
    shipBox.replaceChildren(...SHOP.shipping.map((o) => {
      const price = shipPrice(o, sub);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ship__opt';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.id === shipId));
      b.dataset.id = o.id;
      b.innerHTML = '<span><strong></strong><small></small></span><em></em>';
      b.querySelector('strong').textContent = o.label;
      b.querySelector('small').textContent = o.days;
      b.querySelector('em').textContent = price === 0 ? 'Free' : money2(price);
      return b;
    }));
  }
  shipBox.addEventListener('click', (e) => {
    const b = e.target.closest('.ship__opt');
    if (!b) return;
    shipId = b.dataset.id;
    renderShip();
    renderTotals();
  });

  // ---- Promo ----
  $('coPromo').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('coPromoIn').value.trim().toUpperCase();
    const off = SHOP.promoCodes[code];
    promo = off || 0;
    $('coPromoMsg').textContent = off ? `${code} applied: ${Math.round(off * 100)}% off` : code ? 'That code is not valid.' : '';
    $('coPromoMsg').dataset.ok = off ? '1' : '';
    renderShip();
    renderTotals();
  });

  // ---- Input formatting + live card ----
  const num = $('coCardNum');
  num.addEventListener('input', () => {
    const d = num.value.replace(/\D/g, '').slice(0, 16);
    num.value = d.replace(/(.{4})/g, '$1 ').trim();
    const pad = (d + '•'.repeat(16)).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    $('cardNum').textContent = pad;
    $('cardBrand').textContent = brandOf(d);
  });
  $('coCardName').addEventListener('input', (e) => { $('cardName').textContent = e.target.value.toUpperCase() || 'FULL NAME'; });
  $('coExp').addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (d.length > 2) d = `${d.slice(0, 2)}/${d.slice(2)}`;
    e.target.value = d;
    $('cardExp').textContent = d || 'MM/YY';
  });
  $('coCvc').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    $('cardCvc').textContent = e.target.value || '•••';
  });
  $('coCvc').addEventListener('focus', () => $('coCard').classList.add('is-flipped'));
  $('coCvc').addEventListener('blur', () => $('coCard').classList.remove('is-flipped'));

  // ---- Validation ----
  const rules = {
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.'),
    name: (v) => (v.trim().length > 1 ? '' : 'Enter your full name.'),
    address: (v) => (v.trim().length > 4 ? '' : 'Enter your street address.'),
    city: (v) => (v.trim() ? '' : 'Enter your city.'),
    zip: (v) => (v.trim().length >= 3 ? '' : 'Enter your postal code.'),
    'cc-number': (v) => (luhn(v.replace(/\s/g, '')) ? '' : 'Check your card number.'),
    'cc-name': (v) => (v.trim() ? '' : 'Enter the name on the card.'),
    'cc-exp': (v) => {
      const m = /^(\d\d)\/(\d\d)$/.exec(v);
      if (!m || +m[1] < 1 || +m[1] > 12) return 'Use the format MM/YY.';
      const end = new Date(2000 + +m[2], +m[1], 1);
      return end > new Date() ? '' : 'This card has expired.';
    },
    'cc-csc': (v) => (/^\d{3,4}$/.test(v) ? '' : 'Enter the 3 or 4 digit code.'),
  };
  const check = (input) => {
    const err = rules[input.name]?.(input.value) ?? '';
    const field = input.closest('.field');
    field.classList.toggle('has-error', Boolean(err));
    field.querySelector('.field__err').textContent = err;
    input.setAttribute('aria-invalid', String(Boolean(err)));
    return !err;
  };
  form.addEventListener('focusout', (e) => { if (e.target.matches('input') && e.target.value) check(e.target); });
  form.addEventListener('input', (e) => { if (e.target.closest('.field.has-error')) check(e.target); });
  const validStep = () => {
    const bad = [...steps[step].querySelectorAll('input[name]')].filter((i) => !check(i));
    bad[0]?.focus();
    return bad.length === 0;
  };

  // ---- Steps ----
  function show(next, dir = 1) {
    step = next;
    steps.forEach((s, i) => {
      s.hidden = i !== step;
      if (i === step) { s.dataset.dir = dir > 0 ? 'next' : 'prev'; }
    });
    root.querySelectorAll('.co__steps li').forEach((li, i) => {
      li.classList.toggle('is-active', i === step);
      li.classList.toggle('is-done', i < step);
    });
    $('coLine').style.transform = `scaleX(${step / (steps.length - 1)})`;
    $('coBack').hidden = step === 0;
    if (step === 1) renderShip();
    renderTotals();
    steps[step].querySelector('input, button')?.focus({ preventScroll: true });
  }
  $('coBack').addEventListener('click', () => step > 0 && show(step - 1, -1));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validStep()) {
      $('coNext').classList.remove('is-shake');
      void $('coNext').offsetWidth; // restart the animation
      $('coNext').classList.add('is-shake');
      return;
    }
    if (step < steps.length - 1) show(step + 1);
    else placeOrder();
  });

  // ---- Place order ----
  function placeOrder() {
    const t = totals();
    form.hidden = true;
    $('coBusy').hidden = false;
    root.classList.add('is-busy');
    setTimeout(() => {
      $('coBusy').hidden = true;
      const name = $('coName').value.trim().split(' ')[0];
      const eta = SHOP.shipping.find((o) => o.id === shipId).days;
      $('coDoneMsg').textContent = `Thanks ${name}. We sent a receipt to ${$('coEmail').value.trim()}. Your ${money2(t.total)} order arrives in ${eta}.`;
      $('coOrderNo').textContent = `Order DRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      $('coDone').hidden = false;
      root.classList.remove('is-busy');
      root.classList.add('is-done');
      confetti();
      ['coCardNum', 'coCardName', 'coExp', 'coCvc'].forEach((id) => { $(id).value = ''; }); // never keep card data
      clearCart();
      $('coFinish').focus();
    }, reduced() ? 300 : 2200);
  }

  function confetti() {
    if (reduced()) return;
    const box = $('coConfetti');
    const colors = ['#ff5d7e', '#ffd36e', '#a6f03c', '#7cf5ff', '#ffa13a', '#d58bff'];
    box.replaceChildren(...Array.from({ length: 48 }, () => {
      const p = document.createElement('i');
      p.style.setProperty('--x', `${(Math.random() - 0.5) * 520}px`);
      p.style.setProperty('--y', `${-120 - Math.random() * 260}px`);
      p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      p.style.setProperty('--d', `${Math.random() * 0.25}s`);
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      return p;
    }));
  }

  // ---- Open / close ----
  function open() {
    opener = document.activeElement;
    form.hidden = false;
    $('coBusy').hidden = true;
    $('coDone').hidden = true;
    root.classList.remove('is-busy', 'is-done');
    $('coDemo').hidden = Boolean(SHOP.checkoutUrl);
    renderItems();
    show(0);
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    root.inert = false;
    document.documentElement.style.overflow = 'hidden';
  }
  function close() {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.inert = true;
    document.documentElement.style.overflow = '';
    opener?.focus?.({ preventScroll: true });
  }
  $('coClose').addEventListener('click', close);
  $('coFinish').addEventListener('click', () => { close(); document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' }); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.classList.contains('is-busy')) close();
    if (e.key !== 'Tab') return;
    const items = [...root.querySelectorAll('button, input, select, a[href]')].filter((n) => !n.closest('[hidden]') && !n.disabled);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return { open, close };
}
