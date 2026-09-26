import React, { useState } from 'react';
import { Plus, X, Settings2, RotateCcw } from 'lucide-react';
import useStore from '../store/useStore';
import { DEFAULT_COLOR_PRESETS, colorSwatch, splitColors } from '../utils/colors';

/**
 * The colours a product comes in. No stock is kept per colour -- it is only
 * picked at the counter so the invoice says which one the customer took.
 *
 * Tap the shop's colour buttons to pick, or type new ones ("Maroon, Sky Blue").
 * The button list itself is the shop's and can be managed here, like sizes.
 */
const ProductColorPicker = ({ value = [], onChange, bn }) => {
  const selected = Array.isArray(value) ? value : splitColors(value);
  const saved = useStore((s) => s.shopProfile?.color_presets);
  const saveColorPresets = useStore((s) => s.saveColorPresets);
  const presets = Array.isArray(saved) ? saved : DEFAULT_COLOR_PRESETS;
  const [typed, setTyped] = useState('');
  const [managing, setManaging] = useState(false);
  const [newPreset, setNewPreset] = useState('');

  const has = (c) => selected.some((x) => x.toLowerCase() === c.toLowerCase());
  const toggle = (c) => onChange(has(c) ? selected.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...selected, c]);
  const addTyped = () => {
    const extra = splitColors(typed).filter((c) => !has(c));
    if (extra.length) onChange([...selected, ...extra]);
    setTyped('');
  };
  const addPresets = () => {
    const extra = splitColors(newPreset).filter((c) => !presets.some((p) => p.toLowerCase() === c.toLowerCase()));
    if (extra.length) saveColorPresets([...presets, ...extra]);
    setNewPreset('');
  };

  // Colours on the product that are not among the buttons still show, so they
  // can be taken off.
  const extras = selected.filter((c) => !presets.some((p) => p.toLowerCase() === c.toLowerCase()));

  return (
    <div className="cpk">
      <div className="cpk-chips">
        {[...presets, ...extras].map((c) => (managing && presets.includes(c) ? (
          <span key={c} className="cpk-chip cpk-chip-edit">
            <i style={{ background: colorSwatch(c) }} />{c}
            <button type="button" onClick={() => saveColorPresets(presets.filter((p) => p !== c))}
              title={bn ? 'লিস্ট থেকে বাদ দিন' : 'Remove from the list'}><X size={11} /></button>
          </span>
        ) : (
          <button type="button" key={c} className={`cpk-chip ${has(c) ? 'is-on' : ''}`} onClick={() => toggle(c)}>
            <i style={{ background: colorSwatch(c) }} />{c}
          </button>
        )))}
        <button type="button" className={`cpk-chip cpk-manage ${managing ? 'is-on' : ''}`}
          onClick={() => { setManaging((v) => !v); setNewPreset(''); }}>
          <Settings2 size={12} /> {managing ? (bn ? 'হয়ে গেছে' : 'Done') : (bn ? 'কালার ম্যানেজ' : 'Manage colours')}
        </button>
      </div>

      {managing ? (
        <div className="cpk-row">
          <input
            value={newPreset}
            onChange={(e) => setNewPreset(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPresets(); } }}
            placeholder={bn ? 'লিস্টে নতুন কালার: Maroon, Sky Blue' : 'New colours for the list: Maroon, Sky Blue'}
          />
          <button type="button" className="btn-outline" onClick={addPresets} disabled={!newPreset.trim()}>
            <Plus size={14} /> {bn ? 'লিস্টে যোগ' : 'Add to list'}
          </button>
          {Array.isArray(saved) && (
            <button type="button" className="btn-outline" onClick={() => saveColorPresets(null)} title={bn ? 'আগের লিস্টে ফিরুন' : 'Back to the built-in list'}>
              <RotateCcw size={14} />
            </button>
          )}
          <div className="cpk-note">
            {bn ? 'এই লিস্ট পুরো দোকানের — সবাই একই কালার বাটন দেখবে।' : 'This list is for the whole shop.'}
          </div>
        </div>
      ) : (
        <div className="cpk-row">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }}
            placeholder={bn ? 'অন্য কালার লিখুন: Maroon, Sky Blue' : 'Type other colours: Maroon, Sky Blue'}
          />
          <button type="button" className="btn-outline" onClick={addTyped} disabled={!typed.trim()}>
            <Plus size={14} /> {bn ? 'যোগ' : 'Add'}
          </button>
        </div>
      )}
      <div className="cpk-note">
        {selected.length
          ? `${bn ? 'বাছাই করা' : 'Picked'}: ${selected.join(', ')}`
          : (bn ? 'কোনো কালার বাছা হয়নি — দরকার না হলে খালি রাখুন।' : 'No colour picked — leave empty if not needed.')}
        {' · '}{bn ? 'কালারের আলাদা স্টক নেই, বিক্রির সময় শুধু বেছে দেওয়া হবে।' : 'No stock per colour; it is only picked at the sale.'}
      </div>
    </div>
  );
};

export default ProductColorPicker;
