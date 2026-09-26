/**
 * Sizes in shop order: letter sizes small to large (XS S M L XL XXL 3XL...),
 * then number sizes low to high (28 29 30 ... 44), then anything else
 * (Free Size, colours...) alphabetically. No size label comes first.
 */
const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL'];

export const sizeRank = (value) => {
  const t = String(value || '').trim().toUpperCase();
  if (!t) return [0, 0, ''];
  const i = LETTERS.indexOf(t);
  if (i >= 0) return [1, i, t];
  if (/^\d+(\.\d+)?$/.test(t)) return [2, parseFloat(t), t];
  return [3, 0, t];
};

export const compareSizes = (a, b) => {
  const [ga, na, ta] = sizeRank(a);
  const [gb, nb, tb] = sizeRank(b);
  return ga - gb || na - nb || ta.localeCompare(tb);
};

export const sortSizes = (list) => [...list].sort(compareSizes);
