import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, CalendarDays, RefreshCcw, Printer, ShoppingCart, Truck,
  DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, Landmark, Users,
  TrendingUp, TrendingDown, Banknote, Eye, Trash2, Plus, X, CheckCircle2, Search,
} from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { showConfirmDialog } from '../utils/alert';
import InvoiceDocument, { fromApiInvoice } from '../components/InvoiceDocument';
import './DayBook.css';

/**
 * The day book: one date, everything that happened on it.
 *
 * Top: the numbers the owner asks for at closing time (sold, received,
 * spent, profit, cash in the drawer), each against yesterday. Middle: quick
 * ways to add what is usually still missing at the end of the day. Bottom:
 * every transaction as one list, filterable by kind, each row actionable.
 */

const money = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}৳${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return isoLocal(d); };
const pretty = (iso, bn) => new Date(`${iso}T00:00:00`).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** How each kind of row looks: icon, colour, label. */
const KINDS = {
  sale: { icon: ShoppingCart, tone: 'success', en: 'Sale', bn: 'বিক্রি' },
  collection: { icon: ArrowDownLeft, tone: 'info', en: 'Due collected', bn: 'বকেয়া আদায়' },
  recovery: { icon: ArrowDownLeft, tone: 'info', en: 'SR recovery', bn: 'এসআর আদায়' },
  sr: { icon: Users, tone: 'info', en: 'SR day', bn: 'এসআর দিন' },
  purchase: { icon: Truck, tone: 'warning', en: 'Purchase', bn: 'ক্রয়' },
  supplier_payment: { icon: ArrowUpRight, tone: 'warning', en: 'Paid supplier', bn: 'সাপ্লায়ার পরিশোধ' },
  expense: { icon: DollarSign, tone: 'danger', en: 'Expense', bn: 'খরচ' },
  return: { icon: RotateCcw, tone: 'muted', en: 'Return', bn: 'রিটার্ন' },
  cash: { icon: Landmark, tone: 'muted', en: 'Cash entry', bn: 'ক্যাশ এন্ট্রি' },
};

/** The filter chips, in the order money usually flows through a day. */
const FILTERS = [
  { key: 'all', en: 'Everything', bn: 'সব', kinds: null },
  { key: 'sales', en: 'Sales', bn: 'বিক্রি', kinds: ['sale'] },
  { key: 'in', en: 'Money in', bn: 'টাকা এসেছে', kinds: ['collection', 'recovery', 'sr'] },
  { key: 'purchases', en: 'Purchases', bn: 'ক্রয়', kinds: ['purchase', 'supplier_payment'] },
  { key: 'expenses', en: 'Expenses', bn: 'খরচ', kinds: ['expense'] },
  { key: 'other', en: 'Returns & cash', bn: 'রিটার্ন ও ক্যাশ', kinds: ['return', 'cash'] },
];

