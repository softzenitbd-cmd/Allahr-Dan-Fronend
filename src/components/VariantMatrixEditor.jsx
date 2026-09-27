import React, { useState } from 'react';
import { Plus, X, Settings2, Wand2 } from 'lucide-react';
import useStore from '../store/useStore';
import { sortSizes, compareSizes } from '../utils/sizes';
import { DEFAULT_COLOR_PRESETS, colorSwatch, splitColors } from '../utils/colors';
import { DEFAULT_SIZE_PRESETS, parseVariantText } from './VariantStockEditor';

/**
 * A product's stock as a table: sizes down the side, colours across the top,
 * pieces in each cell. Every filled cell is one thing on the shelf, counted
 * and sold on its own, but the whole product shares one barcode.
 *
 * The table works on a plain value object so a form can hold it:
 *   { sizes: [{id, orig, name, removed}], colors: [...same], cells: {"sid|cid": "4"} }
 * `orig` is the name the server knows (null for a new size/colour); `rows`
 * are the product's rows on the server ({code, size, color, stock}).
 */

let seq = 0;
const newId = (p) => `${p}${Date.now().toString(36)}${(seq += 1)}`;
const key = (sid, cid) => `${sid}|${cid}`;
const lc = (s) => String(s || '').trim().toLowerCase();

/** The table for a product's current rows (and colours it lists). */
export const matrixFromRows = (rows = [], listedColors = []) => {
  const sizeNames = sortSizes([...new Set(rows.map((r) => r.size || ''))]);
  const colourNames = [];
  const addColour = (c) => { if (!colourNames.some((x) => lc(x) === lc(c))) colourNames.push(c); };
  if (!rows.length || rows.some((r) => !r.color)) addColour('');
  rows.filter((r) => r.color).map((r) => r.color).sort((a, b) => a.localeCompare(b)).forEach(addColour);
  (listedColors || []).forEach(addColour);
  const sizes = sizeNames.map((n) => ({ id: `s:${n}`, orig: n, name: n }));
  const colors = colourNames.map((n) => ({ id: `c:${n}`, orig: rows.some((r) => lc(r.color) === lc(n)) || n === '' ? n : null, name: n }));
  const cells = {};
  rows.forEach((r) => {
    const s = sizes.find((x) => x.orig === (r.size || ''));
    const c = colors.find((x) => lc(x.orig) === lc(r.color || ''));
    if (s && c) cells[key(s.id, c.id)] = String(Number(r.stock) || 0);
  });
  return { sizes, colors, cells };
};

const active = (list) => list.filter((x) => !x.removed);

/** Names used twice, or problems that stop a save; '' when fine. */
export const matrixProblem = (value, bn) => {
  const dup = (list) => {
    const names = active(list).map((x) => lc(x.name));
    return names.find((n, i) => names.indexOf(n) !== i);
  };
  const ds = dup(value.sizes);
  if (ds !== undefined) return bn ? `সাইজ "${ds || 'সাইজ ছাড়া'}" দুবার আছে` : `Size "${ds || 'No size'}" is listed twice`;
  const dc = dup(value.colors);
  if (dc !== undefined) return bn ? `কালার "${dc || 'কালার ছাড়া'}" দুবার আছে` : `Colour "${dc || 'No colour'}" is listed twice`;
  return '';
};

/** For a product already on the shelf: what the server's set-matrix needs. */
export const matrixToPayload = (value, rows = []) => {
  const renameSizes = {};
  const renameColors = {};
  active(value.sizes).forEach((s) => { if (s.orig !== null && s.name.trim() !== s.orig) renameSizes[s.orig] = s.name.trim(); });
  active(value.colors).forEach((c) => { if (c.orig !== null && c.name.trim() !== c.orig) renameColors[c.orig] = c.name.trim(); });
  const cells = [];
  active(value.sizes).forEach((s) => active(value.colors).forEach((c) => {
    const v = value.cells[key(s.id, c.id)];
    if (v !== undefined && v !== '') cells.push({ size: s.name.trim(), color: c.name.trim(), stock: parseInt(v, 10) || 0 });
  }));
  // Taken off the table: those rows go (the server checks they are empty).
  const gone = new Set();
  value.sizes.filter((s) => s.removed && s.orig !== null).forEach((s) => rows.filter((r) => (r.size || '') === s.orig).forEach((r) => gone.add(r.code)));
  value.colors.filter((c) => c.removed && c.orig !== null).forEach((c) => rows.filter((r) => lc(r.color) === lc(c.orig)).forEach((r) => gone.add(r.code)));
  return {
    cells,
    renameSizes,
    renameColors,
    remove: [...gone],
    colors: active(value.colors).map((c) => c.name.trim()).filter(Boolean),
  };
};

