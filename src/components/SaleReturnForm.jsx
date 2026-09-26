import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Search, X, RotateCcw, Receipt, Undo2, Wallet, Loader2 } from 'lucide-react';
import useStore from '../store/useStore';
import { formatDate, isoDate } from '../utils/date';

/**
 * Taking goods back against a sale invoice.
 *
 * Pick the invoice, say how many of each line came back, and the server does
 * the rest in one go: stock goes back on the shelf, whatever the customer
 * still owed on that invoice is written off first, and only what is left is
 * handed back as a refund. The preview here shows exactly that split before
 * anything is saved.
 */

const money = (v) => `৳${(Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const REASONS = [
  { en: 'Size problem', bn: 'সাইজ সমস্যা' },
  { en: 'Defective', bn: 'ত্রুটিপূর্ণ' },
  { en: 'Wrong item', bn: 'ভুল পণ্য' },
  { en: 'Changed mind', bn: 'পছন্দ হয়নি' },
];

const SaleReturnForm = ({ bn, initialInvoice = '', onDone }) => {
  const { sales, fetchSaleReturnLines, processSaleReturn } = useStore();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState(null);     // server view of the invoice
  const [qty, setQty] = useState({});                // productId -> qty to return
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(isoDate());
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);

  // Close the suggestion list on an outside click.
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // An invoice whose goods have all come back has nothing left to return.
    const list = (sales || []).filter((s) => (s.items || []).length > 0 && s.returnStatus !== 'full');
    const hits = q
      ? list.filter((s) => [s.id, s.invoice_number, s.customerName, s.customer_phone]
        .some((v) => String(v || '').toLowerCase().includes(q)))
      : list;
    return [...hits].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  }, [sales, query]);

  const load = async (invoiceId) => {
    if (!invoiceId) return;
    setLoading(true);
    setOpen(false);
    const res = await fetchSaleReturnLines(invoiceId);
    setLoading(false);
    if (!res?.ok) return;
    setInvoice(res.data);
    setQuery(res.data.invoice);
    setQty({});
  };

  // Arriving from an invoice ("Return" on POS History) opens it straight away.
  useEffect(() => { if (initialInvoice) load(initialInvoice); }, [initialInvoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setInvoice(null); setQuery(''); setQty({}); setReason(''); setDate(isoDate());
  };

  const lines = invoice?.lines || [];
  const value = lines.reduce((sum, l) => sum + (Number(qty[l.productId]) || 0) * (l.isGift ? 0 : l.unitPrice), 0);
  const units = Object.values(qty).reduce((a, b) => a + (Number(b) || 0), 0);
  const dueOff = Math.min(value, Number(invoice?.dueRemaining) || 0);
  const refund = Math.max(0, value - dueOff);
  const nothingLeft = lines.length > 0 && lines.every((l) => l.returnable <= 0);

  const setLineQty = (line, next) => {
    const n = Math.max(0, Math.min(line.returnable, parseInt(next, 10) || 0));
    setQty((q) => ({ ...q, [line.productId]: n }));
  };

  const returnAll = () => setQty(Object.fromEntries(lines.map((l) => [l.productId, l.returnable])));

  const submit = async (e) => {
    e.preventDefault();
    if (!invoice) { toast.error(bn ? 'আগে চালান বাছাই করুন' : 'Pick an invoice first'); return; }
    if (units <= 0) { toast.error(bn ? 'কোন পণ্য কয়টা ফেরত আসছে লিখুন' : 'Enter how many of each item came back'); return; }
    if (!reason.trim()) { toast.error(bn ? 'রিটার্নের কারণ লিখুন' : 'Give a reason for the return'); return; }

    setSaving(true);
    const res = await processSaleReturn({
      invoiceId: invoice.invoice,
      items: lines.filter((l) => qty[l.productId] > 0).map((l) => ({ productId: l.productId, quantity: qty[l.productId] })),
      reason: reason.trim(),
      date,
    });
    setSaving(false);
    if (!res?.ok) return;

    const r = res.result || {};
    const parts = [];
    if (r.dueAdjusted > 0) parts.push(bn ? `বকেয়া কমেছে ${money(r.dueAdjusted)}` : `due cut by ${money(r.dueAdjusted)}`);
    if (r.refundAmount > 0) parts.push(bn ? `ক্যাশ থেকে ফেরত ${money(r.refundAmount)}` : `${money(r.refundAmount)} refunded from cash`);
    toast.success(`${bn ? 'রিটার্ন হয়েছে' : 'Return saved'} — ${units} ${bn ? 'পিস স্টকে ফিরেছে' : 'pcs back in stock'}${parts.length ? `; ${parts.join(', ')}` : ''}`);
    reset();
    onDone?.(r);
  };

  return (
    <form onSubmit={submit} className="sr-form">
      {/* 1. which invoice */}
      <div className="sr-step">
        <div className="sr-step-label"><span>1</span>{bn ? 'চালান বাছাই করুন' : 'Pick the invoice'}</div>
        <div className="sr-search" ref={boxRef}>
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); if (invoice) setInvoice(null); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(matches[0]?.id || query.trim()); } }}
            placeholder={bn ? 'চালান নং, কাস্টমারের নাম বা ফোন…' : 'Invoice no, customer name or phone…'}
          />
          {query && <button type="button" className="btn-icon" onClick={reset} title={bn ? 'মুছুন' : 'Clear'}><X size={15} /></button>}
          {open && !invoice && matches.length > 0 && (
            <div className="sr-menu">
              {matches.map((s) => (
                <button type="button" key={s.id} className="sr-menu-row" onClick={() => load(s.id)}>
                  <Receipt size={15} />
                  <span className="sr-menu-main">
                    <strong>{s.id}</strong>
                    <span className="text-muted"> · {s.customerName || 'Walk-in'}{s.customer_phone ? ` · ${s.customer_phone}` : ''}</span>
                  </span>
                  <span className="sr-menu-side">{formatDate(s.date)} · {money(s.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {loading && <div className="text-muted text-sm" style={{ marginTop: '0.5rem' }}><Loader2 size={14} className="animate-spin" /> {bn ? 'চালান আনা হচ্ছে…' : 'Loading invoice…'}</div>}
      </div>

      {invoice && (
        <>
          <div className="sr-invoice">
            <div>
              <div className="sr-inv-no">{invoice.invoice}</div>
              <div className="text-muted text-sm">
                {invoice.customerName}{invoice.customerPhone ? ` · ${invoice.customerPhone}` : ''} · {formatDate(invoice.date)}
                {invoice.salesmanName ? ` · ${bn ? 'বিক্রেতা' : 'by'} ${invoice.salesmanName}` : ''}
              </div>
            </div>
            <div className="sr-inv-figs">
              <span>{bn ? 'মোট' : 'Total'} <strong>{money(invoice.total)}</strong></span>
              <span>{invoice.paymentType}</span>
              {invoice.dueRemaining > 0 && <span className="due">{bn ? 'বাকি' : 'Due'} <strong>{money(invoice.dueRemaining)}</strong></span>}
            </div>
          </div>

          {/* 2. what came back */}
          <div className="sr-step">
            <div className="sr-step-label">
              <span>2</span>{bn ? 'কোন পণ্য কয়টা ফেরত এলো' : 'What came back'}
              {!nothingLeft && <button type="button" className="sr-link" onClick={returnAll}>{bn ? 'সব ফেরত' : 'Return everything'}</button>}
            </div>
            {nothingLeft ? (
              <div className="sr-empty">{bn ? 'এই চালানের সব পণ্য আগেই ফেরত নেওয়া হয়েছে।' : 'Everything on this invoice has already been returned.'}</div>
            ) : (
              <div className="table-responsive">
                <table className="data-table sr-lines">
                  <thead>
                    <tr>
                      <th>{bn ? 'পণ্য' : 'Item'}</th>
                      <th className="num">{bn ? 'বিক্রি' : 'Sold'}</th>
                      <th className="num">{bn ? 'আগে ফেরত' : 'Returned'}</th>
                      <th className="num">{bn ? 'প্রতি পিস' : 'Per pc'}</th>
                      <th className="num" style={{ width: 150 }}>{bn ? 'এখন ফেরত' : 'Return now'}</th>
                      <th className="num">{bn ? 'মূল্য' : 'Value'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const n = Number(qty[l.productId]) || 0;
                      const done = l.returnable <= 0;
                      return (
                        <tr key={l.productId || l.name} className={done ? 'is-done' : n > 0 ? 'is-picked' : ''}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{l.name}{l.variant ? <span className="text-muted"> ({l.variant})</span> : null}</div>
                            {l.isGift && <span className="badge bg-info">{bn ? 'গিফট' : 'Gift'}</span>}
                          </td>
                          <td className="num">{l.sold}</td>
                          <td className="num text-muted">{l.returned || '—'}</td>
                          <td className="num">{l.isGift ? '—' : money(l.unitPrice)}</td>
                          <td className="num">
                            {done ? <span className="text-muted text-sm">{bn ? 'সব ফেরত' : 'all back'}</span> : (
                              <div className="sr-stepper">
                                <button type="button" onClick={() => setLineQty(l, n - 1)} disabled={n <= 0}>−</button>
                                <input type="number" min="0" max={l.returnable} value={n} onChange={(e) => setLineQty(l, e.target.value)} />
                                <button type="button" onClick={() => setLineQty(l, n + 1)} disabled={n >= l.returnable}>+</button>
                                <span className="text-muted text-sm">/ {l.returnable}</span>
                              </div>
                            )}
                          </td>
                          <td className="num" style={{ fontWeight: 700 }}>{n > 0 && !l.isGift ? money(n * l.unitPrice) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. how it is settled */}
          {units > 0 && (
            <div className="sr-step">
              <div className="sr-step-label"><span>3</span>{bn ? 'টাকার হিসাব' : 'How it is settled'}</div>
              <div className="sr-settle">
                <div className="sr-settle-row">
                  <span>{bn ? 'ফেরত পণ্যের মূল্য' : 'Value of goods returned'} <span className="text-muted">({units} {bn ? 'পিস' : 'pcs'})</span></span>
                  <strong>{money(value)}</strong>
                </div>
                {dueOff > 0 && (
                  <div className="sr-settle-row">
                    <span><Undo2 size={14} /> {bn ? 'এই চালানের বাকি থেকে কাটা হবে' : 'Taken off what is still owed on this invoice'}</span>
                    <strong className="text-warning">−{money(dueOff)}</strong>
                  </div>
                )}
                <div className="sr-settle-row total">
                  <span>{refund > 0 ? <><Wallet size={15} /> {bn ? 'কাস্টমারকে টাকা ফেরত' : 'Refund to the customer'}</> : (bn ? 'টাকা ফেরত দিতে হবে না' : 'Nothing to refund')}</span>
                  <strong className={refund > 0 ? 'text-danger' : 'text-success'}>{money(refund)}</strong>
                </div>
                {refund > 0 && (
                  <div className="text-muted text-sm" style={{ paddingBottom: '0.5rem' }}>
                    {bn ? 'দোকানের ক্যাশ থেকে ফেরত দেওয়া হবে।' : 'Paid back from Cash in Hand.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. why, and when */}
          {units > 0 && (
            <div className="sr-step">
              <div className="sr-step-label"><span>4</span>{bn ? 'কারণ' : 'Reason'}</div>
              <div className="sr-reasons">
                {REASONS.map((r) => {
                  const label = bn ? r.bn : r.en;
                  return <button type="button" key={r.en} className={`sr-chip ${reason === label ? 'active' : ''}`} onClick={() => setReason(label)}>{label}</button>;
                })}
              </div>
              <div className="sr-row">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={bn ? 'বা নিজে লিখুন…' : 'or type one…'} required />
                <input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} required style={{ maxWidth: 170 }} />
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary sr-submit" disabled={saving || units <= 0}>
            <RotateCcw size={18} />
            {saving ? (bn ? 'সেভ হচ্ছে…' : 'Saving…')
              : units > 0 ? `${bn ? 'রিটার্ন নিন' : 'Process return'} — ${units} ${bn ? 'পিস' : 'pcs'}, ${money(value)}`
                : (bn ? 'ফেরত পণ্যের সংখ্যা দিন' : 'Choose what came back')}
          </button>
        </>
      )}
    </form>
  );
};

export default SaleReturnForm;
