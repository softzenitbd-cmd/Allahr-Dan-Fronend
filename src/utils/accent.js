/**
 * Turning one picked colour into a usable accent.
 *
 * The Settings palette lets the shop choose any colour it likes, but an accent
 * is not one colour -- it is a hover shade, a soft wash behind selected items,
 * and a foreground that stays readable on top of it. Deriving all of those
 * from the single pick is what keeps a freely chosen colour from breaking the
 * interface: a bright yellow needs dark text on it, a deep navy needs white,
 * and on a dark screen a dark accent has to be lifted or it vanishes into the
 * surface it sits on.
 */

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** '#rgb' or '#rrggbb' to {r,g,b}, or null if it is not a colour. */
export const hexToRgb = (hex) => {
  if (typeof hex !== 'string') return null;
  let value = hex.trim().replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

export const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

export const isValidHex = (hex) => hexToRgb(hex) !== null;

/** Perceived brightness, 0 (black) to 1 (white). */
export const luminance = (rgb) => (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

const mix = (rgb, target, amount) => ({
  r: rgb.r + (target - rgb.r) * amount,
  g: rgb.g + (target - rgb.g) * amount,
  b: rgb.b + (target - rgb.b) * amount,
});

export const darken = (hex, amount) => {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(mix(rgb, 0, amount)) : hex;
};

export const lighten = (hex, amount) => {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(mix(rgb, 255, amount)) : hex;
};

/**
 * The whole accent set for one picked colour.
 *
 * `isDark` is the screen, not the colour: on a dark interface a colour that is
 * already dark is lifted so it can still be seen, and on a light interface a
 * very pale colour is deepened so a button drawn in it is not white on white.
 */
export const buildAccent = (hex, isDark = false) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let base = hex;
  const light = luminance(rgb);

  if (isDark && light < 0.35) base = lighten(base, 0.35 - light);
  if (!isDark && light > 0.78) base = darken(base, light - 0.6);

  const baseRgb = hexToRgb(base);
  const baseLight = luminance(baseRgb);

  return {
    '--primary': base,
    '--primary-rgb': `${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}`,
    // Hover goes the way that stays visible: darker on light screens, lighter
    // on dark ones.
    '--primary-hover': isDark ? lighten(base, 0.16) : darken(base, 0.14),
    '--primary-soft': `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, ${isDark ? 0.18 : 0.11})`,
    '--secondary': isDark ? lighten(base, 0.1) : lighten(base, 0.12),
    '--secondary-hover': base,
    // Text drawn on top of a filled accent button. Pure contrast, no taste.
    '--on-primary': baseLight > 0.62 ? '#111926' : '#ffffff',
  };
};

/** Paint the accent onto the document, or clear it back to the named theme. */
export const applyAccent = (hex, isDark = false) => {
  const root = document.body;
  const vars = buildAccent(hex, isDark);
  const keys = [
    '--primary', '--primary-rgb', '--primary-hover', '--primary-soft',
    '--secondary', '--secondary-hover', '--on-primary',
  ];

  if (!vars) {
    keys.forEach((key) => root.style.removeProperty(key));
    return;
  }
  keys.forEach((key) => root.style.setProperty(key, vars[key]));
};

/**
 * A plate of colours worth offering. Chosen to stay readable as an accent on
 * both a white and a near-black interface, and spread far enough apart that
 * two of them never look like the same choice.
 */
export const COLOR_PLATE = [
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Ocean', hex: '#0891b2' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Lime', hex: '#65a30d' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Fuchsia', hex: '#c026d3' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Violet', hex: '#6d28d9' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Navy', hex: '#1e40af' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Brown', hex: '#92400e' },
  { name: 'Charcoal', hex: '#1f2937' },
];

/* ==========================================================================
   Conversions for the colour picker
   --------------------------------------------------------------------------
   A picker needs the colour in three shapes at once: HSV to place the handles,
   RGB/hex to hand back, and HSL/CMYK because those are the numbers people
   compare against a brand sheet.
   ========================================================================== */

/** RGB (0-255) to HSV, with h in degrees and s/v as percentages. */
export const rgbToHsv = ({ r, g, b }) => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
};

/** HSV back to RGB. h in degrees, s and v as percentages. */
export const hsvToRgb = ({ h, s, v }) => {
  const ss = s / 100, vv = v / 100;
  const c = vv * ss;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = vv - c;

  const [r1, g1, b1] =
    hh < 1 ? [c, x, 0] :
    hh < 2 ? [x, c, 0] :
    hh < 3 ? [0, c, x] :
    hh < 4 ? [0, x, c] :
    hh < 5 ? [x, 0, c] : [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

export const rgbToHsl = ({ r, g, b }) => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
};

/** The four print inks, as whole percentages. */
export const rgbToCmyk = ({ r, g, b }) => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - rr - k) / (1 - k)) * 100,
    m: ((1 - gg - k) / (1 - k)) * 100,
    y: ((1 - bb - k) / (1 - k)) * 100,
    k: k * 100,
  };
};

export const hexToHsv = (hex) => {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
};

export const hsvToHex = (hsv) => rgbToHex(hsvToRgb(hsv));
