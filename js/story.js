/**
 * Smooth scrolling (Lenis) + the cinematic scroll story.
 * ---------------------------------------------------------------------------
 * The story only tweens numbers on hero3d.rig; Hero3D turns them into camera
 * moves every frame. Three scrubbed ScrollTriggers:
 *
 *   1. hero -> story   the can leaves its hero spot and glides to center stage
 *   2. story (pinned)  3 beats: lid close-up, low hero angle, full twirl,
 *                      with fruit + ice flying past the camera
 *   3. story -> cards  the can rises out of frame; rendering then pauses
 */
import { loadScript } from './loadScript.js';

const { gsap, ScrollTrigger } = window;

/** Lenis smooth scroll driven by GSAP's ticker so everything shares one rAF. */
export async function initSmoothScroll(src) {
  await loadScript(src);
  const lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  // GSAP's default lag smoothing is kept on purpose: after a long frame,
  // timelines (like the intro) resume instead of jumping to their end.
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  return lenis;
}

/** Where the can sits during the story (fractions of the viewport). */
function storyStage() {
  const mobile = window.innerWidth < 900;
  return mobile ? { sx: 0.5, sy: 0.38, size: 0.46 } : { sx: 0.66, sy: 0.52, size: 0.66 };
}

export function initStory({ hero3d, hero, story, nextSection }) {
  const { rig } = hero3d;
  const beats = [...story.querySelectorAll('.story__beat')];
  const progressBar = story.querySelector('.story__progress-bar');

  const applyStage = () => Object.assign(rig, storyStage());
  applyStage();
  ScrollTrigger.addEventListener('refreshInit', applyStage);

  // 1. Hero -> story: glide from the hero button to center stage. Only
  // `anchor` is tweened here; Hero3D blends the camera from its hero pose
  // into the story values below by `anchor`, so no two timelines share a property.
  gsap.fromTo(rig, { anchor: 0 }, {
    anchor: 1,
    ease: 'power1.inOut',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });

  // 2. Pinned story
  const segment = 1; // timeline units per beat
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut', duration: segment },
    scrollTrigger: {
      trigger: story,
      start: 'top top',
      end: () => `+=${window.innerHeight * (beats.length + 0.5)}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });

  // Later fromTo's must not render on creation, or their start values would
  // overwrite the earlier beats before the user has scrolled at all.
  const later = { immediateRender: false };

  // Beat 1: tilt down onto the lid, push in
  tl.fromTo(rig, { elev: 0.2, zoom: 1, orbit: 0, spin: -0.5, tilt: 0, lookY: 0 },
    { elev: 0.62, zoom: 0.55, orbit: 0.45, spin: -0.1, lookY: 0.34 }, 0);
  // Beat 2: swing low for a heroic angle while fruit + ice rush past
  tl.fromTo(rig, { elev: 0.62, zoom: 0.55, orbit: 0.45, tilt: 0, lookY: 0.34 },
    { elev: -0.14, zoom: 0.82, orbit: -0.55, tilt: -0.2, lookY: 0, ...later }, segment)
    .fromTo(rig, { flyers: 0, flyerOpacity: 0 }, { flyers: 0.55, flyerOpacity: 1, ease: 'none' }, segment);
  // Beat 3: full twirl back to a clean product shot
  tl.fromTo(rig, { elev: -0.14, zoom: 0.82, orbit: -0.55, tilt: -0.2, spin: -0.1 },
    { elev: 0.1, zoom: 1.02, orbit: 0, tilt: 0, spin: Math.PI * 2, ...later }, segment * 2)
    .fromTo(rig, { flyers: 0.55 }, { flyers: 1, ease: 'none', ...later }, segment * 2)
    .to(rig, { flyerOpacity: 0, duration: segment * 0.4, ease: 'none' }, segment * 2.6);
  // Hold the final shot for half a beat
  tl.to({}, { duration: segment * 0.5 });

  // Beat copy: each fades/slides in, then out (the last one stays).
  beats.forEach((beat, i) => {
    const start = i * segment;
    tl.fromTo(beat, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' }, start + 0.08);
    if (i < beats.length - 1) {
      tl.to(beat, { autoAlpha: 0, y: -40, duration: 0.25, ease: 'power2.in' }, start + segment - 0.2);
    }
  });
  tl.fromTo(progressBar, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: tl.duration() }, 0);

  // 3. Exit: can rises out as the next section arrives; then stop rendering.
  gsap.timeline({
    scrollTrigger: {
      trigger: nextSection,
      start: 'top bottom',
      end: 'top 25%',
      scrub: true,
      onLeave: () => hero3d.setActive(false),
      onEnterBack: () => hero3d.setActive(true),
    },
  }).fromTo(rig, { exit: 0, opacity: 1 }, { exit: 1, opacity: 0, ease: 'power1.in' });
}
