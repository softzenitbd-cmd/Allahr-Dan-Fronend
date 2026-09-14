import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, CalendarDays, RefreshCcw, Printer, ShoppingCart, Truck,
  DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, Landmark, Users,
  TrendingUp, TrendingDown, Banknote, Eye, Trash2, Plus, X, CheckCircle2, Search,
  Handshake, Phone, ArrowUpCircle, ArrowDownCircle, FileText, Check, AlertCircle, History, Clock, Download,
} from 'lucide-react';
import useStore from '../store/useStore';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
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
  loan: { icon: Handshake, tone: 'warning', en: 'Loan / Karz', bn: 'কর্জ / ঋণ' },
};

/** The filter chips, in the order money usually flows through a day. */
const FILTERS = [
  { key: 'all', en: 'Everything', bn: 'সব', kinds: null },
  { key: 'sales', en: 'Sales', bn: 'বিক্রি', kinds: ['sale'] },
  { key: 'in', en: 'Money in', bn: 'টাকা এসেছে', kinds: ['collection', 'recovery', 'sr'] },
  { key: 'purchases', en: 'Purchases', bn: 'ক্রয়', kinds: ['purchase', 'supplier_payment'] },
  { key: 'expenses', en: 'Expenses', bn: 'খরচ', kinds: ['expense'] },
  { key: 'loans', en: 'Loans / Karz', bn: 'কর্জ / ঋণ', kinds: ['loan'] },
  { key: 'other', en: 'Returns & cash', bn: 'রিটার্ন ও ক্যাশ', kinds: ['return', 'cash'] },
];

