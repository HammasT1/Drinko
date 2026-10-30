/**
 * Pinned scroll timelines for the anatomy + pour sections.
 * ---------------------------------------------------------------------------
 * Created at boot (3D experience only) so pin spacing exists before anything
 * measures the page. They only tween plain state objects; the 3D stages,
 * built later in idle time, read those objects every frame.
 */
const { gsap } = window;

const pinned = (section, screens) => ({
  trigger: section,
  start: 'top top',
  end: () => `+=${window.innerHeight * screens}`,
  pin: true,
  scrub: 1,
  invalidateOnRefresh: true,
});

/** Take the can apart: tab + lid, base, sleeve, then the wall opens on the liquid. */
export function initAnatomyScroll({ section, state }) {
  gsap.timeline({ defaults: { ease: 'power2.inOut' }, scrollTrigger: pinned(section, 2.6) })
    .to(state, { tab: 1, lid: 1, duration: 1 }, 0)
    .to(state, { base: 1, duration: 0.8 }, 0.75)
    .to(state, { sleeve: 1, duration: 1 }, 1.5)
    .to(state, { wall: 1, duration: 1 }, 2.4)
    .to(state, { spin: 1, duration: 3.4, ease: 'none' }, 0)
    .to({}, { duration: 0.6 }); // hold the fully exploded view
}

/** Can slides in, tips, fills the glass, rights itself, foam rises, can leaves. */
export function initPourScroll({ section, state, lines }) {
  const tl = gsap.timeline({ scrollTrigger: pinned(section, 3.2) })
    .to(state, { enter: 1, duration: 0.5, ease: 'power2.out' }, 0)
    .to(state, { tilt: 1, duration: 0.45, ease: 'power2.inOut' }, 0.45)
    .to(state, { fill: 1, duration: 2.6, ease: 'none' }, 0.85)
    .to(state, { tilt: 0, duration: 0.45, ease: 'power2.inOut' }, 3.45)
    .to(state, { foam: 1, duration: 0.9, ease: 'power2.out' }, 3.4)
    .to(state, { exit: 1, duration: 0.5, ease: 'power2.in' }, 3.9)
    .to({}, { duration: 0.4 });

  // Copy lines take turns as the pour progresses (the last one stays)
  lines.forEach((line, i) => {
    const at = [0, 1.2, 3.4][i] ?? i;
    tl.fromTo(line, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.3, immediateRender: i > 0 }, at);
    if (i < lines.length - 1) tl.to(line, { autoAlpha: 0, y: -24, duration: 0.25 }, [1.05, 3.25][i]);
  });
}
