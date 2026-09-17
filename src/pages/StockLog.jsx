import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle, ArrowUpCircle, Layers, Printer,
  RefreshCcw, Scale, Search, TrendingDown, TrendingUp, X,
  AlertTriangle, PackagePlus,
} from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import './StockLog.css';

/**
 * The stock audit trail.
 *
 * Every sale, purchase, return, SR issue, damage and reversal writes a row
 * here. The table only grows, so it is queried with filters and the server
 * caps what comes back.
 */

// The server's movement types, with the words a shopkeeper would use and the
// direction each one moves stock.
const TYPES = [
  { id: 'All', label: 'All Movements', labelBn: 'সকল নড়াচড়া' },
  { id: 'ADDITIONS', label: 'All Stock In (Added)', labelBn: 'সকল পণ্য যোগ (স্টক ইন)', dir: 'in' },
  { id: 'DAMAGE', label: 'Damage / Loss', labelBn: 'ক্ষতিগ্রস্ত / ড্যামেজ পণ্য', dir: 'out' },
  { id: 'PURCHASE', label: 'Purchase', labelBn: 'ক্রয় চালান', dir: 'in' },
  { id: 'SALE', label: 'Sale', labelBn: 'বিক্রয়', dir: 'out' },
  { id: 'CUSTOMER_RETURN', label: 'Customer Return', labelBn: 'কাস্টমার ফেরত', dir: 'in' },
  { id: 'SUPPLIER_REJECT', label: 'Supplier Reject', labelBn: 'সাপ্লায়ার রিজেক্ট', dir: 'out' },
  { id: 'SR_ISSUE', label: 'Issued to SR', labelBn: 'এসআর ইস্যু', dir: 'out' },
  { id: 'SR_RETURN', label: 'Returned by SR', labelBn: 'এসআর ফেরত', dir: 'in' },
  { id: 'ADJUSTMENT', label: 'Adjustment', labelBn: 'স্টক সমন্বয় / এডিট', dir: 'both' },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map((x) => [x.id, x.label]));
const TYPE_LABEL_BN = Object.fromEntries(TYPES.map((x) => [x.id, x.labelBn || x.label]));

const QUICK_TABS = [
  { id: 'All', labelBn: 'সকল নড়াচড়া', labelEn: 'All Movements', icon: Layers },
  { id: 'ADDITIONS', labelBn: '📦 পণ্য যোগের হিস্ট্রি', labelEn: '📦 Stock In History', icon: ArrowUpCircle, className: 'tab-in' },
  { id: 'DAMAGE', labelBn: '⚠️ ড্যামেজ হিস্ট্রি', labelEn: '⚠️ Damage History', icon: AlertTriangle, className: 'tab-damage' },
  { id: 'PURCHASE', labelBn: '🚚 ক্রয় চালান', labelEn: '🚚 Purchases', icon: TrendingUp },
  { id: 'SALE', labelBn: '🛒 বিক্রয়', labelEn: '🛒 Sales', icon: TrendingDown },
];

