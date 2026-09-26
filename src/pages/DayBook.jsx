import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, CalendarDays, RefreshCcw, Printer, ShoppingCart, Truck,
  DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, Landmark, Users,
  TrendingUp, TrendingDown, Banknote, Eye, Trash2, Plus, Minus, Scale, X, CheckCircle2, Search,
  Handshake, Phone, ArrowUpCircle, ArrowDownCircle, FileText, Check, AlertCircle, History, Clock, Download,
} from 'lucide-react';
import useStore from '../store/useStore';
import { ActivityLogService } from '../api/services';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import InvoiceDocument, { fromApiInvoice } from '../components/InvoiceDocument';
import { DEFAULT_SHOP_ADDRESS } from '../utils/shopConfig';
import './DayBook.css';
import { formatDate, formatLongDate } from '../utils/date';

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
const pretty = (iso, bn) => formatLongDate(iso, bn, '—');

/** How each kind of row looks: icon, colour, label. */
const KINDS = {
  sale: { icon: ShoppingCart, tone: 'success', en: 'Sale', bn: 'বিক্রি' },
  collection: { icon: ArrowDownLeft, tone: 'info', en: 'Due collected', bn: 'বকেয়া আদায়' },
  recovery: { icon: ArrowDownLeft, tone: 'info', en: 'Staff due recovery', bn: 'কর্মী বকেয়া আদায়' },
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
const Kpi = ({ label, value, sub, compare, tone = '', icon: Icon, bn, abs = false, breakdown = null, isCount = false, countSuffix = '' }) => {
  const delta = compare !== undefined && compare !== null ? Number(value) - Number(compare) : null;
  const suffix = countSuffix || (bn ? 'জন' : '');
  const shown = isCount
    ? `${Number(value) || 0} ${suffix}`
    : money(abs ? Math.abs(Number(value) || 0) : value);
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
          {delta === 0
            ? (bn ? 'গতকালের সমান' : 'same as yesterday')
            : isCount
              ? `${delta > 0 ? '+' : ''}${delta} ${suffix} ${bn ? 'গতকালের চেয়ে' : 'vs yesterday'}`
              : `${delta > 0 ? '+' : ''}${money(delta)} ${bn ? 'গতকালের চেয়ে' : 'vs yesterday'}`}
        </div>
      )}
    </div>
  );
};

