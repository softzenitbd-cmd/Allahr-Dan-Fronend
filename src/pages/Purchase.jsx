import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, Search, Trash2, Database, List, Printer, FilePlus, Eye, FileText, Edit } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import './Purchase.css';

// What has been paid on a purchase is what went out at the time plus every
// supplier payment filed against it since; the API sends both as totalPaid /
// dueRemaining, and older rows without them fall back to the original split.
const purchasePaid = (p) => {
  if (p.totalPaid !== undefined && p.totalPaid !== null) return Number(p.totalPaid) || 0;
  return Number(p.paidAmount !== undefined ? p.paidAmount : p.total) || 0;
};
const purchaseDue = (p) => {
  if (p.dueRemaining !== undefined && p.dueRemaining !== null) return Number(p.dueRemaining) || 0;
  return Math.max(0, Number(p.total) - purchasePaid(p));
};

const Purchase = () => {
  const { suppliers, inventory, purchases, processPurchase, deletePurchase, user, language } = useStore();
  // Deleting a purchase un-receives goods and lowers the payable, so the
  // server restricts it to an Admin. Edit works by delete-then-recreate.
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState('New'); // 'New' or 'History'

  const [supplier, setSupplier] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [items, setItems] = useState([{ productId: '', name: '', quantity: 1, price: 0 }]);

  // Quick Entry State
  const [tempProductId, setTempProductId] = useState('');
  const [tempVariant, setTempVariant] = useState('');
  const [tempQty, setTempQty] = useState(1);
  const [tempPrice, setTempPrice] = useState(0);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  const filteredPurchases = purchases.filter(p => {
    if (!startDate && !endDate) return true;
    const pDate = p.date.split('T')[0];
    if (startDate && pDate < startDate) return false;
    if (endDate && pDate > endDate) return false;
    return true;
  });

  const handleEditPurchase = async (purchase) => {
    if (window.confirm('Editing will reverse this purchase from history and load it into the new purchase form. Do you want to continue?')) {
      setSupplier(purchase.supplierName);
      setPaymentType(purchase.paymentType);
      setPaidAmount(purchase.paidAmount !== undefined ? purchase.paidAmount : purchase.total);
      setItems(purchase.items);

      await deletePurchase(purchase.id);

      setActiveTab('New');
      toast.info('Purchase loaded for editing.');
    }
  };

  const handleDeletePurchase = async (id) => {
    if (window.confirm('Are you sure you want to delete this purchase? This will reverse stock and supplier balances. This action cannot be undone.')) {
      const res = await deletePurchase(id);
      if (res?.ok) {
        toast.success('Purchase deleted successfully!');
      }
    }
  };

  return (
    <div className="purchase-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Purchase Management')}</h1>
          <p className="text-muted">{language === 'bn' ? 'সাপ্লায়ার থেকে নতুন ক্রয় যোগ করুন।' : 'Enter new purchases from suppliers (Cash or Baki).'}</p>
        </div>
      </div>

      <div className="card" style={{ padding: '0.5rem', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <div className="segmented-control">
          <button
            type="button"
            className={activeTab === 'New' ? 'active' : ''}
            onClick={() => setActiveTab('New')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <FilePlus size={16} /> {t(language, 'New Purchase Order' || 'New Entry')}
          </button>
          <button
            type="button"
            className={activeTab === 'History' ? 'active' : ''}
            onClick={() => setActiveTab('History')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <List size={16} /> {t(language, 'Purchase History')}
          </button>
        </div>
      </div>

      {activeTab === 'New' && (
        <div className="quick-entry-container animate-slide-up">

          {/* TOP COMPACT HEADER */}
          <div className="qe-header">
            <div>
              <h2 className="text-xl font-bold mb-1">New Purchase</h2>
              <p className="text-muted text-sm">Add items quickly via the input row below.</p>
            </div>
            <div className="flex-align-gap">
              <div className="qe-field">
                <label>Date</label>
                <input type="date" value={new Date().toISOString().split('T')[0]} readOnly style={{ width: '140px', background: 'transparent' }} />
              </div>
              <div className="qe-field">
                <label>Supplier</label>
                <input
                  list="suppliers-list"
                  placeholder="Search or Type Custom..."
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  style={{ width: '180px' }}
                />
                <datalist id="suppliers-list">
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </datalist>
              </div>
              <div className="qe-field">
                <label>Payment</label>
                <select value={paymentType} onChange={(e) => {
                  setPaymentType(e.target.value);
                  setPaidAmount('');
                }} style={{ width: '120px' }}>
                  <option value="Cash">Cash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Baki">Baki</option>
                </select>
              </div>
              {paymentType === 'Baki' && (
                <div className="qe-field">
                  <label>Nagad/Paid Tk</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    style={{ width: '120px' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SINGLE INPUT ROW (Quick Entry) */}
          <div className="qe-input-row">
            <div className="qe-field">
              <label>{t(language, 'Item Name' || 'Product')}</label>
              <input
                list="inventory-products"
                placeholder={t(language, 'Search')}
                value={tempProductId}
                onChange={(e) => {
                  const val = e.target.value;
                  setTempProductId(val);
                  const prod = inventory.find(p => p.name === val || p.id === val);
                  if (prod) setTempPrice(prod.price);
                }}
              />
              <datalist id="inventory-products">
                {inventory.map(p => <option key={p.id} value={p.name}>{p.name} (Stock: {p.stock})</option>)}
              </datalist>
            </div>
            <div className="qe-field">
              <label>{t(language, 'Variant')}</label>
              <input
                type="text"
                placeholder="e.g. Red, XL"
                value={tempVariant}
                onChange={(e) => setTempVariant(e.target.value)}
              />
            </div>
            <div className="qe-field">
              <label>{t(language, 'Qty')}</label>
              <input
                type="number"
                min="1"
                value={tempQty}
                onChange={(e) => setTempQty(parseFloat(e.target.value) || 1)}
              />
            </div>
            <div className="qe-field">
              <label>{t(language, 'Unit Price')} (৳)</label>
              <input
                type="number"
                min="0"
                value={tempPrice}
                onChange={(e) => setTempPrice(parseFloat(e.target.value) || 0)}
              />
            </div>
            <button
              className="btn-primary"
              style={{ height: '42px', padding: '0 1.5rem' }}
              onClick={() => {
                if (!tempProductId || tempQty <= 0) return;

                const prod = inventory.find(p => p.name === tempProductId || p.id === tempProductId);
                const finalId = prod ? prod.id : `CUSTOM_${Date.now()}`;
                const finalName = prod ? prod.name : tempProductId;

                const newItems = [...items.filter(i => i.productId)];
                const existingIndex = newItems.findIndex(i => i.productId === finalId && i.variant === tempVariant);

                if (existingIndex >= 0) {
                  newItems[existingIndex].quantity += tempQty;
                  newItems[existingIndex].price = tempPrice;
                } else {
                  newItems.push({ productId: finalId, name: finalName, variant: tempVariant, quantity: tempQty, price: tempPrice });
                }

                setItems(newItems);
                setTempProductId('');
                setTempVariant('');
                setTempQty(1);
                setTempPrice(0);
              }}
            >
              <Plus size={18} /> Add
            </button>
          </div>

          {/* PREVIEW GRID (Read-Only) */}
          <div className="qe-table-container">
            <table className="qe-table">
              <thead>
                <tr>
                  <th>{t(language, 'Item Name')}</th>
                  <th>{t(language, 'Variant')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Qty')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Unit Price')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Total')}</th>
                  <th style={{ width: '50px', textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.filter(i => i.productId).length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No items added yet. Use the row above to add products.
                    </td>
                  </tr>
                ) : (
                  items.filter(i => i.productId).map((item, index) => (
                    <tr key={index}>
                      <td className="font-bold text-main">{item.name}</td>
                      <td className="text-muted">{item.variant || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>৳{item.price.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }} className="text-primary">
                        ৳{(item.quantity * item.price).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon text-danger"
                          onClick={() => {
                            const newItems = items.filter(i => i.productId).filter((_, i) => i !== index);
                            setItems(newItems);
                          }}
                          title="Remove Item"
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

          {/* FLOATING FOOTER */}
          <div className="qe-footer">
            <div className="text-muted">
              {items.filter(i => i.productId).length} products added
            </div>
            <div className="flex-align-gap" style={{ gap: '1.5rem' }}>
              <div className="text-right">
                <div className="text-muted text-sm uppercase font-bold">{t(language, 'Total')}</div>
                <div className="qe-total" style={{ fontSize: paymentType === 'Baki' ? '1.2rem' : '1.5rem' }}>
                  ৳{items.reduce((acc, item) => acc + (item.quantity * item.price), 0).toLocaleString()}
                </div>
              </div>
              {paymentType === 'Baki' && (
                <>
                  <div className="text-right" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
                    <div className="text-muted text-sm uppercase font-bold">{t(language, 'Paid Amount')}</div>
                    <div className="qe-total text-success" style={{ fontSize: '1.2rem' }}>
                      ৳{parseFloat(paidAmount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
                    <div className="text-danger text-sm uppercase font-bold">{t(language, 'Due Amount')}</div>
                    <div className="qe-total text-danger" style={{ fontSize: '1.5rem' }}>
                      ৳{Math.max(0, items.reduce((acc, item) => acc + (item.quantity * item.price), 0) - (parseFloat(paidAmount) || 0)).toLocaleString()}
                    </div>
                  </div>
                </>
              )}
              <button
                className="btn-primary"
                style={{ padding: '1rem 2rem', fontSize: '1.2rem', borderRadius: 'var(--radius-lg)' }}
                onClick={async () => {
                  const total = items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
                  if (!supplier) {
                    toast.error('Please select a supplier');
                    return;
                  }
                  const validItems = items.filter(i => i.productId && i.quantity > 0);
                  if (validItems.length === 0) {
                    toast.error('Please add at least one valid item');
                    return;
                  }

                  const supplierObj = suppliers.find(s => s.name === supplier || s.id === supplier);
                  const finalSupplierId = supplierObj ? supplierObj.id : `SUP_CUSTOM_${Date.now()}`;
                  const finalSupplierName = supplierObj ? supplierObj.name : supplier;

                  setIsSubmittingPurchase(true);
                  try {
                    const res = await processPurchase({
                      supplierId: finalSupplierId,
                      supplierName: finalSupplierName,
                      paymentType,
                      items: validItems,
                      total,
                      paidAmount: paymentType === 'Baki' ? (parseFloat(paidAmount) || 0) : total,
                      date: new Date().toISOString(),
                      id: 'PUR' + Date.now()
                    });

                    if (res?.ok) {
                      toast.success('Purchase successfully recorded!');
                      setSupplier('');
                      setPaidAmount('');
                      setItems([]);
                      setActiveTab('History');
                    }
                  } finally {
                    setIsSubmittingPurchase(false);
                  }
                }}
                disabled={isSubmittingPurchase || items.filter(i => i.productId).length === 0 || !supplier}
              >
                <FilePlus size={20} className="mr-2 inline" />
                {isSubmittingPurchase ? 'Processing...' : 'Save Purchase'}
              </button>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'History' && (
        <div className="card glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <h2>Purchase History</h2>
            <div className="flex-align-gap">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Start Date"
              />
              <span>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                title="End Date"
              />
              <button className="btn-primary flex-align-gap" onClick={() => {
                printElement('printable-all-purchases-details', 'Purchase');
              }}>
                <Printer size={16} /> Print All Details
              </button>
            </div>
          </div>
          <div className="table-responsive mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>{t(language, 'Invoice ID')}</th>
                  <th>{t(language, 'Supplier Name')}</th>
                  <th>{t(language, 'Items')}</th>
                  <th>{t(language, 'Payment Method')}</th>
                  <th>{t(language, 'Total')}</th>
                  <th>{t(language, 'Paid Amount')}</th>
                  <th>{t(language, 'Due Amount')}</th>
                  <th style={{ textAlign: 'right', paddingRight: '0.85rem' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map(p => (
                  <tr key={p.id}>
                    <td>{p.date.split('T')[0]}</td>
                    <td>{p.id}</td>
                    <td>{p.supplierName}</td>
                    <td>{p.items.reduce((acc, i) => acc + i.quantity, 0)} items</td>
                    <td><span className={`badge ${p.paymentType === 'Cash' ? 'bg-success' : 'bg-warning'}`}>{p.paymentType}</span></td>
                    <td className="font-bold">৳{p.total.toLocaleString()}</td>
                    <td className="text-success font-bold">৳{purchasePaid(p).toLocaleString()}</td>
                    <td className="text-danger font-bold">৳{purchaseDue(p).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => setSelectedInvoice(p)}>
                          <Eye size={16} />
                        </button>
                        {isAdmin && (
                          <>
                            <button className="btn-icon text-info" title="Edit" onClick={() => handleEditPurchase(p)}>
                              <Edit size={16} />
                            </button>
                            <button className="btn-icon text-danger" title="Delete" onClick={() => handleDeletePurchase(p.id)}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && <tr><td colSpan="9" className="text-center text-muted">No purchase history found for this date range.</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'none' }}>
            <div id="printable-all-purchases-details" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
              <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
              <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>Detailed Purchase History</h3>
              {(startDate || endDate) && <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>Date Filter: {startDate || 'Any'} to {endDate || 'Any'}</p>}

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Date</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Invoice</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Supplier</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Payment</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Item</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Variant</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>Qty</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Price</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Total</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Paid</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((purchase) => (
                    <React.Fragment key={purchase.id}>
                      {purchase.items.map((item, idx) => (
                        <tr key={`${purchase.id}-${idx}`}>
                          {idx === 0 && (
                            <>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{new Date(purchase.date).toLocaleDateString()}</td>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{purchase.id}</td>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{purchase.supplierName || 'N/A'}</td>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{purchase.paymentType}</td>
                            </>
                          )}
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.name}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.variant || '-'}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{item.price}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{item.price * item.quantity}</td>
                          {idx === 0 && (
                            <>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', verticalAlign: 'top' }}>৳{purchasePaid(purchase)}</td>
                              <td rowSpan={purchase.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', verticalAlign: 'top' }}>৳{purchaseDue(purchase)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      <tr style={{ background: '#f8f9fa' }}>
                        <td colSpan="10" style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>Invoice {purchase.id} Total: ৳{purchase.total}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div style={{ textAlign: 'right', marginTop: '1.5rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
                Grand Total: ৳{filteredPurchases.reduce((acc, p) => acc + p.total, 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Print Drawer */}
      {selectedInvoice && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Purchase Receipt</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedInvoice(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-invoice-pur" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
                <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                  Purchase Receipt: {selectedInvoice.id}<br />
                  Date: {new Date(selectedInvoice.date).toLocaleString()}
                </p>
                <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

                <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: '#333' }}>
                  {selectedInvoice.supplierName && <><strong>Supplier:</strong> {selectedInvoice.supplierName}<br /></>}
                  <strong>Payment:</strong> {selectedInvoice.paymentType}
                </div>

                <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#000', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Item</th>
                      <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem 0' }}>
                          {item.name} {item.variant ? `(${item.variant})` : ''} <br />
                          <small style={{ color: '#666' }}>{item.quantity} x ৳{item.price}</small>
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>
                          ৳{item.price * item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: '#000' }}>
                  <span>Total:</span>
                  <span>৳{selectedInvoice.total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem', color: '#000' }}>
                  <span>Paid Amount:</span>
                  <span>৳{purchasePaid(selectedInvoice)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem', color: '#000' }}>
                  <span>Due Amount:</span>
                  <span>৳{purchaseDue(selectedInvoice)}</span>
                </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                printElement('printable-single-invoice-pur', 'Purchase');
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

export default Purchase;
