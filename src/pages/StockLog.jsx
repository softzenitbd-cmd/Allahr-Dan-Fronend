import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Layers, Printer,
  RefreshCcw, Scale, Search, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import './StockLog.css';

/**
 * The stock audit trail.
 *
 * Every sale, purchase, return, SR issue and reversal already writes a row
 * here; until now nothing read them back, so "why is this product down to
 * four?" had no answer. The table only grows, so it is always queried with
 * filters and the server caps what comes back.
 */

// The server's movement types, with the words a shopkeeper would use and the
// direction each one moves stock.
const TYPES = [
  { id: 'All', label: 'All Movements' },
  { id: 'SALE', label: 'Sale', dir: 'out' },
  { id: 'PURCHASE', label: 'Purchase', dir: 'in' },
  { id: 'CUSTOMER_RETURN', label: 'Customer Return', dir: 'in' },
  { id: 'SUPPLIER_REJECT', label: 'Supplier Reject', dir: 'out' },
  { id: 'SR_ISSUE', label: 'Issued to SR', dir: 'out' },
  { id: 'SR_RETURN', label: 'Returned by SR', dir: 'in' },
  { id: 'ADJUSTMENT', label: 'Adjustment', dir: 'both' },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map((x) => [x.id, x.label]));

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

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const [product, setProduct] = useState('');
  const [movementType, setMovementType] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  const hasFilters = Boolean(product || movementType !== 'All' || startDate || endDate || search);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { limit: 500 };
    if (product) params.product = product;
    if (movementType !== 'All') params.movement_type = movementType;
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
    setProduct(''); setMovementType('All'); setStartDate(''); setEndDate(''); setSearch('');
  };

  const productName = product ? (inventory.find((p) => p.id === product)?.name || product) : null;

  const stats = summary ? [
    { key: 'entries', label: t(language, 'Total Entries'), value: summary.totalEntries,
      colour: 'var(--info)', Icon: Layers },
    { key: 'in', label: t(language, 'Stock In'), value: `+${summary.totalIn}`,
      colour: 'var(--success)', Icon: TrendingUp },
    { key: 'out', label: t(language, 'Stock Out'), value: `-${summary.totalOut}`,
      colour: 'var(--danger)', Icon: TrendingDown },
    { key: 'net', label: t(language, 'Net Change'),
      value: `${summary.netChange >= 0 ? '+' : ''}${summary.netChange}`,
      colour: summary.netChange >= 0 ? 'var(--success)' : 'var(--danger)', Icon: Scale },
  ] : [];

  return (
    <div className="stocklog-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Stock Movement Log')}</h1>
          <p className="text-muted">
            {language === 'bn'
              ? 'কোন পণ্য কবে কেন কমল বা বাড়ল — প্রতিটি নড়াচড়ার হিসাব।'
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
                  const colour = isIn ? 'var(--success)' : 'var(--danger)';
                  const when = new Date(r.created_at);
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
                          style={{ background: `${colour}1f`, color: colour }}
                        >
                          {isIn ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                          {TYPE_LABEL[r.movement_type] || r.movement_type}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="qty" style={{ color: colour }}>
                          {isIn ? `+${r.quantity_changed}` : r.quantity_changed}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }} className="balance">{r.balance_after}</td>
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
            Allah Dan Gents Point
          </h2>
          <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>Stock Movement Log</h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {productName ? `${productName} · ` : ''}
            {movementType !== 'All' ? `${TYPE_LABEL[movementType]} · ` : ''}
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
                    {r.quantity_changed > 0 ? `+${r.quantity_changed}` : r.quantity_changed}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '0.35rem', textAlign: 'center' }}>{r.balance_after}</td>
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