/** For a new product: one row per filled cell. */
export const matrixToVariants = (value) => {
  const out = [];
  active(value.sizes).forEach((s) => active(value.colors).forEach((c) => {
    const v = value.cells[key(s.id, c.id)];
    if (v !== undefined && v !== '') out.push({ name: s.name.trim(), color: c.name.trim(), stock: parseInt(v, 10) || 0 });
  }));
  return out;
};

export const matrixTotal = (value) => active(value.sizes).reduce((sum, s) => sum + active(value.colors)
  .reduce((n, c) => n + (parseInt(value.cells[key(s.id, c.id)], 10) || 0), 0), 0);

/** Quick-add buttons for a shop-wide list, with its own manage mode. */
const PresetRow = ({ label, presets, used, onPick, onSave, bn, swatch }) => {
  const [managing, setManaging] = useState(false);
  const [text, setText] = useState('');
  const add = () => {
    const extra = splitColors(text).filter((x) => !presets.some((p) => lc(p) === lc(x)));
    if (extra.length) onSave([...presets, ...extra]);
    setText('');
  };
  return (
    <div className="vme-presets">
      <span className="vme-presets-label">{label}</span>
      {presets.map((p) => (managing ? (
        <span key={p} className="vme-chip vme-chip-edit">
          {swatch && <i style={{ background: colorSwatch(p) }} />}{p}
          <button type="button" onClick={() => onSave(presets.filter((x) => x !== p))}><X size={10} /></button>
        </span>
      ) : (
        <button type="button" key={p} className="vme-chip" disabled={used.includes(lc(p))} onClick={() => onPick(p)}>
          {swatch && <i style={{ background: colorSwatch(p) }} />}+ {p}
        </button>
      )))}
      <button type="button" className={`vme-chip vme-manage ${managing ? 'is-on' : ''}`} onClick={() => setManaging((v) => !v)}
        title={bn ? 'লিস্ট সাজান' : 'Edit the list'}>
        <Settings2 size={11} /> {managing ? (bn ? 'হয়ে গেছে' : 'Done') : ''}
      </button>
      {managing && (
        <span className="vme-manage-add">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={bn ? 'লিস্টে নতুন' : 'Add to list'}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button type="button" className="btn-outline" onClick={add} disabled={!text.trim()}><Plus size={12} /></button>
        </span>
      )}
    </div>
  );
};