/** A headline figure with yesterday underneath. */
const Kpi = ({ label, value, sub, compare, tone = '', icon: Icon, bn, abs = false, breakdown = null }) => {
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
      {breakdown && (
        <div className="db-kpi-break">
          {breakdown.map((b) => (
            <div key={b.l} className={`db-kpi-break-item ${b.tone || ''}`}>
              <span className="l">{b.l}</span>
              <span className="v">{b.v}</span>
            </div>
          ))}
        </div>
      )}
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
    loans, fetchLoans, addLoan, payLoan, deleteLoan, importLocalLoans,
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
      if (f?.key === 'in') {
        const isMoneyIn = (f.kinds && f.kinds.includes(row.kind)) || (row.kind === 'loan' && row.flow === 'in');
        if (!isMoneyIn) return false;
      } else if (f?.kinds && !f.kinds.includes(row.kind)) {
        return false;
      }
      if (!q) return true;
      return [row.id, row.party, row.title, row.by, row.method, row.partyPhone].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [data, filter, query]);

  const filterCount = (f) => {
    if (!data) return 0;
    if (!f.kinds) return data.feed.length;
    if (f.key === 'in') {
      return data.feed.filter((r) => (f.kinds.includes(r.kind) || (r.kind === 'loan' && r.flow === 'in'))).length;
    }
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
  // Loan Management (Isolated from shop accounting)
  // ---------------------------------------------------------------- //
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'loans'

  // The loan book lives on the server. Anything an older build left in this
  // browser is moved across once, then forgotten here.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      let stale = [];
      try { stale = JSON.parse(localStorage.getItem('allahr_dan_daybook_loans') || '[]'); } catch { stale = []; }
      if (Array.isArray(stale) && stale.length) {
        const res = await importLocalLoans(stale);
        if (res?.ok) {
          try { localStorage.removeItem('allahr_dan_daybook_loans'); } catch { /* ignore */ }
          if (res.result?.imported) toast.info(bn ? `${res.result.imported}টি পুরোনো কর্জ সার্ভারে নেওয়া হয়েছে` : `${res.result.imported} saved loan(s) moved to the server`);
          return;
        }
      }
      fetchLoans();
    })();
  }, [isAdmin, fetchLoans, importLocalLoans, bn]);

  const [loanDrawer, setLoanDrawer] = useState(false);
  const [loanFilter, setLoanFilter] = useState('all'); // 'all', 'given', 'taken', 'active', 'settled'
  const [loanSearch, setLoanSearch] = useState('');
  const [loanPayTarget, setLoanPayTarget] = useState(null);
  const [loanPayAccount, setLoanPayAccount] = useState('Cash');
  const [loanPayAmount, setLoanPayAmount] = useState('');
  const [loanPayNote, setLoanPayNote] = useState('');
  const [loanPayDate, setLoanPayDate] = useState(today);

  const [loanForm, setLoanForm] = useState({
    type: 'given', // 'given' (দেওয়া) or 'taken' (নেওয়া)
    account: 'Cash', // 'Cash' or 'Bank'
    name: '',
    phone: '',
    amount: '',
    note: '',
    date: today,
  });

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    const name = (loanForm.name || '').trim();
    const amount = parseFloat(loanForm.amount);
    const account = loanForm.account || 'Cash';

    if (!name) {
      toast.error(bn ? 'নাম লিখুন (বাধ্যতামূলক)' : 'Name is required');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error(bn ? 'সঠিক পরিমাণ লিখুন (বাধ্যতামূলক)' : 'Valid amount is required');
      return;
    }

    const isGiven = loanForm.type === 'given';

    setSaving(true);
    const res = await addLoan({
      type: loanForm.type,
      account,
      name,
      phone: (loanForm.phone || '').trim(),
      amount,
      note: (loanForm.note || '').trim(),
      date: loanForm.date || today,
    });
    setSaving(false);
    if (!res?.ok) return;

    toast.success(bn
      ? `ঋণ সংরক্ষণ ও ${account === 'Bank' ? 'ব্যাংক' : 'ক্যাশ'} একাউন্টে ${isGiven ? 'মাইনাস' : 'প্লাস'} করা হয়েছে`
      : `Loan recorded and ${isGiven ? 'deducted from' : 'added to'} ${account}`);
    setLoanDrawer(false);
    setLoanForm({
      type: 'given',
      account: 'Cash',
      name: '',
      phone: '',
      amount: '',
      note: '',
      date: today,
    });
    load(true);
  };

  const openLoanPay = (loan) => {
    setLoanPayTarget(loan);
    setLoanPayAccount(loan.account || 'Cash');
    setLoanPayAmount(String(loan.remainingAmount));
    setLoanPayNote('');
    setLoanPayDate(today);
  };

  const handleLoanPaySubmit = async (e) => {
    e.preventDefault();
    if (!loanPayTarget) return;

    const payAmt = parseFloat(loanPayAmount);
    if (!payAmt || payAmt <= 0) {
      toast.error(bn ? 'সঠিক টাকার পরিমাণ লিখুন' : 'Please enter a valid amount');
      return;
    }
    if (payAmt > loanPayTarget.remainingAmount + 0.001) {
      toast.error(bn ? `অবশিষ্ট দেনা/পাওনা মাত্র ${money(loanPayTarget.remainingAmount)}` : `Maximum payable is ${money(loanPayTarget.remainingAmount)}`);
      return;
    }

    const account = loanPayAccount || loanPayTarget.account || 'Cash';
    const isGiven = loanPayTarget.type === 'given';

    setSaving(true);
    const res = await payLoan(loanPayTarget.id, {
      amount: payAmt,
      account,
      date: loanPayDate || today,
      note: (loanPayNote || '').trim(),
    });
    setSaving(false);
    if (!res?.ok) return;

    toast.success(bn
      ? `${money(payAmt)} পরিশোধ এবং ${account === 'Bank' ? 'ব্যাংক' : 'ক্যাশ'} একাউন্টে ${isGiven ? 'প্লাস' : 'মাইনাস'} করা হয়েছে`
      : `Payment of ${money(payAmt)} recorded and updated in ${account}`);
    setLoanPayTarget(null);
    load(true);
  };

  const handleDeleteLoan = async (loan) => {
    const ok = await showConfirmDialog({
      title: bn ? 'ঋণ রেকর্ডটি মুছে ফেলবেন?' : 'Delete loan record?',
      text: `${loan.name} — ${money(loan.amount)} (${loan.type === 'given' ? (bn ? 'দেওয়া' : 'Given') : (bn ? 'নেওয়া' : 'Taken')}). ${bn ? 'মেইন একাউন্টের ব্যালেন্স ও লেনদেন স্বয়ংক্রিয়ভাবে সমন্বয় হয়ে যাবে।' : 'Main account balance will be restored automatically.'}`,
      confirmButtonText: bn ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: bn ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (!ok) return;

    const res = await deleteLoan(loan.id);
    if (!res?.ok) return;
    toast.success(bn ? 'ঋণের তথ্য মুছে ফেলা হয়েছে ও একাউন্ট ব্যালেন্স সমন্বয় হয়েছে' : 'Loan record deleted and account balance restored');
    load(true);
  };

  // Loan metrics & filtered list
  const loanStats = useMemo(() => {
    let totalGiven = 0;
    let givenRemaining = 0;
    let totalTaken = 0;
    let takenRemaining = 0;
    let totalSettledCount = 0;

    loans.forEach((l) => {
      if (l.type === 'given') {
        totalGiven += Number(l.amount) || 0;
        givenRemaining += Number(l.remainingAmount) || 0;
      } else {
        totalTaken += Number(l.amount) || 0;
        takenRemaining += Number(l.remainingAmount) || 0;
      }
      if (l.status === 'settled') {
        totalSettledCount += 1;
      }
    });

    return {
      totalGiven,
      givenRemaining,
      totalTaken,
      takenRemaining,
      totalSettledCount,
      activeCount: loans.length - totalSettledCount,
    };
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const q = loanSearch.trim().toLowerCase();
    return loans.filter((l) => {
      if (loanFilter === 'given' && l.type !== 'given') return false;
      if (loanFilter === 'taken' && l.type !== 'taken') return false;
      if (loanFilter === 'active' && l.status !== 'active') return false;
      if (loanFilter === 'settled' && l.status !== 'settled') return false;

      if (!q) return true;
      return [l.name, l.phone, l.note, l.id].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [loans, loanFilter, loanSearch]);

  // ---------------------------------------------------------------- //
  // Figures
  // ---------------------------------------------------------------- //
  const s = data?.sales;
  const p = data?.profit;
  const cf = data?.cashflow;
  const cmp = data?.compare || {};
  const dayLabel = date === today ? (bn ? 'আজ' : 'Today') : date === shift(today, -1) ? (bn ? 'গতকাল' : 'Yesterday') : null;

  // Compute today's loan metrics for DayBook calculations
  const todayLoans = useMemo(() => {
    const backendLoans = data?.loans;
    const loanRows = (data?.feed || []).filter((r) => r.kind === 'loan');
    const totalOut = backendLoans ? backendLoans.totalOut : loanRows.filter((r) => r.flow === 'out').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalIn = backendLoans ? backendLoans.totalIn : loanRows.filter((r) => r.flow === 'in').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return {
      count: backendLoans ? backendLoans.count : loanRows.length,
      out: totalOut,
      in: totalIn,
      net: totalIn - totalOut,
      rows: loanRows,
    };
  }, [data]);

  return (
    <div className="day-book animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{bn ? 'দিনের হিসাব ও কর্জ' : 'Day Book & Loans'}</h1>
          <p className="text-muted">{bn ? 'এক দিনের লেনদেন এবং প্রকল্পের বাইরের ব্যক্তিগত কর্জ/ঋণ ব্যবস্থাপনা।' : 'Daily transactions and isolated external loan management.'}</p>
        </div>
        <div className="flex-align-gap">
          {activeTab === 'daily' ? (
            <>
              <button className="btn-outline" onClick={() => load()} disabled={loading}><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> {bn ? 'রিফ্রেশ' : 'Refresh'}</button>
              <button className="btn-outline" onClick={() => printElement('printable-daybook', `DayBook-${date}`)} disabled={!data}><Printer size={16} /> {bn ? 'দিন শেষের রিপোর্ট' : 'Closing Report'}</button>
            </>
          ) : (
            <button className="btn-primary flex-align-gap" onClick={() => setLoanDrawer(true)}>
              <Plus size={16} /> {bn ? 'নতুন ঋণ / কর্জ যোগ' : 'Add New Loan'}
            </button>
          )}
        </div>
      </div>

      {/* Top Menu Tabs */}
      <div className="db-nav-tabs">
        <button
          type="button"
          className={`db-nav-tab ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          <CalendarDays size={18} />
          <span>{bn ? 'দিনের লেনদেন' : 'Daily Transactions'}</span>
          {data?.feed?.length > 0 && <span className="tab-badge">{data.feed.length}</span>}
        </button>
        <button
          type="button"
          className={`db-nav-tab ${activeTab === 'loans' ? 'active' : ''}`}
          onClick={() => setActiveTab('loans')}
        >
          <Handshake size={18} />
          <span>{bn ? 'ঋণ / কর্জ ব্যবস্থাপনা' : 'Loan Tracker'}</span>
          {loans.length > 0 && <span className="tab-badge">{loans.length}</span>}
        </button>
      </div>

      {activeTab === 'daily' ? (
        <>
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
                  sub={`${s.invoiceCount} ${bn ? 'টি চালান' : 'invoices'}${s.totalDiscount > 0 ? ` · ${bn ? 'ছাড়' : 'discount'} ${money(s.totalDiscount)}` : ''}${s.customerReturns > 0 ? ` · ${bn ? 'রিটার্ন' : 'returns'} −${money(s.customerReturns)}` : ''}`}
                  // The owner sees how the figure becomes profit: what those goods
                  // cost, and what is left once that is taken off.
                  breakdown={isAdmin && data.cogs ? [
                    { l: bn ? 'বিক্রি' : 'Sold', v: money(s.netSalesAfterReturns ?? s.netSales) },
                    { l: bn ? 'ক্রয়মূল্য' : 'Cost', v: `−${money(data.cogs.netOfReturns ?? data.cogs.total)}`, tone: 'muted' },
                    { l: `${bn ? 'লাভ' : 'Profit'} ${Math.round(p.grossMargin)}%`, v: money(p.grossProfit), tone: p.grossProfit < 0 ? 'bad' : 'good' },
                  ] : null}
                  compare={cmp.netSales} />
                <Kpi bn={bn} icon={Banknote} tone="info"
                  label={bn ? 'টাকা এসেছে' : 'Received'} value={s.totalReceived}
                  sub={`${bn ? 'কাউন্টারে' : 'at counter'} ${money(s.paidAtCounter)} · ${bn ? 'বকেয়া আদায়' : 'dues'} ${money(s.dueCollected)}`}
                  compare={cmp.received} />
                <Kpi bn={bn} icon={Wallet} tone={s.dueCreated > 0 ? 'warning' : ''}
                  label={bn ? 'আজ বাকি হয়েছে' : 'Due Balance'} value={s.dueCreated}
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
                  <Kpi bn={bn} icon={Handshake} tone={todayLoans.count > 0 ? (todayLoans.out > 0 ? 'warning' : 'info') : ''}
                    label={bn ? 'কর্জ / ঋণ (আজকের)' : 'Loans Today'}
                    value={todayLoans.out > 0 ? -todayLoans.out : todayLoans.in}
                    sub={todayLoans.count > 0
                      ? `${bn ? 'প্রদান/পরিশোধ' : 'Out'} −${money(todayLoans.out)} · ${bn ? 'আদায়/গ্রহণ' : 'In'} +${money(todayLoans.in)}`
                      : (bn ? 'আজ কোনো কর্জ লেনদেন নেই' : 'No loan activity today')}
                  />
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
                      {feed.map((row, idx) => {
                        const k = KINDS[row.kind] || KINDS.cash;
                        const Icon = k.icon;
                        return (
                          <div key={`${row.kind}-${row.id}`} className={`db-row ${k.tone}`}>
                            <div className="db-row-sl">#{idx + 1}</div>
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
                            <div className="db-row-right">
                              <div className="db-row-actions">
                                {row.kind === 'sale' && <button className="btn-icon" title={bn ? 'চালান দেখুন / প্রিন্ট' : 'View / print invoice'} onClick={() => openInvoice(row.id)}><Eye size={16} /></button>}
                                {row.kind === 'sale' && row.due > 0 && <button className="btn-icon text-success" title={bn ? 'বকেয়া নিন' : 'Receive due'} onClick={() => openPay(row)}><Wallet size={16} /></button>}
                                {row.kind === 'expense' && isAdmin && <button className="btn-icon text-danger" title={bn ? 'মুছুন' : 'Delete'} onClick={() => removeExpense(row)}><Trash2 size={16} /></button>}
                              </div>
                              <div className="db-row-amount">
                                {row.due > 0 && <span className="due">({bn ? 'বাকি' : 'due'} {money(row.due)})</span>}
                                {row.due > 0 && (
                                  <span className="db-paid-amt">({bn ? 'জমা' : 'paid'} {money(row.paid || 0)})</span>
                                )}
                                {row.kind === 'sale' && row.due === 0 && row.paid > 0 && <span className="ok"><CheckCircle2 size={11} /> {bn ? 'পরিশোধিত' : 'paid'}</span>}
                                <span className={`amt ${row.flow}`}>{row.flow === 'out' ? '−' : row.flow === 'in' ? '+' : ''}{money(row.amount)}</span>
                              </div>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0 }}>{bn ? 'কর্জ / ঋণ হিসাব (আজ)' : 'Today\'s Loan Summary'}</h3>
                        <span className="badge badge-secondary">{todayLoans.count} {bn ? 'টি' : 'txns'}</span>
                      </div>
                      <div className="db-line">
                        <span className="text-muted">{bn ? 'কর্জ প্রদান / পরিশোধ (আউট)' : 'Loan Given / Paid (Out)'}</span>
                        <span className="num text-danger">{todayLoans.out > 0 ? `−${money(todayLoans.out)}` : money(0)}</span>
                      </div>
                      <div className="db-line">
                        <span className="text-muted">{bn ? 'কর্জ গ্রহণ / আদায় (ইন)' : 'Loan Taken / Collected (In)'}</span>
                        <span className="num text-success">{todayLoans.in > 0 ? `+${money(todayLoans.in)}` : money(0)}</span>
                      </div>
                      <div className="db-line total">
                        <span>{bn ? 'আজকের নেট কর্জ প্রভাব' : 'Net Loan Movement'}</span>
                        <span className={`num ${todayLoans.net < 0 ? 'text-danger' : todayLoans.net > 0 ? 'text-success' : ''}`}>
                          {todayLoans.net < 0 ? `−${money(Math.abs(todayLoans.net))}` : todayLoans.net > 0 ? `+${money(todayLoans.net)}` : money(0)}
                        </span>
                      </div>
                      <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                        <div className="db-line text-sm">
                          <span>{bn ? 'মোট বকেয়া কর্জ পাওনা' : 'Total Owed to You (Given)'}</span>
                          <span className="num text-success">{money(loanStats.givenRemaining)}</span>
                        </div>
                        <div className="db-line text-sm">
                          <span>{bn ? 'মোট বকেয়া কর্জ দেনা' : 'Total You Owe (Taken)'}</span>
                          <span className="num text-danger">{money(loanStats.takenRemaining)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="card db-panel">
                      <h3>{bn ? 'ক্যাশ চলাচল' : 'Cash movement'}</h3>
                      <div className="db-line"><span>{bn ? 'দিনের শুরুতে' : 'Opening'}</span><span className="num">{money(cf.openingTotal)}</span></div>
                      <div className="db-line"><span className="text-success">{bn ? 'এসেছে' : 'In'}</span><span className="num text-success">+{money(cf.inflow)}</span></div>
                      {todayLoans.in > 0 && <div className="db-line text-xs" style={{ paddingLeft: '0.75rem' }}><span className="text-muted">{bn ? '└ কর্জ থেকে এসেছে' : '└ from loan inflow'}</span><span className="num text-success">+{money(todayLoans.in)}</span></div>}
                      <div className="db-line"><span className="text-danger">{bn ? 'গেছে' : 'Out'}</span><span className="num text-danger">−{money(cf.outflow)}</span></div>
                      {todayLoans.out > 0 && <div className="db-line text-xs" style={{ paddingLeft: '0.75rem' }}><span className="text-muted">{bn ? '└ কর্জ বাবদ গেছে' : '└ to loan outflow'}</span><span className="num text-danger">−{money(todayLoans.out)}</span></div>}
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
                      {loanStats.givenRemaining > 0 && (
                        <div className="db-line"><span>{bn ? 'ব্যক্তিগত কর্জ পাওনা' : 'Loans given (owed to you)'}</span><span className="num text-success">{money(loanStats.givenRemaining)}</span></div>
                      )}
                      {loanStats.takenRemaining > 0 && (
                        <div className="db-line"><span>{bn ? 'ব্যক্তিগত কর্জ দেনা' : 'Loans taken (you owe)'}</span><span className="num text-danger">{money(loanStats.takenRemaining)}</span></div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Printable closing report */}
              <div id="printable-daybook" style={{ display: 'none' }}>
                <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '12px' }}>
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{shopProfile?.name || 'Allahr dan gents point'}</div>
                    <div style={{ fontSize: 13 }}>{bn ? 'দিন শেষের রিপোর্ট' : 'Day Closing Report'} — {pretty(date, false)}</div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                    <tbody>
                      {[
                        ['Sales', money(s.netSales), `${s.invoiceCount} invoices`],
                        ['Received', money(s.totalReceived), `counter ${money(s.paidAtCounter)} + dues ${money(s.dueCollected)}`],
                        ['Due Balance', money(s.dueCreated), ''],
                        ...(isAdmin ? [
                          ['Purchases', money(data.purchases.total), `paid ${money(data.purchases.paid + data.purchases.paidLater)}`],
                          ['Expenses', money(data.expenses.total), ''],
                          ['Loans given / paid (Out)', money(todayLoans.out), `${todayLoans.count} loan txns`],
                          ['Loans received / collected (In)', money(todayLoans.in), ''],
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
                        {['SL', 'Time', 'Type', 'Party', 'Details', 'Ref', 'Due', 'Paid', 'Total'].map((h) => <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: h === 'Total' || h === 'Paid' || h === 'Due' ? 'right' : h === 'SL' ? 'center' : 'left' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.feed.map((row, idx) => (
                        <tr key={`${row.kind}-${row.id}`}>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.time || ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{KINDS[row.kind]?.en || row.kind}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.party}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.title}{row.method ? ` (${row.method})` : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', fontSize: 9 }}>{row.id}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', color: row.due > 0 ? '#dc2626' : undefined }}>{row.due > 0 ? money(row.due) : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', color: '#059669' }}>{row.paid !== undefined ? money(row.paid) : money(row.amount)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>{row.flow === 'out' ? '-' : ''}{money(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ========================================================== */
        /* LOAN / কর্জ ব্যবস্থাপনা VIEW (Isolated from Accounts)     */
        /* ========================================================== */
        <div className="loan-container animate-fade-in">
          {/* Summary KPIs */}
          <div className="loan-kpis">
            <div className="db-kpi danger">
              <div className="db-kpi-top">
                <span className="db-kpi-label">{bn ? 'কর্জ প্রদান (আমরা দিয়েছি)' : 'Loan Given (We Lent)'}</span>
                <span className="db-kpi-icon"><ArrowUpCircle size={16} /></span>
              </div>
              <div className="db-kpi-value">{money(loanStats.totalGiven)}</div>
              <div className="db-kpi-sub" style={{ color: '#ef4444', fontWeight: 600 }}>
                {bn ? `বাকি পাওনা: ${money(loanStats.givenRemaining)}` : `Remaining: ${money(loanStats.givenRemaining)}`}
              </div>
            </div>

            <div className="db-kpi info">
              <div className="db-kpi-top">
                <span className="db-kpi-label">{bn ? 'কর্জ গ্রহণ (আমরা নিয়েছি)' : 'Loan Taken (We Borrowed)'}</span>
                <span className="db-kpi-icon"><ArrowDownCircle size={16} /></span>
              </div>
              <div className="db-kpi-value">{money(loanStats.totalTaken)}</div>
              <div className="db-kpi-sub" style={{ color: '#2563eb', fontWeight: 600 }}>
                {bn ? `বাকি দেনা: ${money(loanStats.takenRemaining)}` : `Remaining: ${money(loanStats.takenRemaining)}`}
              </div>
            </div>

            <div className="db-kpi success">
              <div className="db-kpi-top">
                <span className="db-kpi-label">{bn ? 'পরিশোধিত ঋণ' : 'Settled Loans'}</span>
                <span className="db-kpi-icon"><CheckCircle2 size={16} /></span>
              </div>
              <div className="db-kpi-value">{loanStats.totalSettledCount}</div>
              <div className="db-kpi-sub">
                {bn ? `চলমান ঋণ: ${loanStats.activeCount} টি` : `Active loans: ${loanStats.activeCount}`}
              </div>
            </div>
          </div>

          <div className="alert-banner" style={{ background: 'var(--bg-muted)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '0.65rem 1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            💡 <strong>{bn ? 'নোট:' : 'Note:'}</strong> {bn ? 'কর্জের টাকা সরাসরি মূল একাউন্ট (ক্যাশ/ব্যাংক)-এর সাথে সমন্বয় (প্লাস/মাইনাস) হয়।' : 'Loan transactions are directly integrated (plus/minus) with the main account (Cash/Bank).'}
          </div>

          {/* Filters, Search & Add button */}
          <div className="card db-feed-card">
            <div className="db-feed-head">
              <div className="db-chips">
                {[
                  { key: 'all', bn: 'সব', en: 'All', count: loans.length },
                  { key: 'given', bn: 'কর্জ দেওয়া', en: 'Given', count: loans.filter((l) => l.type === 'given').length },
                  { key: 'taken', bn: 'কর্জ নেওয়া', en: 'Taken', count: loans.filter((l) => l.type === 'taken').length },
                  { key: 'active', bn: 'বকেয়া আছে', en: 'Due / Active', count: loans.filter((l) => l.status === 'active').length },
                  { key: 'settled', bn: 'পরিশোধিত', en: 'Settled', count: loans.filter((l) => l.status === 'settled').length },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`db-chip ${loanFilter === f.key ? 'active' : ''}`}
                    onClick={() => setLoanFilter(f.key)}
                  >
                    {bn ? f.bn : f.en} <span className="n">{f.count}</span>
                  </button>
                ))}
              </div>

              <div className="flex-align-gap">
                <div className="db-search">
                  <Search size={14} />
                  <input
                    value={loanSearch}
                    onChange={(e) => setLoanSearch(e.target.value)}
                    placeholder={bn ? 'নাম, ফোন নম্বর…' : 'Search name, phone…'}
                  />
                </div>
                <button className="btn-primary btn-sm flex-align-gap" onClick={() => setLoanDrawer(true)}>
                  <Plus size={15} /> {bn ? 'নতুন ঋণ' : 'Add Loan'}
                </button>
              </div>
            </div>

            {/* Loans Table */}
            {filteredLoans.length === 0 ? (
              <div className="db-empty">
                <Handshake size={42} />
                <p>{bn ? 'কোনো ঋণের রেকর্ড পাওয়া যায়নি।' : 'No loan records found.'}</p>
                <button className="btn-outline btn-sm" onClick={() => setLoanDrawer(true)}>
                  <Plus size={14} /> {bn ? 'নতুন ঋণ যোগ করুন' : 'Add New Loan'}
                </button>
              </div>
            ) : (
              <div className="loan-table-wrapper">
                <table className="loan-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'ধরন' : 'Type'}</th>
                      <th>{bn ? 'তারিখ' : 'Date'}</th>
                      <th>{bn ? 'ব্যক্তির নাম ও ফোন' : 'Person / Phone'}</th>
                      <th>{bn ? 'মূল ঋণ' : 'Original Amount'}</th>
                      <th>{bn ? 'পরিশোধিত' : 'Paid Amount'}</th>
                      <th>{bn ? 'অবশিষ্ট পাওনা/দেনা' : 'Remaining Due'}</th>
                      <th>{bn ? 'স্ট্যাটাস' : 'Status'}</th>
                      <th>{bn ? 'বিবরণ/নোট' : 'Note'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'অ্যাকশন' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map((loan) => {
                      const isGiven = loan.type === 'given';
                      const isSettled = loan.status === 'settled' || loan.remainingAmount <= 0.01;
                      return (
                        <tr key={loan.id}>
                          <td>
                            {isGiven ? (
                              <span className="loan-badge-given">
                                <ArrowUpCircle size={12} /> {bn ? 'কর্জ দেওয়া' : 'Given'}
                              </span>
                            ) : (
                              <span className="loan-badge-taken">
                                <ArrowDownCircle size={12} /> {bn ? 'কর্জ নেওয়া' : 'Taken'}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>
                            {loan.date || '—'}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{loan.name}</div>
                            {loan.phone && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                                <Phone size={11} /> {loan.phone}
                              </div>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {money(loan.amount)}
                          </td>
                          <td style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {money(loan.paidAmount || 0)}
                          </td>
                          <td style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isSettled ? 'var(--text-muted)' : (isGiven ? '#dc2626' : '#2563eb') }}>
                            {money(loan.remainingAmount)}
                          </td>
                          <td>
                            {isSettled ? (
                              <span className="loan-badge-settled">
                                <CheckCircle2 size={12} /> {bn ? 'পরিশোধিত' : 'Settled'}
                              </span>
                            ) : (
                              <span className="loan-badge-active">
                                <Clock size={12} /> {bn ? 'চলমান' : 'Active'}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                            {loan.note || '—'}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              {!isSettled && (
                                <button
                                  type="button"
                                  className="loan-pay-btn"
                                  onClick={() => openLoanPay(loan)}
                                  title={bn ? 'টাকা পরিশোধ / জমা আপডেট' : 'Update Payment'}
                                >
                                  <DollarSign size={13} /> {bn ? 'Pay' : 'Pay'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-icon text-danger"
                                onClick={() => handleDeleteLoan(loan)}
                                title={bn ? 'মুছুন' : 'Delete'}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
            <div className="drawer-footer" style={{ justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn-outline flex-align-gap"
                onClick={() => downloadElementAsPDF('printable-daybook-invoice', `Invoice-${selected.id}`)}
                title="Download A4 size invoice as PDF"
              >
                <Download size={16} /> {bn ? 'A4 PDF ডাউনলোড' : 'A4 Download PDF'}
              </button>
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
        <div className="drawer-overlay" onClick={() => setPay(null)}>
          <div className="drawer-container" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0 }}>{bn ? 'বকেয়া নিন' : 'Receive due'}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setPay(null)}><X size={22} /></button>
            </div>
            <form onSubmit={submitPay} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
              <div className="drawer-footer" style={{ flexShrink: 0 }}>
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
        <div className="drawer-overlay" onClick={() => setExpenseForm(null)}>
          <div className="drawer-container" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0 }}>{bn ? 'খরচ লিখুন' : 'Add expense'}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setExpenseForm(null)}><X size={22} /></button>
            </div>
            <form onSubmit={submitExpense} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
              <div className="drawer-footer" style={{ flexShrink: 0 }}>
                <button type="button" className="btn-outline" onClick={() => setExpenseForm(null)}>{bn ? 'বাতিল' : 'Cancel'}</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : (bn ? 'সংরক্ষণ' : 'Save')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Add Loan Drawer */}
      {loanDrawer && createPortal(
        <div className="drawer-overlay" onClick={() => setLoanDrawer(false)}>
          <div className="drawer-container" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Handshake size={20} /> {bn ? 'নতুন ঋণ / কর্জ যোগ করুন' : 'Add New Loan'}
              </h2>
              <button type="button" className="drawer-close-btn" onClick={() => setLoanDrawer(false)}>
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {/* Loan Type selector */}
                <label>{bn ? 'ঋণের ধরন' : 'Loan Type'} *</label>
                <div className="loan-type-selector">
                  <button
                    type="button"
                    className={`loan-type-btn ${loanForm.type === 'given' ? 'active-given' : ''}`}
                    onClick={() => setLoanForm({ ...loanForm, type: 'given' })}
                  >
                    <ArrowUpCircle size={16} />
                    {bn ? 'কর্জ দেওয়া (আমরা দিয়েছি)' : 'Loan Given'}
                  </button>
                  <button
                    type="button"
                    className={`loan-type-btn ${loanForm.type === 'taken' ? 'active-taken' : ''}`}
                    onClick={() => setLoanForm({ ...loanForm, type: 'taken' })}
                  >
                    <ArrowDownCircle size={16} />
                    {bn ? 'কর্জ নেওয়া (আমরা নিয়েছি)' : 'Loan Taken'}
                  </button>
                </div>

                {/* Name */}
                <label style={{ marginTop: '1rem' }}>
                  {bn ? 'ব্যক্তি বা প্রতিষ্ঠানের নাম' : 'Person / Organization Name'} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={loanForm.name}
                  onChange={(e) => setLoanForm({ ...loanForm, name: e.target.value })}
                  placeholder={bn ? 'নাম লিখুন (বাধ্যতামূলক)' : 'Enter name (required)'}
                  required
                  autoFocus
                />

                {/* Phone */}
                <label>{bn ? 'ফোন নম্বর' : 'Phone Number'}</label>
                <input
                  type="tel"
                  value={loanForm.phone}
                  onChange={(e) => setLoanForm({ ...loanForm, phone: e.target.value })}
                  placeholder={bn ? '০১৭xxxxxxxx (ঐচ্ছিক)' : '017xxxxxxxx (optional)'}
                />

                {/* Account */}
                <label style={{ marginTop: '0.6rem' }}>{bn ? 'লেনদেনের মাধ্যম / একাউন্ট' : 'Account'} *</label>
                <select
                  value={loanForm.account || 'Cash'}
                  onChange={(e) => setLoanForm({ ...loanForm, account: e.target.value })}
                >
                  <option value="Cash">Cash in Hand (নগদ ক্যাশ)</option>
                  <option value="Bank">Bank Account (ব্যাংক একাউন্ট)</option>
                </select>

                {/* Amount */}
                <label style={{ marginTop: '0.6rem' }}>
                  {bn ? 'টাকার পরিমাণ' : 'Amount'} (BDT) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  value={loanForm.amount}
                  onChange={(e) => setLoanForm({ ...loanForm, amount: e.target.value })}
                  min="1"
                  step="any"
                  placeholder="0.00"
                  required
                />

                {/* Date */}
                <label>{bn ? 'তারিখ' : 'Date'}</label>
                <input
                  type="date"
                  value={loanForm.date}
                  onChange={(e) => setLoanForm({ ...loanForm, date: e.target.value })}
                />

                {/* Note */}
                <label>{bn ? 'নোট বা বিবরণ' : 'Note / Description'}</label>
                <textarea
                  rows="2"
                  value={loanForm.note}
                  onChange={(e) => setLoanForm({ ...loanForm, note: e.target.value })}
                  placeholder={bn ? 'কর্জের উদ্দেশ্য বা বিবরণ (ঐচ্ছিক)' : 'Loan purpose/details (optional)'}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="drawer-footer" style={{ flexShrink: 0 }}>
                <button type="button" className="btn-outline" onClick={() => setLoanDrawer(false)}>
                  {bn ? 'বাতিল' : 'Cancel'}
                </button>
                <button type="submit" className="btn-primary">
                  {bn ? 'ঋণ সংরক্ষণ করুন' : 'Save Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Pay Loan Modal */}
      {loanPayTarget && createPortal(
        <div className="drawer-overlay" onClick={() => setLoanPayTarget(null)}>
          <div className="drawer-container" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <DollarSign size={20} />
                {loanPayTarget.type === 'given'
                  ? (bn ? 'কর্জের টাকা আদায় / গ্রহণ' : 'Receive Loan Repayment')
                  : (bn ? 'কর্জের টাকা পরিশোধ / প্রদান' : 'Pay Borrowed Loan')}
              </h2>
              <button type="button" className="drawer-close-btn" onClick={() => setLoanPayTarget(null)}>
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleLoanPaySubmit} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div className="mb-4" style={{ lineHeight: 1.8, padding: '0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <span className="text-muted">{bn ? 'ব্যক্তি' : 'Person'}:</span>{' '}
                    <strong>{loanPayTarget.name}</strong>
                  </div>
                  <div>
                    <span className="text-muted">{bn ? 'ধরন' : 'Type'}:</span>{' '}
                    {loanPayTarget.type === 'given' ? (
                      <span className="loan-badge-given" style={{ padding: '0.1rem 0.4rem' }}>{bn ? 'কর্জ দেওয়া' : 'Given'}</span>
                    ) : (
                      <span className="loan-badge-taken" style={{ padding: '0.1rem 0.4rem' }}>{bn ? 'কর্জ নেওয়া' : 'Taken'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted">{bn ? 'মূল ঋণ' : 'Original Amount'}:</span>{' '}
                    <strong>{money(loanPayTarget.amount)}</strong>
                  </div>
                  <div>
                    <span className="text-muted">{bn ? 'ইতোমধ্যে পরিশোধ' : 'Already Paid'}:</span>{' '}
                    <span className="text-success" style={{ fontWeight: 600 }}>{money(loanPayTarget.paidAmount || 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted">{bn ? 'অবশিষ্ট পাওনা/দেনা' : 'Remaining Due'}:</span>{' '}
                    <strong className="text-danger" style={{ fontSize: '1rem' }}>{money(loanPayTarget.remainingAmount)}</strong>
                  </div>
                </div>

                <label>{bn ? 'লেনদেনের মাধ্যম / একাউন্ট' : 'Account'} *</label>
                <select
                  value={loanPayAccount}
                  onChange={(e) => setLoanPayAccount(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                >
                  <option value="Cash">Cash in Hand (নগদ ক্যাশ)</option>
                  <option value="Bank">Bank Account (ব্যাংক একাউন্ট)</option>
                </select>

                <label>
                  {loanPayTarget.type === 'given' ? (bn ? 'আদায়কৃত টাকার পরিমাণ' : 'Amount Received') : (bn ? 'পরিশোধিত টাকার পরিমাণ' : 'Amount Paid')} (BDT) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  value={loanPayAmount}
                  onChange={(e) => setLoanPayAmount(e.target.value)}
                  min="1"
                  max={loanPayTarget.remainingAmount}
                  step="any"
                  required
                  autoFocus
                />

                <label>{bn ? 'তারিখ' : 'Date'}</label>
                <input
                  type="date"
                  value={loanPayDate}
                  onChange={(e) => setLoanPayDate(e.target.value)}
                />

                <label>{bn ? 'পেমেন্ট সংক্রান্ত নোট' : 'Payment Note'}</label>
                <input
                  type="text"
                  value={loanPayNote}
                  onChange={(e) => setLoanPayNote(e.target.value)}
                  placeholder={bn ? 'নগদ / বিকাশ / ব্যাংক ইত্যাদি (ঐচ্ছিক)' : 'Cash / bKash / bank etc (optional)'}
                />
              </div>

              <div className="drawer-footer" style={{ flexShrink: 0 }}>
                <button type="button" className="btn-outline" onClick={() => setLoanPayTarget(null)}>
                  {bn ? 'বাতিল' : 'Cancel'}
                </button>
                <button type="submit" className="btn-primary">
                  {bn ? 'পরিশোধ আপডেট করুন' : 'Update Payment'}
                </button>
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
