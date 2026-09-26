import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { RefreshCcw, Search, PackageMinus, PackagePlus, List, Plus, Printer, Eye, Edit, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import './Returns.css';
import { formatDate } from '../utils/date';
import SaleReturnForm from '../components/SaleReturnForm';

const Returns = () => {
  const { inventory, processReturn, deleteReturn, returns, user, language, refresh } = useStore();
  // Deleting a return undoes its stock adjustment; Admin only on the server.
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState('New'); // 'New' or 'History'
  // "Return" on an invoice elsewhere lands here with ?invoice=INV045.
  const [searchParams] = useSearchParams();
  const invoiceFromLink = searchParams.get('invoice') || '';
  const bn = language === 'bn';

  // Returns are judged against the latest sales and returns, never a cached
  // copy: a list from a minute ago can miss the invoice just rung up, or the
  // return just taken.
  useEffect(() => { refresh('sales', 'returns'); }, [refresh]);

  // New Return State
  const [returnType, setReturnType] = useState('Customer');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [referenceId, setReferenceId] = useState('');

  // History State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  // The invoice a return was just taken on, so its rows stand out when the
  // page flips to History and nobody has to hunt for what they just did.
  const [justReturned, setJustReturned] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!product) {
      toast.error('Please select a product');
      return;
    }

    const res = await processReturn({
      returnType,
      date: entryDate,
      productId: product,
      quantity,
      reason,
      referenceId
    });

    if (res?.ok) {
      toast.success(`${returnType} Return/Reject processed successfully! Stock has been adjusted.`);
      setProduct('');
      setQuantity(1);
      setReason('');
      setReferenceId('');
      setEntryDate(new Date().toISOString().split('T')[0]);
      setActiveTab('History');
    }
  };

  const filteredReturns = returns.filter(r => {
    const rDate = String(r.date || '').split('T')[0];
    if (startDate && rDate < startDate) return false;
    if (endDate && rDate > endDate) return false;
    const q = historySearch.trim().toLowerCase();
    if (q && ![r.id, r.referenceId, r.productName, r.productId, r.reason]
      .some((v) => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const getProductName = (id) => {
    const item = inventory.find(i => i.id === id);
    return item ? item.name : 'Unknown Product';
  };

  const handleEditReturn = async (ret) => {
    if (window.confirm('Editing will reverse this return from history and load it into the new entry form. Do you want to continue?')) {
      setReturnType(ret.returnType);
      setProduct(ret.productId);
      setQuantity(ret.quantity);
      setReason(ret.reason);
      setReferenceId(ret.referenceId || '');

      await deleteReturn(ret.id);
      setActiveTab('New');
      toast.info('Return loaded for editing.');
    }
  };

  const handleDeleteReturn = async (id) => {
    if (window.confirm(bn
      ? 'এই রিটার্ন মুছবেন? স্টক, কাস্টমারের বাকি আর ফেরত দেওয়া টাকা — সব আগের মতো হয়ে যাবে।'
      : 'Delete this return? Stock, the customer\'s due and any refund will all be put back as they were.')) {
      const res = await deleteReturn(id);
      if (res?.ok) {
        toast.success('Return deleted successfully!');
      }
    }
  };

  return (
    <div className="returns-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Returns & Refunds')}</h1>
          <p className="text-muted">{language === 'bn' ? 'কাস্টমার বা সাপ্লায়ার রিটার্ন ম্যানেজ করুন।' : 'Handle customer returns or supplier rejects to adjust inventory.'}</p>
        </div>
      </div>

      <div className="card glass mb-4" style={{ padding: '0.5rem' }}>
        <div className="return-type-selector" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className={`type-btn ${activeTab === 'New' ? 'active' : ''}`} onClick={() => setActiveTab('New')} style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '120px' }}>
            <Plus size={16} className="inline-block mr-2" /> New Entry
          </button>
          <button className={`type-btn ${activeTab === 'History' ? 'active' : ''}`} onClick={() => setActiveTab('History')} style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '120px' }}>
            <List size={16} className="inline-block mr-2" /> Returns History
          </button>
        </div>
      </div>

      {activeTab === 'New' && (
        <div className="card" style={{ maxWidth: returnType === 'Customer' ? '980px' : '600px', margin: '0 auto' }}>
          <div className="segmented-control" style={{ marginBottom: '2rem' }}>
            <button
              type="button"
              className={returnType === 'Customer' ? 'active' : ''}
              onClick={() => setReturnType('Customer')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <PackagePlus size={16} /> {t(language, 'Customer Return (In)')}
            </button>
            <button
              type="button"
              className={returnType === 'Supplier' ? 'active' : ''}
              onClick={() => setReturnType('Supplier')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <PackageMinus size={16} /> {t(language, 'Supplier Return (Out)')}
            </button>
          </div>

          {returnType === 'Customer' ? (
            <SaleReturnForm
              bn={bn}
              initialInvoice={invoiceFromLink}
              onDone={(r) => { setJustReturned(r?.invoice || ''); setHistorySearch(''); setStartDate(''); setEndDate(''); setActiveTab('History'); }}
            />
          ) : (
          <form onSubmit={handleSubmit} className="return-form">
            <div className="form-group mb-4">
              <label>Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="w-full"
              />
            </div>

            <div className="form-group mb-4">
              <label>{returnType === 'Customer' ? t(language, 'Sale Invoice ID (Optional)' || 'Invoice ID') : t(language, 'Purchase ID (Optional)' || 'Invoice ID')}</label>
              <input
                type="text"
                placeholder={returnType === 'Customer' ? 'e.g. INV001' : 'e.g. PUR001'}
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="form-group mb-4">
              <label>{t(language, 'Item Name' || 'Product')}</label>
              <select value={product} onChange={(e) => setProduct(e.target.value)} required>
                <option value="">Select a product...</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name} (Stock: {item.stock})</option>
                ))}
              </select>
            </div>

            <div className="form-group mb-4">
              <label>{t(language, 'Qty')}</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div className="form-group mb-4">
              <label>{t(language, 'Return Reason')}</label>
              <textarea
                rows="3"
                placeholder="Explain reason for return/reject..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              ></textarea>
            </div>

            <button type="submit" className="btn-primary w-full flex-align-gap center-content">
              <RefreshCcw size={18} />
              {t(language, 'Process Return')} ({returnType})
            </button>
          </form>
          )}
        </div>
      )}

      {activeTab === 'History' && (
        <div className="card glass animate-slide-up">
          <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <h3>Returns & Rejects History <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 500 }}>({filteredReturns.length})</span></h3>
            <div className="flex-align-gap" style={{ flexWrap: 'wrap' }}>
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={bn ? 'চালান নং, পণ্য বা রিটার্ন আইডি…' : 'Invoice no, product or return ID…'}
                style={{ minWidth: 240 }}
              />
              <label className="text-muted text-sm">Filter by Date:</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 bg-input border border-gray-700 rounded text-main" />
              <span className="text-muted">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 bg-input border border-gray-700 rounded text-main" />
              <button className="btn-primary flex-align-gap" onClick={() => {
                printElement('printable-all-returns-details', 'Returns');
              }}>
                <Printer size={18} /> Print All Details
              </button>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t(language, 'Date')}</th>
                  <th>{t(language, 'Invoice ID' || 'Ref ID')}</th>
                  <th>{t(language, 'Type')}</th>
                  <th>{t(language, 'Item Name')}</th>
                  <th>{t(language, 'Qty')}</th>
                  <th style={{ textAlign: 'right' }}>{bn ? 'মূল্য' : 'Value'}</th>
                  <th>{bn ? 'টাকার হিসাব' : 'Settled as'}</th>
                  <th>{t(language, 'Return Reason' || 'Reason')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredReturns.map(r => (
                  <tr key={r.id} className={justReturned && r.referenceId === justReturned ? 'ret-just-saved' : ''}>
                    <td>{r.id}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.referenceId || '-'}</td>
                    <td>
                      <span className={`badge ${r.returnType === 'Customer' ? 'bg-success text-success' : 'bg-danger text-danger'}`} style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: r.returnType === 'Customer' ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)' }}>
                        {r.returnType} {r.returnType === 'Customer' ? 'Return' : 'Reject'}
                      </span>
                    </td>
                    <td>{getProductName(r.productId)}</td>
                    <td className="font-bold">{r.quantity}</td>
                    <td style={{ textAlign: 'right' }}>৳{((Number(r.unit_price) || 0) * r.quantity).toLocaleString()}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {Number(r.due_adjusted) > 0 && <div className="text-warning">{bn ? 'বাকি কমেছে' : 'Due cut'} ৳{Number(r.due_adjusted).toLocaleString()}</div>}
                      {Number(r.refund_amount) > 0 && <div className="text-danger">{bn ? 'ফেরত' : 'Refund'} ৳{Number(r.refund_amount).toLocaleString()} ({r.refund_account})</div>}
                      {!(Number(r.due_adjusted) > 0) && !(Number(r.refund_amount) > 0) && <span className="text-muted">{r.returnType === 'Customer' ? (bn ? 'শুধু স্টক' : 'stock only') : '—'}</span>}
                    </td>
                    <td>{r.reason}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => setSelectedInvoice(r)}>
                          <Eye size={16} />
                        </button>
                        {isAdmin && (
                          <>
                            {r.returnType !== 'Customer' && (
                              <button className="btn-icon text-info" title="Edit" onClick={() => handleEditReturn(r)}>
                                <Edit size={16} />
                              </button>
                            )}
                            <button className="btn-icon text-danger" title="Delete" onClick={() => handleDeleteReturn(r.id)}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReturns.length === 0 && <tr><td colSpan="10" className="text-center text-muted">No returns found.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'none' }}>
            <div id="printable-all-returns-details" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
              <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
              <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>Detailed Returns & Rejects History</h3>
              {(startDate || endDate) && <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>Date Filter: {startDate || 'Any'} to {endDate || 'Any'}</p>}

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Date</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Return ID</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Ref ID</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Type</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Product</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>Qty</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Reason</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{formatDate(r.date)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{r.id}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{r.referenceId || '-'}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{r.returnType}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{getProductName(r.productId)} (ID: {r.productId})</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center', verticalAlign: 'top' }}>{r.quantity}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{r.reason}</td>
                      <td style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{r.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Single Return Drawer */}
      {selectedInvoice && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Return Receipt</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedInvoice(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-return" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
                <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                  {selectedInvoice.returnType} {selectedInvoice.returnType === 'Customer' ? 'Return' : 'Reject'} Receipt<br />
                  ID: {selectedInvoice.id}<br />
                  Date: {new Date(selectedInvoice.date).toLocaleString()}
                </p>
                <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

                <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                  <p><strong>Product Name:</strong> {getProductName(selectedInvoice.productId)}</p>
                  {selectedInvoice.referenceId && (
                    <p><strong>{selectedInvoice.returnType === 'Customer' ? 'Sale Invoice ID' : 'Purchase ID'}:</strong> {selectedInvoice.referenceId}</p>
                  )}
                  <p><strong>Quantity:</strong> <span className="font-bold text-xl">{selectedInvoice.quantity}</span></p>
                  <p><strong>Reason:</strong> {selectedInvoice.reason}</p>
                  <p><strong>Effect:</strong> {selectedInvoice.returnType === 'Customer' ? 'Added to Stock (+)' : 'Removed from Stock (-)'}</p>
                </div>

                <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', marginTop: '1.5rem' }}>
                  Thank you!
                </p>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                printElement('printable-single-return', 'Returns');
              }}>
                <Printer size={20} /> Print Receipt
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Returns;
