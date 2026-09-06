import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../store/useStore';
import { 
  Search, Plus, Minus, Trash2, Gift, Database, List, Printer, Eye, 
  Download, FilePlus, Edit, Wallet, ShoppingCart, User, Phone, 
  MapPin, Sparkles, Banknote, CreditCard, FileText 
} from 'lucide-react';
import { downloadAsPDF, printElement } from '../utils/pdfGenerator';
import { openCashDrawer } from '../utils/cashDrawer';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import Expenses from './Expenses';
import './POS.css';

const POS = () => {
  const { cart, inventory, staff, user, addToCart, removeFromCart, updateCartItem, clearCart, setCart, loadDummyData, processSale, deleteSale, lookupProduct, refresh, saveDraft, deleteDraft, drafts, sales, customers, language } = useStore();
  // Editing or deleting a sale reverses stock and balances, which the server
  // only lets an Admin do. Hiding the controls keeps a salesman from
  // confirming a destructive dialog and then meeting a 403.
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState('New'); // 'New' or 'History'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', location: '' });
  const [paymentType, setPaymentType] = useState('Cash');
  const [paidAmount, setPaidAmount] = useState(0);
  // Kept as a string so the box can sit empty, which means "paid the exact amount".
  const [cashReceived, setCashReceived] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [selectedSalesman, setSelectedSalesman] = useState(user?.id || 'Admin');
  const [completedSale, setCompletedSale] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [scannedItem, setScannedItem] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const customerSearchTerm = (customerInfo.name || '').trim().toLowerCase();
  const customerSuggestions = customerSearchTerm && showCustomerDropdown
    ? (customers || []).filter(c =>
        (c.name || '').toLowerCase().includes(customerSearchTerm) ||
        (c.phone && c.phone.includes(customerSearchTerm))
      ).slice(0, 5)
    : [];

  const handleWalkInCustomer = () => {
    setCustomerInfo({ name: 'Walk-in Customer', phone: '', location: '' });
    setShowCustomerDropdown(false);
  };

  const getCashPresets = (tot) => {
    if (!tot || tot <= 0) return [];
    const presets = [tot];
    const candidateNotes = [50, 100, 200, 500, 1000, 2000];
    for (const note of candidateNotes) {
      if (note > tot && !presets.includes(note)) {
        presets.push(note);
      }
    }
    const nextHundred = Math.ceil(tot / 100) * 100;
    if (nextHundred > tot && !presets.includes(nextHundred)) {
      presets.splice(1, 0, nextHundred);
    }
    return presets.slice(0, 4);
  };
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const filteredSales = sales.filter(s => {
    if (!startDate && !endDate) return true;
    const sDate = s.date.split('T')[0];
    if (startDate && sDate < startDate) return false;
    if (endDate && sDate > endDate) return false;
    return true;
  });

  // How much sits above the till: the top bar, the tab strip, page padding.
  // The panel height used to be a guessed `100vh - 120px`, which ran a hundred
  // pixels past the bottom of the screen and took the checkout button with it.
  // Measuring the real offset keeps the button on screen at any window size.
  useEffect(() => {
    const fit = () => {
      const el = document.querySelector('.pos-container');
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      el.style.setProperty('--pos-offset', `${Math.round(top + 24)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [activeTab]);

  // Automatically focus barcode input on mount
  useEffect(() => {
    document.getElementById('barcode-input')?.focus();
    // Pull fresh stock in. The catalogue in memory was loaded at login, so
    // anything a second terminal sold since then would still read as available
    // on the card shown after a scan.
    refresh('inventory');
  }, [refresh]);

  // What the operator has typed so far, matched against the catalogue. A
  // scanner types the whole code in one burst and presses Enter, so these
  // suggestions are really for someone searching by hand.
  const searchTerm = barcodeInput.trim().toLowerCase();
  const searchResults = searchTerm
    ? inventory.filter(p =>
        String(p.id).toLowerCase().includes(searchTerm) ||
        (p.name || '').toLowerCase().includes(searchTerm)
      ).slice(0, 8)
    : [];

  const pickProduct = (product) => {
    addToCart({ ...product, isGift: false, itemDiscount: 0 });
    // Show what was just scanned, so whoever is on the counter can see the
    // machine read the right label before the customer is charged for it.
    setScannedItem(product);
    setBarcodeInput('');
    document.getElementById('barcode-input')?.focus();
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    const term = barcodeInput.trim();
    if (!term || scanning) return;

    setScanning(true);
    const product = await lookupProduct(term);
    setScanning(false);

    if (product) {
      pickProduct(product);
      return;
    }
    // Several partial matches is not a failure: leave them on screen to choose.
    if (searchResults.length > 1) {
      toast.info(`${searchResults.length} items match "${term}". Pick one below.`);
      return;
    }
    setScannedItem(null);
    toast.error(`No product found for "${term}".`);
  };

  // A scanner finishes its burst with Enter. Relying on the form's implicit
  // submission for that is fragile -- it does nothing when the submit button
  // happens to be disabled, and some keyboard layers never trigger it -- so the
  // key is handled outright. A scan that does not register is a lost sale.
  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSubmit(e);
    }
  };

  const toggleGift = (item) => {
    updateCartItem(item.id, { isGift: !item.isGift });
  };

  const subtotal = cart.reduce((acc, item) => {
    const effectivePrice = item.isGift ? 0 : (item.price - (item.itemDiscount || 0));
    return acc + (effectivePrice * item.quantity);
  }, 0);

  const total = Math.max(0, subtotal - invoiceDiscount);

  // Both conditions the checkout enforces, in one place, so the button and the
  // hint under it can never disagree about why it is disabled.
  const canCheckout = cart.length > 0 && Boolean(customerInfo.name?.trim());

  const handleCheckout = async () => {
    if (!customerInfo.name?.trim()) {
      toast.error('Customer Name is explicitly required for all sales!');
      return;
    }
    
    if (paymentType === 'Cash' && cashReceived !== '' && Number(cashReceived) > 0
        && Number(cashReceived) < total) {
      toast.error(
        `Cash received (৳${Number(cashReceived)}) is less than the total (৳${total}). ` +
        'Choose Partial to leave the rest as due.'
      );
      return;
    }

    if (paymentType === 'Partial') {
      if (!paidAmount || paidAmount <= 0) {
        toast.error('Enter how much the customer is paying now.');
        return;
      }
      if (paidAmount > total) {
        toast.error(`Paid amount cannot be more than the total (৳${total}).`);
        return;
      }
    }

    const salesmanObj = staff.find(s => s.id === selectedSalesman) || { id: 'Admin', name: 'Admin' };
    const saleData = {
      cartItems: cart,
      paymentType,
      customerInfo,
      invoiceDiscount,
      salesman: salesmanObj,
      paidAmount,
    };

    if (editingSaleId) {
      await deleteSale(editingSaleId);
      setEditingSaleId(null);
    }
    
    const res = await processSale(saleData);
    if (res?.ok) {
      // Print the invoice number the server filed. A locally generated one
      // would put a number on the customer's receipt that matches nothing in
      // the shop's records.
      setCompletedSale({
        ...saleData,
        subtotal,
        total,
        date: res.invoice?.date || new Date().toISOString(),
        invoiceId: res.invoice?.id || res.invoice?.invoice_number,
        paidAmount: Number(res.invoice?.paid_amount ?? paidAmount) || 0,
        dueAmount: Number(res.invoice?.due_amount) || 0,
        cashReceived: paymentType === 'Cash' && Number(cashReceived) > total ? Number(cashReceived) : 0,
        changeGiven: paymentType === 'Cash' && Number(cashReceived) > total ? Number(cashReceived) - total : 0,
      });
      clearCart();
      setCustomerInfo({ name: '', phone: '', location: '' });
      setInvoiceDiscount(0);
      setPaidAmount(0);
      setCashReceived('');
      // Start the next sale from the default. Leaving it on Partial with the
      // paid box back at zero is a trap for whoever is on the counter.
      setPaymentType('Cash');
      toast.success(editingSaleId ? 'Sale updated successfully!' : 'Sale processed successfully!');
    }
  };

  // Park the cart so the counter can serve someone else. The customer name is
  // not required here -- a draft is unfinished by definition.
  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      toast.error('Nothing to save. Add items to the cart first.');
      return;
    }
    const salesmanObj = staff.find(s => s.id === selectedSalesman) || { id: 'Admin', name: 'Admin' };
    const res = await saveDraft({
      cartItems: cart, customerInfo, paymentType, invoiceDiscount,
      salesman: salesmanObj, total,
    });
    if (res?.ok) {
      clearCart();
      setCustomerInfo({ name: '', phone: '', location: '' });
      setInvoiceDiscount(0);
      setPaidAmount(0);
      setCashReceived('');
      setScannedItem(null);
      toast.success(`Draft ${res.draft?.id || ''} saved.`);
    }
  };

  const handleResumeDraft = async (draft) => {
    if (cart.length > 0 && !window.confirm('This will replace what is in the cart. Continue?')) return;
    setCart(draft.cartItems || []);
    setCustomerInfo(draft.customerInfo || { name: '', phone: '', location: '' });
    setPaymentType(draft.paymentType || 'Cash');
    setInvoiceDiscount(Number(draft.invoiceDiscount) || 0);
    setActiveTab('New');
    // The draft is now in the cart; leaving it on the list invites double entry.
    await deleteDraft(draft.id);
    toast.info('Draft loaded into the cart.');
  };

  const handleDiscardDraft = async (draft) => {
    if (!window.confirm(`Discard draft ${draft.id}?`)) return;
    const res = await deleteDraft(draft.id);
    if (res?.ok) toast.success('Draft discarded.');
  };

  const handleEditSale = (sale) => {
    setCart(sale.items);
    const customer = customers.find(c => c.id === sale.customerId);
    setCustomerInfo({
       name: sale.customerName !== 'Walk-in Customer' ? sale.customerName : '',
       phone: customer?.phone || '',
       location: customer?.location || ''
    });
    setPaymentType(sale.paymentType);
    setPaidAmount(Number(sale.paid_amount) || 0);
    setInvoiceDiscount(sale.invoiceDiscount || 0);
    setSelectedSalesman(sale.salesmanId || user?.id || 'Admin');
    setEditingSaleId(sale.id);
    setActiveTab('New');
  };

  const handleDeleteSale = async (saleId) => {
    if (window.confirm('Are you sure you want to delete this sale? This action will reverse stock and cash balances.')) {
      const res = await deleteSale(saleId);
      if (res?.ok) {
        toast.success('Sale deleted successfully!');
      }
    }
  };

  return (
    <div className="pos-page animate-fade-in">
      {/* The 400px cap here fitted three tabs. Adding Drafts broke "Point of
          Sale" onto three lines and cut "Daily Expense" in half, so the strip
          now takes the width its labels need. */}
      <div className="card pos-tabs" style={{ padding: '0.5rem', margin: '0 auto 1rem auto', width: 'fit-content', maxWidth: '100%' }}>
        <div className="segmented-control">
          <button 
            type="button"
            className={activeTab === 'New' ? 'active' : ''}
            onClick={() => setActiveTab('New')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} /> {t(language, 'Point of Sale')}
          </button>
          <button 
            type="button"
            className={activeTab === 'History' ? 'active' : ''}
            onClick={() => setActiveTab('History')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <List size={16} /> {t(language, 'Sales History')}
          </button>
          <button
            type="button"
            className={activeTab === 'Drafts' ? 'active' : ''}
            onClick={() => setActiveTab('Drafts')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <FilePlus size={16} /> {t(language, 'Drafts')}{(drafts || []).length ? ` (${drafts.length})` : ''}
          </button>
          <button 
            type="button"
            className={activeTab === 'Expense' ? 'active' : ''}
            onClick={() => setActiveTab('Expense')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Database size={16} /> {t(language, 'Daily Expense')}
          </button>
        </div>
      </div>

      {activeTab === 'New' && (
      <div className="pos-container animate-fade-in">
        <div className="pos-left glass">
          <div className="pos-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%' }}>
              <h2 style={{ margin: 0 }}>{editingSaleId ? t(language, 'Edit Sale') : t(language, 'Point of Sale')}</h2>
              {/* Opens the drawer without a sale, for making change from an
                  earlier customer or putting the float in. Needs the printer's
                  "open cash drawer" setting switched on -- see utils/cashDrawer.js. */}
              <button
                type="button"
                className="btn-outline flex-align-gap"
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                onClick={() => openCashDrawer({ operator: user?.name })}
                title={language === 'bn'
                  ? 'বিক্রি ছাড়াই ড্রয়ার খুলুন (একটি No Sale স্লিপ ছাপবে)'
                  : 'Open the drawer without a sale (prints a No Sale slip)'}
              >
                <Wallet size={16} /> {t(language, 'Open Drawer')}
              </button>
            </div>
          <form onSubmit={handleBarcodeSubmit} className="barcode-form">
            <Search size={18} className="text-muted" />
            <input 
              id="barcode-input"
              type="text" 
              placeholder={t(language, 'Scan barcode or search items...')} 
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              autoComplete="off"
            />
            <button type="submit" className="btn-primary" disabled={scanning}>
              {scanning ? t(language, 'Searching...') : t(language, 'Add')}
            </button>
          </form>
        </div>

        {/* What the scanner just read. Shown so the counter can confirm the
            machine picked up the right label before the customer is charged. */}
        {scannedItem && (
          <div
            className="scanned-item"
            style={{
              margin: '0 1.5rem 1rem',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--primary)',
              background: 'var(--bg-input)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t(language, 'Scanned Item')}
              </div>
              <h4 style={{ margin: '0.15rem 0', fontSize: '1.05rem', fontWeight: 700 }}>{scannedItem.name}</h4>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                {t(language, 'ID/Barcode')}: {scannedItem.id}
                {scannedItem.variant ? ` · ${scannedItem.variant}` : ''}
                {scannedItem.category ? ` · ${scannedItem.category}` : ''}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{t(language, 'Price')}</div>
              <div className="text-primary" style={{ fontSize: '1.2rem', fontWeight: 800 }}>৳{scannedItem.price}</div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{t(language, 'Stock')}</div>
              <div
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  color: scannedItem.stock <= 0 ? 'var(--danger)' : scannedItem.stock <= 10 ? 'var(--warning)' : 'var(--success)',
                }}
              >
                {scannedItem.stock} {scannedItem.unit}
              </div>
            </div>

            <button className="btn-icon text-muted" title="Dismiss" onClick={() => setScannedItem(null)}>
              <Plus size={18} style={{ transform: 'rotate(45deg)' }} />
            </button>

            {scannedItem.stock <= 0 && (
              <div className="text-danger" style={{ flexBasis: '100%', fontSize: '0.8rem', fontWeight: 600 }}>
                {language === 'bn'
                  ? 'সতর্কতা: এই পণ্যের স্টক শেষ। বিক্রির সময় সার্ভার আটকে দিতে পারে।'
                  : 'Warning: this item shows no stock. The sale will be refused at checkout.'}
              </div>
            )}
          </div>
        )}

        {/* Quick Add Section */}
        <div className="quick-products-row">
          {inventory.length === 0 ? (
            <button className="btn-secondary flex-align-gap" style={{ fontSize: '0.82rem', padding: '0.35rem 0.8rem' }} onClick={loadDummyData}>
              <Database size={15} /> {language === 'bn' ? 'স্টক সিঙ্ক করুন' : 'Sync Inventory'}
            </button>
          ) : searchTerm ? (
            // Typing turns the shortcut row into live results.
            searchResults.length === 0 ? (
              <span className="text-muted" style={{ fontSize: '0.85rem', padding: '0.35rem 0' }}>
                {language === 'bn' ? `"${barcodeInput}" এর সাথে কিছু মিলল না।` : `Nothing matches "${barcodeInput}".`}
              </span>
            ) : (
              searchResults.map(item => (
                <button
                  key={item.id}
                  className="quick-item-chip"
                  onClick={() => pickProduct(item)}
                  title={`${item.id} · ${item.category || ''}`}
                >
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span className="price">৳{item.price}</span>
                  <span className={`stock-pill ${item.stock <= 0 ? 'stock-empty' : item.stock <= 10 ? 'stock-low' : 'stock-ok'}`}>
                    {item.stock}
                  </span>
                </button>
              ))
            )
          ) : (
            inventory.slice(0, 8).map(item => (
              <button 
                key={item.id} 
                className="quick-item-chip" 
                onClick={() => pickProduct(item)}
                title={`${item.id} · ${item.category || ''}`}
              >
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <span className="price">৳{item.price}</span>
                <span className={`stock-pill ${item.stock <= 0 ? 'stock-empty' : item.stock <= 10 ? 'stock-low' : 'stock-ok'}`}>
                  {item.stock}
                </span>
              </button>
            ))
          )}
        </div>

        {/* A running count and a way out. Clearing a cart used to mean removing
            items one at a time, and nothing on screen said how many were in it. */}
        {cart.length > 0 && (
          <div className="cart-bar">
            <span className="count">
              {cart.reduce((n, i) => n + i.quantity, 0)} {language === 'bn' ? 'টি আইটেম' : 'items'}
              <span className="text-muted"> · {cart.length} {language === 'bn' ? 'ধরন' : 'lines'}</span>
            </span>
            <button
              className="btn-icon text-danger flex-align-gap"
              onClick={() => {
                if (window.confirm(language === 'bn' ? 'পুরো কার্ট মুছে ফেলবেন?' : 'Clear the whole cart?')) {
                  clearCart();
                  setScannedItem(null);
                  document.getElementById('barcode-input')?.focus();
                }
              }}
            >
              <Trash2 size={15} /> {t(language, 'Clear Cart')}
            </button>
          </div>
        )}

        <div className="cart-list">
          {cart.length === 0 ? (
            // The cart is empty for most of the day. Rather than a bare line of
            // grey text floating in the space, say what to do next -- this is
            // the first thing a new counter hand sees.
            <div className="empty-cart">
              <div className="empty-cart-icon"><ShoppingCart size={34} /></div>
              <h3>{t(language, 'No items in cart')}</h3>
              <p className="text-muted">
                {language === 'bn'
                  ? 'বারকোড স্ক্যান করুন, অথবা উপরের বাক্সে নাম লিখে খুঁজুন।'
                  : 'Scan a barcode, or type a name in the box above to search.'}
              </p>
              {inventory.length > 0 && (
                <p className="text-muted text-sm">
                  {language === 'bn'
                    ? 'দ্রুত যোগ করতে উপরের বাটনগুলোতেও চাপতে পারেন।'
                    : 'The shortcuts above add an item in one tap.'}
                </p>
              )}
            </div>
          ) : (
            cart.map(item => (
              <div className="cart-item glass" key={item.id}>
                <div className="item-info">
                  <div className="item-title-row">
                    <h4>{item.name}</h4>
                    {item.variant && <span className="variant-tag">{item.variant}</span>}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    <span>ID: {item.id}</span>
                    <span style={{ margin: '0 0.35rem' }}>·</span>
                    <span className="font-bold">৳{item.price}</span>
                    {item.stock !== undefined && (
                      <>
                        <span style={{ margin: '0 0.35rem' }}>·</span>
                        <span className={item.stock <= 0 ? 'text-danger' : item.stock <= 10 ? 'text-warning' : 'text-success'}>
                          Stock: {item.stock}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="item-actions">
                  <div className="quantity-control">
                    <button 
                      type="button"
                      className="btn-icon" 
                      onClick={() => updateCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                      title="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="qty-number">{item.quantity}</span>
                    <button 
                      type="button"
                      className="btn-icon" 
                      onClick={() => updateCartItem(item.id, { quantity: item.quantity + 1 })}
                      title="Increase quantity"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="item-discount">
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>Disc:</span>
                    <input 
                      type="number" 
                      min="0"
                      className="item-discount-input"
                      value={item.itemDiscount || ''}
                      onChange={(e) => updateCartItem(item.id, { itemDiscount: parseFloat(e.target.value) || 0 })}
                      disabled={item.isGift}
                      placeholder="0"
                    />
                  </div>
                  <button 
                    type="button"
                    className={`btn-icon gift-toggle-btn ${item.isGift ? 'is-gift' : ''}`} 
                    title={item.isGift ? 'Gift (Price ৳0)' : 'Mark as Gift'} 
                    onClick={() => toggleGift(item)}
                  >
                    <Gift size={16} strokeWidth={item.isGift ? 2.5 : 1.5} />
                  </button>
                  <div className="item-price">
                    ৳{item.isGift ? 0 : ((item.price - (item.itemDiscount || 0)) * item.quantity).toLocaleString()}
                  </div>
                  <button 
                    type="button"
                    className="btn-icon delete-item-btn" 
                    title="Remove item" 
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pos-right glass">
        <div className="pos-right-header">
          <h3>{t(language, 'Checkout Details')}</h3>
          <span className="text-muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            {cart.reduce((n, i) => n + i.quantity, 0)} {language === 'bn' ? 'টি আইটেম' : 'items'}
          </span>
        </div>

        <div className="checkout-scroll">
          {/* Card 1: Customer Details */}
          <div className="checkout-card">
            <div className="card-header-row">
              <label>
                {t(language, 'Customer Details')} <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                className={`walkin-btn ${customerInfo.name === 'Walk-in Customer' ? 'active' : ''}`}
                onClick={handleWalkInCustomer}
                title="Fill as Walk-in Customer"
              >
                <Sparkles size={12} />
                {customerInfo.name === 'Walk-in Customer' 
                  ? (language === 'bn' ? '✓ ওয়াক-ইন' : '✓ Walk-in')
                  : (language === 'bn' ? '+ ওয়াক-ইন' : '+ Walk-in')}
              </button>
            </div>

            <div className="input-with-icon" style={{ position: 'relative' }}>
              <User size={15} />
              <input
                type="text"
                placeholder={language === 'bn' ? 'কাস্টমারের নাম লিখুন বা খুঁজুন...' : 'Customer Name (or search existing)...'}
                value={customerInfo.name}
                onChange={e => {
                  setCustomerInfo({ ...customerInfo, name: e.target.value });
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                autoComplete="off"
              />
              {showCustomerDropdown && customerSuggestions.length > 0 && (
                <div className="customer-suggestions-dropdown">
                  {customerSuggestions.map(c => (
                    <div
                      key={c.id}
                      className="customer-suggestion-item"
                      onClick={() => {
                        setCustomerInfo({
                          name: c.name,
                          phone: c.phone || '',
                          location: c.location || ''
                        });
                        setShowCustomerDropdown(false);
                      }}
                    >
                      <div className="font-bold text-sm">{c.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {c.phone ? `📞 ${c.phone}` : ''} {c.due > 0 ? ` · Due: ৳${c.due}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="customer-sub-grid">
              <div className="input-with-icon">
                <Phone size={14} />
                <input
                  type="text"
                  placeholder={language === 'bn' ? 'মোবাইল নম্বর' : 'Phone'}
                  value={customerInfo.phone}
                  onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                />
              </div>
              <div className="input-with-icon">
                <MapPin size={14} />
                <input
                  type="text"
                  placeholder={language === 'bn' ? 'ঠিকানা' : 'Address'}
                  value={customerInfo.location}
                  onChange={e => setCustomerInfo({ ...customerInfo, location: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Salesman & Payment Mode */}
          <div className="checkout-card">
            <div className="card-header-row">
              <label>{t(language, 'Salesman')}</label>
            </div>
            <select 
              className="w-full" 
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.88rem' }}
              value={selectedSalesman} 
              onChange={e => setSelectedSalesman(e.target.value)}
            >
              {user?.role === 'Admin' && <option value="Admin">Admin (Main Counter)</option>}
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>

            <div className="payment-type-section" style={{ marginTop: '0.25rem' }}>
              <label>{t(language, 'Payment Method')}</label>
              <div className="payment-segmented-control">
                <button 
                  type="button"
                  className={paymentType === 'Cash' ? 'active' : ''}
                  onClick={() => setPaymentType('Cash')}
                >
                  <Banknote size={14} /> {t(language, 'Cash')}
                </button>
                <button
                  type="button"
                  className={paymentType === 'Baki' ? 'active' : ''}
                  onClick={() => setPaymentType('Baki')}
                >
                  <FileText size={14} /> {t(language, 'Due (Baki)')}
                </button>
                <button
                  type="button"
                  className={paymentType === 'Partial' ? 'active' : ''}
                  onClick={() => setPaymentType('Partial')}
                >
                  <CreditCard size={14} /> {t(language, 'Partial')}
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Order Summary & Money Calculation */}
          <div className="checkout-summary-card">
            <div className="summary-line">
              <span className="text-muted">{t(language, 'Subtotal')}</span>
              <span className="font-bold">৳{subtotal.toLocaleString()}</span>
            </div>

            <div className="summary-line">
              <span className="text-muted">{t(language, 'Discount')}</span>
              <div className="discount-input-box">
                <span className="currency-prefix">৳</span>
                <input 
                  type="number" 
                  className="summary-input"
                  value={invoiceDiscount || ''}
                  onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                  min="0"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="summary-line total-highlight-row">
              <span>{t(language, 'Total Payable')}</span>
              <span className="total-amount-display">৳{total.toLocaleString()}</span>
            </div>

            {/* Cash Payment Mode Flow */}
            {paymentType === 'Cash' && (
              <div className="cash-payment-box">
                <div className="summary-line">
                  <span className="font-bold" style={{ fontSize: '0.88rem' }}>{t(language, 'Cash Received')}</span>
                  <div className="cash-input-box">
                    <span className="currency-prefix">৳</span>
                    <input
                      type="number"
                      className="summary-input"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      min="0"
                      placeholder={String(total)}
                    />
                  </div>
                </div>

                {/* Quick Cash Presets */}
                {total > 0 && (
                  <div className="cash-presets-row">
                    <span className="text-muted text-xs" style={{ fontWeight: 600 }}>Notes:</span>
                    {getCashPresets(total).map((amt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`preset-chip ${Number(cashReceived) === amt ? 'active' : ''}`}
                        onClick={() => setCashReceived(String(amt))}
                      >
                        {amt === total ? `Exact ৳${amt}` : `৳${amt}`}
                      </button>
                    ))}
                  </div>
                )}

                {cashReceived !== '' && Number(cashReceived) > 0 && (
                  Number(cashReceived) < total ? (
                    <div className="change-alert alert-danger">
                      ⚠️ {language === 'bn'
                        ? `৳${(total - Number(cashReceived)).toLocaleString()} বাকি — বাকির জন্য Partial বেছে নিন`
                        : `৳${(total - Number(cashReceived)).toLocaleString()} short — choose Partial to record due`}
                    </div>
                  ) : (
                    <div className="change-alert alert-success">
                      <span className="change-label font-bold">{t(language, 'Change to Return')}:</span>
                      <span className="change-val">৳{(Number(cashReceived) - total).toLocaleString()}</span>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Partial Payment Mode Flow */}
            {paymentType === 'Partial' && (
              <div className="partial-payment-box">
                <div className="summary-line">
                  <span className="font-bold" style={{ fontSize: '0.88rem' }}>{t(language, 'Paid Amount')}</span>
                  <div className="cash-input-box">
                    <span className="currency-prefix">৳</span>
                    <input
                      type="number"
                      className="summary-input"
                      value={paidAmount || ''}
                      onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                      min="0"
                      max={total}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="summary-line due-highlight-row">
                  <span>{t(language, 'Due Amount')}</span>
                  <span className="text-danger font-bold" style={{ fontSize: '1.25rem' }}>
                    ৳{Math.max(0, total - paidAmount).toLocaleString()}
                  </span>
                </div>
                {paidAmount > total && (
                  <div className="change-alert alert-danger">
                    {language === 'bn'
                      ? `মোটের চেয়ে ৳${paidAmount - total} বেশি দেওয়া হয়েছে`
                      : `Paid is ৳${paidAmount - total} more than the total`}
                  </div>
                )}
              </div>
            )}

            {/* Baki Mode Flow */}
            {paymentType === 'Baki' && (
              <div className="baki-notice-box">
                📝 {language === 'bn' 
                  ? `সম্পূর্ণ ৳${total.toLocaleString()} কাস্টমারের বাকি হিসেবে যুক্ত হবে।` 
                  : `Full amount (৳${total.toLocaleString()}) will be recorded as Customer Due.`}
              </div>
            )}
          </div>
        </div>

        {/* Pinned Checkout Actions */}
        <div className="checkout-actions">
          <button 
            type="button"
            className="btn-primary checkout-btn" 
            onClick={handleCheckout} 
            disabled={!canCheckout}
          >
            <span>{editingSaleId ? t(language, 'Update Sale & Print') : t(language, 'Process Sale & Print')}</span>
            {canCheckout && <span className="btn-total">৳{total.toLocaleString()}</span>}
          </button>

          {!canCheckout && (
            <p className="checkout-hint">
              {cart.length === 0
                ? (language === 'bn' ? 'কার্টে পণ্য যোগ করুন' : 'Add an item to the cart first')
                : (
                  <span>
                    {language === 'bn' ? 'কাস্টমারের নাম লিখুন বা ' : 'Enter customer name or tap '}
                    <strong 
                      style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }} 
                      onClick={handleWalkInCustomer}
                    >
                      {language === 'bn' ? 'ওয়াক-ইন কাস্টমার' : 'Walk-in Customer'}
                    </strong>
                  </span>
                )}
            </p>
          )}

          {!editingSaleId && (
            <button
              type="button"
              className="btn-outline checkout-btn flex-align-gap"
              style={{ justifyContent: 'center', padding: '0.65rem 1rem', fontSize: '0.9rem' }}
              onClick={handleSaveDraft}
              disabled={cart.length === 0}
            >
              <FilePlus size={16} /> {t(language, 'Save Draft')}
            </button>
          )}

          {editingSaleId && (
            <button 
              type="button"
              className="btn-outline text-danger checkout-btn" 
              style={{ padding: '0.65rem 1rem', fontSize: '0.9rem' }}
              onClick={() => {
                setEditingSaleId(null);
                clearCart();
                setCustomerInfo({ name: '', phone: '', location: '' });
                setInvoiceDiscount(0);
                setPaidAmount(0);
                setCashReceived('');
              }}
            >
              {t(language, 'Cancel Edit')}
            </button>
          )}
        </div>
      </div>

      {/* Invoice Drawer */}
      {completedSale && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Sale Receipt</h3>
              <button className="drawer-close-btn" onClick={() => setCompletedSale(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-invoice" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   Receipt: {completedSale.invoiceId}<br/>
                   Date: {new Date(completedSale.date).toLocaleString()}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 {completedSale.customerInfo.name && (
                   <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: '#333' }}>
                     <strong>Customer:</strong> {completedSale.customerInfo.name}<br/>
                     {completedSale.customerInfo.phone && <><br/><strong>Phone:</strong> {completedSale.customerInfo.phone}</>}
                     {completedSale.customerInfo.location && <><br/><strong>Location:</strong> {completedSale.customerInfo.location}</>}
                   </div>
                 )}

                 <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#000', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #eee' }}>
                        <th style={{textAlign: 'left', paddingBottom: '0.5rem'}}>Item</th>
                        <th style={{textAlign: 'right', paddingBottom: '0.5rem'}}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedSale.cartItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '0.75rem 0' }}>
                            {item.name} {item.isGift && '(Gift)'} <br/> 
                            <small style={{ color: '#666' }}>{item.quantity} x ৳{item.price} {item.itemDiscount > 0 ? `(-৳${item.itemDiscount})` : ''}</small>
                          </td>
                          <td style={{textAlign: 'right', padding: '0.75rem 0'}}>
                            ৳{item.isGift ? 0 : (item.price - (item.itemDiscount || 0)) * item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#333', marginTop: '0.5rem' }}>
                    <span>Subtotal:</span>
                    <span>৳{completedSale.subtotal}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#333' }}>
                    <span>Discount:</span>
                    <span>৳{completedSale.invoiceDiscount}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: '#000' }}>
                    <span>Total Payable:</span>
                    <span>৳{completedSale.total}</span>
                 </div>
                 {completedSale.changeGiven > 0 && (
                   <>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#333', marginTop: '0.35rem' }}>
                        <span>Cash Received:</span>
                        <span>৳{completedSale.cashReceived}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', color: '#000' }}>
                        <span>Change Returned:</span>
                        <span>৳{completedSale.changeGiven}</span>
                     </div>
                   </>
                 )}
                 {completedSale.dueAmount > 0 && (
                   <>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#333', marginTop: '0.35rem' }}>
                        <span>Paid:</span>
                        <span>৳{completedSale.paidAmount}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', color: '#000' }}>
                        <span>Due:</span>
                        <span>৳{completedSale.dueAmount}</span>
                     </div>
                   </>
                 )}
                 <div style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '0.9rem', color: '#555' }}>
                    <p style={{ marginBottom: '0.2rem' }}>Payment: {completedSale.paymentType}</p>
                    <p style={{ marginBottom: '0.5rem' }}>Salesman: {completedSale.salesman?.name}</p>
                    <p>Thank you for shopping with us!</p>
                 </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                 printElement('printable-invoice', 'POS');
              }}>
                <Printer size={20} /> Print Receipt
              </button>
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => downloadAsPDF('printable-invoice', `Receipt_${completedSale.invoiceId}.pdf`)}>
                <Download size={20} /> Download PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
      )}

      {activeTab === 'History' && (
      <div className="card glass animate-slide-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2>Sales History</h2>
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
                 printElement('printable-all-sales-details', 'POS');
            }}>
              <Printer size={16} /> Print All Details
            </button>
            <button className="btn-outline flex-align-gap text-info" onClick={() => downloadAsPDF('printable-all-sales-details', 'Sales_History.pdf')}>
              <Download size={16} /> Download PDF
            </button>
          </div>
        </div>
        <div className="table-responsive mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t(language, 'Date')}</th>
                <th>{t(language, 'Invoice ID')}</th>
                <th>{t(language, 'Customer Name')}</th>
                <th>{t(language, 'Items')}</th>
                <th>{t(language, 'Payment Method')}</th>
                <th>{t(language, 'Total')}</th>
                <th style={{textAlign:'center'}}>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(s => (
                <tr key={s.id}>
                  <td>{s.date.split('T')[0]}</td>
                  <td>{s.id}</td>
                  <td>{s.customerName || 'N/A'}</td>
                  <td>{s.items.length} items</td>
                  <td><span className={`badge ${s.paymentType === 'Cash' ? 'bg-success' : 'bg-warning'}`}>{s.paymentType}</span></td>
                  <td className="text-primary font-bold">৳{s.total.toLocaleString()}</td>
                  <td style={{textAlign:'center'}}>
                    <div className="flex-align-gap" style={{justifyContent:'center'}}>
                      <button className="btn-icon" title="View & Print" onClick={() => setSelectedInvoice(s)}>
                        <Eye size={16} />
                      </button>
                      {isAdmin && (
                        <>
                          <button className="btn-icon text-info" title="Edit Sale" onClick={() => handleEditSale(s)}>
                            <Edit size={16} />
                          </button>
                          <button className="btn-icon text-danger" title="Delete Sale" onClick={() => handleDeleteSale(s.id)}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && <tr><td colSpan="7" className="text-center text-muted">No sales history found for this date range.</td></tr>}
            </tbody>
          </table>
        </div>
        
        <div style={{ display: 'none' }}>
          <div id="printable-all-sales-details" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
            <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
            <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>Detailed Sales History</h3>
            {(startDate || endDate) && <p style={{textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem'}}>Date Filter: {startDate || 'Any'} to {endDate || 'Any'}</p>}
            
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Date</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Invoice</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Customer</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Payment</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Item</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>Qty</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>Price</th>
                  <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <React.Fragment key={sale.id}>
                    {sale.items.map((item, idx) => (
                      <tr key={`${sale.id}-${idx}`}>
                        {idx === 0 && (
                           <>
                             <td rowSpan={sale.items.length} style={{border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top'}}>{new Date(sale.date).toLocaleDateString()}</td>
                             <td rowSpan={sale.items.length} style={{border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top'}}>{sale.id}</td>
                             <td rowSpan={sale.items.length} style={{border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top'}}>{sale.customerName || 'N/A'}</td>
                             <td rowSpan={sale.items.length} style={{border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top'}}>{sale.paymentType}</td>
                           </>
                        )}
                        <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.name}</td>
                        <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>{item.quantity}</td>
                        <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>৳{item.price}</td>
                        <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>৳{item.price * item.quantity}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8f9fa' }}>
                      <td colSpan="7" style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold'}}>Invoice {sale.id} Total:</td>
                      <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold'}}>৳{sale.total}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', marginTop: '1.5rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
              Grand Total: ৳{filteredSales.reduce((acc, s) => acc + s.total, 0)}
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
              <h3 style={{ margin: 0 }}>Sale Receipt</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedInvoice(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-invoice-pos" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   Sale Receipt: {selectedInvoice.id}<br/>
                   Date: {new Date(selectedInvoice.date).toLocaleString()}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: '#333' }}>
                   {selectedInvoice.customerName && <><strong>Customer:</strong> {selectedInvoice.customerName}<br/></>}
                   <strong>Payment:</strong> {selectedInvoice.paymentType}
                 </div>

                 <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#000', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #eee' }}>
                        <th style={{textAlign: 'left', paddingBottom: '0.5rem'}}>Item</th>
                        <th style={{textAlign: 'right', paddingBottom: '0.5rem'}}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '0.75rem 0' }}>
                            {item.name} <br/> 
                            <small style={{ color: '#666' }}>{item.quantity} x ৳{item.price}</small>
                          </td>
                          <td style={{textAlign: 'right', padding: '0.75rem 0'}}>
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
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                 printElement('printable-single-invoice-pos', 'POS');
              }}>
                <Printer size={20} /> Print Receipt
              </button>
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => downloadAsPDF('printable-single-invoice-pos', `Receipt_${selectedInvoice.id}.pdf`)}>
                <Download size={20} /> Download PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {activeTab === 'Drafts' && (
        <div className="card glass animate-slide-up">
          <h2 className="mb-4">{t(language, 'Parked Carts')}</h2>
          <p className="text-muted mb-4">
            {language === 'bn'
              ? 'অসমাপ্ত বিক্রয় এখানে জমা থাকে। যেকোনোটি চালু করলে কার্টে ফিরে আসবে।'
              : 'Unfinished sales wait here. Resuming one loads it back into the cart.'}
          </p>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>ID</th>
                  <th>{t(language, 'Customer Name')}</th>
                  <th>{t(language, 'Items')}</th>
                  <th style={{ textAlign: 'right' }}>{t(language, 'Total')}</th>
                  <th>{t(language, 'Salesman')}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(drafts || []).length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center text-muted" style={{ padding: '2rem' }}>
                      {language === 'bn' ? 'কোনো ড্রাফট নেই।' : 'No parked carts.'}
                    </td>
                  </tr>
                ) : (
                  drafts.map((d) => (
                    <tr key={d.id}>
                      <td>{String(d.date).split('T')[0]}</td>
                      <td>{d.id}</td>
                      <td>{d.customerInfo?.name || <span className="text-muted">—</span>}</td>
                      <td>{(d.cartItems || []).length} items</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{Number(d.total || 0).toLocaleString()}</td>
                      <td className="text-muted">{d.salesman?.name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex-align-gap" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
                            onClick={() => handleResumeDraft(d)}
                          >
                            {t(language, 'Resume')}
                          </button>
                          <button className="btn-icon text-danger" title="Discard" onClick={() => handleDiscardDraft(d)}>
                            <Trash2 size={16} />
                          </button>
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

      {activeTab === 'Expense' && (
        <div className="animate-fade-in" style={{ padding: '0 0.5rem' }}>
          <Expenses />
        </div>
      )}

    </div>
  );
};

export default POS;