const VariantMatrixEditor = ({ value, onChange, rows = [], bn, unit = 'Pcs' }) => {
  const savedSizes = useStore((s) => s.shopProfile?.size_presets);
  const savedColors = useStore((s) => s.shopProfile?.color_presets);
  const saveSizePresets = useStore((s) => s.saveSizePresets);
  const saveColorPresets = useStore((s) => s.saveColorPresets);
  const sizePresets = sortSizes(Array.isArray(savedSizes) ? savedSizes : DEFAULT_SIZE_PRESETS);
  const colorPresets = Array.isArray(savedColors) ? savedColors : DEFAULT_COLOR_PRESETS;
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');

  const sizes = active(value.sizes);
  const colors = active(value.colors);
  const origStock = (sid, cid) => {
    const s = value.sizes.find((x) => x.id === sid);
    const c = value.colors.find((x) => x.id === cid);
    if (!s || !c || s.orig === null || c.orig === null) return null;
    const r = rows.find((x) => (x.size || '') === s.orig && lc(x.color) === lc(c.orig));
    return r ? Number(r.stock) || 0 : null;
  };

  const set = (patch) => onChange({ ...value, ...patch });
  const setCell = (sid, cid, v) => set({ cells: { ...value.cells, [key(sid, cid)]: v } });
  const addSize = (name) => {
    const n = String(name || '').trim();
    const back = value.sizes.find((x) => x.removed && lc(x.name) === lc(n));
    if (back) { set({ sizes: value.sizes.map((x) => (x === back ? { ...x, removed: false } : x)) }); return; }
    if (sizes.some((x) => lc(x.name) === lc(n))) return;
    const list = [...value.sizes, { id: newId('ns'), orig: null, name: n }];
    // Keep the table in shop order as sizes are added.
    list.sort((a, b) => compareSizes(a.name, b.name));
    set({ sizes: list });
  };
  const addColor = (name) => {
    const n = String(name || '').trim();
    const back = value.colors.find((x) => x.removed && lc(x.name) === lc(n));
    if (back) { set({ colors: value.colors.map((x) => (x === back ? { ...x, removed: false } : x)) }); return; }
    if (colors.some((x) => lc(x.name) === lc(n))) return;
    let list = [...value.colors, { id: newId('nc'), orig: null, name: n }];
    // The first real colour replaces the plain "pieces" column while that is
    // still empty and holds nothing on the shelf.
    const plain = colors.length === 1 && !colors[0].name.trim() ? colors[0] : null;
    if (n && plain && !rows.some((r) => !r.color)
      && sizes.every((s) => !String(value.cells[key(s.id, plain.id)] ?? '').trim())) {
      list = list.filter((x) => x !== plain);
    }
    set({ colors: list });
  };
  const lineTotal = (list, pick) => list.reduce((n, x) => n + (parseInt(value.cells[pick(x)], 10) || 0), 0);
  const canRemoveSize = (s) => colors.every((c) => !(parseInt(value.cells[key(s.id, c.id)], 10) > 0));
  const canRemoveColor = (c) => sizes.every((s) => !(parseInt(value.cells[key(s.id, c.id)], 10) > 0));
  const removeSize = (s) => set({
    sizes: s.orig === null ? value.sizes.filter((x) => x !== s) : value.sizes.map((x) => (x === s ? { ...x, removed: true } : x)),
  });
  const removeColor = (c) => set({
    colors: c.orig === null ? value.colors.filter((x) => x !== c) : value.colors.map((x) => (x === c ? { ...x, removed: true } : x)),
  });
  const rename = (listName, item, name) => set({ [listName]: value[listName].map((x) => (x === item ? { ...x, name } : x)) });

  // "XL4, L10" fills the first colour column, adding sizes as needed.
  const applyPaste = () => {
    const parsed = parseVariantText(paste);
    if (!parsed) { setPasteError(bn ? 'লিখুন যেমন: XL4, L10 বা 44:5' : 'Type e.g. XL4, L10 or 44:5'); return; }
    let next = { ...value, sizes: [...value.sizes], cells: { ...value.cells } };
    let col = active(next.colors)[0];
    if (!col) {
      col = { id: newId('nc'), orig: null, name: '' };
      next.colors = [...next.colors, col];
    }
    parsed.forEach((p) => {
      let s = active(next.sizes).find((x) => lc(x.name) === lc(p.name));
      if (!s) {
        s = { id: newId('ns'), orig: null, name: p.name };
        next.sizes.push(s);
      }
      next.cells[key(s.id, col.id)] = p.stock;
    });
    next.sizes.sort((a, b) => compareSizes(a.name, b.name));
    onChange(next);
    setPaste('');
    setPasteError('');
  };

  const usedSizes = sizes.map((s) => lc(s.name));
  const usedColors = colors.map((c) => lc(c.name));
  const total = matrixTotal(value);

  return (
    <div className="vme">
      <PresetRow label={bn ? 'সাইজ:' : 'Sizes:'} presets={sizePresets} used={usedSizes} onPick={addSize}
        onSave={(list) => saveSizePresets(sortSizes(list))} bn={bn} />
      <PresetRow label={bn ? 'কালার:' : 'Colours:'} presets={colorPresets} used={usedColors} onPick={addColor}
        onSave={saveColorPresets} bn={bn} swatch />
      <div className="vme-add">
        <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder={bn ? 'অন্য সাইজ' : 'Other size'}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); splitColors(newSize).forEach(addSize); setNewSize(''); } }} />
        <button type="button" className="btn-outline" disabled={!newSize.trim()} onClick={() => { splitColors(newSize).forEach(addSize); setNewSize(''); }}>
          <Plus size={13} /> {bn ? 'সাইজ' : 'Size'}
        </button>
        <input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder={bn ? 'অন্য কালার' : 'Other colour'}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); splitColors(newColor).forEach(addColor); setNewColor(''); } }} />
        <button type="button" className="btn-outline" disabled={!newColor.trim()} onClick={() => { splitColors(newColor).forEach(addColor); setNewColor(''); }}>
          <Plus size={13} /> {bn ? 'কালার' : 'Colour'}
        </button>
        {!usedSizes.includes('') && (
          <button type="button" className="vme-chip" onClick={() => addSize('')}>+ {bn ? 'সাইজ ছাড়া' : 'No size'}</button>
        )}
        {!usedColors.includes('') && colors.length > 0 && (
          <button type="button" className="vme-chip" onClick={() => addColor('')}>+ {bn ? 'কালার ছাড়া' : 'No colour'}</button>
        )}
      </div>

      {sizes.length === 0 ? (
        <div className="vme-empty">
          {bn ? 'উপরের বাটন থেকে সাইজ যোগ করুন (সাইজ না থাকলে "+ সাইজ ছাড়া")।' : 'Add sizes from the buttons above ("+ No size" if it has none).'}
        </div>
      ) : (
        <div className="vme-scroll">
          <table className="vme-table">
            <thead>
              <tr>
                <th className="vme-corner">{bn ? 'সাইজ \\ কালার' : 'Size \\ Colour'}</th>
                {colors.map((c) => (
                  <th key={c.id}>
                    <div className="vme-head">
                      {c.name.trim() && <i style={{ background: colorSwatch(c.name) }} />}
                      <input value={c.name} placeholder={colors.length > 1 ? (bn ? 'কালার ছাড়া' : 'No colour') : (bn ? 'পিস' : 'Pieces')}
                        onChange={(e) => rename('colors', c, e.target.value)} />
                      {(colors.length > 1 || c.name.trim()) && (
                        <button type="button" disabled={!canRemoveColor(c)} onClick={() => removeColor(c)}
                          title={canRemoveColor(c) ? (bn ? 'কলাম বাদ দিন' : 'Remove column') : (bn ? 'আগে পিস ০ করুন' : 'Make the pieces 0 first')}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="vme-total-col">{bn ? 'মোট' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.id}>
                  <th>
                    <div className="vme-head">
                      <input value={s.name} placeholder={bn ? 'সাইজ ছাড়া' : 'No size'} onChange={(e) => rename('sizes', s, e.target.value)} />
                      <button type="button" disabled={!canRemoveSize(s)} onClick={() => removeSize(s)}
                        title={canRemoveSize(s) ? (bn ? 'সারি বাদ দিন' : 'Remove row') : (bn ? 'আগে পিস ০ করুন' : 'Make the pieces 0 first')}>
                        <X size={11} />
                      </button>
                    </div>
                  </th>
                  {colors.map((c) => {
                    const v = value.cells[key(s.id, c.id)];
                    const was = origStock(s.id, c.id);
                    const changed = v !== undefined && v !== '' && (was === null ? parseInt(v, 10) > 0 : (parseInt(v, 10) || 0) !== was);
                    return (
                      <td key={c.id} className={changed ? 'is-changed' : undefined}>
                        <input type="number" min="0" value={v ?? ''} placeholder="0"
                          onChange={(e) => setCell(s.id, c.id, e.target.value)} />
                        {changed && was !== null && <div className="vme-was">{bn ? 'আগে' : 'was'} {was}</div>}
                      </td>
                    );
                  })}
                  <td className="vme-total-col">{lineTotal(colors, (c) => key(s.id, c.id))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{bn ? 'মোট' : 'Total'}</th>
                {colors.map((c) => <td key={c.id}>{lineTotal(sizes, (s) => key(s.id, c.id))}</td>)}
                <td className="vme-total-col"><b>{total}</b> {unit}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {colors.length <= 1 && (
        <div className="vme-paste">
          <input value={paste} onChange={(e) => { setPaste(e.target.value); setPasteError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPaste(); } }}
            placeholder={bn ? 'এক লাইনে: XL4, L10, M3' : 'In one line: XL4, L10, M3'} />
          <button type="button" className="btn-outline" onClick={applyPaste} disabled={!paste.trim()}><Wand2 size={13} /> {bn ? 'বসাও' : 'Fill'}</button>
        </div>
      )}
      {pasteError && <div className="vse-error">{pasteError}</div>}
      <div className="vme-note">
        {bn
          ? 'প্রতিটা ঘর আলাদা স্টক — বিক্রি হলে ঠিক ওই সাইজ-কালারের স্টক কমবে। পুরো পণ্যের বারকোড একটাই; POS-এ স্ক্যান করলে সাইজ আর কালার বেছে নেবেন।'
          : 'Each cell is its own stock and sells on its own. The product has one barcode; at the POS you pick the size and colour.'}
      </div>
    </div>
  );
};

export default VariantMatrixEditor;
