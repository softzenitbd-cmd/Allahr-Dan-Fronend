import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Printer, Trash2, Wallet, Search, RefreshCcw, X,
  FileText, Banknote, AlertCircle, Receipt, Download, Edit, RotateCcw,
} from 'lucide-react';
import { toast } from 'react-toastify';
import useStore from '../store/useStore';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import InvoiceDocument, { fromApiInvoice } from '../components/InvoiceDocument';
import ThermalReceipt from '../components/ThermalReceipt';
import { t } from '../utils/i18n';
import './POSHistory.css';
import { formatDate } from '../utils/date';

/**
 * Every invoice the counter has filed, and what is still owed on each one.
 *
 * The POS screen prints a receipt at the moment of sale and then forgets it.
 * This is where a document is found again afterwards: reprinted for a customer
 * who lost theirs, checked against what was actually paid, and -- for a sale
 * that went out on Baki or Partial -- settled when the customer comes back
 * with the money.
 */

const money = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/** What the server says is still outstanding, tolerating an older payload. */
const outstandingOf = (sale) => {
  if (sale?.dueRemaining !== undefined && sale?.dueRemaining !== null) return Number(sale.dueRemaining) || 0;
  return Number(sale?.due_amount) || 0;
};

/** Everything received against the invoice: at the till, plus later collections. */
const receivedOf = (sale) => {
  if (sale?.totalPaid !== undefined && sale?.totalPaid !== null) return Number(sale.totalPaid) || 0;
  return Number(sale?.paid_amount) || 0;
};

const PAYMENT_METHODS = ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bangla QR'];

const STAT_TINTS = {
  count: 'rgba(59,130,246,0.12)',
  sales: 'rgba(99,102,241,0.12)',
  received: 'rgba(16,185,129,0.12)',
  due: 'rgba(239,68,68,0.12)',
};

