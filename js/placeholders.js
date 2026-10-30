/**
 * Placeholder artwork generators.
 * ---------------------------------------------------------------------------
 * Each function returns an SVG string drawn from a flavor palette. They are
 * only used when the matching `*Src` in config.js is `null`. Once you drop in
 * your own files, nothing here runs for that asset.
 */

/** Small deterministic RNG so each flavor's condensation looks the same on every load. */
function seededRandom(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

/** Brushed aluminium gradient stops, reused by can rim, lid and tab. */
const METAL_STOPS = `
  <stop offset="0" stop-color="#4b515c"/>
  <stop offset=".14" stop-color="#c9ced6"/>
  <stop offset=".3" stop-color="#ffffff"/>
  <stop offset=".46" stop-color="#aab1bc"/>
  <stop offset=".74" stop-color="#737b89"/>
  <stop offset=".9" stop-color="#c3c8d0"/>
  <stop offset="1" stop-color="#454b55"/>`;

/** Condensation droplets + a couple of drips, scattered with a seeded RNG. */
function droplets(rand, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = 30 + rand() * 140;
    const y = 66 + rand() * 250;
    const r = 1.1 + rand() * 2.6;
    out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(2)}" ry="${(r * 1.3).toFixed(2)}"
      fill="rgba(255,255,255,.26)" stroke="rgba(0,0,0,.14)" stroke-width=".5"/>
      <circle cx="${(x - r * 0.35).toFixed(1)}" cy="${(y - r * 0.45).toFixed(1)}" r="${(r * 0.35).toFixed(2)}" fill="rgba(255,255,255,.9)"/>`;
  }
  // Longer running drips
  for (let i = 0; i < 4; i++) {
    const x = 40 + rand() * 120;
    const y = 90 + rand() * 150;
    const len = 18 + rand() * 30;
    out += `<path d="M${x.toFixed(1)},${y.toFixed(1)} v${len.toFixed(1)}" stroke="rgba(255,255,255,.28)"
      stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="${x.toFixed(1)}" cy="${(y + len).toFixed(1)}" r="2.4" fill="rgba(255,255,255,.4)"/>`;
  }
  return out;
}

/** 4-point sparkle used on the label. */
const sparkle = (x, y, s, fill) =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}"
    d="M0,-10 C1,-3 3,-1 10,0 C3,1 1,3 0,10 C-1,3 -3,1 -10,0 C-3,-1 -1,-3 0,-10 Z"/>`;

/**
 * The can body (without the pull tab, which is a separate layer so it can pop).
 * viewBox 0 0 200 380. `uid` keeps gradient ids unique when several cans are inline.
 */
export function canSVG(flavor, uid) {
  const p = flavor.palette;
  const id = (name) => `${uid}-${name}`;
  const rand = seededRandom(flavor.id);
  const outline =
    'M38,22 C38,32 22,40 22,58 L22,324 C22,342 36,350 40,358 L160,358 C164,350 178,342 178,324 L178,58 C178,40 162,32 162,22 Z';

  return `<svg ${SVG_NS} viewBox="0 0 200 380" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id('metal')}" x1="0" x2="1" y1="0" y2="0">${METAL_STOPS}</linearGradient>
    <linearGradient id="${id('body')}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${p.dark}"/>
      <stop offset=".13" stop-color="${p.primary}"/>
      <stop offset=".3" stop-color="${p.highlight}"/>
      <stop offset=".44" stop-color="${p.primary}"/>
      <stop offset=".78" stop-color="${p.dark}"/>
      <stop offset=".9" stop-color="${p.primary}"/>
      <stop offset="1" stop-color="${p.dark}"/>
    </linearGradient>
    <linearGradient id="${id('gloss')}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".25" stop-color="#fff" stop-opacity=".75"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".45"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id('logo')}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${p.highlight}"/>
    </linearGradient>
    <radialGradient id="${id('lid')}" cx=".5" cy=".35" r=".7">
      <stop offset="0" stop-color="#eef0f3"/>
      <stop offset=".7" stop-color="#9aa1ad"/>
      <stop offset="1" stop-color="#5c636f"/>
    </radialGradient>
    <clipPath id="${id('clip')}"><path d="${outline}"/></clipPath>
  </defs>

  <!-- Aluminium shell (visible at neck + base) -->
  <path d="${outline}" fill="url(#${id('metal')})"/>

  <g clip-path="url(#${id('clip')})">
    <!-- Colored sleeve -->
    <rect x="0" y="60" width="200" height="262" fill="url(#${id('body')})"/>
    <rect x="0" y="60" width="200" height="3" fill="#000" opacity=".25"/>
    <rect x="0" y="319" width="200" height="3" fill="#000" opacity=".25"/>

    <!-- Label art: wave + accent line -->
    <path d="M0,252 C40,232 70,270 110,250 S170,230 200,246 L200,322 L0,322 Z" fill="${p.dark}" opacity=".6"/>
    <path d="M0,240 C40,220 70,258 110,238 S170,218 200,234" stroke="${p.accent}" stroke-width="3" fill="none"/>
    ${sparkle(58, 112, 0.7, p.accent)}
    ${sparkle(150, 214, 0.55, p.accent)}
    ${sparkle(146, 100, 0.35, '#fff')}

    <!-- Flavor name -->
    <text x="100" y="84" text-anchor="middle" fill="#fff" font-family="Manrope, sans-serif"
      font-weight="800" font-size="10.5" letter-spacing="2.4">${flavor.name.toUpperCase()}</text>

    <!-- Vertical brand logo with drop shadow copy -->
    <g transform="translate(100 172) rotate(-90)">
      <text x="3" y="3" text-anchor="middle" dominant-baseline="central" fill="${p.dark}" opacity=".7"
        font-family="Unbounded, sans-serif" font-weight="900" font-size="50"
        textLength="160" lengthAdjust="spacingAndGlyphs">DRINKO</text>
      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="url(#${id('logo')})"
        font-family="Unbounded, sans-serif" font-weight="900" font-size="50"
        textLength="160" lengthAdjust="spacingAndGlyphs">DRINKO</text>
    </g>

    <text x="100" y="304" text-anchor="middle" fill="#fff" opacity=".85" font-family="Manrope, sans-serif"
      font-weight="700" font-size="8" letter-spacing="2">SPARKLING SODA · 330 ML</text>

    <!-- Condensation -->
    ${droplets(rand, 26)}

    <!-- Gloss highlights -->
    <rect x="46" y="24" width="17" height="336" fill="url(#${id('gloss')})" opacity=".85"/>
    <rect x="70" y="24" width="5" height="336" fill="url(#${id('gloss')})" opacity=".35"/>
    <rect x="158" y="24" width="6" height="336" fill="url(#${id('gloss')})" opacity=".25"/>
  </g>

  <!-- Base rim -->
  <ellipse cx="100" cy="356" rx="60" ry="6" fill="url(#${id('metal')})"/>

  <!-- Lid + rim -->
  <ellipse cx="100" cy="22" rx="62" ry="12" fill="url(#${id('metal')})"/>
  <ellipse cx="100" cy="23.5" rx="54" ry="8.6" fill="url(#${id('lid')})"/>
  <ellipse cx="100" cy="28" rx="13" ry="3.6" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
  <ellipse cx="100" cy="22" rx="62" ry="12" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/>
</svg>`;
}

/** Pull tab, drawn separately so it can pop open. viewBox 0 0 60 34. */
export function tabSVG(uid) {
  const id = `${uid}-tab`;
  return `<svg ${SVG_NS} viewBox="0 0 60 34" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="1">${METAL_STOPS}</linearGradient></defs>
  <path fill-rule="evenodd" fill="url(#${id})" stroke="rgba(0,0,0,.35)" stroke-width="1"
    d="M14,1 H46 A13,13 0 0 1 59,14 V20 A13,13 0 0 1 46,33 H14 A13,13 0 0 1 1,20 V14 A13,13 0 0 1 14,1 Z
       M17,11.5 a13,5.5 0 1,0 26,0 a13,5.5 0 1,0 -26,0 Z"/>
  <circle cx="30" cy="25" r="3.4" fill="#7c8492" stroke="rgba(255,255,255,.7)" stroke-width=".8"/>
  <path d="M8,6 Q30,-1 52,6" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/>
</svg>`;
}

/** Crown-shaped liquid splash. viewBox 0 0 300 200, anchored at bottom center. */
export function splashSVG(palette) {
  const arms = [-68, -48, -28, -10, 10, 28, 48, 68];
  const lengths = [90, 130, 160, 175, 170, 150, 125, 85];
  let shapes = '';
  arms.forEach((angle, i) => {
    const len = lengths[i];
    shapes += `<ellipse cx="150" cy="${190 - len / 2}" rx="${9 - Math.abs(angle) / 20}" ry="${len / 2}"
      transform="rotate(${angle} 150 190)" fill="url(#sg)"/>`;
    // Detached droplet at each tip
    const rad = (angle * Math.PI) / 180;
    const tx = 150 + Math.sin(rad) * (len + 14);
    const ty = 190 - Math.cos(rad) * (len + 14);
    shapes += `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${(5 + (i % 3) * 2).toFixed(1)}" fill="${palette.primary}"/>`;
  });
  return `<svg ${SVG_NS} viewBox="0 0 300 200">
  <defs>
    <linearGradient id="sg" x1="0" x2="0" y1="1" y2="0">
      <stop offset="0" stop-color="${palette.dark}"/>
      <stop offset=".45" stop-color="${palette.primary}"/>
      <stop offset="1" stop-color="${palette.highlight}"/>
    </linearGradient>
  </defs>
  ${shapes}
  <ellipse cx="150" cy="188" rx="70" ry="12" fill="url(#sg)"/>
  <ellipse cx="128" cy="184" rx="22" ry="3" fill="#fff" opacity=".45"/>
</svg>`;
}

/** Single teardrop of liquid. viewBox 0 0 20 28. */
export function dropSVG(palette) {
  return `<svg ${SVG_NS} viewBox="0 0 20 28">
  <defs>
    <radialGradient id="dg" cx=".35" cy=".6" r=".7">
      <stop offset="0" stop-color="${palette.highlight}"/>
      <stop offset=".6" stop-color="${palette.primary}"/>
      <stop offset="1" stop-color="${palette.dark}"/>
    </radialGradient>
  </defs>
  <path d="M10,0 C10,0 20,13 20,18 A10,10 0 0 1 0,18 C0,13 10,0 10,0 Z" fill="url(#dg)"/>
  <ellipse cx="6.5" cy="17" rx="2" ry="3.2" fill="#fff" opacity=".7"/>
</svg>`;
}

/** Soap-film style bubble. viewBox 0 0 40 40. */
export function bubbleSVG() {
  return `<svg ${SVG_NS} viewBox="0 0 40 40">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".5" r=".5">
      <stop offset=".6" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".92" stop-color="#fff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".7"/>
    </radialGradient>
  </defs>
  <circle cx="20" cy="20" r="18.5" fill="url(#bg)" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
  <ellipse cx="13" cy="12" rx="5" ry="3" transform="rotate(-35 13 12)" fill="#fff" opacity=".85"/>
  <circle cx="27" cy="29" r="1.6" fill="#fff" opacity=".5"/>
</svg>`;
}

/** Glassy isometric ice cube. viewBox 0 0 100 100. */
export function iceSVG() {
  return `<svg ${SVG_NS} viewBox="0 0 100 100">
  <g stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linejoin="round">
    <path d="M50,8 L92,30 L50,52 L8,30 Z" fill="rgba(235,248,255,.75)"/>
    <path d="M8,30 L50,52 L50,94 L8,72 Z" fill="rgba(160,205,235,.55)"/>
    <path d="M50,52 L92,30 L92,72 L50,94 Z" fill="rgba(120,175,215,.5)"/>
  </g>
  <path d="M22,30 L50,16" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>
  <path d="M14,42 L14,62" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
  <circle cx="68" cy="60" r="3" fill="#fff" opacity=".7"/>
  <circle cx="30" cy="66" r="2" fill="#fff" opacity=".6"/>
</svg>`;
}

/** Citrus wheel shared by the lime and orange generators. */
function citrusSlice(rind, pith, flesh, fleshLight) {
  let segments = '';
  for (let i = 0; i < 9; i++) {
    const a = (i * 360) / 9;
    segments += `<path transform="rotate(${a} 50 50)" fill="url(#cf)"
      d="M50,47 L44,15 Q50,11 56,15 Z" stroke="${pith}" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  return `<svg ${SVG_NS} viewBox="0 0 100 100">
  <defs>
    <radialGradient id="cf" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${fleshLight}"/>
      <stop offset="1" stop-color="${flesh}"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="47" fill="${rind}"/>
  <circle cx="50" cy="50" r="41" fill="${pith}"/>
  <circle cx="50" cy="50" r="38" fill="${flesh}"/>
  ${segments}
  <circle cx="50" cy="50" r="4" fill="${pith}"/>
  <path d="M20,30 A36,36 0 0 1 40,15" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
</svg>`;
}

/** Fruit decorations keyed by `flavor.fruit`. */
const FRUITS = {
  cherry: (p) => `<svg ${SVG_NS} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="ch" cx=".35" cy=".35" r=".7">
        <stop offset="0" stop-color="${p.highlight}"/>
        <stop offset=".45" stop-color="${p.primary}"/>
        <stop offset="1" stop-color="${p.dark}"/>
      </radialGradient>
    </defs>
    <path d="M34,62 Q40,30 60,12 M66,66 Q66,34 60,12" stroke="#4a6b1f" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M60,12 Q78,4 88,16 Q72,24 60,12 Z" fill="#5fae2e"/>
    <circle cx="34" cy="70" r="20" fill="url(#ch)"/>
    <circle cx="66" cy="74" r="20" fill="url(#ch)"/>
    <ellipse cx="27" cy="63" rx="5" ry="3" transform="rotate(-30 27 63)" fill="#fff" opacity=".8"/>
    <ellipse cx="59" cy="67" rx="5" ry="3" transform="rotate(-30 59 67)" fill="#fff" opacity=".8"/>
  </svg>`,
  lime: () => citrusSlice('#3f8f17', '#eaffc9', '#9be22f', '#d7ff8c'),
  orange: () => citrusSlice('#e8590c', '#fff1d6', '#ff8c1a', '#ffd08a'),
};

export function fruitSVG(kind, palette) {
  return (FRUITS[kind] || FRUITS.orange)(palette);
}

/** Turn an SVG string into a URL usable by <img src> or CSS url(). */
export const svgToDataURI = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