const DayBook = () => {
  const {
    user, language, shopProfile, sales, customers, staff, expenseCategories, expenses,
    fetchDayBook, addExpense, deleteExpense, payInvoiceDue, refresh,
    loans, fetchLoans, addLoan, payLoan, deleteLoan, deleteLoanPayment, importLocalLoans,
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
  const [expenseForm, setExpenseForm] = useState(null);  // { category, amount, description, staffId }
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
    const DEFAULT_CATS = ['Shop Rent', 'Electricity Bill', 'Transport', 'Staff Cost', 'Marketing', 'Others'];
    const fromApi = (expenseCategories || []).map((c) => (typeof c === 'string' ? c : c.name));
    const fromRows = (expenses || []).map((e) => e.category);
    return [...new Set([...DEFAULT_CATS, ...fromApi, ...fromRows].filter(Boolean))];
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
      date,
      category: expenseForm.category,
      amount,
      staff: expenseForm.staffId || undefined,
      staffId: expenseForm.staffId || undefined,
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
  const [loanAdjustDrawer, setLoanAdjustDrawer] = useState(false);
  const [loanAdjustTab, setLoanAdjustTab] = useState('old'); // 'old' | 'adjust'
  const [loanHistoryTarget, setLoanHistoryTarget] = useState(null);
  const [loanFilter, setLoanFilter] = useState('all'); // 'all', 'given', 'taken', 'active', 'settled'
  const [loanViewMode, setLoanViewMode] = useState('grouped'); // 'grouped' (ডিফল্ট: ১ ব্যক্তি ১ সারি) | 'detailed' (আলাদা এন্ট্রি)
  const [loanSearch, setLoanSearch] = useState('');
  const [loanPayTarget, setLoanPayTarget] = useState(null);
  const [loanPayAccount, setLoanPayAccount] = useState('Cash');
  const [loanPayAmount, setLoanPayAmount] = useState('');
  const [loanPayNote, setLoanPayNote] = useState('');
  const [loanPayDate, setLoanPayDate] = useState(today);

  const [loanForm, setLoanForm] = useState({
    type: 'given', // 'given' (দেওয়া) or 'taken' (নেওয়া)
    account: 'Cash', // all loans move drawer cash; the shop keeps no bank
    name: '',
    phone: '',
    amount: '',
    note: '',
    date: today,
  });

  const [oldLoanForm, setOldLoanForm] = useState({
    type: 'given',
    name: '',
    phone: '',
    amount: '',
    alreadyPaid: '',
    account: 'Cash',
    date: today,
    note: '',
    affectCash: false,
  });

  const [adjustForm, setAdjustForm] = useState({
    loanId: '',
    type: 'decrease', // 'decrease' (-) or 'increase' (+)
    amount: '',
    account: 'Cash',
    date: today,
    note: '',
    affectCash: true,
  });

  // Quick Plus (+) and Minus (-) Adjustments for loans (same name)
  const [quickAdjustTarget, setQuickAdjustTarget] = useState(null);
  const [quickAdjustType, setQuickAdjustType] = useState('increase'); // 'increase' (+) | 'decrease' (-)
  const [quickAdjustAmount, setQuickAdjustAmount] = useState('');
  const [quickAdjustAccount, setQuickAdjustAccount] = useState('Cash');
  const [quickAdjustDate, setQuickAdjustDate] = useState(today);
  const [quickAdjustNote, setQuickAdjustNote] = useState('');

  // Group loans by normalized person name and loan type (one single row per person)
  const groupedLoans = useMemo(() => {
    const groups = {};

    loans.forEach((loan) => {
      const normName = (loan.name || '').trim() || loan.id || 'Unnamed';
      const key = `${normName.toLowerCase()}___${loan.type}`;

      if (!groups[key]) {
        groups[key] = {
          id: loan.id,
          key,
          name: normName,
          phone: loan.phone || '',
          type: loan.type,
          account: loan.account || 'Cash',
          date: loan.date || '',
          note: loan.note || '',
          amount: 0,
          paidAmount: 0,
          remainingAmount: 0,
          status: 'settled',
          loans: [],
          payments: [],
        };
      }

      const g = groups[key];
      g.loans.push(loan);

      if (!g.phone && loan.phone) g.phone = loan.phone;
      if (loan.date) {
        if (!g.date || String(loan.date).localeCompare(String(g.date)) > 0) {
          g.date = loan.date;
        }
      }

      g.amount += Number(loan.amount) || 0;
      g.paidAmount += Number(loan.paidAmount) || 0;
      g.remainingAmount += Number(loan.remainingAmount) || 0;

      if (Array.isArray(loan.payments)) {
        loan.payments.forEach((p) => {
          g.payments.push({
            ...p,
            loanId: loan.id,
          });
        });
      }
    });

    return Object.values(groups).map((g) => {
      g.amount = Math.round(g.amount * 100) / 100;
      g.paidAmount = Math.round(g.paidAmount * 100) / 100;
      g.remainingAmount = Math.max(0, Math.round(g.remainingAmount * 100) / 100);
      g.status = g.remainingAmount <= 0.01 ? 'settled' : 'active';
      g.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
      return g;
    });
  }, [loans]);

  // Keep history and quick adjust modals up to date with latest loan data
  useEffect(() => {
    if (loanHistoryTarget) {
      const targetName = (loanHistoryTarget.name || '').trim().toLowerCase();
      const refreshed = (loanViewMode === 'grouped' ? groupedLoans : loans).find(
        (l) => (l.name || '').trim().toLowerCase() === targetName && l.type === loanHistoryTarget.type
      );
      if (refreshed) setLoanHistoryTarget(refreshed);
    }
    if (quickAdjustTarget) {
      const targetName = (quickAdjustTarget.name || '').trim().toLowerCase();
      const refreshed = (loanViewMode === 'grouped' ? groupedLoans : loans).find(
        (l) => (l.name || '').trim().toLowerCase() === targetName && l.type === quickAdjustTarget.type
      );
      if (refreshed) setQuickAdjustTarget(refreshed);
    }
  }, [loans, groupedLoans, loanViewMode]);

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
      ? `ঋণ সংরক্ষণ ও ক্যাশ একাউন্টে ${isGiven ? 'মাইনাস' : 'প্লাস'} করা হয়েছে`
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

  const handleOldLoanSubmit = async (e) => {
    e.preventDefault();
    const name = (oldLoanForm.name || '').trim();
    const amount = parseFloat(oldLoanForm.amount);
    const alreadyPaid = parseFloat(oldLoanForm.alreadyPaid) || 0;
    const account = oldLoanForm.account || 'Cash';
    const date = oldLoanForm.date || today;
    const note = (oldLoanForm.note || '').trim();

    if (!name) {
      toast.error(bn ? 'নাম লিখুন (বাধ্যতামূলক)' : 'Name is required');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error(bn ? 'সঠিক মূল ঋণের পরিমাণ লিখুন' : 'Valid original amount is required');
      return;
    }
    if (alreadyPaid > amount) {
      toast.error(bn ? 'ইতোমধ্যে পরিশোধিত টাকা মূল ঋণের চেয়ে বেশি হতে পারে না' : 'Already paid cannot exceed original amount');
      return;
    }

    setSaving(true);
    if (oldLoanForm.affectCash) {
      const res = await addLoan({
        type: oldLoanForm.type,
        account,
        name,
        phone: (oldLoanForm.phone || '').trim(),
        amount,
        note: note ? `[পুরাতন হিসাব] ${note}` : '[পুরাতন হিসাব]',
        date,
      });
      if (res?.ok && alreadyPaid > 0) {
        await fetchLoans();
        const updated = useStore.getState().loans;
        const created = updated.find(l => l.name === name && Math.abs(l.amount - amount) < 0.01);
        if (created) {
          await payLoan(created.id, {
            amount: alreadyPaid,
            account,
            date,
            note: 'পূর্বে পরিশোধিত কিস্তি',
          }, { name });
        }
      }
    } else {
      const oldCode = `LN-OLD-${Date.now().toString().slice(-6)}`;
      const payments = alreadyPaid > 0 ? [{
        id: `LP-OLD-${Date.now().toString().slice(-6)}`,
        amount: alreadyPaid,
        account,
        date,
        note: 'পূর্বে পরিশোধিত কিস্তি',
      }] : [];

      const res = await importLocalLoans([{
        id: oldCode,
        type: oldLoanForm.type,
        name,
        phone: (oldLoanForm.phone || '').trim(),
        amount,
        account,
        date,
        note: note ? `[পুরাতন হিসাব] ${note}` : '[পুরাতন হিসাব / প্রারম্ভিক রেকর্ড]',
        payments,
      }]);

      if (res?.ok) {
        ActivityLogService.logCustom({
          action: 'CREATE',
          module: 'LOAN',
          description: `পুরাতন ঋণ এন্ট্রি: ৳${amount} (${name}) - বকেয়া: ৳${amount - alreadyPaid} [ক্যাশ ড্রয়ার অপরিবর্তিত]`,
          details: { name, amount, alreadyPaid, type: oldLoanForm.type, affectCash: false },
        }).catch(() => {});
      }
    }
    setSaving(false);

    toast.success(bn ? 'পুরাতন ঋণের হিসাব সফলভাবে সংরক্ষিত হয়েছে' : 'Old loan record saved successfully');
    setLoanAdjustDrawer(false);
    setOldLoanForm({
      type: 'given',
      name: '',
      phone: '',
      amount: '',
      alreadyPaid: '',
      account: 'Cash',
      date: today,
      note: '',
      affectCash: false,
    });
    load(true);
  };

  const handleLoanAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustForm.loanId) {
      toast.error(bn ? 'অনুগ্রহ করে ঋণ নির্বাচন করুন' : 'Please select a loan');
      return;
    }
    const targetLoan = loans.find(l => l.id === adjustForm.loanId);
    if (!targetLoan) return;

    const amount = parseFloat(adjustForm.amount);
    if (!amount || amount <= 0) {
      toast.error(bn ? 'সঠিক টাকার পরিমাণ লিখুন' : 'Valid amount is required');
      return;
    }

    setSaving(true);
    if (adjustForm.type === 'decrease') {
      if (amount > targetLoan.remainingAmount + 0.001) {
        toast.error(bn ? `সর্বোচ্চ সমন্বয়যোগ্য বকেয়া ${money(targetLoan.remainingAmount)}` : `Maximum adjustable due is ${money(targetLoan.remainingAmount)}`);
        setSaving(false);
        return;
      }
      const res = await payLoan(targetLoan.id, {
        amount,
        account: adjustForm.account || 'Cash',
        date: adjustForm.date || today,
        note: `[ব্যালেন্স হ্রাস / সমন্বয়] ${adjustForm.note || ''}`.trim(),
      }, { name: targetLoan.name });
      if (res?.ok) {
        toast.success(bn ? `ঋণ থেকে ${money(amount)} হ্রাস / সমন্বয় করা হয়েছে` : `Loan reduced by ${money(amount)}`);
      }
    } else {
      const res = await addLoan({
        type: targetLoan.type,
        account: adjustForm.account || 'Cash',
        name: targetLoan.name,
        phone: targetLoan.phone || '',
        amount,
        note: `[ঋণ বৃদ্ধি (+)] মূল ঋণ: ${targetLoan.id} - ${adjustForm.note || ''}`.trim(),
        date: adjustForm.date || today,
      });
      if (res?.ok) {
        toast.success(bn ? `নতুন করে ${money(amount)} ঋণ বৃদ্ধি করা হয়েছে` : `Loan increased by ${money(amount)}`);
      }
    }
    setSaving(false);
    setLoanAdjustDrawer(false);
    setAdjustForm({
      loanId: '',
      type: 'decrease',
      amount: '',
      account: 'Cash',
      date: today,
      note: '',
      affectCash: true,
    });
    load(true);
  };

  const openLoanAdjustModal = (loan, type = 'increase') => {
    setQuickAdjustTarget(loan);
    setQuickAdjustType(type);
    setQuickAdjustAmount(type === 'decrease' ? String(loan.remainingAmount || '') : '');
    setQuickAdjustAccount(loan.account || 'Cash');
    setQuickAdjustDate(today);
    setQuickAdjustNote('');
  };

  const handleQuickAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!quickAdjustTarget) return;

    const amount = parseFloat(quickAdjustAmount);
    if (!amount || amount <= 0) {
      toast.error(bn ? 'সঠিক টাকার পরিমাণ লিখুন' : 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    if (quickAdjustType === 'decrease') {
      if (amount > quickAdjustTarget.remainingAmount + 0.001) {
        toast.error(bn ? `সর্বোচ্চ সমন্বয়যোগ্য বকেয়া ${money(quickAdjustTarget.remainingAmount)}` : `Maximum payable is ${money(quickAdjustTarget.remainingAmount)}`);
        setSaving(false);
        return;
      }

      // Distribute repayment across active sub-loans for this person
      const subLoans = quickAdjustTarget.loans && quickAdjustTarget.loans.length > 0
        ? quickAdjustTarget.loans
        : [quickAdjustTarget];
      const activeSubs = subLoans.filter(l => (Number(l.remainingAmount) || 0) > 0.001);
      let toPay = amount;

      for (const targetSub of activeSubs) {
        if (toPay <= 0.001) break;
        const chunk = Math.min(toPay, Number(targetSub.remainingAmount) || 0);
        await payLoan(targetSub.id, {
          amount: chunk,
          account: quickAdjustAccount || 'Cash',
          date: quickAdjustDate || today,
          note: (quickAdjustNote || '').trim() || (bn ? '[ঋণ হ্রাস / কিস্তি পরিশোধ]' : '[Repayment / Decrease]'),
        }, { name: quickAdjustTarget.name });
        toPay -= chunk;
      }

      setSaving(false);
      toast.success(bn
        ? `${quickAdjustTarget.name}-এর ঋণ থেকে ${money(amount)} পরিশোধ / হ্রাস করা হয়েছে`
        : `Recorded repayment of ${money(amount)} for ${quickAdjustTarget.name}`);
      setQuickAdjustTarget(null);
      load(true);
    } else {
      const res = await addLoan({
        type: quickAdjustTarget.type,
        account: quickAdjustAccount || 'Cash',
        name: quickAdjustTarget.name,
        phone: quickAdjustTarget.phone || '',
        amount,
        note: (quickAdjustNote || '').trim()
          ? `[কর্জ বৃদ্ধি (+)] ${quickAdjustNote}`
          : `[কর্জ বৃদ্ধি (+)] ${quickAdjustTarget.name}`,
        date: quickAdjustDate || today,
      });
      setSaving(false);
      if (res?.ok) {
        toast.success(bn
          ? `${quickAdjustTarget.name}-এর নামে ${money(amount)} ঋণ বৃদ্ধি করা হয়েছে`
          : `Loan increased by ${money(amount)} for ${quickAdjustTarget.name}`);
        setQuickAdjustTarget(null);
        load(true);
      }
    }
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
    const subLoans = loanPayTarget.loans && loanPayTarget.loans.length > 0
      ? loanPayTarget.loans
      : [loanPayTarget];
    const activeSubs = subLoans.filter(l => (Number(l.remainingAmount) || 0) > 0.001);
    let toPay = payAmt;

    for (const targetSub of activeSubs) {
      if (toPay <= 0.001) break;
      const chunk = Math.min(toPay, Number(targetSub.remainingAmount) || 0);
      await payLoan(targetSub.id, {
        amount: chunk,
        account,
        date: loanPayDate || today,
        note: (loanPayNote || '').trim() || (bn ? 'কিস্তি পরিশোধ' : 'Loan Repayment'),
      }, { name: loanPayTarget.name });
      toPay -= chunk;
    }
    setSaving(false);

    toast.success(bn
      ? `${money(payAmt)} পরিশোধ এবং ক্যাশ একাউন্টে ${isGiven ? 'প্লাস' : 'মাইনাস'} করা হয়েছে`
      : `Payment of ${money(payAmt)} recorded and updated in ${account}`);
    setLoanPayTarget(null);
    load(true);
  };

  const handleDeleteLoanPayment = async (loan, payment) => {
    const ok = await showConfirmDialog({
      title: bn ? 'কিস্তির রেকর্ডটি মুছে ফেলবেন?' : 'Delete payment installment?',
      text: `${bn ? 'টাকার পরিমাণ' : 'Amount'}: ${money(payment.amount)} (${bn ? 'তারিখ' : 'Date'}: ${formatDate(payment.date)}). ${bn ? 'মেইন একাউন্টের ব্যালেন্স স্বয়ংক্রিয়ভাবে সমন্বয় হয়ে যাবে।' : 'Account balance will be restored automatically.'}`,
      confirmButtonText: bn ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: bn ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (!ok) return;

    setSaving(true);
    const res = await deleteLoanPayment(loan.id, payment.id, { name: loan.name, amount: payment.amount });
    setSaving(false);
    if (!res?.ok) return;
    toast.success(bn ? 'কিস্তির রেকর্ড মুছে ফেলা হয়েছে' : 'Installment record deleted');
    load(true);
  };

  const handleDeleteLoan = async (loan) => {
    const subLoans = loan.loans && loan.loans.length > 0 ? loan.loans : [loan];
    const ok = await showConfirmDialog({
      title: bn ? 'ঋণ রেকর্ডটি মুছে ফেলবেন?' : 'Delete loan record?',
      text: `${loan.name} — ${money(loan.amount)} (${subLoans.length > 1 ? `${subLoans.length}টি এন্ট্রি` : (loan.type === 'given' ? (bn ? 'দেওয়া' : 'Given') : (bn ? 'নেওয়া' : 'Taken'))}). ${bn ? 'মেইন একাউন্টের ব্যালেন্স ও লেনদেন স্বয়ংক্রিয়ভাবে সমন্বয় হয়ে যাবে।' : 'Main account balance will be restored automatically.'}`,
      confirmButtonText: bn ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: bn ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (!ok) return;

    setSaving(true);
    for (const sub of subLoans) {
      await deleteLoan(sub.id, { name: sub.name, amount: sub.amount });
    }
    setSaving(false);
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

    const baseList = loanViewMode === 'grouped' ? groupedLoans : loans;

    baseList.forEach((l) => {
      if (l.type === 'given') {
        totalGiven += Number(l.amount) || 0;
        givenRemaining += Number(l.remainingAmount) || 0;
      } else {
        totalTaken += Number(l.amount) || 0;
        takenRemaining += Number(l.remainingAmount) || 0;
      }
      if (l.status === 'settled' || Number(l.remainingAmount) <= 0.01) {
        totalSettledCount += 1;
      }
    });

    return {
      totalGiven,
      givenRemaining,
      totalTaken,
      takenRemaining,
      totalSettledCount,
      activeCount: baseList.length - totalSettledCount,
    };
  }, [loans, groupedLoans, loanViewMode]);

  const filteredLoans = useMemo(() => {
    const q = loanSearch.trim().toLowerCase();
    const baseList = loanViewMode === 'grouped' ? groupedLoans : loans;
    return baseList.filter((l) => {
      if (loanFilter === 'given' && l.type !== 'given') return false;
      if (loanFilter === 'taken' && l.type !== 'taken') return false;
      if (loanFilter === 'active' && l.status !== 'active') return false;
      if (loanFilter === 'settled' && l.status !== 'settled') return false;

      if (!q) return true;
      return [l.name, l.phone, l.note, l.id].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [loans, groupedLoans, loanViewMode, loanFilter, loanSearch]);

  const personLedger = useMemo(() => {
    if (!loanHistoryTarget) return [];
    const entries = [];
    const subLoans = loanHistoryTarget.loans && loanHistoryTarget.loans.length > 0
      ? loanHistoryTarget.loans
      : [loanHistoryTarget];

    subLoans.forEach((l) => {
      entries.push({
        id: l.id,
        date: l.date || today,
        type: 'loan',
        description: l.type === 'given' ? (bn ? 'কর্জ প্রদান' : 'Loan Given') : (bn ? 'কর্জ গ্রহণ' : 'Loan Taken'),
        note: l.note || '',
        account: l.account || 'Cash',
        amount: Number(l.amount) || 0,
        rawLoan: l,
        timestamp: new Date(l.date || today).getTime(),
      });

      (l.payments || []).forEach((p) => {
        entries.push({
          id: p.id,
          date: p.date || today,
          type: 'payment',
          description: bn ? 'কিস্তি পরিশোধ / আদায়' : 'Payment Installment',
          note: p.note || '',
          account: p.account || 'Cash',
          amount: Number(p.amount) || 0,
          rawLoan: l,
          rawPayment: p,
          timestamp: new Date(p.date || today).getTime(),
        });
      });
    });

    entries.sort((a, b) => a.timestamp - b.timestamp);

    let running = 0;
    return entries.map((e) => {
      if (e.type === 'loan') {
        running += e.amount;
      } else {
        running = Math.max(0, running - e.amount);
      }
      return {
        ...e,
        runningBalance: running,
      };
    });
  }, [loanHistoryTarget, bn]);

  const sameNameLoans = useMemo(() => {
    if (!quickAdjustTarget) return [];
    const targetName = (quickAdjustTarget.name || '').trim().toLowerCase();
    return loans.filter((l) => (l.name || '').trim().toLowerCase() === targetName);
  }, [loans, quickAdjustTarget]);

  const totalSameNameRemaining = useMemo(() => {
    return sameNameLoans.reduce((sum, l) => sum + (Number(l.remainingAmount) || 0), 0);
  }, [sameNameLoans]);

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

  // Compute customer metrics for the selected day
  const customerMetrics = useMemo(() => {
    const backendCount = data?.sales?.customerCount;
    const backendReg = data?.sales?.registeredCustomers;
    const backendWalkin = data?.sales?.walkinCustomers;

    const saleRows = (data?.feed || []).filter((r) => r.kind === 'sale');
    const invoiceCount = s?.invoiceCount ?? saleRows.length;

    let total = 0;
    let regCount = 0;
    let walkinCount = 0;

    if (backendCount !== undefined && backendCount !== null) {
      total = backendCount;
      regCount = backendReg || 0;
      walkinCount = backendWalkin || 0;
    } else {
      const WALK_IN_NAMES = new Set(['walk-in', 'walk-in customer', 'cash customer', 'walk in customer', 'walk in', '']);
      const registeredCusts = new Set();
      saleRows.forEach((r) => {
        const name = (r.party || '').trim().toLowerCase();
        const phone = (r.partyPhone || '').trim();
        const isWalkin = (WALK_IN_NAMES.has(name) || !name) && !phone;
        if (isWalkin) {
          walkinCount += 1;
        } else {
          registeredCusts.add(`${name}_${phone}`);
        }
      });
      regCount = registeredCusts.size;
      total = regCount + walkinCount;
    }

    const netSales = Number(s?.netSales) || 0;
    const avgBasket = total > 0 ? Math.round(netSales / total) : 0;

    let subText = '';
    if (total === 0) {
      subText = bn ? 'আজ কোনো বিক্রি হয়নি' : 'No sales today';
    } else if (regCount > 0 && walkinCount > 0) {
      subText = `${regCount} ${bn ? 'জন নামসহ' : 'regular'} · ${walkinCount} ${bn ? 'জন ওয়াক-ইন' : 'walk-in'}`;
    } else if (walkinCount > 0) {
      subText = `${walkinCount} ${bn ? 'জন ওয়াক-ইন ক্রেতা' : 'walk-in buyers'}`;
    } else {
      subText = `${regCount} ${bn ? 'জন নিবন্ধিত ক্রেতা' : 'registered buyers'}`;
    }

    const breakdown = total > 0 ? [
      { l: bn ? 'চালান' : 'Invoices', v: `${invoiceCount} ${bn ? 'টি' : ''}` },
      { l: bn ? 'গড় কেনাকাটা' : 'Avg Basket', v: money(avgBasket) },
    ] : null;

    return { total, regCount, walkinCount, sub: subText, breakdown };
  }, [data, s, bn]);

  // Compute customer returns metrics for the selected day
  const customerReturns = useMemo(() => {
    const backendRet = data?.returns?.customer;
    const saleReturns = (data?.feed || []).filter((r) => r.kind === 'return');

    let units = 0;
    let count = 0;
    let retailValue = 0;
    let refundAmount = 0;
    let dueAdjusted = 0;

    if (backendRet) {
      units = Number(backendRet.units) || 0;
      count = Number(backendRet.count) || 0;
      retailValue = Number(backendRet.retailValue) || 0;
      refundAmount = Number(backendRet.refundAmount) || 0;
      dueAdjusted = Number(backendRet.dueAdjusted) || 0;
    } else {
      saleReturns.forEach((r) => {
        units += Number(r.quantity) || 1;
        retailValue += Number(r.amount) || 0;
        refundAmount += Number(r.refund) || Number(r.cash) || 0;
        dueAdjusted += Number(r.dueAdjusted) || 0;
      });
      count = saleReturns.length;
    }

    return { units, count, retailValue, refundAmount, dueAdjusted };
  }, [data]);

  const netSalesEffective = s?.netSalesAfterReturns !== undefined
    ? Number(s.netSalesAfterReturns)
    : Math.max(0, Number(s?.netSales || 0) - customerReturns.retailValue);

  const netReceivedEffective = s?.netReceived !== undefined
    ? Number(s.netReceived)
    : Math.max(0, Number(s?.totalReceived || 0) - customerReturns.refundAmount);

  // Unpaid due calculation (defensive fallback from feed + backend)
  const dueMetrics = useMemo(() => {
    const saleRows = (data?.feed || []).filter((r) => r.kind === 'sale');
    const backendRemaining = s?.dueRemaining !== undefined ? Number(s.dueRemaining) : (s?.netDueCreated !== undefined ? Number(s.netDueCreated) : null);
    const backendCreated = s?.dueCreated !== undefined ? Number(s.dueCreated) : null;
    const backendPaidLater = s?.duePaidLater !== undefined ? Number(s.duePaidLater) : null;

    let created = 0;
    let paidLater = 0;
    let returnCredited = 0;
    let unpaid = 0;

    saleRows.forEach((r) => {
      const invDue = Number(r.dueCreated ?? r.due) || 0;
      const invPaidLater = Number(r.duePaidLater) || 0;
      const invRetCredited = Number(r.dueCredited) || 0;
      const invUnpaid = r.due !== undefined ? Number(r.due) : Math.max(0, invDue - invPaidLater - invRetCredited);
      created += invDue;
      paidLater += invPaidLater;
      returnCredited += invRetCredited;
      unpaid += invUnpaid;
    });

    const finalUnpaid = backendRemaining !== null ? backendRemaining : unpaid;
    const finalCreated = backendCreated !== null ? backendCreated : created;
    const finalPaidLater = backendPaidLater !== null ? backendPaidLater : paidLater;

    let subText = '';
    if (finalCreated === 0) {
      subText = bn ? 'আজ কোনো বাকি বিক্রি নেই' : 'No credit sales today';
    } else if (finalUnpaid === 0) {
      subText = bn ? 'আজকের সব বাকি পরিশোধ ও সমন্বয় হয়েছে' : 'All dues from today paid/settled';
    } else {
      subText = `${bn ? 'আজকের বিক্রি থেকে যা বকেয়া রইল' : 'left unpaid from today\'s sales'}${finalPaidLater > 0 ? ` · ${bn ? 'আদায়' : 'paid'} ${money(finalPaidLater)}` : ''}`;
    }

    const breakdown = finalCreated > 0 ? [
      { l: bn ? 'চালানে বাকি' : 'Gross Due', v: money(finalCreated) },
      { l: bn ? 'বকেয়া আদায়' : 'Paid Today', v: finalPaidLater > 0 ? `−${money(finalPaidLater)}` : '৳0', tone: finalPaidLater > 0 ? 'good' : 'muted' },
      { l: bn ? 'রিটার্ন সমন্বয়' : 'Return Credit', v: customerReturns.dueAdjusted > 0 ? `−${money(customerReturns.dueAdjusted)}` : '৳0', tone: customerReturns.dueAdjusted > 0 ? 'good' : 'muted' },
      { l: bn ? 'অবশিষ্ট বাকি' : 'Net Due', v: money(finalUnpaid), tone: finalUnpaid > 0 ? 'bad' : 'good' },
    ] : null;

    return {
      unpaid: finalUnpaid,
      created: finalCreated,
      paidLater: finalPaidLater,
      sub: subText,
      breakdown,
    };
  }, [data, s, customerReturns, bn]);

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
              <button
                className="btn-outline flex-align-gap"
                onClick={() => downloadElementAsPDF('printable-daybook', `Closing-Report-${date}`)}
                disabled={!data}
                title={bn ? 'ক্লোজিং রিপোর্ট PDF ডাউনলোড করুন' : 'Download Closing Report as PDF'}
              >
                <Download size={16} /> {bn ? 'PDF ডাউনলোড' : 'Download PDF'}
              </button>
              <button className="btn-outline flex-align-gap" onClick={() => printElement('printable-daybook', `DayBook-${date}`)} disabled={!data}>
                <Printer size={16} /> {bn ? 'দিন শেষের রিপোর্ট' : 'Closing Report'}
              </button>
            </>
          ) : (
            <div className="flex-align-gap">
              <button
                className="btn-outline flex-align-gap"
                onClick={() => printElement('printable-all-loans', `Loans-Report-${date}`)}
                title={bn ? 'সকল ঋণের রিপোর্ট প্রিন্ট করুন' : 'Print All Loans Report'}
              >
                <Printer size={16} /> {bn ? 'ঋণ রিপোর্ট প্রিন্ট' : 'Print Report'}
              </button>
              <button className="btn-primary flex-align-gap" onClick={() => setLoanDrawer(true)}>
                <Plus size={16} /> {bn ? 'নতুন ঋণ / কর্জ যোগ' : 'Add New Loan'}
              </button>
            </div>
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
                  label={bn ? 'বিক্রি (নেট)' : 'Net Sales'} value={netSalesEffective}
                  sub={`${s.invoiceCount} ${bn ? 'টি চালান' : 'invoices'}${customerReturns.retailValue > 0 ? ` · ${bn ? 'রিটার্ন বাদ' : 'returns'} −${money(customerReturns.retailValue)}` : ''}${s.totalDiscount > 0 ? ` · ${bn ? 'ছাড়' : 'discount'} ${money(s.totalDiscount)}` : ''}`}
                  breakdown={isAdmin && data.cogs ? [
                    { l: bn ? 'বিক্রি' : 'Sold', v: money(netSalesEffective) },
                    { l: bn ? 'ক্রয়মূল্য' : 'Cost', v: `−${money(data.cogs.netOfReturns ?? data.cogs.total)}`, tone: 'muted' },
                    { l: `${bn ? 'লাভ' : 'Profit'} ${Math.round(p.grossMargin)}%`, v: money(p.grossProfit), tone: p.grossProfit < 0 ? 'bad' : 'good' },
                  ] : (customerReturns.retailValue > 0 ? [
                    { l: bn ? 'মোট বিক্রি' : 'Gross Sold', v: money(s.netSales) },
                    { l: bn ? 'পণ্য ফেরত' : 'Returns', v: `−${money(customerReturns.retailValue)}`, tone: 'bad' },
                    { l: bn ? 'প্রকৃত বিক্রি' : 'Net Sold', v: money(netSalesEffective), tone: 'good' },
                  ] : null)}
                  compare={cmp.netSales} />
                <Kpi bn={bn} icon={Users} tone="primary" isCount={true} countSuffix={bn ? 'জন' : ''}
                  label={bn ? 'আজকের ক্রেতা' : 'Customers'}
                  value={customerMetrics.total}
                  sub={customerMetrics.sub}
                  breakdown={customerMetrics.breakdown}
                  compare={cmp.customerCount} />
                <Kpi bn={bn} icon={RotateCcw} tone={customerReturns.units > 0 ? 'danger' : ''} isCount={true} countSuffix={bn ? 'টি' : 'pcs'}
                  label={bn ? 'পণ্য রিটার্ন' : 'Returns'}
                  value={customerReturns.units}
                  sub={customerReturns.units > 0
                    ? `${money(customerReturns.retailValue)} ${bn ? 'মূল্য' : 'worth'}${customerReturns.refundAmount > 0 ? ` · ${bn ? 'নগদ ফেরত' : 'refund'} ${money(customerReturns.refundAmount)}` : ''}${customerReturns.dueAdjusted > 0 ? ` · ${bn ? 'বাকি সমন্বয়' : 'due adj'} ${money(customerReturns.dueAdjusted)}` : ''}`
                    : (bn ? 'আজ কোনো পণ্য ফেরত নেই' : 'No returns today')}
                  breakdown={customerReturns.units > 0 ? [
                    { l: bn ? 'ফেরত মূল্য' : 'Return Value', v: money(customerReturns.retailValue), tone: 'bad' },
                    { l: bn ? 'নগদ রিফান্ড' : 'Cash Refund', v: customerReturns.refundAmount > 0 ? `−${money(customerReturns.refundAmount)}` : '৳0', tone: customerReturns.refundAmount > 0 ? 'bad' : 'muted' },
                    { l: bn ? 'বাকি সমন্বয়' : 'Due Adjusted', v: customerReturns.dueAdjusted > 0 ? `−${money(customerReturns.dueAdjusted)}` : '৳0', tone: customerReturns.dueAdjusted > 0 ? 'good' : 'muted' },
                  ] : null}
                  compare={cmp.returnUnits} />
                <Kpi bn={bn} icon={Banknote} tone="info"
                  label={bn ? 'টাকা এসেছে (নেট)' : 'Net Received'} value={netReceivedEffective}
                  sub={customerReturns.refundAmount > 0
                    ? `${bn ? 'মোট আদায়' : 'gross in'} ${money(s.totalReceived)} − ${bn ? 'রিটার্ন রিফান্ড' : 'refund'} ${money(customerReturns.refundAmount)}`
                    : `${bn ? 'কাউন্টারে' : 'at counter'} ${money(s.paidAtCounter)} · ${bn ? 'বকেয়া আদায়' : 'dues'} ${money(s.dueCollected)}`}
                  breakdown={customerReturns.refundAmount > 0 ? [
                    { l: bn ? 'কাউন্টারে' : 'Counter', v: money(s.paidAtCounter) },
                    { l: bn ? 'বকেয়া আদায়' : 'Dues In', v: money(s.dueCollected) },
                    { l: bn ? 'রিফান্ড বাদ' : 'Refund Out', v: `−${money(customerReturns.refundAmount)}`, tone: 'bad' },
                  ] : null}
                  compare={cmp.received} />
                <Kpi bn={bn} icon={Wallet} tone={dueMetrics.unpaid > 0 ? 'warning' : ''}
                  label={bn ? 'আজ বাকি হয়েছে (নেট)' : 'Due Balance'} value={dueMetrics.unpaid}
                  sub={dueMetrics.sub}
                  breakdown={dueMetrics.breakdown} />
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
                    sub={`${bn ? 'শুরুতে' : 'opened'} ${money(cf.openingCash)} · ${bn ? 'বাসায়' : 'home'} ${money(cf.closingBank)}`} />
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
                <button className="db-quick-btn" onClick={() => setExpenseForm({ category: categories[0] || 'Others', amount: '', description: '', staffId: '' })}><Plus size={18} /> {bn ? 'খরচ লিখুন' : 'Add expense'}</button>
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
                                {row.title}{row.note ? ` · ${row.note}` : ''}
                                <span className="db-row-id"> · {row.id}</span>
                              </div>
                            </div>
                            {/* Who made the sale, in a column of its own so the
                                day reads down the list rather than across it. */}
                            <div className="db-row-by" title={row.by || ''}>
                              {row.by ? (
                                <>
                                  <span className="l">{bn ? 'বিক্রেতা' : 'Salesman'}</span>
                                  <span className="v">{row.by}</span>
                                </>
                              ) : <span className="v empty">—</span>}
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

                  {/* Which wallet or drawer the day's money actually moved
                      through -- sales, dues collected, payments made. */}
                  <div className="card db-panel">
                    <h3>{bn ? 'কোন মাধ্যমে কত টাকা' : 'Money by method'}</h3>
                    {(data.byMethod || []).length === 0 && <div className="text-muted text-sm">{bn ? 'আজ কোনো লেনদেন নেই' : 'No money moved today'}</div>}
                    {(data.byMethod || []).map((r) => (
                      <div key={r.method} className="db-line">
                        <span>
                          <strong>{r.method}</strong>
                          <span className="text-muted"> · {r.count} {bn ? 'টি' : 'txn'}</span>
                        </span>
                        <span className="num">
                          {r.in > 0 && <span className="text-success">+{money(r.in)}</span>}
                          {r.in > 0 && r.out > 0 && <span className="text-muted"> / </span>}
                          {r.out > 0 && <span className="text-danger">−{money(r.out)}</span>}
                        </span>
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
                      <div className="text-muted text-sm" style={{ marginTop: '0.35rem' }}>{bn ? 'ক্যাশ' : 'Cash'} {money(cf.closingCash)} · {bn ? 'বাসায়' : 'Home'} {money(cf.closingBank)}</div>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="card db-panel">
                      <h3>{bn ? 'মোট বকেয়া (আজ পর্যন্ত)' : 'Outstanding (as of now)'}</h3>
                      <div className="db-line"><span>{bn ? 'কাস্টমারের কাছে পাওনা' : 'Customers owe'}</span><span className="num text-success">{money(data.position.assets.customerDue)}</span></div>
                      <div className="db-line"><span>{bn ? 'কর্মীর কাছে পাওনা' : 'Staff owes'}</span><span className="num text-success">{money(data.position.assets.staffDue)}</span></div>
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
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{shopProfile?.name || shopProfile?.shop_name || 'Allahr dan gents point'}</div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{bn ? 'দিন শেষের রিপোর্ট' : 'Day Closing Report'} — {pretty(date, false)}</div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
                    <thead>
                      <tr style={{ background: '#f1f1f1' }}>
                        {['SL', 'Time', 'Type', 'Party', 'Salesman', 'Details', 'Ref', 'Due', 'Paid', 'Total'].map((h) => <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: h === 'Total' || h === 'Paid' || h === 'Due' ? 'right' : h === 'SL' ? 'center' : 'left' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.feed.map((row, idx) => (
                        <tr key={`${row.kind}-${row.id}`}>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.time || ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{KINDS[row.kind]?.en || row.kind}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.party}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.by || ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px' }}>{row.title}{row.method ? ` (${row.method})` : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', fontSize: 9 }}>{row.id}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', color: row.due > 0 ? '#dc2626' : undefined }}>{row.due > 0 ? money(row.due) : ''}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', color: '#059669' }}>{row.paid !== undefined ? money(row.paid) : money(row.amount)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>{row.flow === 'out' ? '-' : ''}{money(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {[
                        ['Sales (Net of Returns)', money(netSalesEffective), `${s.invoiceCount} invoices${customerReturns.retailValue > 0 ? ` (after ${money(customerReturns.retailValue)} returns)` : ''}`],
                        ['Customers Served', `${customerMetrics.total}`, customerMetrics.sub],
                        ['Customer Returns', `${customerReturns.units} pcs`, customerReturns.units > 0 ? `${money(customerReturns.retailValue)} (refund: ${money(customerReturns.refundAmount)}, due adj: ${money(customerReturns.dueAdjusted)})` : 'None'],
                        ['Received (Net of Refunds)', money(netReceivedEffective), `counter ${money(s.paidAtCounter)} + dues ${money(s.dueCollected)}${customerReturns.refundAmount > 0 ? ` − refund ${money(customerReturns.refundAmount)}` : ''}`],
                        ['Due Balance (Net)', money(dueMetrics.unpaid), dueMetrics.sub],
                        ...(isAdmin ? [
                          ['Purchases', money(data.purchases.total), `paid ${money(data.purchases.paid + data.purchases.paidLater)}`],
                          ['Expenses', money(data.expenses.total), ''],
                          ['Loans given / paid (Out)', money(todayLoans.out), `${todayLoans.count} loan txns`],
                          ['Loans received / collected (In)', money(todayLoans.in), ''],
                          ['Cost of goods sold', money(data.cogs.total), `${data.cogs.unitsSold} units`],
                          ['Gross profit', money(p.grossProfit), `${p.grossMargin}%`],
                          [p.isLoss ? 'Net loss' : 'Net profit', money(Math.abs(p.netProfit)), ''],
                          ['Cash opening → closing', `${money(cf.openingCash)} → ${money(cf.closingCash)}`, `home ${money(cf.closingBank)}`],
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
                {(() => {
                  const baseList = loanViewMode === 'grouped' ? groupedLoans : loans;
                  return [
                    { key: 'all', bn: 'সব', en: 'All', count: baseList.length },
                    { key: 'given', bn: 'কর্জ দেওয়া', en: 'Given', count: baseList.filter((l) => l.type === 'given').length },
                    { key: 'taken', bn: 'কর্জ নেওয়া', en: 'Taken', count: baseList.filter((l) => l.type === 'taken').length },
                    { key: 'active', bn: 'বকেয়া আছে', en: 'Due / Active', count: baseList.filter((l) => l.status === 'active').length },
                    { key: 'settled', bn: 'পরিশোধিত', en: 'Settled', count: baseList.filter((l) => l.status === 'settled').length },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className={`db-chip ${loanFilter === f.key ? 'active' : ''}`}
                      onClick={() => setLoanFilter(f.key)}
                    >
                      {bn ? f.bn : f.en} <span className="n">{f.count}</span>
                    </button>
                  ));
                })()}
              </div>

              <div className="flex-align-gap">
                <div style={{ display: 'inline-flex', background: 'var(--bg-muted, #f1f5f9)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color, #e2e8f0)' }}>
                  <button
                    type="button"
                    onClick={() => setLoanViewMode('grouped')}
                    style={{
                      border: 'none',
                      background: loanViewMode === 'grouped' ? '#fff' : 'transparent',
                      color: loanViewMode === 'grouped' ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: loanViewMode === 'grouped' ? 700 : 500,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      boxShadow: loanViewMode === 'grouped' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                    title={bn ? '১ ব্যক্তি ১ সারি (একীভূত হিসাব)' : 'Consolidated (1 Person 1 Row)'}
                  >
                    {bn ? 'ব্যক্তিভিত্তিক (১ সারি)' : 'By Person (1 Row)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanViewMode('detailed')}
                    style={{
                      border: 'none',
                      background: loanViewMode === 'detailed' ? '#fff' : 'transparent',
                      color: loanViewMode === 'detailed' ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: loanViewMode === 'detailed' ? 700 : 500,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      boxShadow: loanViewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                    title={bn ? 'সকল পৃথক এন্ট্রি ভিউ' : 'All Detailed Entries'}
                  >
                    {bn ? 'সকল এন্ট্রি' : 'All Entries'}
                  </button>
                </div>

                <div className="db-search">
                  <Search size={14} />
                  <input
                    value={loanSearch}
                    onChange={(e) => setLoanSearch(e.target.value)}
                    placeholder={bn ? 'নাম, ফোন নম্বর…' : 'Search name, phone…'}
                  />
                </div>
                <button
                  type="button"
                  className="btn-outline btn-sm flex-align-gap"
                  onClick={() => {
                    setLoanAdjustDrawer(true);
                    setLoanAdjustTab('old');
                  }}
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }}
                  title={bn ? 'পূর্বের পুরাতন হিসাব লিপিবদ্ধ ও ব্যালেন্স সমন্বয় (+ / -)' : 'Old Accounts & Balance Adjustment (+ / -)'}
                >
                  <Scale size={15} /> {bn ? 'পুরাতন হিসাব / সমন্বয় (+ / -)' : 'Old / Adjust (+ / -)'}
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
                            {formatDate(loan.date, '—')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <div
                                    style={{ fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer' }}
                                    onClick={() => setLoanSearch(loan.name)}
                                    title={bn ? 'এই ব্যক্তির সকল কর্জ রেকর্ড দেখতে ক্লিক করুন' : 'Click to filter all loans for this name'}
                                  >
                                    {loan.name}
                                  </div>
                                  {loan.loans && loan.loans.length > 1 && (
                                    <span
                                      style={{
                                        fontSize: '0.6875rem',
                                        padding: '1px 6px',
                                        borderRadius: '999px',
                                        background: 'rgba(37,99,235,0.1)',
                                        color: '#2563eb',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                      }}
                                      title={bn ? `এই ব্যক্তির ${loan.loans.length}টি এন্ট্রি একসাথে সমন্বিত রয়েছে` : `${loan.loans.length} entries consolidated`}
                                    >
                                      {loan.loans.length} {bn ? 'টি এন্ট্রি' : 'entries'}
                                    </span>
                                  )}
                                </div>
                                {loan.phone && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                                    <Phone size={11} /> {loan.phone}
                                  </div>
                                )}
                              </div>
                              <div className="loan-name-quick-actions">
                                <button
                                  type="button"
                                  className="loan-pill-btn plus"
                                  onClick={() => openLoanAdjustModal(loan, 'increase')}
                                  title={bn ? `${loan.name}-এর নামে কর্জ বৃদ্ধি (+)` : `Increase loan for ${loan.name} (+)`}
                                >
                                  <Plus size={11} />
                                  <span>{bn ? 'প্লাস' : '+'}</span>
                                </button>
                                <button
                                  type="button"
                                  className="loan-pill-btn minus"
                                  onClick={() => openLoanAdjustModal(loan, 'decrease')}
                                  title={isSettled ? (bn ? 'পরিশোধিত' : 'Settled') : (bn ? `${loan.name}-এর ঋণ পরিশোধ/হ্রাস (−)` : `Pay / Decrease loan for ${loan.name} (−)`)}
                                  disabled={isSettled}
                                >
                                  <Minus size={11} />
                                  <span>{bn ? 'মাইনাস' : '−'}</span>
                                </button>
                              </div>
                            </div>
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
                            {loan.loans && loan.loans.length > 1
                              ? (bn ? `${loan.loans.length}টি এন্ট্রির সমন্বিত হিসাব` : `${loan.loans.length} consolidated entries`)
                              : (loan.note || '—')}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="loan-act-btn plus"
                                onClick={() => openLoanAdjustModal(loan, 'increase')}
                                title={bn ? `${loan.name}-এর নামে ঋণ বৃদ্ধি (+)` : `Increase loan (+)`}
                              >
                                <Plus size={13} />
                                <span>{bn ? 'বৃদ্ধি (+)' : '+ Add'}</span>
                              </button>
                              {!isSettled ? (
                                <button
                                  type="button"
                                  className="loan-act-btn minus"
                                  onClick={() => openLoanAdjustModal(loan, 'decrease')}
                                  title={bn ? `${loan.name}-এর ঋণ পরিশোধ বা হ্রাস (−)` : `Pay / Decrease (−)`}
                                >
                                  <Minus size={13} />
                                  <span>{bn ? 'পরিশোধ (−)' : '− Pay'}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="loan-act-btn settled-btn"
                                  disabled
                                  title={bn ? 'সম্পূর্ণ পরিশোধিত' : 'Settled'}
                                >
                                  <Check size={12} />
                                  <span>{bn ? 'পরিশোধিত' : 'Settled'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-icon text-primary"
                                onClick={() => setLoanHistoryTarget(loan)}
                                title={bn ? 'ঋণ স্টেটমেন্ট ও কিস্তির হিস্টরি দেখুন' : 'View History & Statement'}
                              >
                                <FileText size={16} />
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn-icon text-danger"
                                  onClick={() => handleDeleteLoan(loan)}
                                  title={bn ? 'মুছুন' : 'Delete'}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
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
                  {['Cash', 'bKash', 'Nagad', 'Rocket', 'Bangla QR'].map((m) => <option key={m}>{m}</option>)}
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

                {(expenseForm.category === 'Staff Cost' || expenseForm.staffId) && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '1rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{bn ? 'কর্মী নির্বাচন করুন (Staff)' : 'Select Staff'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({bn ? 'ঐচ্ছিক' : 'Optional'})</span>
                    </label>
                    <select
                      style={{ width: '100%', marginTop: '0.35rem', padding: '0.4rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
                      value={expenseForm.staffId || ''}
                      onChange={(e) => setExpenseForm({ ...expenseForm, staffId: e.target.value })}
                    >
                      <option value="">{bn ? '-- কর্মী নির্বাচন করুন --' : '-- Select Staff --'}</option>
                      {(staff || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role || 'Staff'}) — {bn ? 'চলতি বকেয়া' : 'Current Due'}: ৳{s.due || 0}
                        </option>
                      ))}
                    </select>
                    {expenseForm.staffId && (
                      <p style={{ color: '#f59e0b', fontSize: '0.75rem', margin: '0.35rem 0 0 0' }}>
                        ⚠️ {bn ? 'এই খরচের টাকা কর্মীর বকেয়া (Due) হিসাবে জমা হবে।' : 'This amount will be added to the staff member\'s due balance.'}
                      </p>
                    )}
                  </div>
                )}

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
                    <span className="text-muted">{bn ? 'অবশিষ্ট দেনা/পাওনা' : 'Remaining Due'}:</span>{' '}
                    <strong className="text-danger" style={{ fontSize: '1rem' }}>{money(loanPayTarget.remainingAmount)}</strong>
                  </div>
                </div>

                {/* Quick Installment Chips */}
                <div style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                    {bn ? 'দ্রুত কিস্তি নির্বাচন (বা নিচে যেকোনো পরিমাণ লিখুন):' : 'Quick Installment Amount:'}
                  </div>
                  <div className="loan-quick-chips">
                    <button
                      type="button"
                      className={`loan-quick-chip ${Number(loanPayAmount) === Number(loanPayTarget.remainingAmount) ? 'active' : ''}`}
                      onClick={() => setLoanPayAmount(String(loanPayTarget.remainingAmount))}
                    >
                      {bn ? 'সম্পূর্ণ বাকি' : 'Full'}: {money(loanPayTarget.remainingAmount)}
                    </button>
                    {loanPayTarget.remainingAmount > 100 && (
                      <button
                        type="button"
                        className={`loan-quick-chip ${Number(loanPayAmount) === Math.round(loanPayTarget.remainingAmount / 2) ? 'active' : ''}`}
                        onClick={() => setLoanPayAmount(String(Math.round(loanPayTarget.remainingAmount / 2)))}
                      >
                        {bn ? '৫০% (অর্ধেক)' : '50%'}: {money(Math.round(loanPayTarget.remainingAmount / 2))}
                      </button>
                    )}
                    {[500, 1000, 2000, 5000, 10000].filter(amt => amt < loanPayTarget.remainingAmount).slice(0, 3).map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className={`loan-quick-chip ${Number(loanPayAmount) === amt ? 'active' : ''}`}
                        onClick={() => setLoanPayAmount(String(amt))}
                      >
                        {money(amt)}
                      </button>
                    ))}
                  </div>
                </div>

                <label>{bn ? 'লেনদেনের মাধ্যম / একাউন্ট' : 'Account'} *</label>
                <select
                  value={loanPayAccount}
                  onChange={(e) => setLoanPayAccount(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                >
                  <option value="Cash">Cash in Hand (নগদ ক্যাশ)</option>
                </select>

                <label>
                  {loanPayTarget.type === 'given' ? (bn ? 'আদায়কৃত কিস্তির পরিমাণ' : 'Amount Received') : (bn ? 'পরিশোধিত কিস্তির পরিমাণ' : 'Amount Paid')} (BDT) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  value={loanPayAmount}
                  onChange={(e) => setLoanPayAmount(e.target.value)}
                  min="1"
                  max={loanPayTarget.remainingAmount}
                  step="any"
                  placeholder={bn ? 'টাকার পরিমাণ লিখুন (কম বা বেশি)' : 'Enter amount (partial or full)'}
                  required
                  autoFocus
                />

                {/* Live balance calculation preview */}
                {(() => {
                  const entered = parseFloat(loanPayAmount) || 0;
                  const remAfter = Math.max(0, loanPayTarget.remainingAmount - entered);
                  const isFullySettled = entered >= loanPayTarget.remainingAmount;
                  return (
                    <div style={{ padding: '0.65rem 0.85rem', background: isFullySettled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(37, 99, 235, 0.08)', borderRadius: 'var(--radius-md)', border: `1px solid ${isFullySettled ? '#86efac' : '#93c5fd'}`, marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                        <span className="text-muted">{bn ? 'এই কিস্তিতে প্রদান:' : 'Paying now:'}</span>
                        <strong>{money(entered)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 700 }}>
                        <span>{bn ? 'পরিশোধ পরবর্তী অবশিষ্ট থাকবে:' : 'Remaining after payment:'}</span>
                        <span style={{ color: isFullySettled ? '#16a34a' : '#dc2626' }}>{money(remAfter)}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: isFullySettled ? '#16a34a' : 'var(--text-muted)' }}>
                        {isFullySettled
                          ? (bn ? '✅ এই পেমেন্টে ঋণটি সম্পূর্ণ পরিশোধিত (Settled) হিসেবে গণ্য হবে।' : '✅ This payment will settle the loan completely.')
                          : (bn ? `ℹ️ আংশিক কিস্তি। বাকি ${money(remAfter)} চলমান (Active) থাকবে।` : `ℹ️ Partial installment. ${money(remAfter)} will remain active.`)}
                      </div>
                    </div>
                  );
                })()}

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
                  placeholder={bn ? 'নগদ / কিস্তি নং / রেফারেন্স (ঐচ্ছিক)' : 'Cash / installment ref (optional)'}
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

      {/* Loan History & Statement Modal */}
      {loanHistoryTarget && createPortal(
        <div className="drawer-overlay" onClick={() => setLoanHistoryTarget(null)}>
          <div className="drawer-container" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={20} />
                {bn ? 'ঋণ বিবরণী ও কিস্তির হিসাব' : 'Loan Statement & Ledger'}
              </h2>
              <div className="flex-align-gap">
                <button
                  type="button"
                  className="btn-outline btn-sm flex-align-gap"
                  onClick={() => printElement('printable-loan-statement', `Loan-Statement-${loanHistoryTarget.id}`)}
                  title={bn ? 'স্টেটমেন্ট প্রিন্ট করুন' : 'Print Statement'}
                >
                  <Printer size={14} /> {bn ? 'প্রিন্ট' : 'Print'}
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm flex-align-gap"
                  onClick={() => downloadElementAsPDF('printable-loan-statement', `Loan-Statement-${loanHistoryTarget.id}`)}
                  title={bn ? 'PDF ডাউনলোড' : 'PDF'}
                >
                  <Download size={14} /> PDF
                </button>
                <button type="button" className="drawer-close-btn" onClick={() => setLoanHistoryTarget(null)}>
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {/* Person header card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem', background: 'var(--bg-muted)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bn ? 'ব্যক্তির নাম' : 'Person'}</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>{loanHistoryTarget.name}</div>
                  {loanHistoryTarget.phone && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem' }}>
                      <Phone size={11} /> {loanHistoryTarget.phone}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bn ? 'ঋণের ধরন ও কোড' : 'Type & Code'}</div>
                  <div style={{ marginTop: '0.2rem' }}>
                    {loanHistoryTarget.type === 'given' ? (
                      <span className="loan-badge-given"><ArrowUpCircle size={12} /> {bn ? 'কর্জ দেওয়া' : 'Given'}</span>
                    ) : (
                      <span className="loan-badge-taken"><ArrowDownCircle size={12} /> {bn ? 'কর্জ নেওয়া' : 'Taken'}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{loanHistoryTarget.id}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bn ? 'শুরুর তারিখ ও মাধ্যম' : 'Date & Account'}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{loanHistoryTarget.date || '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{loanHistoryTarget.account || 'Cash'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bn ? 'বর্তমান অবস্থা' : 'Status'}</div>
                  <div style={{ marginTop: '0.2rem' }}>
                    {loanHistoryTarget.status === 'settled' || loanHistoryTarget.remainingAmount <= 0.01 ? (
                      <span className="loan-badge-settled"><CheckCircle2 size={12} /> {bn ? 'পরিশোধিত' : 'Settled'}</span>
                    ) : (
                      <span className="loan-badge-active"><Clock size={12} /> {bn ? 'চলমান বকেয়া' : 'Active'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Metric cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{bn ? 'মূল ঋণের পরিমাণ' : 'Original Amount'}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '0.2rem' }}>{money(loanHistoryTarget.amount)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>{bn ? 'মোট পরিশোধিত' : 'Total Paid'}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>{money(loanHistoryTarget.paidAmount || 0)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #fca5a5' }}>
                  <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 }}>{bn ? 'অবশিষ্ট দেনা/পাওনা' : 'Remaining Due'}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.2rem' }}>{money(loanHistoryTarget.remainingAmount)}</div>
                </div>
              </div>

              {/* Timeline table */}
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <History size={15} /> {bn ? 'লেনদেন ও কিস্তির বিবরণী' : 'Transactions & Installment Ledger'}
              </h4>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '1rem' }}>
                <table className="loan-stmt-table">
                  <thead>
                    <tr>
                      <th>{bn ? 'তারিখ' : 'Date'}</th>
                      <th>{bn ? 'ধরন ও বিবরণ' : 'Description'}</th>
                      <th>{bn ? 'মাধ্যম' : 'Account'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'টাকা' : 'Amount'}</th>
                      <th style={{ textAlign: 'right' }}>{bn ? 'ব্যালেন্স' : 'Balance'}</th>
                      {isAdmin && <th style={{ textAlign: 'center', width: '40px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {personLedger.map((entry) => {
                      const isLoanAdd = entry.type === 'loan';
                      return (
                        <tr key={entry.id}>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(entry.date)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{
                                fontWeight: 700,
                                color: isLoanAdd ? (loanHistoryTarget.type === 'given' ? '#b91c1c' : '#2563eb') : 'var(--success)'
                              }}>
                                {entry.description}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>#{entry.id}</span>
                            </div>
                            {entry.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{entry.note}</div>}
                          </td>
                          <td><span className="badge badge-secondary">{entry.account || 'Cash'}</span></td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: isLoanAdd ? 'var(--text-main)' : 'var(--success)',
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {isLoanAdd ? `+${money(entry.amount)}` : `−${money(entry.amount)}`}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: entry.runningBalance > 0 ? '#b91c1c' : 'var(--text-muted)',
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {money(entry.runningBalance)}
                          </td>
                          {isAdmin && (
                            <td style={{ textAlign: 'center' }}>
                              {entry.type === 'payment' ? (
                                <button
                                  type="button"
                                  className="btn-icon text-danger"
                                  style={{ padding: '2px' }}
                                  onClick={() => handleDeleteLoanPayment(entry.rawLoan, entry.rawPayment)}
                                  title={bn ? 'এই কিস্তি মুছুন' : 'Delete installment'}
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : (
                                (loanHistoryTarget.loans && loanHistoryTarget.loans.length > 1) && (
                                  <button
                                    type="button"
                                    className="btn-icon text-danger"
                                    style={{ padding: '2px' }}
                                    onClick={() => handleDeleteLoan(entry.rawLoan)}
                                    title={bn ? 'এই নির্দিষ্ট এন্ট্রিটি মুছুন' : 'Delete this specific entry'}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="drawer-footer" style={{ flexShrink: 0, justifyContent: 'space-between' }}>
              <button type="button" className="btn-outline" onClick={() => setLoanHistoryTarget(null)}>
                {bn ? 'বন্ধ করুন' : 'Close'}
              </button>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  style={{ borderColor: '#10b981', color: '#059669', fontWeight: 600 }}
                  onClick={() => {
                    const tgt = loanHistoryTarget;
                    setLoanHistoryTarget(null);
                    openLoanAdjustModal(tgt, 'increase');
                  }}
                  title={bn ? 'এই ব্যক্তির নামে ঋণ বৃদ্ধি করুন (+)' : 'Increase loan on this person (+)'}
                >
                  <Plus size={15} /> {bn ? 'কর্জ বৃদ্ধি (+)' : 'Add Loan (+)'}
                </button>
                {loanHistoryTarget.remainingAmount > 0.01 && (
                  <button
                    type="button"
                    className="btn-primary flex-align-gap"
                    onClick={() => {
                      const tgt = loanHistoryTarget;
                      setLoanHistoryTarget(null);
                      openLoanAdjustModal(tgt, 'decrease');
                    }}
                    title={bn ? 'ঋণ পরিশোধ বা কিস্তি জমা নিন (−)' : 'Pay / Collect Installment (−)'}
                  >
                    <Minus size={15} /> {bn ? 'কিস্তি পরিশোধ (−)' : 'Pay Installment (−)'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Quick Loan Plus/Minus Modal for the same person */}
      {quickAdjustTarget && createPortal(
        <div className="drawer-overlay" onClick={() => setQuickAdjustTarget(null)}>
          <div className="drawer-container" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {quickAdjustType === 'increase' ? (
                  <>
                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}><Plus size={22} /></span>
                    <span>{bn ? 'কর্জ বৃদ্ধি (+)' : 'Increase Loan (+)'}</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center' }}><Minus size={22} /></span>
                    <span>{bn ? 'কর্জ পরিশোধ / হ্রাস (−)' : 'Pay / Decrease Loan (−)'}</span>
                  </>
                )}
              </h2>
              <button type="button" className="drawer-close-btn" onClick={() => setQuickAdjustTarget(null)}>
                <X size={22} />
              </button>
            </div>

            {/* Switch between Increase (+) and Decrease (-) */}
            <div style={{ padding: '0.75rem 1.25rem 0' }}>
              <div className="loan-adjust-tabs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: 'var(--bg-muted)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                <button
                  type="button"
                  className={`loan-adjust-tab ${quickAdjustType === 'increase' ? 'active' : ''}`}
                  onClick={() => {
                    setQuickAdjustType('increase');
                    setQuickAdjustAmount('');
                  }}
                  style={quickAdjustType === 'increase' ? { background: '#10b981', color: '#fff', fontWeight: 700 } : {}}
                >
                  <Plus size={15} />
                  {bn ? 'ঋণ বৃদ্ধি (+)' : 'Increase (+)'}
                </button>
                <button
                  type="button"
                  className={`loan-adjust-tab ${quickAdjustType === 'decrease' ? 'active' : ''}`}
                  onClick={() => {
                    setQuickAdjustType('decrease');
                    setQuickAdjustAmount(String(quickAdjustTarget.remainingAmount || ''));
                  }}
                  style={quickAdjustType === 'decrease' ? { background: '#2563eb', color: '#fff', fontWeight: 700 } : {}}
                  disabled={quickAdjustTarget.remainingAmount <= 0.01}
                >
                  <Minus size={15} />
                  {bn ? 'পরিশোধ / হ্রাস (−)' : 'Pay / Decrease (−)'}
                </button>
              </div>
            </div>

            <form onSubmit={handleQuickAdjustSubmit} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {/* Person Information Card */}
                <div style={{ lineHeight: 1.7, padding: '0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>{bn ? 'একই ব্যক্তি / প্রতিষ্ঠানের নাম:' : 'Person / Party Name:'}</span>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>{quickAdjustTarget.name}</div>
                      {quickAdjustTarget.phone && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.1rem' }}>
                          <Phone size={11} /> {quickAdjustTarget.phone}
                        </div>
                      )}
                    </div>
                    <div>
                      {quickAdjustTarget.type === 'given' ? (
                        <span className="loan-badge-given"><ArrowUpCircle size={12} /> {bn ? 'কর্জ দেওয়া (পাওনা)' : 'Loan Given'}</span>
                      ) : (
                        <span className="loan-badge-taken"><ArrowDownCircle size={12} /> {bn ? 'কর্জ নেওয়া (দেনা)' : 'Loan Taken'}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8125rem' }}>
                    <div>
                      <span className="text-muted">{bn ? 'মূল ঋণ:' : 'Original:'}</span>{' '}
                      <strong>{money(quickAdjustTarget.amount)}</strong>
                    </div>
                    <div>
                      <span className="text-muted">{bn ? 'ইতোমধ্যে পরিশোধ:' : 'Paid:'}</span>{' '}
                      <span className="text-success" style={{ fontWeight: 600 }}>{money(quickAdjustTarget.paidAmount || 0)}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                    <span className="text-muted">{bn ? 'বর্তমান অবশিষ্ট দেনা/পাওনা:' : 'Current Due:'}</span>{' '}
                    <strong style={{ color: quickAdjustTarget.type === 'given' ? '#dc2626' : '#2563eb', fontSize: '1rem' }}>
                      {money(quickAdjustTarget.remainingAmount)}
                    </strong>
                  </div>

                  {sameNameLoans.length > 1 && (
                    <div style={{ marginTop: '0.4rem', padding: '0.3rem 0.5rem', background: 'rgba(37, 99, 235, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: '#1d4ed8' }}>
                      ℹ️ {bn ? `এই একই নামে (${quickAdjustTarget.name}) মোট ${sameNameLoans.length}টি ঋণ রয়েছে। সর্বমোট বকেয়া: ${money(totalSameNameRemaining)}` : `Total ${sameNameLoans.length} loans exist for this name. Combined due: ${money(totalSameNameRemaining)}`}
                    </div>
                  )}
                </div>

                {/* Quick Chips */}
                {quickAdjustType === 'increase' ? (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      {bn ? 'দ্রুত পরিমাণ পছন্দ করুন (বা নিচে লিখুন):' : 'Quick Amount:'}
                    </div>
                    <div className="loan-quick-chips">
                      {[500, 1000, 2000, 5000, 10000, 20000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          className={`loan-quick-chip ${Number(quickAdjustAmount) === amt ? 'active' : ''}`}
                          onClick={() => setQuickAdjustAmount(String(amt))}
                        >
                          +{money(amt)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      {bn ? 'দ্রুত কিস্তি নির্বাচন (বা নিচে যেকোনো পরিমাণ লিখুন):' : 'Quick Installment:'}
                    </div>
                    <div className="loan-quick-chips">
                      <button
                        type="button"
                        className={`loan-quick-chip ${Number(quickAdjustAmount) === Number(quickAdjustTarget.remainingAmount) ? 'active' : ''}`}
                        onClick={() => setQuickAdjustAmount(String(quickAdjustTarget.remainingAmount))}
                      >
                        {bn ? 'সম্পূর্ণ বাকি' : 'Full'}: {money(quickAdjustTarget.remainingAmount)}
                      </button>
                      {quickAdjustTarget.remainingAmount > 100 && (
                        <button
                          type="button"
                          className={`loan-quick-chip ${Number(quickAdjustAmount) === Math.round(quickAdjustTarget.remainingAmount / 2) ? 'active' : ''}`}
                          onClick={() => setQuickAdjustAmount(String(Math.round(quickAdjustTarget.remainingAmount / 2)))}
                        >
                          {bn ? '৫০% (অর্ধেক)' : '50%'}: {money(Math.round(quickAdjustTarget.remainingAmount / 2))}
                        </button>
                      )}
                      {[500, 1000, 2000, 5000].filter(amt => amt < quickAdjustTarget.remainingAmount).map(amt => (
                        <button
                          key={amt}
                          type="button"
                          className={`loan-quick-chip ${Number(quickAdjustAmount) === amt ? 'active' : ''}`}
                          onClick={() => setQuickAdjustAmount(String(amt))}
                        >
                          {money(amt)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amount input */}
                <label>
                  {quickAdjustType === 'increase'
                    ? (bn ? 'নতুন ঋণ বৃদ্ধির টাকার পরিমাণ (BDT) *' : 'Increase Amount (BDT) *')
                    : (bn ? 'পরিশোধ / জমার টাকার পরিমাণ (BDT) *' : 'Payment Amount (BDT) *')}
                </label>
                <input
                  type="number"
                  value={quickAdjustAmount}
                  onChange={(e) => setQuickAdjustAmount(e.target.value)}
                  min="1"
                  max={quickAdjustType === 'decrease' ? quickAdjustTarget.remainingAmount : undefined}
                  step="any"
                  placeholder="0.00"
                  required
                  autoFocus
                />

                {/* Live Preview */}
                {(() => {
                  const entered = parseFloat(quickAdjustAmount) || 0;
                  if (quickAdjustType === 'increase') {
                    const totalAfter = quickAdjustTarget.remainingAmount + entered;
                    return (
                      <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid #86efac', marginTop: '0.65rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                          <span className="text-muted">{bn ? 'বর্তমান বকেয়া:' : 'Current Due:'}</span>
                          <strong>{money(quickAdjustTarget.remainingAmount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem', color: '#059669' }}>
                          <span>{bn ? 'নতুন কর্জ বৃদ্ধি (+):' : 'Adding Loan (+):'}</span>
                          <strong>+{money(entered)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 800, borderTop: '1px dashed #86efac', paddingTop: '0.35rem', marginTop: '0.25rem' }}>
                          <span>{bn ? 'বৃদ্ধির পর মোট বকেয়া হবে:' : 'Total Due After Increase:'}</span>
                          <span style={{ color: '#059669' }}>{money(totalAfter)}</span>
                        </div>
                      </div>
                    );
                  } else {
                    const remAfter = Math.max(0, quickAdjustTarget.remainingAmount - entered);
                    const isFullySettled = entered >= quickAdjustTarget.remainingAmount;
                    return (
                      <div style={{ padding: '0.65rem 0.85rem', background: isFullySettled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(37, 99, 235, 0.08)', borderRadius: 'var(--radius-md)', border: `1px solid ${isFullySettled ? '#86efac' : '#93c5fd'}`, marginTop: '0.65rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                          <span className="text-muted">{bn ? 'পরিশোধিত হচ্ছে:' : 'Paying now:'}</span>
                          <strong>{money(entered)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 800, borderTop: `1px dashed ${isFullySettled ? '#86efac' : '#93c5fd'}`, paddingTop: '0.35rem', marginTop: '0.25rem' }}>
                          <span>{bn ? 'পরিশোধ পরবর্তী অবশিষ্ট থাকবে:' : 'Remaining after payment:'}</span>
                          <span style={{ color: isFullySettled ? '#16a34a' : '#dc2626' }}>{money(remAfter)}</span>
                        </div>
                      </div>
                    );
                  }
                })()}

                {/* Account and Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <div>
                    <label>{bn ? 'লেনদেনের মাধ্যম / একাউন্ট' : 'Account'} *</label>
                    <select
                      value={quickAdjustAccount}
                      onChange={(e) => setQuickAdjustAccount(e.target.value)}
                    >
                      <option value="Cash">Cash in Hand (নগদ ক্যাশ)</option>
                    </select>
                  </div>
                  <div>
                    <label>{bn ? 'তারিখ' : 'Date'}</label>
                    <input
                      type="date"
                      value={quickAdjustDate}
                      onChange={(e) => setQuickAdjustDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Note */}
                <label style={{ marginTop: '0.5rem' }}>{bn ? 'বিবরণ বা নোট' : 'Note / Reference'}</label>
                <input
                  type="text"
                  value={quickAdjustNote}
                  onChange={(e) => setQuickAdjustNote(e.target.value)}
                  placeholder={quickAdjustType === 'increase'
                    ? (bn ? 'কর্জ বৃদ্ধির উদ্দেশ্য বা বিবরণ (ঐচ্ছিক)' : 'Increase note/purpose (optional)')
                    : (bn ? 'নগদ / কিস্তি নং / রেফারেন্স (ঐচ্ছিক)' : 'Payment note/ref (optional)')}
                />
              </div>

              <div className="drawer-footer" style={{ flexShrink: 0 }}>
                <button type="button" className="btn-outline" onClick={() => setQuickAdjustTarget(null)}>
                  {bn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={quickAdjustType === 'increase' ? { background: '#10b981', borderColor: '#10b981' } : {}}
                >
                  {quickAdjustType === 'increase'
                    ? (bn ? 'কর্জ বৃদ্ধি সংরক্ষণ করুন (+)' : 'Save Loan Increase (+)')
                    : (bn ? 'পরিশোধ আপডেট করুন (−)' : 'Save Payment (−)')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Old Account & Balance Adjustment Drawer */}
      {loanAdjustDrawer && createPortal(
        <div className="drawer-overlay" onClick={() => setLoanAdjustDrawer(false)}>
          <div className="drawer-container" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Scale size={20} />
                {bn ? 'পুরাতন হিসাব ও ব্যালেন্স সমন্বয় (+ / -)' : 'Old Accounts & Balance Adjustment'}
              </h2>
              <button type="button" className="drawer-close-btn" onClick={() => setLoanAdjustDrawer(false)}>
                <X size={22} />
              </button>
            </div>

            {/* Two Tabs: Old Loan vs Adjust Existing */}
            <div style={{ padding: '0 1.25rem', marginTop: '0.75rem' }}>
              <div className="loan-adjust-tabs">
                <button
                  type="button"
                  className={`loan-adjust-tab ${loanAdjustTab === 'old' ? 'active' : ''}`}
                  onClick={() => setLoanAdjustTab('old')}
                >
                  {bn ? 'পুরাতন হিসাব যোগ' : 'Add Old Loan'}
                </button>
                <button
                  type="button"
                  className={`loan-adjust-tab ${loanAdjustTab === 'adjust' ? 'active' : ''}`}
                  onClick={() => setLoanAdjustTab('adjust')}
                >
                  {bn ? 'ব্যালেন্স সমন্বয় (+ / -)' : 'Adjust Balance (+ / -)'}
                </button>
              </div>
            </div>

            {loanAdjustTab === 'old' ? (
              <form onSubmit={handleOldLoanSubmit} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <div className="alert-banner" style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', fontSize: '0.8rem', color: '#1e40af', marginBottom: '0.75rem' }}>
                    ℹ️ {bn ? 'সফটওয়্যার ব্যবহারের পূর্বের পুরাতন বা প্রারম্ভিক ঋণ যোগ করতে এটি ব্যবহার করুন। আজকের ক্যাশ ড্রয়ার কমবে না।' : 'Use this to record old loans from before using the software without affecting today\'s cash drawer.'}
                  </div>

                  <label>{bn ? 'ঋণের ধরন' : 'Loan Type'} *</label>
                  <div className="loan-type-selector">
                    <button
                      type="button"
                      className={`loan-type-btn ${oldLoanForm.type === 'given' ? 'active-given' : ''}`}
                      onClick={() => setOldLoanForm({ ...oldLoanForm, type: 'given' })}
                    >
                      <ArrowUpCircle size={16} />
                      {bn ? 'কর্জ দিয়েছিলাম (পাওনা)' : 'Lent (Given)'}
                    </button>
                    <button
                      type="button"
                      className={`loan-type-btn ${oldLoanForm.type === 'taken' ? 'active-taken' : ''}`}
                      onClick={() => setOldLoanForm({ ...oldLoanForm, type: 'taken' })}
                    >
                      <ArrowDownCircle size={16} />
                      {bn ? 'কর্জ নিয়েছিলাম (দেনা)' : 'Borrowed (Taken)'}
                    </button>
                  </div>

                  <label style={{ marginTop: '0.75rem' }}>{bn ? 'ব্যক্তি বা প্রতিষ্ঠানের নাম' : 'Person Name'} *</label>
                  <input
                    type="text"
                    value={oldLoanForm.name}
                    onChange={(e) => setOldLoanForm({ ...oldLoanForm, name: e.target.value })}
                    placeholder={bn ? 'নাম লিখুন (বাধ্যতামূলক)' : 'Enter name (required)'}
                    required
                    autoFocus
                  />

                  <label>{bn ? 'ফোন নম্বর' : 'Phone Number'}</label>
                  <input
                    type="tel"
                    value={oldLoanForm.phone}
                    onChange={(e) => setOldLoanForm({ ...oldLoanForm, phone: e.target.value })}
                    placeholder={bn ? '০১৭xxxxxxxx (ঐচ্ছিক)' : '017xxxxxxxx (optional)'}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <div>
                      <label>{bn ? 'মূল ঋণের পরিমাণ' : 'Original Amount'} *</label>
                      <input
                        type="number"
                        value={oldLoanForm.amount}
                        onChange={(e) => setOldLoanForm({ ...oldLoanForm, amount: e.target.value })}
                        min="1"
                        step="any"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <label>{bn ? 'পূর্বে পরিশোধিত (যদি থাকে)' : 'Already Paid'}</label>
                      <input
                        type="number"
                        value={oldLoanForm.alreadyPaid}
                        onChange={(e) => setOldLoanForm({ ...oldLoanForm, alreadyPaid: e.target.value })}
                        min="0"
                        step="any"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {oldLoanForm.amount && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                      <span className="text-muted">{bn ? 'বর্তমান অবশিষ্ট বকেয়া থাকবে:' : 'Net Remaining Due:'}</span>{' '}
                      <strong style={{ color: '#dc2626' }}>{money(Math.max(0, (parseFloat(oldLoanForm.amount) || 0) - (parseFloat(oldLoanForm.alreadyPaid) || 0)))}</strong>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div>
                      <label>{bn ? 'ঋণ লেনদেনের মাধ্যম' : 'Account'}</label>
                      <select
                        value={oldLoanForm.account}
                        onChange={(e) => setOldLoanForm({ ...oldLoanForm, account: e.target.value })}
                      >
                        <option value="Cash">Cash in Hand (নগদ ক্যাশ)</option>
                      </select>
                    </div>
                    <div>
                      <label>{bn ? 'ঋণের মূল তারিখ' : 'Original Date'}</label>
                      <input
                        type="date"
                        value={oldLoanForm.date}
                        onChange={(e) => setOldLoanForm({ ...oldLoanForm, date: e.target.value })}
                      />
                    </div>
                  </div>

                  <label style={{ marginTop: '0.5rem' }}>{bn ? 'নোট বা বিবরণ' : 'Note / Description'}</label>
                  <input
                    type="text"
                    value={oldLoanForm.note}
                    onChange={(e) => setOldLoanForm({ ...oldLoanForm, note: e.target.value })}
                    placeholder={bn ? 'পুরাতন হিসাবের বিবরণ বা তথ্য' : 'Old record reference'}
                  />

                  <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }}>
                    <input
                      type="checkbox"
                      id="old-affect-cash"
                      checked={oldLoanForm.affectCash}
                      onChange={(e) => setOldLoanForm({ ...oldLoanForm, affectCash: e.target.checked })}
                      style={{ width: 'auto', cursor: 'pointer' }}
                    />
                    <label htmlFor="old-affect-cash" style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer' }}>
                      {bn ? 'আজকের ক্যাশ ব্যালেন্সে প্রভাব ফেলবে (ডিফল্ট: বন্ধ)' : 'Affect today\'s Cash/Bank balance (Default: Off)'}
                    </label>
                  </div>
                </div>

                <div className="drawer-footer" style={{ flexShrink: 0 }}>
                  <button type="button" className="btn-outline" onClick={() => setLoanAdjustDrawer(false)}>
                    {bn ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button type="submit" className="btn-primary">
                    {bn ? 'পুরাতন হিসাব সংরক্ষণ' : 'Save Old Loan'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLoanAdjustSubmit} className="db-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <div className="alert-banner" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', fontSize: '0.8rem', color: '#b45309', marginBottom: '0.75rem' }}>
                    ℹ️ {bn ? 'বিদ্যমান কোনো ব্যক্তির ঋণের পরিমাণ বৃদ্ধি (+) বা ছাড়/মওকুফ/হ্রাস (-) করার জন্য এটি ব্যবহার করুন।' : 'Use this to increase (+) or discount/decrease (-) an existing person\'s loan balance.'}
                  </div>

                  <label>{bn ? 'ব্যক্তি বা চলমান ঋণ নির্বাচন করুন' : 'Select Loan / Person'} *</label>
                  <select
                    value={adjustForm.loanId}
                    onChange={(e) => setAdjustForm({ ...adjustForm, loanId: e.target.value })}
                    required
                  >
                    <option value="">{bn ? '-- ঋণ সিলেক্ট করুন --' : '-- Select Loan --'}</option>
                    {loans.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name} — {l.type === 'given' ? (bn ? 'কর্জ দেওয়া' : 'Given') : (bn ? 'কর্জ নেওয়া' : 'Taken')} (বাকি: {money(l.remainingAmount)})
                      </option>
                    ))}
                  </select>

                  <label style={{ marginTop: '0.75rem' }}>{bn ? 'সমন্বয়ের ধরন' : 'Adjustment Type'} *</label>
                  <div className="loan-type-selector">
                    <button
                      type="button"
                      className={`loan-type-btn ${adjustForm.type === 'decrease' ? 'active-given' : ''}`}
                      onClick={() => setAdjustForm({ ...adjustForm, type: 'decrease' })}
                    >
                      <Minus size={16} />
                      {bn ? 'ঋণ হ্রাস / ছাড় (−)' : 'Decrease / Discount (−)'}
                    </button>
                    <button
                      type="button"
                      className={`loan-type-btn ${adjustForm.type === 'increase' ? 'active-taken' : ''}`}
                      onClick={() => setAdjustForm({ ...adjustForm, type: 'increase' })}
                    >
                      <Plus size={16} />
                      {bn ? 'ঋণ বৃদ্ধি (+)' : 'Increase Loan (+)'}
                    </button>
                  </div>

                  <label style={{ marginTop: '0.75rem' }}>{bn ? 'সমন্বয়ের টাকার পরিমাণ' : 'Amount'} (BDT) *</label>
                  <input
                    type="number"
                    value={adjustForm.amount}
                    onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                    min="1"
                    step="any"
                    placeholder="0.00"
                    required
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <div>
                      <label>{bn ? 'মাধ্যম / একাউন্ট' : 'Account'}</label>
                      <select
                        value={adjustForm.account}
                        onChange={(e) => setAdjustForm({ ...adjustForm, account: e.target.value })}
                      >
                        <option value="Cash">Cash (নগদ ক্যাশ)</option>
                      </select>
                    </div>
                    <div>
                      <label>{bn ? 'তারিখ' : 'Date'}</label>
                      <input
                        type="date"
                        value={adjustForm.date}
                        onChange={(e) => setAdjustForm({ ...adjustForm, date: e.target.value })}
                      />
                    </div>
                  </div>

                  <label style={{ marginTop: '0.5rem' }}>{bn ? 'সমন্বয়ের কারণ / নোট' : 'Reason / Note'}</label>
                  <input
                    type="text"
                    value={adjustForm.note}
                    onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                    placeholder={bn ? 'ডিসকাউন্ট / মওকুফ / হিসাব মিলকরণ ইত্যাদি' : 'Discount / waiver / balance correction'}
                  />
                </div>

                <div className="drawer-footer" style={{ flexShrink: 0 }}>
                  <button type="button" className="btn-outline" onClick={() => setLoanAdjustDrawer(false)}>
                    {bn ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button type="submit" className="btn-primary">
                    {bn ? 'ব্যালেন্স সমন্বয় করুন' : 'Apply Adjustment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* Printable Single Loan Statement */}
      {loanHistoryTarget && (
        <div id="printable-loan-statement" style={{ display: 'none' }}>
          <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid #333', paddingBottom: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{shopProfile?.name || shopProfile?.shop_name || 'Allahr dan gents point'}</div>
              <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{bn ? 'ঋণ বিবরণী ও কিস্তির হিসাব (Loan Statement)' : 'Loan Statement & Ledger'}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{bn ? 'প্রিন্টের তারিখ:' : 'Printed Date:'} {formatDate(new Date())}</div>
            </div>
            {/* Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12, background: '#f8fafc', padding: 8, borderRadius: 6 }}>
              <div>
                <div><strong>{bn ? 'ব্যক্তির নাম:' : 'Person:'}</strong> {loanHistoryTarget.name}</div>
                {loanHistoryTarget.phone && <div><strong>{bn ? 'মোবাইল:' : 'Phone:'}</strong> {loanHistoryTarget.phone}</div>}
                <div><strong>{bn ? 'ঋণের কোড:' : 'Loan Code:'}</strong> {loanHistoryTarget.id}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div><strong>{bn ? 'ধরন:' : 'Type:'}</strong> {loanHistoryTarget.type === 'given' ? (bn ? 'কর্জ দেওয়া (Lent)' : 'Given') : (bn ? 'কর্জ নেওয়া (Borrowed)' : 'Taken')}</div>
                <div><strong>{bn ? 'তারিখ:' : 'Date:'}</strong> {formatDate(loanHistoryTarget.date)}</div>
                <div><strong>{bn ? 'স্ট্যাটাস:' : 'Status:'}</strong> {loanHistoryTarget.status === 'settled' || loanHistoryTarget.remainingAmount <= 0.01 ? (bn ? 'পরিশোধিত' : 'Settled') : (bn ? 'চলমান' : 'Active')}</div>
              </div>
            </div>
            {/* KPI Summary in Statement */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: '#666' }}>{bn ? 'মূল ঋণ' : 'Original Loan'}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{money(loanHistoryTarget.amount)}</div>
              </div>
              <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4, background: '#f0fdf4' }}>
                <div style={{ fontSize: 10, color: '#166534' }}>{bn ? 'মোট পরিশোধ' : 'Total Paid'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>{money(loanHistoryTarget.paidAmount || 0)}</div>
              </div>
              <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4, background: '#fef2f2' }}>
                <div style={{ fontSize: 10, color: '#991b1b' }}>{bn ? 'অবশিষ্ট পাওনা/দেনা' : 'Remaining Due'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>{money(loanHistoryTarget.remainingAmount)}</div>
              </div>
            </div>
            {/* Table of Ledger */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{bn ? 'তারিখ' : 'Date'}</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{bn ? 'বিবরণ' : 'Description'}</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{bn ? 'মাধ্যম' : 'Account'}</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>{bn ? 'টাকা' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {personLedger.map((entry, idx) => {
                  const isLoanAdd = entry.type === 'loan';
                  return (
                    <tr key={entry.id || idx}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{formatDate(entry.date)}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>
                        <strong>{entry.description}</strong>
                        {entry.note ? ` (${entry.note})` : ''}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{entry.account || 'Cash'}</td>
                      <td style={{
                        border: '1px solid #cbd5e1',
                        padding: '6px',
                        textAlign: 'right',
                        color: isLoanAdd ? '#b91c1c' : '#166534',
                        fontWeight: 600
                      }}>
                        {isLoanAdd ? `+${money(entry.amount)}` : `-${money(entry.amount)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Signature */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 10, fontSize: 11 }}>
              <div style={{ textAlign: 'center', width: '150px', borderTop: '1px dashed #666' }}>{bn ? 'গ্রহীতার স্বাক্ষর' : 'Recipient Signature'}</div>
              <div style={{ textAlign: 'center', width: '150px', borderTop: '1px dashed #666' }}>{bn ? 'অনুমোদনকারীর স্বাক্ষর' : 'Authorized Signature'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Printable All Loans Report */}
      <div id="printable-all-loans" style={{ display: 'none' }}>
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{shopProfile?.name || shopProfile?.shop_name || 'Allahr dan gents point'}</div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{bn ? 'কর্জ / ঋণ খাতা ও হিসাব বিবরণী' : 'Loan Book & Statement Report'}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{bn ? 'তারিখ:' : 'Date:'} {pretty(today, bn)}</div>
          </div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#666' }}>{bn ? 'মোট কর্জ দেওয়া (Lent)' : 'Total Given'}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{money(loanStats.totalGiven)}</div>
              <div style={{ fontSize: 10, color: '#dc2626' }}>{bn ? 'বাকি:' : 'Due:'} {money(loanStats.givenRemaining)}</div>
            </div>
            <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#666' }}>{bn ? 'মোট কর্জ নেওয়া (Borrowed)' : 'Total Taken'}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{money(loanStats.totalTaken)}</div>
              <div style={{ fontSize: 10, color: '#2563eb' }}>{bn ? 'দেনা:' : 'Due:'} {money(loanStats.takenRemaining)}</div>
            </div>
            <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#666' }}>{bn ? 'চলমান ঋণ' : 'Active Loans'}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{loanStats.activeCount} {bn ? 'টি' : ''}</div>
            </div>
            <div style={{ border: '1px solid #ccc', padding: 6, borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#666' }}>{bn ? 'পরিশোধিত ঋণ' : 'Settled Loans'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{loanStats.totalSettledCount} {bn ? 'টি' : ''}</div>
            </div>
          </div>
          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#f1f1f1' }}>
                {['SL', bn ? 'ধরন' : 'Type', bn ? 'তারিখ' : 'Date', bn ? 'নাম ও ফোন' : 'Person', bn ? 'মূল ঋণ' : 'Original', bn ? 'পরিশোধ' : 'Paid', bn ? 'বকেয়া' : 'Remaining', bn ? 'স্ট্যাটাস' : 'Status'].map(h => (
                  <th key={h} style={{ border: '1px solid #ccc', padding: '6px', textAlign: h.includes('Original') || h.includes('Paid') || h.includes('Remaining') || h.includes('ঋণ') || h.includes('পরিশোধ') || h.includes('বকেয়া') ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLoans.map((l, idx) => (
                <tr key={l.id}>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{l.type === 'given' ? (bn ? 'কর্জ দেওয়া' : 'Given') : (bn ? 'কর্জ নেওয়া' : 'Taken')}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{formatDate(l.date)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px' }}>{l.name} {l.phone ? `(${l.phone})` : ''}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right' }}>{money(l.amount)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right', color: '#16a34a' }}>{money(l.paidAmount || 0)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{money(l.remainingAmount)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'center' }}>{l.status === 'settled' || l.remainingAmount <= 0.01 ? (bn ? 'পরিশোধিত' : 'Settled') : (bn ? 'চলমান' : 'Active')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DayBook;