/** "3 min ago" for anything today, so recent activity reads without arithmetic. */
const relativeTime = (iso) => {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

const StockLog = () => {
  const { inventory, language, fetchStockLogs } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const [product, setProduct] = useState(() => searchParams.get('product') || '');
  const [movementType, setMovementType] = useState(() => searchParams.get('type') || 'All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  const hasFilters = Boolean(product || movementType !== 'All' || startDate || endDate || search);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { limit: 500 };
    if (product) params.product = product;
    if (movementType !== 'All') {
      if (movementType === 'ADDITIONS') {
        params.direction = 'in';
      } else {
        params.movement_type = movementType;
      }
    }
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (search.trim()) params.search = search.trim();

    const res = await fetchStockLogs(params);
    if (res?.ok) {
      setRows(res.rows);
      setSummary(res.summary);
    }
    setLoading(false);
  }, [fetchStockLogs, product, movementType, startDate, endDate, search]);

  // Filters are applied on the server, so a change means a new request. The
  // search box is debounced so typing does not fire one per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const clearFilters = () => {
    setProduct('');
    setMovementType('All');
    setStartDate('');
    setEndDate('');
    setSearch('');
    setSearchParams({});
  };

  const handleTabClick = (tabId) => {
    setMovementType(tabId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tabId === 'All') next.delete('type');
      else next.set('type', tabId);
      return next;
    });
  };

  const productName = product ? (inventory.find((p) => p.id === product)?.name || product) : null;

  const stats = summary ? [
    {
      key: 'entries', label: t(language, 'Total Entries'), value: summary.totalEntries,
      colour: 'var(--info)', Icon: Layers
    },
    {
      key: 'in', label: language === 'bn' ? 'মোট যোগ (Stock In)' : t(language, 'Stock In'),
      value: `+${summary.totalIn}`,
      colour: 'var(--success)', Icon: TrendingUp
    },
    {
      key: 'out', label: language === 'bn' ? 'মোট কর্তন / ক্ষতি (Stock Out)' : t(language, 'Stock Out'),
      value: `-${summary.totalOut}`,
      colour: 'var(--danger)', Icon: TrendingDown
    },
    {
      key: 'net', label: t(language, 'Net Change'),
      value: `${summary.netChange >= 0 ? '+' : ''}${summary.netChange}`,
      colour: summary.netChange >= 0 ? 'var(--success)' : 'var(--danger)', Icon: Scale
    },
  ] : [];

  return (
    <div className="stocklog-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Stock Movement Log')}</h1>
          <p className="text-muted">
            {language === 'bn'
              ? 'কোন পণ্য কবে কত পিস যোগ বা ড্যামেজ হয়েছে — প্রতিটি নড়াচড়ার নিখুঁত হিসাব।'
              : 'Every movement in and out of stock, and the document behind it.'}
          </p>
        </div>
        <div className="flex-align-gap">
          <button className="btn-outline flex-align-gap" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'spin' : undefined} />
            {loading ? t(language, 'Loading...') : t(language, 'Refresh')}
          </button>
          <button className="btn-primary flex-align-gap" onClick={() => printElement('printable-stock-log', 'StockLog')}>
            <Printer size={16} /> {t(language, 'Print')}
          </button>
        </div>
      </div>

      {/* Quick Filter Tabs: All, Stock In / Additions, Damage, Purchases, Sales */}
      <div className="stocklog-tabs">
        {QUICK_TABS.map((tab) => {
          const isActive = movementType === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`stocklog-tab-btn ${isActive ? `active ${tab.className || ''}` : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              <TabIcon size={16} />
              {language === 'bn' ? tab.labelBn : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* What the current filters add up to. Sits on one line so the table
          below stays on screen. */}
      {summary && (
        <div className="stocklog-stats">
          {stats.map(({ key, label, value, colour, Icon }) => (
            <div className="stocklog-stat" key={key}>
              <div className="icon" style={{ background: `${colour}1a`, color: colour }}>
                <Icon size={21} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="label">{label}</div>
                <div className="value" style={{ color: key === 'entries' ? 'var(--text-main)' : colour }}>
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="stocklog-filters">
          <div className="field grow">
            <label htmlFor="stocklog-search">{t(language, 'Search')}</label>
            <div className="search-bar" style={{ margin: 0 }}>
              <Search size={17} className="text-muted" />
              <input
                id="stocklog-search"
                type="text"
                placeholder={language === 'bn' ? 'পণ্য, রেফারেন্স বা কারণ...' : 'Product, reference or reason...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="stocklog-product">{t(language, 'Item Name')}</label>
            <select id="stocklog-product" value={product} onChange={(e) => setProduct(e.target.value)} style={{ minWidth: '170px' }}>
              <option value="">{language === 'bn' ? 'সব পণ্য' : 'All products'}</option>
              {inventory.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="stocklog-type">{t(language, 'Type')}</label>
            <select id="stocklog-type" value={movementType} onChange={(e) => setMovementType(e.target.value)} style={{ minWidth: '170px' }}>
              {TYPES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}{x.dir === 'in' ? ' (in)' : x.dir === 'out' ? ' (out)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>{t(language, 'Date')}</label>
            <div className="dates">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="From" />
              <span className="text-muted">–</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="To" />
            </div>
          </div>

          {hasFilters && (
            <button className="btn-outline flex-align-gap" onClick={clearFilters} style={{ height: '40px' }}>
              <X size={15} /> {t(language, 'Clear Filters')}
            </button>
          )}
        </div>

        <div className="flex-align-gap" style={{ justifyContent: 'space-between', margin: '0.85rem 0', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="text-muted text-sm">
            {loading
              ? (language === 'bn' ? 'লোড হচ্ছে...' : 'Loading...')
              : `${rows.length}${rows.length >= 500 ? '+' : ''} ${language === 'bn' ? 'টি নড়াচড়া' : 'movements'}`}
            {productName ? ` · ${productName}` : ''}
          </span>
          {rows.length >= 500 && (
            <span className="text-muted text-sm">
              {language === 'bn'
                ? 'সাম্প্রতিক ৫০০টি দেখানো হচ্ছে — আরও পিছনে যেতে ফিল্টার দিন।'
                : 'Showing the most recent 500 — filter to reach further back.'}
            </span>
          )}
        </div>

        <div className="table-responsive stocklog-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t(language, 'Date')}</th>
                <th>{t(language, 'Item Name')}</th>
                <th>{t(language, 'Type')}</th>
                <th style={{ textAlign: 'center' }}>{t(language, 'Change')}</th>
                <th style={{ textAlign: 'center' }}>{t(language, 'Balance After')}</th>
                <th>{t(language, 'Reference')}</th>
                <th>{t(language, 'Reason')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="stocklog-empty">
                      {loading ? (
                        <div className="big">{language === 'bn' ? 'লোড হচ্ছে...' : 'Loading...'}</div>
                      ) : (
                        <>
                          <div className="big">
                            {hasFilters
                              ? (language === 'bn' ? 'এই ফিল্টারে কিছু নেই' : 'Nothing matches these filters')
                              : (language === 'bn' ? 'এখনো কোনো নড়াচড়া হয়নি' : 'No stock has moved yet')}
                          </div>
                          <div>
                            {hasFilters
                              ? (language === 'bn' ? 'তারিখ বা ধরন বদলে দেখুন।' : 'Try a wider date range or a different type.')
                              : (language === 'bn' ? 'বিক্রি বা ক্রয় করলে এখানে দেখা যাবে।' : 'Sales and purchases will show up here.')}
                          </div>
                          {hasFilters && (
                            <button className="btn-outline mt-4" onClick={clearFilters}>
                              {t(language, 'Clear Filters')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isIn = r.quantity_changed > 0;
                  const isDamage = r.movement_type === 'DAMAGE';
                  const colour = isDamage ? '#dc2626' : isIn ? '#059669' : '#e11d48';
                  const when = new Date(r.created_at);
                  const unitStr = r.unit || 'pcs';

                  // Determine human-friendly movement label
                  let label = TYPE_LABEL[r.movement_type] || r.movement_type;
                  if (language === 'bn') {
                    if (isDamage) label = '⚠️ ড্যামেজ / নষ্ট';
                    else if (r.movement_type === 'PURCHASE' && r.reference_id?.startsWith('INIT')) label = 'নতুন পণ্য (প্রারম্ভিক)';
                    else if (r.movement_type === 'ADJUSTMENT' && isIn) label = 'স্টক যোগ / বৃদ্ধি';
                    else label = TYPE_LABEL_BN[r.movement_type] || label;
                  }

                  return (
                    <tr key={r.id} className={isIn ? 'is-in' : 'is-out'}>
                      <td className="when" style={{ whiteSpace: 'nowrap' }}>
                        {when.toLocaleDateString()}
                        <span className="time">
                          {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {relativeTime(r.created_at)}
                        </span>
                      </td>
                      <td>
                        <span className="font-bold">{r.product_name}</span>
                        <span className="text-muted" style={{ display: 'block', fontSize: '0.75rem' }}>{r.product_code}</span>
                      </td>
                      <td>
                        <span
                          className="movement"
                          style={{ background: `${colour}1a`, color: colour, fontWeight: 600 }}
                        >
                          {isDamage ? <AlertTriangle size={13} /> : isIn ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                          {label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="qty" style={{ color: colour, fontWeight: 700 }}>
                          {isIn ? `+${r.quantity_changed}` : r.quantity_changed} {unitStr}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }} className="balance font-semibold">
                        {r.balance_after} {unitStr}
                      </td>
                      <td><span className="ref" title={r.reference_id}>{r.reference_id || '—'}</span></td>
                      <td className="reason">{r.reason || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'none' }}>
        <div id="printable-stock-log" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Allahr dan gents point
          </h2>
          <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>
            {movementType === 'DAMAGE'
              ? 'ড্যামেজ হিস্ট্রি রিপোর্ট (Damage History Report)'
              : movementType === 'ADDITIONS'
                ? 'পণ্য যোগের হিস্ট্রি রিপোর্ট (Stock In / Additions Report)'
                : 'Stock Movement Log'}
          </h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {productName ? `${productName} · ` : ''}
            {movementType !== 'All' ? `${(language === 'bn' ? TYPE_LABEL_BN[movementType] : TYPE_LABEL[movementType]) || movementType} · ` : ''}
            {startDate || endDate ? `${startDate || 'Any'} to ${endDate || 'Any'}` : 'All dates'}
          </p>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Date', 'Product', 'Type', 'Change', 'Balance', 'Reference', 'Reason'].map((h) => (
                  <th key={h} style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem' }}>{r.product_name} ({r.product_code})</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem' }}>{TYPE_LABEL[r.movement_type] || r.movement_type}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem', textAlign: 'center' }}>
                    {r.quantity_changed > 0 ? `+${r.quantity_changed}` : r.quantity_changed} {r.unit || 'pcs'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem', textAlign: 'center' }}>{r.balance_after} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem' }}>{r.reference_id || '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem' }}>{r.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary && (
            <p style={{ textAlign: 'right', marginTop: '1rem', fontWeight: 'bold' }}>
              In: +{summary.totalIn} &nbsp; Out: -{summary.totalOut} &nbsp; Net: {summary.netChange}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockLog;
