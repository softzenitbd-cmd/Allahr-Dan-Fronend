import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Truck, UserCheck, Search, Phone, MapPin, Calendar, Printer,
  Wallet, RefreshCcw, X, BookOpen, ChevronDown, ChevronLeft, ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import './Ledger.css';

/**
 * The ledger: one party at a time, in full.
 *
 * Pick a customer, supplier or salesman from the box at the top and their
 * whole account fills the page -- every invoice, every payment, what they
 * still owe -- with a date window over the transactions and a way to settle
 * the balance, invoice by invoice or all at once, without leaving the screen.
 */

const money = (v) => `৳${(Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const day = (v) => (v ? String(v).split('T')[0] : '—');
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const KINDS = [
  { key: 'customer', en: 'Customer', bn: 'কাস্টমার', Icon: Users },
  { key: 'supplier', en: 'Supplier', bn: 'সাপ্লায়ার', Icon: Truck },
  { key: 'salesman', en: 'Salesman / Admin', bn: 'সেলসম্যান / এডমিন', Icon: UserCheck },
];

const METHODS = ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank'];
const PAGE_SIZE = 15;

/** The ranges worth one tap. */
const quickRanges = () => {
  const today = new Date();
  const back = (n) => { const d = new Date(today); d.setDate(today.getDate() - n); return d; };
  return [
    { id: 'all', en: 'All time', bn: 'সব', start: '', end: '' },
    { id: 'today', en: 'Today', bn: 'আজ', start: isoLocal(today), end: isoLocal(today) },
    { id: '7', en: '7 days', bn: '৭ দিন', start: isoLocal(back(6)), end: isoLocal(today) },
    { id: '30', en: '30 days', bn: '৩০ দিন', start: isoLocal(back(29)), end: isoLocal(today) },
    { id: 'month', en: 'This month', bn: 'এই মাস', start: isoLocal(new Date(today.getFullYear(), today.getMonth(), 1)), end: isoLocal(today) },
  ];
};

/** A page of rows, and the controls to move between pages. */
const usePager = (rows, resetKey) => {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey, rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  return {
    slice: rows.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE),
    page: safe, pages, total: rows.length, setPage,
    from: rows.length ? (safe - 1) * PAGE_SIZE + 1 : 0,
    to: Math.min(safe * PAGE_SIZE, rows.length),
  };
};

const Pager = ({ pager, bn }) => pager.total <= PAGE_SIZE ? (
  <div className="ld-pager"><span>{pager.total} {bn ? 'টি' : 'rows'}</span></div>
) : (
  <div className="ld-pager">
    <span>{pager.from}–{pager.to} / {pager.total}</span>
    <div className="ld-pager-btns">
      <button type="button" className="btn-icon" disabled={pager.page <= 1} onClick={() => pager.setPage(pager.page - 1)}><ChevronLeft size={16} /></button>
      <span className="ld-pager-num">{pager.page} / {pager.pages}</span>
      <button type="button" className="btn-icon" disabled={pager.page >= pager.pages} onClick={() => pager.setPage(pager.page + 1)}><ChevronRight size={16} /></button>
    </div>
  </div>
);

const Ledger = () => {
  const {
    customers, suppliers, staff, language, shopProfile,
    fetchPartyLedger, payInvoiceDue, payAll, refresh,
  } = useStore();
  const bn = language === 'bn';

  const [kind, setKind] = useState('customer');
  const [selectedId, setSelectedId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerText, setPickerText] = useState('');
  const pickerRef = useRef(null);

  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('primary');
  const [pay, setPay] = useState(null); // { mode: 'invoice'|'account'|'all', invoice?, amount, date, method, notes }
  const [saving, setSaving] = useState(false);

  useEffect(() => { refresh('customers', 'suppliers', 'staff'); }, [refresh]);

  // Close the picker when clicking anywhere else.
  useEffect(() => {
    const onDown = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const adminOption = useMemo(() => ({
    id: 'Admin',
    staff_code: 'Admin',
    name: 'Admin',
    role: bn ? 'দোকান এডমিন' : 'Shop Admin',
    phone: '',
    due: 0,
  }), [bn]);

  const source = useMemo(() => {
    if (kind === 'customer') return customers || [];
    if (kind === 'supplier') return suppliers || [];
    const list = [...(staff || [])];
    if (!list.some((s) => String(s.id).toLowerCase() === 'admin' || (s.name || '').toLowerCase() === 'admin')) {
      list.unshift(adminOption);
    }
    return list;
  }, [kind, customers, suppliers, staff, adminOption]);

  const selected = useMemo(() => {
    return (source || []).find((p) => p.id === selectedId || p.staff_code === selectedId) || null;
  }, [source, selectedId]);

  const options = useMemo(() => {
    const term = pickerText.trim().toLowerCase();
    return (source || [])
      .filter((p) => !term
        || (p.name || '').toLowerCase().includes(term)
        || (p.phone || '').includes(term)
        || String(p.id || '').toLowerCase().includes(term)
        || String(p.role || '').toLowerCase().includes(term))
      .sort((a, b) => {
        if (kind === 'salesman') {
          if (String(a.id).toLowerCase() === 'admin') return -1;
          if (String(b.id).toLowerCase() === 'admin') return 1;
        }
        return (Number(b.due) || 0) - (Number(a.due) || 0) || (a.name || '').localeCompare(b.name || '');
      })
      .slice(0, 60);
  }, [source, pickerText, kind]);

  const load = useCallback(async () => {
    if (!selectedId) { setData(null); return; }
    setLoading(true);
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await fetchPartyLedger(kind, selectedId, params);
    if (res?.ok) setData(res.data);
    setLoading(false);
  }, [fetchPartyLedger, kind, selectedId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const switchKind = (k) => {
    setKind(k); setSelectedId(''); setData(null); setPickerText(''); setTab('primary'); setPay(null);
  };

  const applyRange = (r) => { setRange(r.id); setStartDate(r.start); setEndDate(r.end); };

  // ---------------------------------------------------------------- //
  // Payments
  // ---------------------------------------------------------------- //
  const partyDue = Number(data?.party?.due) || 0;
  const today = isoLocal(new Date());

  const openPay = (mode, invoice = null) => {
    const amount = mode === 'invoice' ? invoice.due : partyDue;
    setPay({ mode, invoice, amount: String(amount || ''), date: today, method: 'Cash', notes: '' });
  };

  const submitPay = async (e) => {
    e.preventDefault();
    const amount = parseFloat(pay.amount);
    if (!amount || amount <= 0) { toast.error(bn ? 'সঠিক পরিমাণ লিখুন।' : 'Enter a valid amount.'); return; }
    const cap = pay.mode === 'invoice' ? pay.invoice.due : partyDue;
    if (amount > cap + 0.001) { toast.error(bn ? `বকেয়া মাত্র ${money(cap)}` : `Only ${money(cap)} is due.`); return; }

    setSaving(true);
    const opts = { method: pay.method, notes: pay.notes };
    let res;
    if (pay.mode === 'invoice') {
      res = await payInvoiceDue(pay.invoice.id, { amount, date: pay.date, ...opts });
    } else {
      // Full or partial, the money is applied to the party's unpaid documents
      // oldest first, so each invoice / purchase clears along with the total.
      const type = kind === 'customer' ? 'Customer' : kind === 'supplier' ? 'Supplier' : 'Staff';
      res = await payAll(type, data.party.id, { amount, date: pay.date, ...opts });
    }
    setSaving(false);

    if (res?.ok) {
      const n = res.result?.settlements?.length;
      const docWord = kind === 'supplier' ? (bn ? 'ক্রয়ে' : 'purchases') : (bn ? 'চালানে' : 'invoices');
      toast.success(
        n > 1
          ? (bn ? `${money(amount)} — ${n}টি ${docWord} ভাগ হয়ে জমা হয়েছে` : `${money(amount)} recorded across ${n} ${docWord}`)
          : (bn ? `${money(amount)} লেখা হয়েছে` : `${money(amount)} recorded`)
      );
      setPay(null);
      await load();
    }
  };

  const payLabel = kind === 'customer' ? (bn ? 'পেমেন্ট নিন' : 'Receive Payment')
    : kind === 'supplier' ? (bn ? 'সাপ্লায়ারকে পরিশোধ' : 'Pay Supplier')
      : (bn ? 'বকেয়া আদায়' : 'Recover Due');

  // ---------------------------------------------------------------- //
  // Rows for the active tab, paged
  // ---------------------------------------------------------------- //
  const rowsForTab = useMemo(() => {
    if (!data) return [];
    switch (tab) {
      case 'primary': return kind === 'supplier' ? data.purchases : data.invoices;
      case 'payments': return data.payments;
      case 'statement': return data.statement;
      case 'products': return data.products;
      case 'dues': return kind === 'supplier' ? data.duePurchases : data.dueInvoices;
      case 'sr': return data.srSettlements;
      case 'recoveries': return data.recoveries;
      default: return [];
    }
  }, [data, tab, kind]);
  const pager = usePager(rowsForTab, `${selectedId}|${tab}|${startDate}|${endDate}`);

  const isSalesmanAdmin = kind === 'salesman' && (String(selectedId).toLowerCase() === 'admin' || String(data?.party?.id).toLowerCase() === 'admin');

  const tabs = useMemo(() => {
    if (!data) return [];
    if (kind === 'customer') return [
      { key: 'primary', l: bn ? 'চালান' : 'Invoices', n: data.invoices.length },
      { key: 'payments', l: bn ? 'পেমেন্ট' : 'Payments', n: data.payments.length },
      { key: 'statement', l: bn ? 'স্টেটমেন্ট' : 'Statement', n: data.statement.length },
      { key: 'dues', l: bn ? 'বকেয়া চালান' : 'Due Invoices', n: data.dueInvoices.length },
    ];
    if (kind === 'supplier') return [
      { key: 'primary', l: bn ? 'ক্রয়' : 'Purchases', n: data.purchases.length },
      { key: 'payments', l: bn ? 'পেমেন্ট' : 'Payments', n: data.payments.length },
      { key: 'statement', l: bn ? 'স্টেটমেন্ট' : 'Statement', n: data.statement.length },
      { key: 'dues', l: bn ? 'বকেয়া ক্রয়' : 'Due Purchases', n: (data.duePurchases || []).length },
    ];
    const salesmanTabs = [
      { key: 'primary', l: bn ? 'বিক্রয়' : 'Sales', n: data.invoices.length },
      { key: 'products', l: bn ? 'পণ্য' : 'Products', n: data.products.length },
      { key: 'dues', l: bn ? 'বকেয়া বিক্রয়' : 'Due Sales', n: data.dueInvoices.length },
    ];
    if (!isSalesmanAdmin || (data.srSettlements && data.srSettlements.length > 0)) {
      salesmanTabs.push({ key: 'sr', l: bn ? 'এসআর দিন' : 'SR Days', n: (data.srSettlements || []).length });
    }
    if (!isSalesmanAdmin || (data.recoveries && data.recoveries.length > 0)) {
      salesmanTabs.push({ key: 'recoveries', l: bn ? 'আদায়' : 'Recoveries', n: (data.recoveries || []).length });
    }
    return salesmanTabs;
  }, [data, kind, bn, isSalesmanAdmin]);

  // Lifetime tiles, then the same for the window when one is set.
  const tiles = useMemo(() => {
    if (!data) return { life: [], period: [] };
    const t = data.totals, p = data.period || {};
    if (kind === 'customer') return {
      life: [
        { l: bn ? 'চালান' : 'Invoices', v: t.invoices },
        { l: bn ? 'মোট কেনাকাটা' : 'Total Purchased', v: money(t.purchased) },
        { l: bn ? 'মোট পরিশোধ' : 'Total Paid', v: money(t.totalPaid), c: 'good' },
        { l: bn ? 'বকেয়া চালান' : 'Invoices with Due', v: t.dueInvoices, c: t.dueInvoices ? 'bad' : '' },
        { l: bn ? 'শেষ কেনাকাটা' : 'Last Invoice', v: day(t.lastInvoice) },
        { l: bn ? 'শেষ পেমেন্ট' : 'Last Payment', v: day(t.lastPayment) },
      ],
      period: [
        { l: bn ? 'চালান' : 'Invoices', v: p.invoices },
        { l: bn ? 'কেনাকাটা' : 'Purchased', v: money(p.purchased) },
        { l: bn ? 'কাউন্টারে পরিশোধ' : 'Paid at Sale', v: money(p.paidAtSale), c: 'good' },
        { l: bn ? 'বকেয়া আদায়' : 'Due Collected', v: money(p.paidLater), c: 'good' },
        { l: bn ? 'বাকিতে বিক্রি' : 'Due Balance', v: money(p.dueCreated), c: p.dueCreated ? 'bad' : '' },
      ],
    };
    if (kind === 'supplier') return {
      life: [
        { l: bn ? 'ক্রয়' : 'Purchases', v: t.purchases },
        { l: bn ? 'মোট ক্রয়' : 'Total Bought', v: money(t.bought) },
        { l: bn ? 'মোট পরিশোধ' : 'Total Paid', v: money(t.totalPaid), c: 'good' },
        { l: bn ? 'বকেয়া ক্রয়' : 'Purchases with Due', v: t.duePurchases, c: t.duePurchases ? 'bad' : '' },
        { l: bn ? 'শেষ ক্রয়' : 'Last Purchase', v: day(t.lastPurchase) },
        { l: bn ? 'শেষ পেমেন্ট' : 'Last Payment', v: day(t.lastPayment) },
      ],
      period: [
        { l: bn ? 'ক্রয়' : 'Purchases', v: p.purchases },
        { l: bn ? 'কেনা' : 'Bought', v: money(p.bought) },
        { l: bn ? 'হাতে হাতে' : 'Paid on Purchase', v: money(p.paidAtPurchase), c: 'good' },
        { l: bn ? 'পরে পরিশোধ' : 'Paid Later', v: money(p.paidLater), c: 'good' },
        { l: bn ? 'বাকিতে কেনা' : 'Bought on Credit', v: money(p.dueCreated), c: p.dueCreated ? 'bad' : '' },
      ],
    };
    return {
      life: [
        { l: bn ? 'বিক্রয় চালান' : 'Sales Invoices', v: t.invoices },
        { l: bn ? 'বিক্রীত ইউনিট' : 'Units Sold', v: t.units },
        { l: bn ? 'মোট বিক্রয়' : 'Total Sales', v: money(t.salesAmount), c: 'info' },
        { l: bn ? 'নগদ আদায়' : 'Cash Collected', v: money(t.cashCollected), c: 'good' },
        { l: bn ? 'কাস্টমারের কাছে বকেয়া' : 'Still Due from Customers', v: money(t.dueOutstanding), c: t.dueOutstanding ? 'bad' : '' },
        ...(!isSalesmanAdmin ? [
          { l: bn ? 'এসআর দিন' : 'SR Days', v: t.srDays },
          { l: bn ? 'দোকানকে দেনা' : 'Owes the Shop', v: money(t.staffDue), c: t.staffDue ? 'bad' : 'good' },
          { l: bn ? 'আদায় হয়েছে' : 'Recovered', v: money(t.recovered), c: 'good' },
        ] : []),
      ],
      period: [
        { l: bn ? 'চালান' : 'Invoices', v: p.invoices },
        { l: bn ? 'ইউনিট' : 'Units', v: p.units },
        { l: bn ? 'বিক্রয়' : 'Sales', v: money(p.salesAmount), c: 'info' },
        { l: bn ? 'নগদ' : 'Cash', v: money(p.cashCollected), c: 'good' },
        { l: bn ? 'বাকিতে' : 'On Credit', v: money(p.dueCreated), c: p.dueCreated ? 'bad' : '' },
        ...(!isSalesmanAdmin ? [
          { l: bn ? 'আদায়' : 'Recovered', v: money(p.recovered), c: 'good' },
        ] : []),
      ],
    };
  }, [data, kind, bn, isSalesmanAdmin]);

  const shopName = shopProfile?.shop_name || 'Allah Dan Gents Point';
  const hasWindow = Boolean(startDate || endDate);
  const windowLabel = hasWindow ? `${startDate || '…'} → ${endDate || '…'}` : (bn ? 'সব সময়' : 'all time');
  const kindMeta = KINDS.find((k) => k.key === kind);
  const cell = { border: '1px solid #d1d5db', padding: '4px 6px' };

  // ---------------------------------------------------------------- //
  return (
    <div className="ledger-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{bn ? 'খাতা (লেজার)' : 'Ledger'}</h1>
          <p className="text-muted">
            {bn
              ? 'কাস্টমার, সাপ্লায়ার বা সেলসম্যান বেছে নিন — সব হিসাব এক পাতায়, পেমেন্টও এখান থেকেই।'
              : 'Pick a customer, supplier or salesman — every invoice, payment and due on one page, and settle it right here.'}
          </p>
        </div>
      </div>

      {/* ---------------- Who ---------------- */}
      <div className="card ledger-pick">
        <div className="segmented-control">
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? 'active' : ''} onClick={() => switchKind(k.key)}>
              <k.Icon size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />{bn ? k.bn : k.en}
            </button>
          ))}
        </div>

        <div className="party-picker" ref={pickerRef}>
          <button type="button" className={`pp-trigger ${pickerOpen ? 'open' : ''}`} onClick={() => setPickerOpen((o) => !o)}>
            {selected ? (
              <>
                <span className="ll-avatar">{initials(selected.name)}</span>
                <span className="pp-main">
                  <span className="pp-name">{selected.name}</span>
                  <span className="pp-sub">{selected.phone || selected.role || selected.company || selected.id}</span>
                </span>
                {Number(selected.due) > 0 && <span className="ll-due owed">{money(selected.due)}</span>}
              </>
            ) : (
              <span className="pp-placeholder">
                <Search size={15} />
                {bn ? `${kindMeta.bn} বেছে নিন…` : `Choose a ${kindMeta.en.toLowerCase()}…`}
              </span>
            )}
            <ChevronDown size={16} className="pp-chev" />
          </button>

          {pickerOpen && (
            <div className="pp-menu">
              <div className="pp-search">
                <Search size={14} />
                <input
                  autoFocus
                  placeholder={bn ? 'নাম, ফোন বা আইডি লিখুন' : 'Type a name, phone or ID'}
                  value={pickerText}
                  onChange={(e) => setPickerText(e.target.value)}
                />
              </div>
              <div className="pp-list">
                {options.length === 0 && <div className="ll-empty">{bn ? 'কিছু পাওয়া যায়নি।' : 'Nothing matches.'}</div>}
                {options.map((p) => {
                  const due = Number(p.due) || 0;
                  return (
                    <button key={p.id} type="button" className={`ll-row ${p.id === selectedId ? 'active' : ''}`}
                      onClick={() => { setSelectedId(p.id); setPickerOpen(false); setPickerText(''); setTab('primary'); }}>
                      <span className="ll-avatar">{initials(p.name)}</span>
                      <span className="ll-main">
                        <span className="ll-name">{p.name}</span>
                        <span className="ll-sub">{p.phone || p.role || p.company || p.id}</span>
                      </span>
                      <span className={`ll-due ${due > 0 ? 'owed' : 'zero'}`}>{due > 0 ? money(due) : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ---- When ---- */}
        <div className="ledger-range">
          {quickRanges().map((r) => (
            <button key={r.id} type="button" className={`cb-chip ${range === r.id ? 'active' : ''}`} onClick={() => applyRange(r)}>
              {bn ? r.bn : r.en}
            </button>
          ))}
          <div className="ledger-dates">
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setRange('custom'); }} title={bn ? 'শুরু' : 'From'} />
            <span className="text-muted">→</span>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setRange('custom'); }} title={bn ? 'শেষ' : 'To'} />
            {hasWindow && (
              <button type="button" className="btn-icon" title={bn ? 'ফিল্টার মুছুন' : 'Clear'} onClick={() => applyRange(quickRanges()[0])}><X size={15} /></button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Detail ---------------- */}
      {!selectedId ? (
        <div className="card ld-empty-detail">
          <BookOpen size={40} />
          <h3>{bn ? 'উপরের বাক্স থেকে একজনকে বেছে নিন' : 'Choose someone in the box above'}</h3>
          <p className="text-sm">{bn ? 'তার পুরো খাতা এখানে খুলবে।' : 'Their full ledger opens here.'}</p>
        </div>
      ) : !data ? (
        <div className="card ld-empty-detail">
          <RefreshCcw size={30} className="animate-spin" />
          <p className="text-sm">{bn ? 'খাতা খোলা হচ্ছে…' : 'Opening the ledger…'}</p>
        </div>
      ) : (
        <div className="ledger-detail">
          {/* Header */}
          <div className="card">
            <div className="ld-head">
              <div className="ld-identity">
                <div className="ld-avatar">{initials(data.party.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <h2>{data.party.name}</h2>
                  <div className="ld-meta">
                    <span className="badge">{data.party.id}</span>
                    {data.party.role && <span>{data.party.role}</span>}
                    {data.party.company && <span>{data.party.company}</span>}
                    {data.party.phone && <span><Phone size={12} />{data.party.phone}</span>}
                    {(data.party.location || data.party.address) && <span><MapPin size={12} />{data.party.location || data.party.address}</span>}
                    {(data.party.since || data.party.joinDate) && <span><Calendar size={12} />{bn ? 'থেকে' : 'since'} {day(data.party.since || data.party.joinDate)}</span>}
                  </div>
                </div>
              </div>
              <div className="ld-due-box">
                <div className="lbl">
                  {kind === 'supplier'
                    ? (bn ? 'দোকানের দেনা' : 'Shop owes')
                    : isSalesmanAdmin
                      ? (bn ? 'কাস্টমার বকেয়া' : 'Customer Dues')
                      : kind === 'salesman'
                        ? (bn ? 'দোকানকে দেনা' : 'Owes the shop')
                        : (bn ? 'মোট বকেয়া' : 'Total due')}
                </div>
                <div className={`amt ${(isSalesmanAdmin ? data?.totals?.dueOutstanding : partyDue) > 0 ? 'owed' : 'clear'}`}>
                  {money(isSalesmanAdmin ? data?.totals?.dueOutstanding : partyDue)}
                </div>
                {(isSalesmanAdmin ? (data?.totals?.dueOutstanding || 0) <= 0 : partyDue <= 0) && (
                  <div className="text-muted text-sm">
                    <CheckCircle2 size={12} style={{ verticalAlign: '-2px' }} /> {bn ? 'পরিষ্কার' : 'Nothing outstanding'}
                  </div>
                )}
              </div>
            </div>

            <div className="ld-actions">
              {partyDue > 0 && (
                <>
                  <button className="btn-primary" onClick={() => openPay('all')}>
                    <CheckCircle2 size={16} /> {bn ? `পুরো বকেয়া পরিশোধ (${money(partyDue)})` : `Pay Full Due (${money(partyDue)})`}
                  </button>
                  <button className="btn-outline" onClick={() => openPay('account')}>
                    <Wallet size={16} /> {payLabel}
                  </button>
                </>
              )}
              <button className="btn-outline" onClick={() => printElement('printable-ledger', `Ledger-${data.party.id}`)}>
                <Printer size={16} /> {bn ? 'স্টেটমেন্ট প্রিন্ট' : 'Print Statement'}
              </button>
              <button className="btn-outline" onClick={load} disabled={loading}>
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> {bn ? 'রিফ্রেশ' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Totals: lifetime, and the window if one is set */}
          <div>
            <div className="ld-section-label">{bn ? 'সব সময়ের হিসাব' : 'All time'}</div>
            <div className="ld-tiles">
              {tiles.life.map((t) => (
                <div className="ld-tile" key={t.l}><div className="t-label">{t.l}</div><div className={`t-value ${t.c || ''}`}>{t.v}</div></div>
              ))}
            </div>
          </div>
          {hasWindow && (
            <div>
              <div className="ld-section-label">{bn ? 'এই সময়ে' : 'In this period'} · {windowLabel}</div>
              <div className="ld-tiles period">
                {tiles.period.map((t) => (
                  <div className="ld-tile" key={t.l}><div className="t-label">{t.l}</div><div className={`t-value ${t.c || ''}`}>{t.v}</div></div>
                ))}
              </div>
            </div>
          )}

          {/* Lists */}
          <div className="card">
            <div className="ld-tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`ld-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  {t.l} <span className="n">{t.n}</span>
                </button>
              ))}
              <span className="ld-window-note">{windowLabel}</span>
            </div>

            <div className="table-responsive" style={{ marginTop: '1rem', border: 'none' }}>
              {/* invoices / sales / due invoices */}
              {((tab === 'primary' && kind !== 'supplier') || tab === 'dues') && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th>
                      <th>{bn ? 'চালান' : 'Invoice'}</th>
                      {kind === 'salesman' ? <th>{bn ? 'কাস্টমার' : 'Customer'}</th> : <th>{bn ? 'সেলসম্যান' : 'Salesman'}</th>}
                      <th>{bn ? 'পেমেন্ট' : 'Payment'}</th>
                      <th className="num">{bn ? 'আইটেম' : 'Items'}</th>
                      <th className="num">{bn ? 'মোট' : 'Total'}</th>
                      <th className="num">{bn ? 'পরিশোধ' : 'Paid'}</th>
                      <th className="num">{bn ? 'বকেয়া' : 'Due'}</th>
                      {(kind === 'customer' || kind === 'salesman') && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="9" className="text-center text-muted" style={{ padding: '1.5rem' }}>{tab === 'dues' ? (bn ? 'কোনো বকেয়া নেই।' : 'Nothing outstanding.') : (bn ? 'এই সময়ে কোনো চালান নেই।' : 'No invoices in this period.')}</td></tr>}
                    {pager.slice.map((r) => (
                      <tr key={r.id}>
                        <td>{day(r.date)}</td>
                        <td style={{ fontWeight: 600 }}>{r.id}</td>
                        {kind === 'salesman'
                          ? <td>{r.customerName}<div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.customerPhone}</div></td>
                          : <td className="text-muted">{r.salesmanName}</td>}
                        <td><span className={`badge ${r.due > 0 ? 'bg-danger' : 'bg-success'}`}>{r.paymentType}</span></td>
                        <td className="num">{r.items} / {r.units}u</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(r.total)}</td>
                        <td className="num text-success">{money(r.totalPaid)}</td>
                        <td className={`num ${r.due > 0 ? 'text-danger font-bold' : 'text-muted'}`}>{money(r.due)}</td>
                        {(kind === 'customer' || kind === 'salesman') && (
                          <td className="num">
                            {r.due > 0 && (
                              <button className="btn-icon" style={{ color: 'var(--success)' }} title={bn ? 'এই চালানের বকেয়া নিন' : 'Pay this invoice'} onClick={() => openPay('invoice', r)}>
                                <Wallet size={15} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'primary' && kind === 'supplier' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'ক্রয় নং' : 'Purchase'}</th><th>{bn ? 'পেমেন্ট' : 'Payment'}</th><th>{bn ? 'পণ্য' : 'Items'}</th>
                      <th className="num">{bn ? 'মোট' : 'Total'}</th><th className="num">{bn ? 'পরিশোধ' : 'Paid'}</th><th className="num">{bn ? 'বকেয়া' : 'Due'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কোনো ক্রয় নেই।' : 'No purchases in this period.'}</td></tr>}
                    {pager.slice.map((r) => (
                      <tr key={r.id}>
                        <td>{day(r.date)}</td>
                        <td style={{ fontWeight: 600 }}>{r.id}</td>
                        <td><span className={`badge ${r.due > 0 ? 'bg-danger' : 'bg-success'}`}>{r.paymentType}</span></td>
                        <td>
                          {r.lines.slice(0, 3).map((l, i) => <div key={i} style={{ fontSize: '0.78rem' }}>{l.name}{l.variant ? ` (${l.variant})` : ''} × {l.quantity}</div>)}
                          {r.lines.length > 3 && <div className="text-muted" style={{ fontSize: '0.72rem' }}>+{r.lines.length - 3} {bn ? 'আরও' : 'more'}</div>}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(r.total)}</td>
                        <td className="num text-success">
                          {money(r.paidAtPurchase + (r.duePaid || 0))}
                          {r.duePaid > 0 && <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 400 }}>{bn ? 'পরে' : 'later'} {money(r.duePaid)}</div>}
                        </td>
                        <td className={`num ${r.due > 0 ? 'text-danger font-bold' : 'text-muted'}`}>{money(r.due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'dues' && kind === 'supplier' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'ক্রয় নং' : 'Purchase'}</th><th>{bn ? 'পণ্য' : 'Items'}</th>
                      <th className="num">{bn ? 'মোট' : 'Total'}</th><th className="num">{bn ? 'পরিশোধ' : 'Paid'}</th><th className="num">{bn ? 'বাকি' : 'Still due'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="6" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'কোনো বকেয়া ক্রয় নেই।' : 'No purchase has anything due.'}</td></tr>}
                    {pager.slice.map((r) => (
                      <tr key={r.id}>
                        <td>{day(r.date)}</td>
                        <td style={{ fontWeight: 600 }}>{r.id}</td>
                        <td>{r.items} {bn ? 'টি' : 'items'} · {r.units} {bn ? 'পিস' : 'units'}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(r.total)}</td>
                        <td className="num text-success">{money(r.paidAtPurchase + (r.duePaid || 0))}</td>
                        <td className="num text-danger font-bold">{money(r.due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'payments' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'রসিদ' : 'Receipt'}</th><th>{bn ? 'মাধ্যম' : 'Method'}</th>
                      {kind === 'customer' && <th>{bn ? 'চালান' : 'Against Invoice'}</th>}
                      {kind === 'supplier' && <th>{bn ? 'ক্রয়' : 'Against Purchase'}</th>}
                      <th>{bn ? 'নোট' : 'Note'}</th><th className="num">{bn ? 'পরিমাণ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="6" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কোনো পেমেন্ট নেই।' : 'No payments in this period.'}</td></tr>}
                    {pager.slice.map((p) => (
                      <tr key={p.id}>
                        <td>{day(p.date)}</td>
                        <td style={{ fontWeight: 600 }}>{p.id}</td>
                        <td><span className="badge">{p.method}</span></td>
                        {kind === 'customer' && <td className="text-muted">{p.invoice || (bn ? 'হিসাবে' : 'account')}</td>}
                        {kind === 'supplier' && <td className="text-muted">{p.purchase || (bn ? 'হিসাবে' : 'account')}</td>}
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{p.notes}</td>
                        <td className="num text-success" style={{ fontWeight: 700 }}>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'statement' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'বিবরণ' : 'Description'}</th><th>{bn ? 'রেফারেন্স' : 'Ref'}</th>
                      <th className="num">{bn ? 'ধার্য' : 'Charge'}</th><th className="num">{bn ? 'পরিশোধ' : 'Payment'}</th><th className="num">{bn ? 'ব্যালেন্স' : 'Balance'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasWindow && (
                      <tr style={{ background: 'var(--bg-subtle)' }}>
                        <td colSpan="5" className="text-muted">{bn ? 'ওপেনিং বকেয়া' : 'Opening balance'}</td>
                        <td className="num balance-cell">{money(data.party.openingDue)}</td>
                      </tr>
                    )}
                    {pager.slice.length === 0 && <tr><td colSpan="6" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কোনো লেনদেন নেই।' : 'No entries in this period.'}</td></tr>}
                    {pager.slice.map((e) => (
                      <tr key={`${e.id}-${e.type}`}>
                        <td>{day(e.date)}</td>
                        <td>{e.description}</td>
                        <td className="text-muted" style={{ fontSize: '0.78rem' }}>{e.id}</td>
                        <td className="num text-danger">{e.type === 'charge' ? money(e.amount) : ''}</td>
                        <td className="num text-success">{e.type === 'payment' ? money(e.amount) : ''}</td>
                        <td className="num balance-cell">{money(e.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'products' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'পণ্য' : 'Product'}</th><th>{bn ? 'কোড' : 'Code'}</th>
                      <th className="num">{bn ? 'চালানে' : 'In Invoices'}</th><th className="num">{bn ? 'ইউনিট' : 'Units Sold'}</th>
                      <th className="num">{bn ? 'গিফট' : 'Gifted'}</th><th className="num">{bn ? 'বিক্রয়মূল্য' : 'Sales Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="6" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কিছু বিক্রি করেনি।' : 'Nothing sold in this period.'}</td></tr>}
                    {pager.slice.map((p) => (
                      <tr key={`${p.code}-${p.variant}`}>
                        <td style={{ fontWeight: 600 }}>{p.name}{p.variant ? <span className="text-muted"> · {p.variant}</span> : null}</td>
                        <td className="text-muted">{p.code}</td>
                        <td className="num">{p.invoices}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{p.qty}</td>
                        <td className="num text-muted">{p.gifts || '—'}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'sr' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'কোড' : 'Code'}</th><th>{bn ? 'অবস্থা' : 'Status'}</th>
                      <th className="num">{bn ? 'মাল দেওয়া' : 'Issued'}</th><th className="num">{bn ? 'বিক্রি' : 'Sold'}</th>
                      <th className="num">{bn ? 'নগদ জমা' : 'Cash In'}</th><th className="num">{bn ? 'ঘাটতি' : 'Shortfall'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কোনো এসআর দিন নেই।' : 'No SR days in this period.'}</td></tr>}
                    {pager.slice.map((d) => (
                      <tr key={d.id}>
                        <td>{day(d.date)}</td>
                        <td style={{ fontWeight: 600 }}>{d.id}</td>
                        <td><span className={`badge ${d.status === 'Settled' ? 'bg-success' : 'bg-warning'}`}>{d.status}</span></td>
                        <td className="num">{money(d.issuedValue)}</td>
                        <td className="num">{money(d.salesValue)}</td>
                        <td className="num text-success">{money(d.cashReceived)}</td>
                        <td className={`num ${d.shortfall > 0 ? 'text-danger font-bold' : 'text-muted'}`}>{money(d.shortfall)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'recoveries' && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th><th>{bn ? 'রসিদ' : 'Receipt'}</th><th>{bn ? 'মাধ্যম' : 'Method'}</th><th>{bn ? 'নোট' : 'Note'}</th><th className="num">{bn ? 'পরিমাণ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.length === 0 && <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '1.5rem' }}>{bn ? 'এই সময়ে কোনো আদায় নেই।' : 'No recoveries in this period.'}</td></tr>}
                    {pager.slice.map((p) => (
                      <tr key={p.id}>
                        <td>{day(p.date)}</td>
                        <td style={{ fontWeight: 600 }}>{p.id}</td>
                        <td><span className="badge">{p.method}</span></td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{p.notes}</td>
                        <td className="num text-success" style={{ fontWeight: 700 }}>{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <Pager pager={pager} bn={bn} />
          </div>

          {/* Printable statement */}
          <div style={{ display: 'none' }}>
            <div id="printable-ledger" style={{ padding: '22px 26px', background: '#fff', color: '#111827', fontSize: '12px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800 }}>{shopName}</div>
                {shopProfile?.address && <div style={{ color: '#4b5563', fontSize: '11px' }}>{shopProfile.address}</div>}
                <div style={{ marginTop: 6, fontWeight: 700, letterSpacing: '0.1em' }}>
                  {kind === 'customer' ? 'CUSTOMER STATEMENT' : kind === 'supplier' ? 'SUPPLIER STATEMENT' : 'SALESMAN STATEMENT'}
                </div>
                <div style={{ fontSize: '11px', color: '#4b5563' }}>
                  {hasWindow ? `Period: ${startDate || 'start'} to ${endDate || 'today'}` : 'All transactions'} · printed {new Date().toLocaleDateString('en-GB')}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{data.party.name}</div>
                  <div style={{ color: '#4b5563' }}>{data.party.id}{data.party.phone ? ` · ${data.party.phone}` : ''}</div>
                  {(data.party.location || data.party.address) && <div style={{ color: '#4b5563' }}>{data.party.location || data.party.address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 700 }}>
                    {kind === 'supplier' ? 'Payable' : kind === 'salesman' ? 'Owes the shop' : 'Balance due'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: partyDue > 0 ? '#b91c1c' : '#047857' }}>{money(partyDue)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {tiles.life.map((t) => (
                  <div key={t.l} style={{ flex: '1 1 110px', border: '1px solid #e5e7eb', borderRadius: 4, padding: '5px 8px' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', fontWeight: 700 }}>{t.l}</div>
                    <div style={{ fontWeight: 700 }}>{t.v}</div>
                  </div>
                ))}
              </div>
              {kind !== 'salesman' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}>
                    {['Date', 'Description', 'Ref', 'Charge', 'Payment', 'Balance'].map((h, i) => <th key={h} style={{ ...cell, textAlign: i >= 3 ? 'right' : 'left', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {!hasWindow && <tr><td colSpan={5} style={{ ...cell, color: '#6b7280' }}>Opening balance</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{money(data.party.openingDue)}</td></tr>}
                    {data.statement.map((e) => (
                      <tr key={`${e.id}-${e.type}`}>
                        <td style={cell}>{day(e.date)}</td><td style={cell}>{e.description}</td><td style={{ ...cell, color: '#6b7280' }}>{e.id}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{e.type === 'charge' ? money(e.amount) : ''}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{e.type === 'payment' ? money(e.amount) : ''}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{money(e.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr style={{ background: '#f3f4f6' }}>
                    {['Date', 'Invoice', 'Customer', 'Payment', 'Total', 'Paid', 'Due'].map((h, i) => <th key={h} style={{ ...cell, textAlign: i >= 4 ? 'right' : 'left', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.invoices.map((r) => (
                      <tr key={r.id}>
                        <td style={cell}>{day(r.date)}</td><td style={cell}>{r.id}</td><td style={cell}>{r.customerName}</td><td style={cell}>{r.paymentType}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{money(r.total)}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{money(r.totalPaid)}</td>
                        <td style={{ ...cell, textAlign: 'right', color: r.due > 0 ? '#b91c1c' : '#111827' }}>{money(r.due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: '11px' }}>
                <div style={{ borderTop: '1px solid #111827', paddingTop: 3, width: 160, textAlign: 'center' }}>{kind === 'supplier' ? 'Supplier' : kind === 'salesman' ? 'Salesman' : 'Customer'}</div>
                <div style={{ borderTop: '1px solid #111827', paddingTop: 3, width: 160, textAlign: 'center' }}>For {shopName}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment drawer */}
      {pay && data && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '440px' }}>
            <div className="drawer-header">
              <h2>{pay.mode === 'all' ? (bn ? 'পুরো বকেয়া পরিশোধ' : 'Pay Full Due') : pay.mode === 'invoice' ? (bn ? 'চালানের বকেয়া' : 'Pay Invoice') : payLabel}</h2>
              <button className="drawer-close-btn" onClick={() => setPay(null)}><X size={20} /></button>
            </div>
            <form className="ledger-pay-form" onSubmit={submitPay} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="mb-4" style={{ lineHeight: 1.8 }}>
                  <div><span className="text-muted">{bn ? 'নাম' : 'Name'}:</span> <strong>{data.party.name}</strong></div>
                  {pay.invoice && <div><span className="text-muted">{bn ? 'চালান' : 'Invoice'}:</span> <strong>{pay.invoice.id}</strong> ({money(pay.invoice.total)})</div>}
                  <div>
                    <span className="text-muted">{bn ? 'বকেয়া' : 'Outstanding'}:</span>{' '}
                    <strong className="text-danger">{money(pay.mode === 'invoice' ? pay.invoice.due : partyDue)}</strong>
                  </div>
                  {pay.mode !== 'invoice' && kind !== 'salesman' && (() => {
                    const docs = kind === 'supplier' ? (data.duePurchases || []) : (data.dueInvoices || []);
                    if (docs.length === 0) return null;
                    const word = kind === 'supplier'
                      ? (bn ? 'বকেয়া ক্রয়ে' : `unpaid purchase${docs.length > 1 ? 's' : ''}`)
                      : (bn ? 'বকেয়া চালানে' : `unpaid invoice${docs.length > 1 ? 's' : ''}`);
                    return (
                      <div className="ld-payall-note">
                        {bn
                          ? `টাকাটা পুরোনো থেকে নতুন ক্রমে ${docs.length}টি ${word} ভাগ হয়ে জমা হবে — যতটুকু দেবেন ততটুকু কেটে যাবে, প্রতিটির নিজের বকেয়াও আপডেট হবে।`
                          : `The amount is applied to the ${docs.length} ${word}, oldest first — however much you pay, each document's own due updates too.`}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>{bn ? 'পরিমাণ' : 'Amount'} (BDT)</label>
                    <input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} min="1" step="any" required autoFocus />
                    {pay.mode === 'all' && <small>{bn ? 'কম দিলে যতটুকু হয় ততটুকু মিটবে, বাকিটা থেকে যাবে।' : 'Pay less and it clears as much as it covers; the rest stays due.'}</small>}
                  </div>
                  <div>
                    <label>{bn ? 'তারিখ' : 'Date'}</label>
                    <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} required />
                  </div>
                  <div>
                    <label>{bn ? 'মাধ্যম' : 'Method'}</label>
                    <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <small>{bn ? 'Bank হলে ব্যাংক হিসাবে, নাহলে ক্যাশে।' : 'Bank posts to the bank account; anything else to cash.'}</small>
                  </div>
                  <div>
                    <label>{bn ? 'নোট' : 'Note'}</label>
                    <input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} placeholder={bn ? 'ঐচ্ছিক' : 'Optional'} />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setPay(null)}>{bn ? 'বাতিল' : 'Cancel'}</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : (bn ? 'সেভ করুন' : 'Save')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Ledger;
