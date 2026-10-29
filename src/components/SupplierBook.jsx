import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PackagePlus, Wallet, Trash2, Search, Printer, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { SupplierBookService } from '../api/services';
import { errorMessage } from '../api/client';
import { showConfirmDialog } from '../utils/alert';
import { printElement } from '../utils/pdfGenerator';
import { formatDate, isoDate } from '../utils/date';

/**
 * The supplier book: goods received and money paid, written per supplier with
 * the date, the pieces and the amount, and what is still owed. Kept apart from
 * the shop's cash, purchases and stock, like the loan tracker.
 */
const money = (n) => `৳${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SupplierBook = ({ bn }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // supplier code
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null); // { kind, date, pieces, amount, note, saving }

  const loadSummary = useCallback(async () => {
    try {
      const data = await SupplierBookService.summary();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(errorMessage(err, bn ? 'সাপ্লায়ার খাতা লোড হয়নি' : 'Could not load the supplier book'));
    }
  }, [bn]);

  const loadBook = useCallback(async (code) => {
    setLoading(true);
    try {
      setBook(await SupplierBookService.entries(code));
    } catch (err) {
      toast.error(errorMessage(err, bn ? 'খাতা লোড হয়নি' : 'Could not load the book'));
    } finally {
      setLoading(false);
    }
  }, [bn]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (selected) loadBook(selected); else setBook(null); }, [selected, loadBook]);

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = rows.filter((r) => !t || r.name.toLowerCase().includes(t) || String(r.phone || '').includes(t));
    // Suppliers with something in the book first, the most owed on top.
    return list.sort((a, b) => (b.entries > 0) - (a.entries > 0) || b.balance - a.balance || a.name.localeCompare(b.name));
  }, [rows, search]);

  const owedTotal = rows.reduce((n, r) => n + (r.balance > 0 ? r.balance : 0), 0);

  const openForm = (kind) => setForm({ kind, date: isoDate(new Date()), pieces: '', amount: '', note: '', saving: false });

  const save = async () => {
    const amount = parseFloat(form.amount) || 0;
    const pieces = parseInt(form.pieces, 10) || 0;
    if (form.kind === 'payment' && amount <= 0) {
      toast.error(bn ? 'কত টাকা দিলেন লিখুন' : 'Enter the amount paid');
      return;
    }
    if (form.kind === 'goods' && amount <= 0 && pieces <= 0) {
      toast.error(bn ? 'পিস বা টাকার পরিমাণ লিখুন' : 'Enter the pieces or the amount');
      return;
    }
    setForm({ ...form, saving: true });
    try {
      await SupplierBookService.add({ supplier: selected, kind: form.kind, date: form.date, pieces, amount, note: form.note });
      setForm(null);
      toast.success(bn ? 'খাতায় লেখা হয়েছে' : 'Written in the book');
      await Promise.all([loadBook(selected), loadSummary()]);
    } catch (err) {
      setForm((f) => (f ? { ...f, saving: false } : f));
      toast.error(errorMessage(err, bn ? 'সেভ হয়নি' : 'Could not save'));
    }
  };

  const remove = async (entry) => {
    const ok = await showConfirmDialog({
      title: bn ? 'এন্ট্রিটা মুছবেন?' : 'Delete this entry?',
      text: `${formatDate(entry.date)} — ${entry.kind === 'goods' ? (bn ? 'মাল আনা' : 'Goods') : (bn ? 'টাকা দেওয়া' : 'Paid')} ${money(entry.amount)}`,
      confirmButtonText: bn ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: bn ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (!ok) return;
    try {
      await SupplierBookService.remove(entry.id);
      await Promise.all([loadBook(selected), loadSummary()]);
    } catch (err) {
      toast.error(errorMessage(err, bn ? 'মোছা যায়নি' : 'Could not delete'));
    }
  };

  const current = rows.find((r) => r.id === selected);

  return (
    <div className="sbook">
      <p className="text-muted text-sm" style={{ margin: '0 0 0.75rem' }}>
        {bn
          ? 'এই খাতা দোকানের ক্যাশ, ক্রয় বা স্টকের হিসাবের সাথে যুক্ত নয় — শুধু কোন সাপ্লায়ার থেকে কবে কত পিস মাল কত টাকার আনলেন আর কত টাকা দিলেন, তার আলাদা হিসাব।'
          : "This book is not part of the shop's cash, purchases or stock — only a separate account of goods received and money paid per supplier."}
      </p>
      <div className="sbook-layout">
        <div className="sbook-list">
          <div className="sbook-search">
            <Search size={15} className="text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={bn ? 'সাপ্লায়ার খুঁজুন' : 'Find a supplier'} />
          </div>
          <div className="sbook-owed">{bn ? 'মোট বাকি (সব সাপ্লায়ার)' : 'Owed to all suppliers'}: <b>{money(owedTotal)}</b></div>
          <div className="sbook-items">
            {shown.map((r) => (
              <button type="button" key={r.id} className={`sbook-item ${selected === r.id ? 'is-on' : ''}`} onClick={() => setSelected(r.id)}>
                <span className="sbook-name">{r.name}<small>{r.phone || r.company || r.id}</small></span>
                <span className={`sbook-bal ${r.balance > 0 ? 'is-owed' : ''}`}>
                  {r.entries ? money(r.balance) : <small>{bn ? 'খালি' : 'empty'}</small>}
                </span>
              </button>
            ))}
            {shown.length === 0 && <div className="text-muted text-sm" style={{ padding: '1rem' }}>{bn ? 'কোনো সাপ্লায়ার নেই' : 'No suppliers'}</div>}
          </div>
        </div>

        <div className="sbook-detail">
          {!selected ? (
            <div className="sbook-empty">{bn ? 'বাঁ দিক থেকে একজন সাপ্লায়ার বাছুন' : 'Pick a supplier on the left'}</div>
          ) : (
            <>
              <div className="sbook-head">
                <div>
                  <h3 style={{ margin: 0 }}>{current?.name || book?.supplier?.name}</h3>
                  <div className="text-muted text-sm">{current?.phone || ''}</div>
                </div>
                <div className="sbook-actions">
                  <button type="button" className="btn-primary flex-align-gap" onClick={() => openForm('goods')}>
                    <PackagePlus size={15} /> {bn ? 'মাল আনলাম' : 'Goods received'}
                  </button>
                  <button type="button" className="btn-outline flex-align-gap" onClick={() => openForm('payment')}>
                    <Wallet size={15} /> {bn ? 'টাকা দিলাম' : 'Paid'}
                  </button>
                  <button type="button" className="btn-outline flex-align-gap" onClick={() => printElement('printable-supplier-book', `Supplier-Book-${current?.name || ''}`)} disabled={!book?.entries?.length}>
                    <Printer size={15} />
                  </button>
                </div>
              </div>

              {book?.totals && (
                <div className="sbook-totals">
                  <div><span>{bn ? 'মোট পিস' : 'Pieces'}</span><b>{book.totals.pieces}</b></div>
                  <div><span>{bn ? 'মোট মাল' : 'Goods'}</span><b>{money(book.totals.goods)}</b></div>
                  <div><span>{bn ? 'মোট দেওয়া' : 'Paid'}</span><b className="text-success">{money(book.totals.paid)}</b></div>
                  <div><span>{bn ? 'বাকি' : 'Owed'}</span><b className={book.totals.balance > 0 ? 'text-danger' : ''}>{money(book.totals.balance)}</b></div>
                </div>
              )}

              {form && (
                <div className={`sbook-form ${form.kind === 'goods' ? 'is-goods' : 'is-pay'}`}>
                  <div className="sbook-form-head">
                    <b>{form.kind === 'goods' ? (bn ? 'মাল আনলাম' : 'Goods received') : (bn ? 'টাকা দিলাম' : 'Money paid')}</b>
                    <button type="button" className="btn-icon" onClick={() => setForm(null)} disabled={form.saving}><X size={16} /></button>
                  </div>
                  <div className="sbook-form-row">
                    <label>{bn ? 'তারিখ' : 'Date'}<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                    {form.kind === 'goods' && (
                      <label>{bn ? 'কত পিস' : 'Pieces'}<input type="number" min="0" value={form.pieces} placeholder="0" onChange={(e) => setForm({ ...form, pieces: e.target.value })} /></label>
                    )}
                    <label>{form.kind === 'goods' ? (bn ? 'কত টাকার মাল' : 'Value (৳)') : (bn ? 'কত টাকা দিলাম' : 'Amount (৳)')}
                      <input type="number" min="0" value={form.amount} placeholder="0" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </label>
                    <label className="grow">{bn ? 'নোট' : 'Note'}<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={bn ? 'যেমন: শার্ট, চালান নং' : 'e.g. shirts, bill no'} /></label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn-primary" onClick={save} disabled={form.saving}>{form.saving ? '…' : (bn ? 'খাতায় লিখুন' : 'Save')}</button>
                    <button type="button" className="btn-outline" onClick={() => setForm(null)} disabled={form.saving}>{bn ? 'বাতিল' : 'Cancel'}</button>
                  </div>
                </div>
              )}

              <div className="table-responsive" style={{ opacity: loading ? 0.6 : 1 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th>
                      <th>{bn ? 'বিবরণ' : 'Entry'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'পিস' : 'Pieces'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'মাল আনা' : 'Goods'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'টাকা দেওয়া' : 'Paid'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'বাকি' : 'Owed'}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(book?.entries || []).slice().reverse().map((e) => (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(e.date)}</td>
                        <td>
                          <span className={`sbook-kind ${e.kind === 'goods' ? 'is-goods' : 'is-pay'}`}>
                            {e.kind === 'goods' ? (bn ? 'মাল আনা' : 'Goods') : (bn ? 'টাকা দেওয়া' : 'Paid')}
                          </span>
                          {e.note && <div className="text-muted text-sm">{e.note}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>{e.kind === 'goods' && e.pieces ? e.pieces : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{e.kind === 'goods' ? money(e.amount) : '—'}</td>
                        <td style={{ textAlign: 'right' }} className="text-success">{e.kind === 'payment' ? money(e.amount) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(e.balance)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn-icon text-danger" title={bn ? 'মুছুন' : 'Delete'} onClick={() => remove(e)}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                    {book && !book.entries?.length && (
                      <tr><td colSpan={7} className="text-center text-muted" style={{ padding: '1.5rem' }}>
                        {bn ? 'এখনো কিছু লেখা হয়নি — "মাল আনলাম" বা "টাকা দিলাম" চাপুন' : 'Nothing written yet — press "Goods received" or "Paid"'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* For paper: oldest first, with the running balance. */}
              <div style={{ display: 'none' }}>
                <div id="printable-supplier-book" style={{ padding: '1.5rem', color: '#000', background: '#fff' }}>
                  <h2 style={{ textAlign: 'center', margin: 0 }}>{bn ? 'সাপ্লায়ার খাতা' : 'Supplier Book'} — {current?.name}</h2>
                  <p style={{ textAlign: 'center', margin: '0.25rem 0 1rem' }}>{current?.phone || ''}</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>{['তারিখ', 'বিবরণ', 'পিস', 'মাল আনা', 'টাকা দেওয়া', 'বাকি'].map((h) => <th key={h} style={{ border: '1px solid #999', padding: '4px' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {(book?.entries || []).map((e) => (
                        <tr key={e.id}>
                          <td style={{ border: '1px solid #ccc', padding: '4px' }}>{formatDate(e.date)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px' }}>{e.kind === 'goods' ? 'মাল আনা' : 'টাকা দেওয়া'}{e.note ? ` — ${e.note}` : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>{e.kind === 'goods' ? e.pieces : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>{e.kind === 'goods' ? money(e.amount) : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>{e.kind === 'payment' ? money(e.amount) : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>{money(e.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {book?.totals && (
                    <p style={{ marginTop: '0.75rem', fontWeight: 700 }}>
                      মোট পিস {book.totals.pieces} · মোট মাল {money(book.totals.goods)} · মোট দেওয়া {money(book.totals.paid)} · বাকি {money(book.totals.balance)}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupplierBook;
