import React, { useState } from 'react';
import { Plus, X, Wand2 } from 'lucide-react';

/**
 * Sizes, each with its own pieces: XL 4, L 10, M 3.
 *
 * Rows can be typed one by one, added from the common-size chips, or pasted in
 * one go as "XL4, L10, M3" -- the way the shop already writes it on paper.
 */

const SIZE_CHIPS = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const NUMBER_CHIPS = ['28', '30', '32', '34', '36', '38', '40'];

// "XL4", "XL:4", "XL-4", "XL = 4", "XL 4"
const PAIR = /^\s*(.*?[^\d\s:=-])\s*[:=-]?\s*(\d+)\s*$/;

/** Garment sizes read in capitals ("xl" -> "XL"); anything else is left as typed. */
const tidySize = (name) => {
  const t = String(name || '').trim();
  return /^(\d*x*[sml]|x+l|\d*xl)$/i.test(t) ? t.toUpperCase() : t;
};

/** "XL4, L10" -> [{name:'XL', stock:4}, {name:'L', stock:10}], or null if any piece is unreadable. */
export const parseVariantText = (text) => {
  const pieces = String(text || '').split(/[,\n;]+/).map((p) => p.trim()).filter(Boolean);
  if (!pieces.length) return null;
  const rows = [];
  for (const piece of pieces) {
    const m = piece.match(PAIR);
    if (!m) return null;
    rows.push({ name: tidySize(m[1]), stock: String(parseInt(m[2], 10)) });
  }
  return rows;
};

/** True when a plain variant box holds a size list with pieces, e.g. "XL4, L10". */
export const looksLikeVariantList = (text) => {
  const rows = parseVariantText(text);
  return Boolean(rows && rows.length >= 1 && /\d/.test(text) && /[a-z]/i.test(text));
};

const VariantStockEditor = ({ rows, onChange, bn, unit = 'Pcs' }) => {
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');

  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const addRow = (name = '') => {
    if (name && rows.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) return;
    onChange([...rows.filter((r) => r.name.trim() || r.stock), { name, stock: '' }]);
  };

  const applyPaste = () => {
    const parsed = parseVariantText(paste);
    if (!parsed) {
      setPasteError(bn ? 'প্রতিটা সাইজের সাথে পিস লিখুন, যেমন: XL4, L10' : 'Write each size with its pieces, e.g. XL4, L10');
      return;
    }
    // Merge: a size already in the list takes the pasted count.
    const merged = [...rows.filter((r) => r.name.trim())];
    parsed.forEach((p) => {
      const at = merged.findIndex((r) => r.name.trim().toLowerCase() === p.name.toLowerCase());
      if (at >= 0) merged[at] = { ...merged[at], stock: p.stock };
      else merged.push(p);
    });
    onChange(merged);
    setPaste('');
    setPasteError('');
  };

  const total = rows.reduce((sum, r) => sum + (parseInt(r.stock, 10) || 0), 0);
  const names = rows.map((r) => r.name.trim().toLowerCase());
  const dup = names.find((n, i) => n && names.indexOf(n) !== i);

  return (
    <div className="vse">
      <div className="vse-paste">
        <input
          value={paste}
          onChange={(e) => { setPaste(e.target.value); setPasteError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPaste(); } }}
          placeholder={bn ? 'এক লাইনে লিখুন: XL4, L10, M3' : 'Type in one line: XL4, L10, M3'}
        />
        <button type="button" className="btn-outline" onClick={applyPaste} disabled={!paste.trim()}>
          <Wand2 size={14} /> {bn ? 'বসাও' : 'Fill'}
        </button>
      </div>
      {pasteError && <div className="vse-error">{pasteError}</div>}

      <div className="vse-chips">
        {[...SIZE_CHIPS, ...NUMBER_CHIPS].map((size) => (
          <button type="button" key={size} className="vse-chip" onClick={() => addRow(size)}
            disabled={names.includes(size.toLowerCase())}>+ {size}</button>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="vse-rows">
          <div className="vse-head">
            <span>{bn ? 'সাইজ / ভেরিয়েন্ট' : 'Size / variant'}</span>
            <span>{bn ? 'পিস' : 'Pieces'}</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div className="vse-row" key={i}>
              <input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="XL" />
              <input type="number" min="0" value={row.stock} onChange={(e) => update(i, { stock: e.target.value })} placeholder="0" />
              <button type="button" className="btn-icon" onClick={() => remove(i)} title={bn ? 'বাদ দিন' : 'Remove'}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="vse-foot">
        <button type="button" className="vse-add" onClick={() => addRow('')}><Plus size={14} /> {bn ? 'আরেকটা সাইজ' : 'Add a size'}</button>
        <span className="vse-total">
          {rows.filter((r) => r.name.trim()).length} {bn ? 'টি সাইজ' : 'sizes'} · {bn ? 'মোট' : 'total'} <strong>{total}</strong> {unit}
        </span>
      </div>
      {dup && <div className="vse-error">{bn ? `"${dup}" দুবার লেখা হয়েছে` : `"${dup}" is listed twice`}</div>}
      <div className="vse-note">
        {bn
          ? 'প্রতিটা সাইজ আলাদা বারকোড আর আলাদা স্টক নিয়ে সেভ হবে। আগে থেকে থাকা সাইজে স্টক যোগ হবে।'
          : 'Each size is saved with its own barcode and stock. A size that already exists gets these pieces added.'}
      </div>
    </div>
  );
};

export default VariantStockEditor;
