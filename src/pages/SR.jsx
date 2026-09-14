import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, List, Truck, Trash2, Printer, Eye, PackageCheck } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';

const money = (n) => `৳${Number(n || 0).toLocaleString()}`;

/**
 * The SR (sales representative) consignment day.
 *
 * Morning: stock is issued to a salesman and leaves the shelf immediately.
 * Night: the salesman brings back what did not sell and hands over cash. What
 * he sold but did not pay for becomes a due against him.
 */
const SR = () => {
  const {
    srSettlements, staff, inventory, user, language,
    issueSRStock, settleSR, deleteSRSettlement,
  } = useStore();

  const isAdmin = user?.role === 'Admin';
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState('Issue');

  // --- Issue form ---
  const [salesmanId, setSalesmanId] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [tempProduct, setTempProduct] = useState('');
  const [tempQty, setTempQty] = useState(1);

  // --- Settle drawer ---
  const [settling, setSettling] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [returnQtys, setReturnQtys] = useState({});
  const [viewing, setViewing] = useState(null);

  // --- History filters ---
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const pending = (srSettlements || []).filter((s) => s.status === 'Pending');
  const history = (srSettlements || []).filter((s) => {
    if (!startDate && !endDate) return true;
    const d = String(s.date).split('T')[0];
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const issuedTotal = items.reduce((acc, i) => acc + i.quantity * i.price, 0);

  const addItem = () => {
    const product = inventory.find((p) => p.name === tempProduct || p.id === tempProduct);
    if (!product) {
      toast.error('Pick a product from the list.');
      return;
    }
    if (tempQty <= 0) {
      toast.error('Quantity must be more than zero.');
      return;
    }
    if (tempQty > product.stock) {
      toast.error(`Only ${product.stock} ${product.unit} of ${product.name} in stock.`);
      return;
    }

    const existing = items.findIndex((i) => i.productId === product.id);
    const next = [...items];
    if (existing >= 0) {
      const combined = next[existing].quantity + tempQty;
      if (combined > product.stock) {
        toast.error(`Only ${product.stock} ${product.unit} of ${product.name} in stock.`);
        return;
      }
      next[existing] = { ...next[existing], quantity: combined };
    } else {
      next.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        price: Number(product.price),
        quantity: tempQty,
        stock: product.stock,
      });
    }
    setItems(next);
    setTempProduct('');
    setTempQty(1);
  };

  const handleIssue = async () => {
    if (!salesmanId) {
      toast.error('Choose which salesman is taking the stock.');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one product to issue.');
      return;
    }

    const res = await issueSRStock({
      salesmanId,
      date: issueDate,
      notes,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.price })),
    });

    if (res?.ok) {
      toast.success('Stock issued. The day is now open for settlement.');
      setItems([]);
      setNotes('');
      setActiveTab('Pending');
    }
  };

  const openSettle = (record) => {
    setSettling(record);
    setCashReceived('');
    setReturnQtys(Object.fromEntries(record.items.map((i) => [i.productId, 0])));
  };

  // What the SR owes is decided by what he did not bring back.
  const settleSold = settling
    ? settling.items.reduce(
      (acc, i) => acc + (i.quantity - (Number(returnQtys[i.productId]) || 0)) * Number(i.price),
      0
    )
    : 0;
  const settleShortfall = Math.max(0, settleSold - (parseFloat(cashReceived) || 0));

  const handleSettle = async () => {
    const cash = parseFloat(cashReceived);
    if (cashReceived === '' || Number.isNaN(cash) || cash < 0) {
      toast.error('Enter how much cash the salesman handed over.');
      return;
    }

    const bad = settling.items.find((i) => {
      const q = Number(returnQtys[i.productId]) || 0;
      return q < 0 || q > i.quantity;
    });
    if (bad) {
      toast.error(`Returned quantity for ${bad.name} cannot be more than the ${bad.quantity} issued.`);
      return;
    }

    const res = await settleSR(settling.id, {
      cashReceived: cash,
      returnItems: settling.items.map((i) => ({
        productId: i.productId,
        returnQty: Number(returnQtys[i.productId]) || 0,
      })),
    });

    if (res?.ok) {
      toast.success(
        settleShortfall > 0
          ? `Settled. ${money(settleShortfall)} added to the salesman's due.`
          : 'Settled in full. Nothing outstanding.'
      );
      setSettling(null);
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm(
      `Delete ${record.id}? Stock still with the salesman goes back to the shelf and any due raised is removed.`
    )) return;
    const res = await deleteSRSettlement(record.id);
    if (res?.ok) toast.success('SR record deleted.');
  };

  return (
    <div className="sr-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'SR Consignment')}</h1>
          <p className="text-muted">
            {language === 'bn'
              ? 'সকালে সেলসম্যানকে মাল দিন, রাতে অবিক্রীত মাল ও ক্যাশ বুঝে নিন।'
              : 'Issue stock to a salesman in the morning, reconcile unsold goods and cash at night.'}
          </p>
        </div>
      </div>

      <div className="card glass mb-4" style={{ padding: '0.5rem' }}>
        <div className="return-type-selector" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            className={`type-btn ${activeTab === 'Issue' ? 'active' : ''}`}
            onClick={() => setActiveTab('Issue')}
            style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '140px' }}
          >
            <Plus size={16} className="inline-block mr-2" /> {t(language, 'Issue Stock')}
          </button>
          <button
            className={`type-btn ${activeTab === 'Pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('Pending')}
            style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '140px' }}
          >
            <PackageCheck size={16} className="inline-block mr-2" /> {t(language, 'Pending')} ({pending.length})
          </button>
          <button
            className={`type-btn ${activeTab === 'History' ? 'active' : ''}`}
            onClick={() => setActiveTab('History')}
            style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '140px' }}
          >
            <List size={16} className="inline-block mr-2" /> {t(language, 'History')}
          </button>
        </div>
      </div>

      {/* ---------------- Issue ---------------- */}
      {activeTab === 'Issue' && (
        <div className="card animate-slide-up">
          <div className="card-toolbar" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="text-muted text-sm block mb-1">{t(language, 'Salesman')} *</label>
              <select
                value={salesmanId}
                onChange={(e) => setSalesmanId(e.target.value)}
                style={{ minWidth: '200px' }}
              >
                <option value="">Select a salesman...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="text-muted text-sm block mb-1">{t(language, 'Date')}</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
              <label className="text-muted text-sm block mb-1">{t(language, 'Notes')}</label>
              <input
                type="text"
                className="w-full"
                placeholder="Route, area, or any remark"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div
            className="flex-align-gap"
            style={{ gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.5rem' }}
          >
            <div className="form-group" style={{ flex: 2, minWidth: '240px' }}>
              <label className="text-muted text-sm block mb-1">{t(language, 'Item Name')}</label>
              <input
                list="sr-products"
                className="w-full"
                placeholder={t(language, 'Search')}
                value={tempProduct}
                onChange={(e) => setTempProduct(e.target.value)}
              />
              <datalist id="sr-products">
                {inventory.map((p) => (
                  <option key={p.id} value={p.name}>{p.name} (Stock: {p.stock})</option>
                ))}
              </datalist>
            </div>
            <div className="form-group" style={{ width: '110px' }}>
              <label className="text-muted text-sm block mb-1">{t(language, 'Qty')}</label>
              <input
                type="number"
                min="1"
                className="w-full"
                value={tempQty}
                onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
              />
            </div>
            <button className="btn-primary flex-align-gap" style={{ height: '42px' }} onClick={addItem}>
              <Plus size={18} /> {t(language, 'Add')}
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Item Name')}</th>
                  <th>{t(language, 'Unit')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Qty')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Price')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Total')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-muted" style={{ padding: '2rem' }}>
                      Nothing added yet. Pick a product above to load the salesman's bag.
                    </td>
                  </tr>
                ) : (
                  items.map((i) => (
                    <tr key={i.productId}>
                      <td className="font-bold">{i.name}</td>
                      <td className="text-muted">{i.unit}</td>
                      <td style={{ textAlign: 'center' }}>{i.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{money(i.price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }} className="text-primary">
                        {money(i.quantity * i.price)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon text-danger"
                          title="Remove"
                          onClick={() => setItems(items.filter((x) => x.productId !== i.productId))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            className="flex-align-gap"
            style={{ justifyContent: 'flex-end', gap: '2rem', marginTop: '1.5rem', flexWrap: 'wrap' }}
          >
            <div className="text-right">
              <div className="text-muted text-sm uppercase font-bold">{t(language, 'Total Issued Value')}</div>
              <div className="text-primary" style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                {money(issuedTotal)}
              </div>
            </div>
            <button
              className="btn-primary flex-align-gap"
              style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
              onClick={handleIssue}
              disabled={items.length === 0 || !salesmanId}
            >
              <Truck size={20} /> {t(language, 'Issue Stock')}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Pending ---------------- */}
      {activeTab === 'Pending' && (
        <div className="card glass animate-slide-up">
          <h3 className="mb-4">{t(language, 'Awaiting Settlement')}</h3>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>ID</th>
                  <th>{t(language, 'Salesman')}</th>
                  <th>{t(language, 'Items')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Total Issued Value')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No stock is out with a salesman right now.
                    </td>
                  </tr>
                ) : (
                  pending.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.date).split('T')[0]}</td>
                      <td>{s.id}</td>
                      <td className="font-bold">{s.salesmanName}</td>
                      <td>{s.items.length} items</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{money(s.totalIssuedValue)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex-align-gap" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
                          <button className="btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }} onClick={() => openSettle(s)}>
                            {t(language, 'Settle')}
                          </button>
                          <button className="btn-icon" title="View" onClick={() => setViewing(s)}>
                            <Eye size={16} />
                          </button>
                          {isAdmin && (
                            <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(s)}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- History ---------------- */}
      {activeTab === 'History' && (
        <div className="card glass animate-slide-up">
          <div
            className="flex-between mb-4"
            style={{ flexWrap: 'wrap', gap: '1rem', display: 'flex', justifyContent: 'space-between' }}
          >
            <h3>{t(language, 'SR History')}</h3>
            <div className="flex-align-gap">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Start Date" />
              <span className="text-muted">to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="End Date" />
              <button
                className="btn-primary flex-align-gap"
                onClick={() => {
                  printElement('printable-sr-history', 'SR');
                }}
              >
                <Printer size={16} /> Print
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>ID</th>
                  <th>{t(language, 'Salesman')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Issued')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Sold')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Cash')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Due Amount')}</th>
                  <th>{t(language, 'Status')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan="9" className="text-center text-muted">No SR records for this date range.</td></tr>
                ) : (
                  history.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.date).split('T')[0]}</td>
                      <td>{s.id}</td>
                      <td>{s.salesmanName}</td>
                      <td style={{ textAlign: 'right' }}>{money(s.totalIssuedValue)}</td>
                      <td style={{ textAlign: 'right' }}>{s.status === 'Settled' ? money(s.totalSalesValue) : '-'}</td>
                      <td style={{ textAlign: 'right' }} className="text-success">
                        {s.status === 'Settled' ? money(s.cashReceived) : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }} className={Number(s.dueAmount) > 0 ? 'text-danger font-bold' : ''}>
                        {Number(s.dueAmount) > 0 ? money(s.dueAmount) : '-'}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: s.status === 'Settled' ? 'rgba(40,167,69,0.12)' : 'rgba(245,158,11,0.12)',
                            color: s.status === 'Settled' ? 'var(--success)' : 'var(--warning)',
                            fontWeight: 600,
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex-align-gap" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
                          <button className="btn-icon" title="View" onClick={() => setViewing(s)}>
                            <Eye size={16} />
                          </button>
                          {s.status === 'Pending' && (
                            <button className="btn-icon text-info" title="Settle" onClick={() => openSettle(s)}>
                              <PackageCheck size={16} />
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(s)}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'none' }}>
            <div id="printable-sr-history" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
              <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Allahr dan gents point
              </h2>
              <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>SR Consignment History</h3>
              {(startDate || endDate) && (
                <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Date Filter: {startDate || 'Any'} to {endDate || 'Any'}
                </p>
              )}
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    {['Date', 'ID', 'Salesman', 'Issued', 'Sold', 'Cash', 'Due', 'Status'].map((h) => (
                      <th key={h} style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id}>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{String(s.date).split('T')[0]}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{s.id}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{s.salesmanName}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>{money(s.totalIssuedValue)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>{money(s.totalSalesValue)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>{money(s.cashReceived)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>{money(s.dueAmount)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: '1.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                Total Cash Collected: {money(history.reduce((a, s) => a + Number(s.cashReceived || 0), 0))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Settle drawer ---------------- */}
      {settling && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Settle')} — {settling.salesmanName}</h2>
              <button className="drawer-close-btn" onClick={() => setSettling(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="drawer-body">
              <p className="text-muted mb-4">
                {language === 'bn'
                  ? 'যে মাল ফেরত এসেছে তার পরিমাণ লিখুন, তারপর কত টাকা জমা দিল সেটা দিন।'
                  : 'Enter how much of each item came back, then how much cash was handed over.'}
              </p>

              <div className="table-responsive mb-4">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t(language, 'Item Name')}</th>
                      <th style={{ textAlign: 'center' }}>{t(language, 'Issued')}</th>
                      <th style={{ textAlign: 'center' }}>{t(language, 'Returned')}</th>
                      <th style={{ textAlign: 'center' }}>{t(language, 'Sold')}</th>
                      <th style={{ textAlign: 'right' }}>{t(language, 'Total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settling.items.map((i) => {
                      const ret = Number(returnQtys[i.productId]) || 0;
                      const sold = i.quantity - ret;
                      return (
                        <tr key={i.productId}>
                          <td className="font-bold">{i.name}</td>
                          <td style={{ textAlign: 'center' }}>{i.quantity}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={i.quantity}
                              style={{ width: '70px', padding: '0.25rem', textAlign: 'center' }}
                              value={returnQtys[i.productId] ?? 0}
                              onChange={(e) =>
                                setReturnQtys({ ...returnQtys, [i.productId]: parseInt(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{sold}</td>
                          <td style={{ textAlign: 'right' }}>{money(sold * Number(i.price))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="summary-section">
                <div className="summary-row">
                  <span>{t(language, 'Total Sales Value')}</span>
                  <span className="font-bold">{money(settleSold)}</span>
                </div>
                <div className="summary-row">
                  <span>{t(language, 'Cash Received')} *</span>
                  <input
                    type="number"
                    className="discount-input"
                    min="0"
                    placeholder="0"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                  />
                </div>
                <div className="summary-row total-row">
                  <span>{t(language, 'Shortfall (SR Due)')}</span>
                  <span className={settleShortfall > 0 ? 'text-danger' : 'text-success'} style={{ fontWeight: 800 }}>
                    {money(settleShortfall)}
                  </span>
                </div>
              </div>

              {settleShortfall > 0 && (
                <p className="text-muted text-sm mt-2">
                  {money(settleShortfall)} will be added to {settling.salesmanName}&apos;s due and can be
                  collected later from the Customers &amp; Dues screen.
                </p>
              )}
            </div>

            <div className="drawer-footer">
              <button type="button" className="btn-outline" onClick={() => setSettling(null)}>
                {t(language, 'Cancel')}
              </button>
              <button type="button" className="btn-primary flex-align-gap" onClick={handleSettle}>
                <PackageCheck size={18} /> {t(language, 'Confirm Settlement')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ---------------- View drawer ---------------- */}
      {viewing && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>SR Slip</h3>
              <button className="drawer-close-btn" onClick={() => setViewing(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: 0, backgroundColor: '#fff' }}>
              <div id="printable-sr-slip" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  Allahr dan gents point
                </h2>
                <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                  SR Consignment Slip: {viewing.id}<br />
                  Date: {String(viewing.date).split('T')[0]} &middot; Status: {viewing.status}
                </p>
                <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                  <strong>Salesman:</strong> {viewing.salesmanName}
                  {viewing.notes ? <><br /><strong>Notes:</strong> {viewing.notes}</> : null}
                </p>

                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginBottom: '1rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Item</th>
                      <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Issued</th>
                      <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Returned</th>
                      <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Sold</th>
                      <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.items.map((i) => (
                      <tr key={i.productId} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.5rem 0' }}>{i.name}</td>
                        <td style={{ textAlign: 'center' }}>{i.quantity}</td>
                        <td style={{ textAlign: 'center' }}>{i.returnQty ?? i.return_quantity ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>{i.soldQty}</td>
                        <td style={{ textAlign: 'right' }}>{money(i.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {[
                  ['Total Issued Value', viewing.totalIssuedValue],
                  ['Total Sales Value', viewing.totalSalesValue],
                  ['Cash Received', viewing.cashReceived],
                  ['Due (SR)', viewing.dueAmount],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.35rem' }}>
                    <span>{label}:</span>
                    <span style={{ fontWeight: label === 'Due (SR)' ? 'bold' : 'normal' }}>{money(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button
                className="btn-primary flex-align-gap"
                style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }}
                onClick={() => {
                  printElement('printable-sr-slip', 'SR');
                }}
              >
                <Printer size={20} /> Print Slip
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SR;
