import React, { useState } from 'react';
import { Plus, X, Wand2, Settings2, RotateCcw } from 'lucide-react';
import useStore from '../store/useStore';
import { sortSizes } from '../utils/sizes';

/**
 * Sizes, each with its own pieces: XL 4, L 10, M 3.
 *
 * Rows can be typed one by one, added from the common-size chips, or pasted in
 * one go as "XL4, L10, M3" -- the way the shop already writes it on paper.
 */

const SIZE_CHIPS = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const NUMBER_CHIPS = ['28', '30', '32', '34', '36', '38', '40'];
export const DEFAULT_SIZE_PRESETS = [...SIZE_CHIPS, ...NUMBER_CHIPS];

// "XL4", "XL:4", "XL-4", "XL = 4", "XL 4"
const PAIR = /^\s*(.*?[^\d\s:=-])\s*[:=-]?\s*(\d+)\s*$/;
// A number size needs a separator before its pieces: "44:5", "44 5", "44-5"
const NUM_PAIR = /^\s*(\d+)\s*[:=\s-]\s*(\d+)\s*$/;

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
    const m = piece.match(NUM_PAIR) || piece.match(PAIR);
    if (!m) return null;
    rows.push({ name: tidySize(m[1]), stock: String(parseInt(m[2], 10)) });
  }
  return rows;
};

/** Like parseVariantText, but a size typed without pieces ("44", "Free Size")
 *  still becomes a row, with the pieces left to fill in. */
const parseLenient = (text) => {
  const pieces = String(text || '').split(/[,\n;]+/).map((p) => p.trim()).filter(Boolean);
  if (!pieces.length) return null;
  return pieces.map((piece) => {
    const m = piece.match(NUM_PAIR) || piece.match(PAIR);
    return m ? { name: tidySize(m[1]), stock: String(parseInt(m[2], 10)) } : { name: tidySize(piece), stock: '' };
  });
};

/** True when a plain variant box holds a size list with pieces, e.g. "XL4, L10". */
export const looksLikeVariantList = (text) => {
  const rows = parseVariantText(text);
  return Boolean(rows && rows.length >= 1 && /\d/.test(text) && /[a-z]/i.test(text));
};

const VariantStockEditor = ({ rows, onChange, bn, unit = 'Pcs' }) => {
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');
  // The quick size buttons are the shop's own list, kept on the server.
  const savedPresets = useStore((s) => s.shopProfile?.size_presets);
  const saveSizePresets = useStore((s) => s.saveSizePresets);
  // Always in shop order, so a new 29 lands between 28 and 30.
  const presets = sortSizes(Array.isArray(savedPresets) ? savedPresets : DEFAULT_SIZE_PRESETS);
  const [managing, setManaging] = useState(false);
  const [newPreset, setNewPreset] = useState('');
  const addPresets = () => {
    const extra = newPreset.split(/[,\n;]+/).map((x) => tidySize(x)).filter(Boolean)
      .filter((x) => !presets.some((p) => p.toLowerCase() === x.toLowerCase()));
    if (extra.length) saveSizePresets(sortSizes([...presets, ...extra]));
    setNewPreset('');
  };
  const removePreset = (size) => saveSizePresets(presets.filter((p) => p !== size));

  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const addRow = (name = '') => {
    if (name && rows.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) return;
    onChange([...rows.filter((r) => r.name.trim() || r.stock), { name, stock: '' }]);
  };

  const applyPaste = () => {
    const parsed = parseLenient(paste);
    if (!parsed) {
      setPasteError(bn ? 'সাইজ লিখুন, যেমন: XL4, L10 বা 44:5' : 'Type sizes, e.g. XL4, L10 or 44:5');
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
        {presets.map((size) => (managing ? (
          <span key={size} className="vse-chip vse-chip-edit">
            {size}
            <button type="button" onClick={() => removePreset(size)} title={bn ? 'লিস্ট থেকে বাদ দিন' : 'Remove from the list'}>
              <X size={11} />
            </button>
          </span>
        ) : (
          <button type="button" key={size} className="vse-chip" onClick={() => addRow(size)}
            disabled={names.includes(size.toLowerCase())}>+ {size}</button>
        )))}
        <button
          type="button"
          className={`vse-chip vse-chip-manage ${managing ? 'is-on' : ''}`}
          onClick={() => { setManaging((v) => !v); setNewPreset(''); }}
          title={bn ? 'সাইজের লিস্ট সাজান' : 'Edit the size list'}
        >
          <Settings2 size={12} /> {managing ? (bn ? 'হয়ে গেছে' : 'Done') : (bn ? 'সাইজ ম্যানেজ' : 'Manage sizes')}
        </button>
      </div>
      {managing && (
        <div className="vse-manage">
          <input
            value={newPreset}
            onChange={(e) => setNewPreset(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPresets(); } }}
            placeholder={bn ? 'নতুন সাইজ: 42, 44, Free Size' : 'New sizes: 42, 44, Free Size'}
          />
          <button type="button" className="btn-outline" onClick={addPresets} disabled={!newPreset.trim()}>
            <Plus size={14} /> {bn ? 'লিস্টে যোগ' : 'Add to list'}
          </button>
          {Array.isArray(savedPresets) && (
            <button type="button" className="btn-outline" onClick={() => saveSizePresets(null)} title={bn ? 'আগের লিস্টে ফিরুন' : 'Back to the built-in list'}>
              <RotateCcw size={14} />
            </button>
          )}
          <div className="vse-manage-note">
            {bn
              ? 'এই লিস্ট পুরো দোকানের জন্য সেভ থাকে — সবাই একই সাইজ বাটন দেখবে। × চাপলে লিস্ট থেকে বাদ যাবে (পণ্য বা স্টক কিছু বদলাবে না)।'
              : 'This list is saved for the whole shop. × removes a button only — no product or stock changes.'}
          </div>
        </div>
      )}

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
