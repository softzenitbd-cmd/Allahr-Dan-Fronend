/** The colour buttons a shop starts with; it can add and remove its own. */
export const DEFAULT_COLOR_PRESETS = [
  'Black', 'White', 'Red', 'Blue', 'Navy', 'Sky Blue', 'Green', 'Olive', 'Grey',
  'Maroon', 'Brown', 'Cream', 'Yellow', 'Orange', 'Pink', 'Purple', 'Golden', 'Off White',
];

// Names a shop writes that CSS does not know, or knows differently.
const SWATCH = {
  'navy': '#1e3a8a', 'navy blue': '#1e3a8a', 'sky blue': '#38bdf8', 'sky': '#38bdf8',
  'olive': '#6b7a2a', 'maroon': '#7f1d1d', 'cream': '#f5ecd2', 'off white': '#f4f1ea',
  'golden': '#d4a017', 'gold': '#d4a017', 'silver': '#c0c0c0', 'ash': '#b2b2b2',
  'grey': '#6b7280', 'gray': '#6b7280', 'coffee': '#6f4e37', 'mint': '#98ff98',
  'bottle green': '#0b4d2c', 'dark green': '#14532d', 'light blue': '#93c5fd',
  'lemon': '#fff44f', 'peach': '#ffcba4', 'magenta': '#d946ef', 'multi': 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
};

/** A CSS background for a colour name; grey when it is not a colour at all. */
export const colorSwatch = (name) => {
  const key = String(name || '').trim().toLowerCase();
  if (SWATCH[key]) return SWATCH[key];
  try {
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', key.replace(/\s+/g, ''))) {
      return key.replace(/\s+/g, '');
    }
  } catch { /* fall through */ }
  return '#cbd5e1';
};

/** "Red, Blue" <-> ['Red', 'Blue'] */
export const splitColors = (text) => String(text || '').split(/[,;]+/).map((c) => c.trim()).filter(Boolean);
export const joinColors = (list) => (list || []).join(', ');