/** A headline figure with yesterday underneath. */
const Kpi = ({ label, value, sub, compare, tone = '', icon: Icon, bn, abs = false }) => {
  const delta = compare !== undefined && compare !== null ? Number(value) - Number(compare) : null;
  const shown = money(abs ? Math.abs(Number(value) || 0) : value);
  return (
    <div className={`db-kpi ${tone}`}>
      <div className="db-kpi-top">
        <span className="db-kpi-label">{label}</span>
        {Icon && <span className="db-kpi-icon"><Icon size={16} /></span>}
      </div>
      <div className="db-kpi-value">{shown}</div>
      {sub && <div className="db-kpi-sub">{sub}</div>}
      {delta !== null && (
        <div className={`db-kpi-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
          {delta > 0 ? <TrendingUp size={12} /> : delta < 0 ? <TrendingDown size={12} /> : null}
          {delta === 0 ? (bn ? 'গতকালের সমান' : 'same as yesterday') : `${delta > 0 ? '+' : ''}${money(delta)} ${bn ? 'গতকালের চেয়ে' : 'vs yesterday'}`}
        </div>
      )}
    </div>
  );
};

const DayBook = () => {
  const {
    user, language, shopProfile, sales, customers, expenseCategories, expenses,
    fetchDayBook, addExpense, deleteExpense, payInvoiceDue, refresh,
  } = useStore();
  const navigate = useNavigate();
  const bn = language === 'bn';
  const isAdmin = user?.role === 'Admin';

  const today = isoLocal(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);        // invoice open in the drawer
  const [pay, setPay] = useState(null);                  // { invoice, amount, method }
  const [expenseForm, setExpenseForm] = useState(null);  // { category, amount, description }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetchDayBook(date);
    if (res?.ok) setData(res.data);
    setLoading(false);
  }, [date, fetchDayBook]);

  useEffect(() => { load(); }, [load]);

  // A live day keeps itself fresh while the page stays open.
  useEffect(() => {
    if (date !== today) return undefined;
    const id = setInterval(() => load(true), 60000);
    return () => clearInterval(id);
  }, [date, today, load]);

  const categories = useMemo(() => {
    const fromApi = (expenseCategories || []).map((c) => c.name);
    const fromRows = (expenses || []).map((e) => e.category);
    return [...new Set([...fromApi, ...fromRows].filter(Boolean))];
  }, [expenseCategories, expenses]);

  const feed = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.key === filter);
    const q = query.trim().toLowerCase();
    return data.feed.filter((row) => {
      if (f?.kinds && !f.kinds.includes(row.kind)) return false;
      if (!q) return true;
      return [row.id, row.party, row.title, row.by, row.method, row.partyPhone].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [data, filter, query]);

  const filterCount = (f) => {
    if (!data) return 0;
    if (!f.kinds) return data.feed.length;
    return f.kinds.reduce((n, k) => n + (data.counts[k] || 0), 0);
  };

  // ---------------------------------------------------------------- //
  // Row actions
  // ---------------------------------------------------------------- //
  const openInvoice = (id) => {
    const inv = (sales || []).find((s) => s.id === id);
    if (!inv) { toast.info(bn ? 'চালান লোড হচ্ছে, আবার চেষ্টা করুন' : 'Invoice still loading, try again'); refresh('sales'); return; }
    setSelected(inv);
  };

  const openPay = (row) => setPay({ invoice: row, amount: String(row.due), method: 'Cash' });

  const submitPay = async (e) => {
    e.preventDefault();
    const amount = parseFloat(pay.amount);
    if (!amount || amount <= 0 || amount > pay.invoice.due + 0.001) {
      toast.error(bn ? `বকেয়া মাত্র ${money(pay.invoice.due)}` : `Only ${money(pay.invoice.due)} is due.`); return;
    }
    setSaving(true);
    const res = await payInvoiceDue(pay.invoice.id, { amount, date: today, method: pay.method });
    setSaving(false);
    if (res?.ok) { toast.success(bn ? `${money(amount)} জমা হয়েছে` : `${money(amount)} received`); setPay(null); load(true); }
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0) { toast.error(bn ? 'সঠিক পরিমাণ লিখুন' : 'Enter a valid amount'); return; }
    setSaving(true);
    const res = await addExpense({
      date, category: expenseForm.category, amount,
      description: (expenseForm.description || '').trim() || expenseForm.category,
    });
    setSaving(false);
    if (res?.ok) { toast.success(bn ? 'খরচ লেখা হয়েছে' : 'Expense recorded'); setExpenseForm(null); load(true); }
  };

  const removeExpense = async (row) => {
    const ok = await showConfirmDialog({
      title: bn ? 'খরচ মুছবেন?' : 'Delete this expense?',
      text: `${row.party} — ${money(row.amount)}`,
      confirmButtonText: bn ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: bn ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (!ok) return;
    const res = await deleteExpense(row.id);
    if (res?.ok) { toast.success(bn ? 'খরচ মুছে গেছে' : 'Expense deleted'); load(true); }
  };

  // ---------------------------------------------------------------- //
  // Figures
  // ---------------------------------------------------------------- //
  const s = data?.sales;
  const p = data?.profit;
  const cf = data?.cashflow;
  const cmp = data?.compare || {};
  const dayLabel = date === today ? (bn ? 'আজ' : 'Today') : date === shift(today, -1) ? (bn ? 'গতকাল' : 'Yesterday') : null;

  return (
    <div className="day-book animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{bn ? 'দিনের হিসাব' : 'Day Book'}</h1>
          <p className="text-muted">{bn ? 'এক দিনের সব বিক্রি, ক্রয়, খরচ, আদায় আর লাভ — এক জায়গায়।' : 'Every sale, purchase, expense, payment and the profit of one day, on one page.'}</p>
        </div>
        <div className="flex-align-gap">
          <button className="btn-outline" onClick={() => load()} disabled={loading}><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> {bn ? 'রিফ্রেশ' : 'Refresh'}</button>
          <button className="btn-outline" onClick={() => printElement('printable-daybook', `DayBook-${date}`)} disabled={!data}><Printer size={16} /> {bn ? 'দিন শেষের রিপোর্ট' : 'Closing Report'}</button>
        </div>
      </div>

      {/* Which day */}
      <div className="db-datebar">
        <button className="btn-icon" onClick={() => setDate(shift(date, -1))} title={bn ? 'আগের দিন' : 'Previous day'}><ChevronLeft size={18} /></button>
        <div className="db-date">
          <CalendarDays size={18} />
          <div>
            <div className="db-date-main">{dayLabel ? `${dayLabel} · ` : ''}{pretty(date, bn)}</div>
            {data?.isToday && <div className="db-live"><span className="dot" /> {bn ? 'লাইভ — প্রতি মিনিটে আপডেট হয়' : 'Live — refreshes every minute'}</div>}
          </div>
        </div>
        <button className="btn-icon" onClick={() => setDate(shift(date, 1))} disabled={date >= today} title={bn ? 'পরের দিন' : 'Next day'}><ChevronRight size={18} /></button>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {date !== today && <button className="btn-outline btn-sm" onClick={() => setDate(today)}>{bn ? 'আজকে যান' : 'Jump to today'}</button>}
      </div>

      {!data && loading && <div className="db-loading">{bn ? 'হিসাব আনা হচ্ছে…' : 'Adding up the day…'}</div>}

      {data && (
        <>
          {/* The closing-time numbers */}
          <div className="db-kpis">
            <Kpi bn={bn} icon={ShoppingCart} tone="success"
              label={bn ? 'বিক্রি' : 'Sales'} value={s.netSales}
              sub={`${s.invoiceCount} ${bn ? 'টি চালান' : 'invoices'}${s.totalDiscount > 0 ? ` · ${bn ? 'ছাড়' : 'discount'} ${money(s.totalDiscount)}` : ''}`}
              compare={cmp.netSales} />
            <Kpi bn={bn} icon={Banknote} tone="info"
              label={bn ? 'টাকা এসেছে' : 'Received'} value={s.totalReceived}
              sub={`${bn ? 'কাউন্টারে' : 'at counter'} ${money(s.paidAtCounter)} · ${bn ? 'বকেয়া আদায়' : 'dues'} ${money(s.dueCollected)}`}
              compare={cmp.received} />
            <Kpi bn={bn} icon={Wallet} tone={s.dueCreated > 0 ? 'warning' : ''}
              label={bn ? 'আজ বাকি হয়েছে' : 'Sold on credit'} value={s.dueCreated}
              sub={bn ? 'আজকের বিক্রি থেকে যা বকেয়া রইল' : 'left unpaid from today\'s sales'} />
            {isAdmin && (
              <Kpi bn={bn} icon={Truck} tone="warning"
                label={bn ? 'ক্রয়' : 'Purchases'} value={data.purchases.total}
                sub={`${data.purchases.count} ${bn ? 'টি' : 'bills'} · ${bn ? 'পরিশোধ' : 'paid'} ${money(data.purchases.paid + data.purchases.paidLater)}`} />
            )}
            <Kpi bn={bn} icon={DollarSign} tone="danger"
              label={bn ? 'খরচ' : 'Expenses'} value={data.expenses.total}
              sub={data.expenses.categories.slice(0, 2).map((c) => `${c.category} ${money(c.amount)}`).join(' · ') || (bn ? 'কোনো খরচ নেই' : 'no expenses')}
              compare={cmp.expenses} />
            {isAdmin && (
              <Kpi bn={bn} icon={p.isLoss ? TrendingDown : TrendingUp} tone={p.isLoss ? 'danger' : 'success'}
                label={p.isLoss ? (bn ? 'আজ লোকসান' : 'Loss today') : (bn ? 'আজ লাভ' : 'Profit today')} value={p.netProfit} abs
                sub={`${bn ? 'মোট লাভ' : 'gross'} ${money(p.grossProfit)} (${p.grossMargin}%) − ${bn ? 'খরচ' : 'expenses'} ${money(p.operatingExpenses)}`}
                compare={cmp.netProfit} />
            )}
            {isAdmin && (
              <Kpi bn={bn} icon={Landmark} tone="info"
                label={bn ? 'ক্যাশে আছে' : 'Cash in hand'} value={cf.closingCash}
                sub={`${bn ? 'শুরুতে' : 'opened'} ${money(cf.openingCash)} · ${bn ? 'ব্যাংক' : 'bank'} ${money(cf.closingBank)}`} />
            )}
          </div>

          {isAdmin && data.cogs.itemsMissingCost > 0 && (
            <div className="db-warn">
              {bn
                ? `${data.cogs.unitsMissingCost} পিস পণ্যের ক্রয়মূল্য দেওয়া নেই, তাই আজকের লাভ বেশি দেখাতে পারে। Inventory-তে ক্রয়মূল্য দিন।`
                : `${data.cogs.unitsMissingCost} units sold today have no cost price set, so profit may be overstated. Add cost prices in Inventory.`}
            </div>
          )}

          {/* Get things done from here */}
          <div className="db-quick">
            <button className="db-quick-btn primary" onClick={() => navigate('/pos')}><ShoppingCart size={18} /> {bn ? 'নতুন বিক্রি' : 'New sale'}</button>
            <button className="db-quick-btn" onClick={() => setExpenseForm({ category: categories[0] || 'Others', amount: '', description: '' })}><Plus size={18} /> {bn ? 'খরচ লিখুন' : 'Add expense'}</button>
            {isAdmin && <button className="db-quick-btn" onClick={() => navigate('/ledger')}><Wallet size={18} /> {bn ? 'বকেয়া নিন / দিন' : 'Receive / pay due'}</button>}
            {isAdmin && <button className="db-quick-btn" onClick={() => navigate('/purchases')}><Truck size={18} /> {bn ? 'নতুন ক্রয়' : 'New purchase'}</button>}
            <button className="db-quick-btn" onClick={() => navigate('/returns')}><RotateCcw size={18} /> {bn ? 'রিটার্ন' : 'Return'}</button>
          </div>

          <div className="db-grid">
            {/* The day, line by line */}
            <div className="card db-feed-card">
              <div className="db-feed-head">
                <div className="db-chips">
                  {FILTERS.map((f) => (
                    <button key={f.key} className={`db-chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                      {bn ? f.bn : f.en} <span className="n">{filterCount(f)}</span>
                    </button>
                  ))}
                </div>
                <div className="db-search">
                  <Search size={14} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={bn ? 'নাম, ফোন, চালান নং…' : 'Name, phone, invoice…'} />
                </div>
              </div>

              {feed.length === 0 ? (
                <div className="db-empty">
                  <CalendarDays size={36} />
                  <div>{data.feed.length === 0 ? (bn ? 'এই দিনে কোনো লেনদেন হয়নি।' : 'Nothing happened on this day.') : (bn ? 'এই ফিল্টারে কিছু নেই।' : 'Nothing matches this filter.')}</div>
                </div>
              ) : (
                <div className="db-feed">
                  {feed.map((row) => {
                    const k = KINDS[row.kind] || KINDS.cash;
                    const Icon = k.icon;
                    return (
                      <div key={`${row.kind}-${row.id}`} className={`db-row ${k.tone}`}>
                        <div className="db-row-time">{row.time || '—'}</div>
                        <div className={`db-row-icon ${k.tone}`}><Icon size={16} /></div>
                        <div className="db-row-main">
                          <div className="db-row-title">
                            <span className="db-row-kind">{bn ? k.bn : k.en}</span>
                            <strong>{row.party}</strong>
                            {row.method && <span className={`badge ${row.method === 'Baki' ? 'bg-danger' : row.method === 'Partial' ? 'bg-warning' : 'bg-muted'}`}>{row.method}</span>}
                          </div>
                          <div className="db-row-sub">
                            {row.title}{row.by ? ` · ${bn ? 'বিক্রেতা' : 'by'} ${row.by}` : ''}{row.note ? ` · ${row.note}` : ''}
                            <span className="db-row-id"> · {row.id}</span>
                          </div>
                        </div>
                        <div className="db-row-amount">
                          <div className={`amt ${row.flow}`}>{row.flow === 'out' ? '−' : row.flow === 'in' ? '+' : ''}{money(row.amount)}</div>
                          {row.due > 0 && <div className="due">{bn ? 'বাকি' : 'due'} {money(row.due)}</div>}
                          {row.kind === 'sale' && row.due === 0 && row.paid > 0 && <div className="ok"><CheckCircle2 size={11} /> {bn ? 'পরিশোধিত' : 'paid'}</div>}
                        </div>
                        <div className="db-row-actions">
                          {row.kind === 'sale' && <button className="btn-icon" title={bn ? 'চালান দেখুন / প্রিন্ট' : 'View / print invoice'} onClick={() => openInvoice(row.id)}><Eye size={16} /></button>}
                          {row.kind === 'sale' && row.due > 0 && <button className="btn-icon text-success" title={bn ? 'বকেয়া নিন' : 'Receive due'} onClick={() => openPay(row)}><Wallet size={16} /></button>}
                          {row.kind === 'expense' && isAdmin && <button className="btn-icon text-danger" title={bn ? 'মুছুন' : 'Delete'} onClick={() => removeExpense(row)}><Trash2 size={16} /></button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* The side: who sold, what sold, how it was paid */}
            <div className="db-side">
              <div className="card db-panel">
                <h3>{bn ? 'পেমেন্ট মাধ্যম' : 'By payment type'}</h3>
                {s.byPaymentType.length === 0 && <div className="text-muted text-sm">{bn ? 'আজ বিক্রি নেই' : 'No sales yet'}</div>}
                {s.byPaymentType.map((r) => (
                  <div key={r.type} className="db-line">
                    <span><span className={`badge ${r.type === 'Baki' ? 'bg-danger' : r.type === 'Partial' ? 'bg-warning' : 'bg-success'}`}>{r.type}</span> <span className="text-muted">× {r.count}</span></span>
                    <span className="num">{money(r.total)}{r.due > 0 && <small className="text-danger"> ({bn ? 'বাকি' : 'due'} {money(r.due)})</small>}</span>
                  </div>
                ))}
              </div>

              <div className="card db-panel">
                <h3>{bn ? 'কে কত বিক্রি করল' : 'By salesman'}</h3>
                {data.bySalesman.length === 0 && <div className="text-muted text-sm">{bn ? 'আজ বিক্রি নেই' : 'No sales yet'}</div>}
                {data.bySalesman.map((r) => (
                  <div key={r.name} className="db-line">
                    <span><strong>{r.name}</strong> <span className="text-muted">· {r.invoices} {bn ? 'টি' : 'inv'}</span></span>
                    <span className="num">{money(r.total)}{r.due > 0 && <small className="text-danger"> ({bn ? 'বাকি' : 'due'} {money(r.due)})</small>}</span>
                  </div>
                ))}
              </div>

              <div className="card db-panel">
                <h3>{bn ? 'বেশি বিক্রি হওয়া পণ্য' : 'Top products'}</h3>
                {data.topProducts.length === 0 && <div className="text-muted text-sm">{bn ? 'আজ বিক্রি নেই' : 'No sales yet'}</div>}
                {data.topProducts.map((r) => (
                  <div key={r.name} className="db-line">
                    <span className="ellipsis">{r.name} <span className="text-muted">× {r.units}</span></span>
                    <span className="num">{money(r.amount)}</span>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <div className="card db-panel">
                  <h3>{bn ? 'ক্যাশ চলাচল' : 'Cash movement'}</h3>
                  <div className="db-line"><span>{bn ? 'দিনের শুরুতে' : 'Opening'}</span><span className="num">{money(cf.openingTotal)}</span></div>
                  <div className="db-line"><span className="text-success">{bn ? 'এসেছে' : 'In'}</span><span className="num text-success">+{money(cf.inflow)}</span></div>
                  <div className="db-line"><span className="text-danger">{bn ? 'গেছে' : 'Out'}</span><span className="num text-danger">−{money(cf.outflow)}</span></div>
                  <div className="db-line total"><span>{bn ? 'দিনের শেষে' : 'Closing'}</span><span className="num">{money(cf.closingTotal)}</span></div>
                  <div className="text-muted text-sm" style={{ marginTop: '0.35rem' }}>{bn ? 'ক্যাশ' : 'Cash'} {money(cf.closingCash)} · {bn ? 'ব্যাংক' : 'Bank'} {money(cf.closingBank)}</div>
                </div>
              )}

              {isAdmin && (
                <div className="card db-panel">
                  <h3>{bn ? 'মোট বকেয়া (আজ পর্যন্ত)' : 'Outstanding (as of now)'}</h3>
                  <div className="db-line"><span>{bn ? 'কাস্টমারের কাছে পাওনা' : 'Customers owe'}</span><span className="num text-success">{money(data.position.assets.customerDue)}</span></div>
                  <div className="db-line"><span>{bn ? 'এসআর-এর কাছে পাওনা' : 'SRs owe'}</span><span className="num text-success">{money(data.position.assets.staffDue)}</span></div>
                  <div className="db-line"><span>{bn ? 'সাপ্লায়ারকে দেনা' : 'Owed to suppliers'}</span><span className="num text-danger">{money(data.position.liabilities.supplierDue)}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Printable closing report */}
          <div id="printable-daybook" style={{ display: 'none' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{shopProfile?.name || 'Allah Dan Gents Point'}</div>
                <div style={{ fontSize: 13 }}>{bn ? 'দিন শেষের রিপোর্ট' : 'Day Closing Report'} — {pretty(date, false)}</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                <tbody>
                  {[
                    ['Sales', money(s.netSales), `${s.invoiceCount} invoices`],
                    ['Received', money(s.totalReceived), `counter ${money(s.paidAtCounter)} + dues ${money(s.dueCollected)}`],
                    ['Sold on credit', money(s.dueCreated), ''],
                    ...(isAdmin ? [
                      ['Purchases', money(data.purchases.total), `paid ${money(data.purchases.paid + data.purchases.paidLater)}`],
                      ['Expenses', money(data.expenses.total), ''],
                      ['Cost of goods sold', money(data.cogs.total), `${data.cogs.unitsSold} units`],
                      ['Gross profit', money(p.grossProfit), `${p.grossMargin}%`],
                      [p.isLoss ? 'Net loss' : 'Net profit', money(Math.abs(p.netProfit)), ''],
                      ['Cash opening → closing', `${money(cf.openingCash)} → ${money(cf.closingCash)}`, `bank ${money(cf.closingBank)}`],
                    ] : [['Expenses', money(data.expenses.total), '']]),
                  ].map(([l, v, h]) => (
                    <tr key={l}>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{l}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{v}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', color: '#555' }}>{h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f1f1f1' }}>
                    {['Time', 'Type', 'Party', 'Details', 'Ref', 'Amount', 'Due'].map((h) => <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: h === 'Amount' || h === 'Due' ? 'right' : 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.feed.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.time || ''}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{KINDS[row.kind]?.en || row.kind}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.party}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.title}{row.method ? ` (${row.method})` : ''}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px', fontSize: 9 }}>{row.id}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right' }}>{row.flow === 'out' ? '-' : ''}{money(row.amount)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right' }}>{row.due > 0 ? money(row.due) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Invoice viewer */}
      {selected && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '780px' }}>
            <div className="drawer-header">
              <h2 style={{ margin: 0 }}>{bn ? 'চালান' : 'Invoice'} {selected.id}</h2>
              <button className="drawer-close-btn" onClick={() => setSelected(null)}><X size={22} /></button>
            </div>
            <div className="drawer-body" style={{ padding: 0, background: '#fff' }}>
              <InvoiceDocument sale={fromApiInvoice(selected, customers)} shopProfile={shopProfile} language={language} domId="printable-daybook-invoice" />
            </div>
            <div className="drawer-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-primary flex-align-gap" onClick={() => printElement('printable-daybook-invoice', `Invoice-${selected.id}`)}>
                <Printer size={16} /> {bn ? 'চালান প্রিন্ট' : 'Print Invoice'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Receive due on one invoice */}
      {pay && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '440px' }}>
            <form onSubmit={submitPay} className="db-form">
              <div className="drawer-header">
                <h2 style={{ margin: 0 }}>{bn ? 'বকেয়া নিন' : 'Receive due'}</h2>
                <button type="button" className="drawer-close-btn" onClick={() => setPay(null)}><X size={22} /></button>
              </div>
              <div className="drawer-body">
                <div className="mb-4" style={{ lineHeight: 1.8 }}>
                  <div><span className="text-muted">{bn ? 'কাস্টমার' : 'Customer'}:</span> <strong>{pay.invoice.party}</strong></div>
                  <div><span className="text-muted">{bn ? 'চালান' : 'Invoice'}:</span> {pay.invoice.id}</div>
                  <div><span className="text-muted">{bn ? 'বকেয়া' : 'Due'}:</span> <strong className="text-danger">{money(pay.invoice.due)}</strong></div>
                </div>
                <label>{bn ? 'পরিমাণ' : 'Amount'} (BDT)</label>
                <input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} min="1" step="any" required autoFocus />
                <label>{bn ? 'মাধ্যম' : 'Method'}</label>
                <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setPay(null)}>{bn ? 'বাতিল' : 'Cancel'}</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : (bn ? 'জমা নিন' : 'Receive')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Quick expense */}
      {expenseForm && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '440px' }}>
            <form onSubmit={submitExpense} className="db-form">
              <div className="drawer-header">
                <h2 style={{ margin: 0 }}>{bn ? 'খরচ লিখুন' : 'Add expense'}</h2>
                <button type="button" className="drawer-close-btn" onClick={() => setExpenseForm(null)}><X size={22} /></button>
              </div>
              <div className="drawer-body">
                <div className="text-muted text-sm mb-4">{bn ? 'তারিখ' : 'Date'}: <strong>{pretty(date, bn)}</strong></div>
                <label>{bn ? 'খাত' : 'Category'}</label>
                <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                  {(categories.length ? categories : ['Others']).map((c) => <option key={c}>{c}</option>)}
                </select>
                <label>{bn ? 'পরিমাণ' : 'Amount'} (BDT)</label>
                <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} min="1" step="any" required autoFocus />
                <label>{bn ? 'বিবরণ' : 'Description'}</label>
                <input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder={bn ? 'ঐচ্ছিক' : 'Optional'} />
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setExpenseForm(null)}>{bn ? 'বাতিল' : 'Cancel'}</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : (bn ? 'সংরক্ষণ' : 'Save')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DayBook;
