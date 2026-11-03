/**
 * Header + footer behavior: scroll progress, hide-on-scroll nav, active link,
 * mobile menu, and the newsletter form (front-end only until wired to a service).
 */
export function initChrome() {
  const nav = document.getElementById('nav');
  const bar = document.getElementById('progress');
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('navMenu');
  const links = [...document.querySelectorAll('.nav__links a')];
  const targets = links.map((a) => document.querySelector(a.getAttribute('href')));
  let last = 0;

  const toggleMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) nav.classList.remove('is-hidden');
  };
  burger?.addEventListener('click', () => toggleMenu(menu.hidden));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) toggleMenu(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });

  const onScroll = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > last && y > 300 && menu.hidden);
    last = y;
    const mid = y + window.innerHeight * 0.4;
    links.forEach((a, i) => {
      const t = targets[i];
      const r = t && t.closest('.pin-spacer') ? t.closest('.pin-spacer') : t;
      const top = r ? r.getBoundingClientRect().top + y : Infinity;
      const bottom = r ? top + r.offsetHeight : 0;
      a.classList.toggle('is-active', mid >= top && mid < bottom);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const form = document.getElementById('signup');
  const msg = document.getElementById('signupMsg');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('input');
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
    msg.textContent = ok ? 'You are on the list. Stay fizzy.' : 'Please enter a valid email address.';
    if (ok) form.reset();
  });
}