const POSHistory = () => {
  const {
    sales, customers, shopProfile, language, user,
    payInvoiceDue, deleteSale, refresh,
  } = useStore();

  const isAdmin = user?.role === 'Admin';
  const navigate = useNavigate();

  const handleEditInvoice = (sale) => {
    // Editing re-rings the whole sale, which would put returned goods back
    // on the shelf a second time. Undo the returns first.
    if (sale.returnStatus && sale.returnStatus !== 'none') {
      toast.error(language === 'bn'
        ? 'এই চালানে রিটার্ন আছে। আগে Returns → History থেকে রিটার্নটা মুছুন, তারপর এডিট করুন।'
        : 'This invoice has returns against it. Delete them in Returns → History first, then edit.');
      return;
    }
    navigate('/pos', { state: { editSale: sale } });
  };

  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [dueOnly, setDueOnly] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selected, setSelected] = useState(null);
  const [payModal, setPayModal] = useState({ show: false, sale: null, amount: '', date: '', method: 'Cash', notes: '' });
  const [saving, setSaving] = useState(false);
  const [quickThermalSale, setQuickThermalSale] = useState(null);

  const handleQuickThermalPrint = (sale) => {
    setQuickThermalSale(sale);
    setTimeout(() => {
      printElement('printable-quick-thermal-history', `Receipt-${sale.id || sale.invoice_number}`, { isThermal: true });
    }, 200);
  };

  // The list comes from the store's `sales` slice, which the layout only loads
  // for the routes that declare it. Ask for it on the way in so a direct link
  // to this page is not an empty table.
  useEffect(() => {
    refresh('sales', 'customers');
  }, [refresh]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh('sales', 'customers', 'treasury');
    setIsRefreshing(false);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sales || []).filter((s) => {
      const day = String(s.date || '').split('T')[0];
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
      if (paymentFilter !== 'All') {
        if (paymentFilter === 'Mobile Banking') {
          if (!s.paymentType?.startsWith('Mobile Banking') && !['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap'].includes(s.paymentType)) {
            return false;
          }
        } else if (!s.paymentType?.includes(paymentFilter)) {
          return false;
        }
      }
      if (dueOnly && outstandingOf(s) <= 0) return false;
      if (!term) return true;
      return (
        String(s.id || '').toLowerCase().includes(term) ||
        String(s.customerName || '').toLowerCase().includes(term) ||
        String(s.customer_phone || '').toLowerCase().includes(term) ||
        String(s.salesmanName || '').toLowerCase().includes(term) ||
        (s.items || []).some((item) =>
          String(item.name || '').toLowerCase().includes(term) ||
          String(item.variant || '').toLowerCase().includes(term)
        )
      );
    });
  }, [sales, search, startDate, endDate, paymentFilter, dueOnly]);

  const stats = useMemo(() => {
    const totals = filtered.reduce((acc, s) => {
      acc.sales += Number(s.total) || 0;
      acc.received += receivedOf(s);
      acc.due += outstandingOf(s);
      return acc;
    }, { sales: 0, received: 0, due: 0 });

    return [
      { key: 'count', label: language === 'bn' ? 'চালান' : 'Invoices', value: filtered.length, colour: 'var(--info)', Icon: FileText },
      { key: 'sales', label: language === 'bn' ? 'মোট বিক্রয়' : 'Total Sales', value: `৳${money(totals.sales)}`, colour: 'var(--primary)', Icon: Receipt },
      { key: 'received', label: language === 'bn' ? 'মোট আদায়' : 'Total Received', value: `৳${money(totals.received)}`, colour: 'var(--success)', Icon: Banknote },
      { key: 'due', label: language === 'bn' ? 'মোট বকেয়া' : 'Outstanding Due', value: `৳${money(totals.due)}`, colour: 'var(--danger)', Icon: AlertCircle },
    ];
  }, [filtered, language]);

  const clearFilters = () => {
    setSearch(''); setStartDate(''); setEndDate(''); setPaymentFilter('All'); setDueOnly(false);
  };

  const openPayModal = (sale) => {
    setPayModal({
      show: true,
      sale,
      amount: String(outstandingOf(sale)),
      date: new Date().toISOString().split('T')[0],
      method: 'Cash',
      notes: '',
    });
  };

  const closePayModal = () => setPayModal({ show: false, sale: null, amount: '', date: '', method: 'Cash', notes: '' });

  const handlePayDue = async (e) => {
    e.preventDefault();
    const { sale } = payModal;
    const amount = parseFloat(payModal.amount);
    const remaining = outstandingOf(sale);

    if (!amount || amount <= 0) {
      toast.error(language === 'bn' ? 'সঠিক পরিমাণ লিখুন।' : 'Enter a valid amount.');
      return;
    }
    if (amount > remaining + 0.001) {
      toast.error(
        language === 'bn'
          ? `এই চালানের বকেয়া ৳${money(remaining)}, তার বেশি নেওয়া যাবে না।`
          : `This invoice only has ৳${money(remaining)} due.`
      );
      return;
    }

    setSaving(true);
    const res = await payInvoiceDue(sale.id, {
      amount,
      date: payModal.date,
      method: payModal.method,
      notes: payModal.notes,
    });
    setSaving(false);

    if (res?.ok) {
      toast.success(
        language === 'bn'
          ? `৳${money(amount)} জমা হয়েছে (${sale.id})`
          : `৳${money(amount)} received against ${sale.id}`
      );
      // Keep an open receipt in step with what was just collected.
      if (res.invoice) {
        setSelected((prev) => (prev && prev.id === res.invoice.id ? res.invoice : prev));
      }
      closePayModal();
    }
  };

  const handleDelete = async (sale) => {
    const confirmed = window.confirm(
      `Delete invoice ${sale.id}? Stock, the customer's balance and any payments taken against it will be reversed.`
    );
    if (!confirmed) return;
    const res = await deleteSale(sale.id);
    if (res?.ok) {
      toast.success('Invoice deleted.');
      if (selected?.id === sale.id) setSelected(null);
    }
  };

  const shopName = (language === 'bn' && shopProfile?.shop_name_bn)
    ? shopProfile.shop_name_bn
    : (shopProfile?.shop_name || 'Allahr dan gents point');

  return (
    <div className="poshistory-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{language === 'bn' ? 'পিওএস ইতিহাস' : 'POS History'}</h1>
          <p className="text-muted">
            {language === 'bn'
              ? 'প্রতিটি বিক্রয়ের চালান — কত পরিশোধ, কত বকেয়া, এবং বকেয়া জমা নেওয়ার সুযোগ।'
              : 'Every invoice the counter has filed: what was paid, what is still due, and where to collect it.'}
          </p>
        </div>
        <div className="flex-align-gap">
          <button className="btn-outline flex-align-gap" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : undefined} />
            {isRefreshing ? t(language, 'Loading...') : t(language, 'Refresh')}
          </button>
          <button className="btn-primary flex-align-gap" onClick={() => printElement('printable-invoice-list', 'POS-History')}>
            <Printer size={16} /> {language === 'bn' ? 'তালিকা প্রিন্ট' : 'Print List'}
          </button>
        </div>
      </div>

      <div className="poshistory-stats">
        {stats.map(({ key, label, value, colour, Icon }) => (
          <div className="poshistory-stat" key={key}>
            <div className="icon" style={{ background: STAT_TINTS[key], color: colour }}>
              <Icon size={21} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="label">{label}</div>
              <div className="value" style={{ color: key === 'count' ? 'var(--text-main)' : colour }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card glass mb-4" style={{ padding: '1rem' }}>
        <div className="poshistory-filters">
          <div className="field grow">
            <label>{t(language, 'Search')}</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="w-full"
                style={{ paddingLeft: '2rem' }}
                placeholder={language === 'bn' ? 'চালান নম্বর, কাস্টমার, ফোন বা পণ্য' : 'Invoice no, customer, phone or product'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>{language === 'bn' ? 'শুরুর তারিখ' : 'From'}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="field">
            <label>{language === 'bn' ? 'শেষ তারিখ' : 'To'}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="field">
            <label>{t(language, 'Payment Method')}</label>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="All">{language === 'bn' ? 'সব' : 'All'}</option>
              {['Cash', 'Mobile Banking', 'bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Baki', 'Partial'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <label
              className="flex-align-gap"
              style={{ cursor: 'pointer', padding: '0.55rem 0.75rem', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '10px' }}
            >
              <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
              <span style={{ fontSize: '0.85rem' }}>{language === 'bn' ? 'শুধু বকেয়া' : 'Due only'}</span>
            </label>
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <button className="btn-outline flex-align-gap" onClick={clearFilters}>
              <X size={15} /> {language === 'bn' ? 'ফিল্টার মুছুন' : 'Clear'}
            </button>
          </div>
        </div>
      </div>

      <div className="card glass">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t(language, 'Date')}</th>
                <th>{t(language, 'Invoice ID')}</th>
                <th>{t(language, 'Customer Name')}</th>
                <th>{language === 'bn' ? 'বিক্রেতা' : 'Salesman'}</th>
                <th>{language === 'bn' ? 'বিক্রিত পণ্য' : 'Products Sold'}</th>
                <th>{t(language, 'Payment Method')}</th>
                <th style={{ textAlign: 'right' }}>{t(language, 'Total')}</th>
                <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'পরিশোধ' : 'Paid'}</th>
                <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'বকেয়া' : 'Due'}</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'লাভ' : 'Profit'}</th>}
                <th style={{ textAlign: 'right', paddingRight: '0.85rem' }}>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const remaining = outstandingOf(s);
                const received = receivedOf(s);
                const settled = remaining <= 0;
                return (
                  <tr key={s.id}>
                    <td>{formatDate(s.date)}</td>
                    <td style={{ fontWeight: 600 }}>{s.id}</td>
                    <td>
                      {s.customerName || 'N/A'}
                      {s.customer_phone && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{s.customer_phone}</div>
                      )}
                    </td>
                    <td>{s.salesmanName || 'Admin'}</td>
                    <td style={{ minWidth: '180px', maxWidth: '300px' }}>
                      {s.items && s.items.length > 0 ? (
                        <div className="poshistory-products-cell">
                          {s.items.map((item, idx) => (
                            <div key={idx} className="poshistory-product-row">
                              <span className="poshistory-product-name" title={item.name}>
                                • {item.name}
                                {item.variant ? <span className="poshistory-product-variant"> ({item.variant})</span> : null}
                              </span>
                              <span className="poshistory-product-qty">
                                ×{item.quantity}
                              </span>
                              {isAdmin && item.profit !== undefined && (
                                <span
                                  className={`poshistory-product-profit ${!item.costKnown ? 'unknown' : item.profit < 0 ? 'loss' : ''}`}
                                  title={item.costKnown
                                    ? (language === 'bn'
                                      ? `বিক্রি ৳${money(item.lineRevenue)} − ক্রয়মূল্য ৳${money(item.lineCost)}`
                                      : `Sold ৳${money(item.lineRevenue)} − cost ৳${money(item.lineCost)}`)
                                    : (language === 'bn' ? 'ক্রয়মূল্য দেওয়া নেই' : 'No cost price set')}
                                >
                                  {item.costKnown ? `${item.profit < 0 ? '−' : '+'}৳${money(Math.abs(item.profit))}` : '?'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pay-pill ${settled ? 'paid' : received > 0 ? 'partial' : 'due'}`}>
                        {s.paymentType}
                      </span>
                      {s.returnStatus && s.returnStatus !== 'none' && (
                        <span className={`ret-pill ${s.returnStatus}`} title={language === 'bn' ? `ফেরত মূল্য ৳${money(s.returnedValue)}` : `Returned value ৳${money(s.returnedValue)}`}>
                          {s.returnStatus === 'full'
                            ? (language === 'bn' ? 'রিটার্নড' : 'Returned')
                            : (language === 'bn' ? 'আংশিক রিটার্ন' : 'Part returned')}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{money(s.total)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>৳{money(received)}</td>
                    <td style={{
                      textAlign: 'right',
                      color: remaining > 0 ? 'var(--danger)' : 'var(--text-muted)',
                      fontWeight: remaining > 0 ? 700 : 400,
                    }}>
                      ৳{money(remaining)}
                    </td>
                    {isAdmin && (
                      <td style={{
                        textAlign: 'right', fontWeight: 700,
                        color: s.profit == null ? 'var(--text-muted)' : s.profit < 0 ? 'var(--danger)' : 'var(--success)',
                      }}>
                        {s.profit == null ? '—' : `${s.profit < 0 ? '−' : ''}৳${money(Math.abs(s.profit))}`}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button
                          className="btn-icon"
                          title={language === 'bn' ? 'থার্মাল প্রিন্ট' : 'Thermal Print'}
                          onClick={() => handleQuickThermalPrint(s)}
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          className="btn-icon"
                          title={language === 'bn' ? 'দেখুন ও প্রিন্ট' : 'View & Print'}
                          onClick={() => setSelected(s)}
                        >
                          <Eye size={16} />
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-icon text-info"
                            title={language === 'bn' ? 'চালান এডিট করুন' : 'Edit Invoice'}
                            onClick={() => handleEditInvoice(s)}
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {remaining > 0 && (
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--success)' }}
                            title={language === 'bn' ? 'বকেয়া জমা নিন' : 'Receive due payment'}
                            onClick={() => openPayModal(s)}
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn-icon text-danger" title={t(language, 'Delete')} onClick={() => handleDelete(s)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 11 : 10} className="text-center text-muted" style={{ padding: '2rem' }}>
                    {language === 'bn' ? 'এই ফিল্টারে কোনো চালান পাওয়া যায়নি।' : 'No invoices match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* The filtered list, laid out for paper. */}
      <div style={{ display: 'none' }}>
        <div id="printable-invoice-list" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
          <h2 style={{ textAlign: 'center', margin: 0 }}>{shopName}</h2>
          <h3 style={{ textAlign: 'center', fontWeight: 500 }}>POS Invoice History</h3>
          {(startDate || endDate) && (
            <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>{startDate || 'Any'} to {endDate || 'Any'}</p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Date</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Invoice</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Customer</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Salesman</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Products</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' }}>Payment</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>Total</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>Paid</th>
                <th style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>{formatDate(s.date)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>{s.id}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>{s.customerName || 'N/A'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>{s.salesmanName || 'Admin'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>
                    {(s.items || []).map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}`).join(', ') || '—'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem' }}>{s.paymentType}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>৳{money(s.total)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>৳{money(receivedOf(s))}</td>
                  <td style={{ border: '1px solid #ddd', padding: '0.4rem', textAlign: 'right' }}>৳{money(outstandingOf(s))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: '1rem', fontWeight: 700 }}>
            Grand Total: ৳{money(filtered.reduce((acc, s) => acc + (Number(s.total) || 0), 0))}
            {'  |  '}
            Due: ৳{money(filtered.reduce((acc, s) => acc + outstandingOf(s), 0))}
          </div>
        </div>
      </div>

      {/* One invoice, in full */}
      {selected && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '780px' }}>
            <div className="drawer-header">
              <h2 style={{ margin: 0 }}>{language === 'bn' ? 'চালান' : 'Invoice'} {selected.id}</h2>
              <button className="drawer-close-btn" onClick={() => setSelected(null)}>
                <X size={22} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: 0, background: '#fff' }}>
              <InvoiceDocument
                sale={fromApiInvoice(selected, customers)}
                shopProfile={shopProfile}
                language={language}
                domId="printable-invoice-detail"
              />
              <div style={{ display: 'none' }}>
                <ThermalReceipt
                  sale={fromApiInvoice(selected, customers)}
                  shopProfile={shopProfile}
                  language={language}
                  domId="printable-thermal-invoice-detail"
                />
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div className="flex-align-gap" style={{ gap: '6px' }}>
                {outstandingOf(selected) > 0 && (
                  <span className="pay-pill due">
                    {language === 'bn' ? 'বকেয়া' : 'Due'}: ৳{money(outstandingOf(selected))}
                  </span>
                )}
                {selected.returnStatus && selected.returnStatus !== 'none' && (
                  <span className={`ret-pill ${selected.returnStatus}`}>
                    {selected.returnStatus === 'full'
                      ? (language === 'bn' ? 'রিটার্নড' : 'Returned')
                      : (language === 'bn' ? 'আংশিক রিটার্ন' : 'Part returned')} · ৳{money(selected.returnedValue)}
                  </span>
                )}
              </div>
              <div className="flex-align-gap" style={{ gap: '8px' }}>
                {/* Returns are taken against the invoice they came from. */}
                {selected.returnStatus !== 'full' && <button
                  className="btn-outline flex-align-gap"
                  onClick={() => navigate(`/returns?invoice=${encodeURIComponent(selected.id)}`)}
                  title={language === 'bn' ? 'এই চালানের পণ্য ফেরত নিন' : 'Take goods back from this invoice'}
                >
                  <RotateCcw size={16} /> {language === 'bn' ? 'রিটার্ন' : 'Return'}
                </button>}
                {outstandingOf(selected) > 0 && (
                  <button className="btn-outline flex-align-gap" onClick={() => openPayModal(selected)}>
                    <Wallet size={16} /> {language === 'bn' ? 'বকেয়া জমা নিন' : 'Pay Due'}
                  </button>
                )}
                <button
                  className="btn-primary flex-align-gap"
                  onClick={() => printElement('printable-thermal-invoice-detail', `Receipt-${selected.id}`, { isThermal: true })}
                >
                  <Printer size={16} /> {language === 'bn' ? 'থার্মাল প্রিন্ট' : 'Thermal Print'}
                </button>
                <button
                  className="btn-outline flex-align-gap"
                  onClick={() => printElement('printable-invoice-detail', `Invoice-${selected.id}`, { isThermal: false })}
                >
                  <FileText size={16} /> {language === 'bn' ? 'A4 চালান' : 'A4 Invoice'}
                </button>
                <button
                  className="btn-outline flex-align-gap"
                  onClick={() => downloadElementAsPDF('printable-invoice-detail', `Invoice-${selected.id}`)}
                  title="Download A4 size invoice as PDF"
                >
                  <Download size={16} /> {language === 'bn' ? 'A4 PDF ডাউনলোড' : 'A4 Download PDF'}
                </button>
                {isAdmin && (
                  <button
                    className="btn-outline flex-align-gap text-info"
                    style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                    onClick={() => {
                      const saleToEdit = selected;
                      setSelected(null);
                      handleEditInvoice(saleToEdit);
                    }}
                  >
                    <Edit size={16} /> {language === 'bn' ? 'চালান এডিট করুন' : 'Edit Invoice'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Receive a due payment against one invoice */}
      {payModal.show && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '420px' }}>
            <div className="drawer-header">
              <h2>{language === 'bn' ? 'বকেয়া জমা' : 'Receive Due Payment'}</h2>
              <button className="drawer-close-btn" onClick={closePayModal}>
                <X size={22} />
              </button>
            </div>

            <form className="poshistory-pay-form" onSubmit={handlePayDue} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="mb-4" style={{ lineHeight: 1.8 }}>
                  <div><span className="text-muted">{language === 'bn' ? 'চালান' : 'Invoice'}:</span> <strong>{payModal.sale?.id}</strong></div>
                  <div><span className="text-muted">{t(language, 'Customer Name')}:</span> <strong>{payModal.sale?.customerName}</strong></div>
                  <div><span className="text-muted">{t(language, 'Total')}:</span> ৳{money(payModal.sale?.total)}</div>
                  <div>
                    <span className="text-muted">{language === 'bn' ? 'বকেয়া' : 'Outstanding'}:</span>{' '}
                    <strong className="text-danger">৳{money(outstandingOf(payModal.sale))}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Amount')} (BDT)</label>
                    <input
                      type="number"
                      className="w-full"
                      value={payModal.amount}
                      onChange={(e) => setPayModal({ ...payModal, amount: e.target.value })}
                      required
                      min="1"
                      max={outstandingOf(payModal.sale)}
                      step="any"
                      autoFocus
                    />
                    <small className="text-muted">
                      {language === 'bn'
                        ? 'পুরো বকেয়া বা তার অংশবিশেষ নেওয়া যাবে।'
                        : 'Take the whole due, or part of it.'}
                    </small>
                  </div>

                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Date')}</label>
                    <input
                      type="date"
                      className="w-full"
                      value={payModal.date}
                      onChange={(e) => setPayModal({ ...payModal, date: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Payment Method')}</label>
                    <select
                      className="w-full"
                      value={payModal.method}
                      onChange={(e) => setPayModal({ ...payModal, method: e.target.value })}
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <small className="text-muted">
                      {language === 'bn'
                        ? 'যে মাধ্যমেই হোক, টাকা দোকানের ক্যাশে জমা হবে।'
                        : 'Whatever the method, the money goes into Cash in Hand.'}
                    </small>
                  </div>

                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'মন্তব্য' : 'Note'}</label>
                    <input
                      className="w-full"
                      value={payModal.notes}
                      onChange={(e) => setPayModal({ ...payModal, notes: e.target.value })}
                      placeholder={language === 'bn' ? 'ঐচ্ছিক' : 'Optional'}
                    />
                  </div>
                </div>
              </div>

              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={closePayModal}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? t(language, 'Loading...') : (language === 'bn' ? 'জমা নিন' : 'Receive Payment')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Hidden container for quick thermal print from table row */}
      {quickThermalSale && (
        <div style={{ display: 'none' }}>
          <ThermalReceipt
            sale={fromApiInvoice(quickThermalSale, customers)}
            shopProfile={shopProfile}
            language={language}
            domId="printable-quick-thermal-history"
          />
        </div>
      )}
    </div>
  );
};

export default POSHistory;
