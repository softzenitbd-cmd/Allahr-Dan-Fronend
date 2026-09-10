import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../store/useStore';
import {
  Search, Plus, Minus, Trash2, Gift, Database, List, Printer, Eye,
  FilePlus, Edit, Wallet, ShoppingCart, User, UserCheck, Phone,
  MapPin, Sparkles, Banknote, CreditCard, FileText, Check, X
} from 'lucide-react';
import { printElement } from '../utils/pdfGenerator';
import InvoiceDocument, { fromCompletedSale, fromApiInvoice } from '../components/InvoiceDocument';
import PaymentVoucher from '../components/PaymentVoucher';
import { openCashDrawer } from '../utils/cashDrawer';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import Expenses from './Expenses';
import './POS.css';

const POS = () => {
  const { cart, inventory, staff, user, addToCart, removeFromCart, updateCartItem, clearCart, setCart, loadDummyData, processSale, deleteSale, lookupProduct, refresh, saveDraft, deleteDraft, drafts, sales, customers, language, shopProfile } = useStore();
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
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);

  const customerSearchTerm = (customerInfo.name || '').trim().toLowerCase();
  const customerSuggestions = customerSearchTerm && showCustomerDropdown
    ? (customers || []).filter(c =>
        (c.name || '').toLowerCase().includes(customerSearchTerm) ||
        (c.phone && c.phone.includes(customerSearchTerm))
      ).slice(0, 5)
    : [];

  // A regular customer is more often known by number than by name -- the
  // number is what they read out. Typing digits into the phone box narrows
  // the list by phone, and picking one fills the whole customer in.
  const phoneSearchTerm = (customerInfo.phone || '').replace(/\D/g, '');
  const phoneSuggestions = phoneSearchTerm.length >= 3 && showPhoneDropdown
    ? (customers || []).filter(c =>
        (c.phone || '').replace(/\D/g, '').includes(phoneSearchTerm)
      ).slice(0, 5)
    : [];

  const chooseCustomer = (c) => {
    setCustomerInfo({ name: c.name, phone: c.phone || '', location: c.location || '' });
    setShowCustomerDropdown(false);
    setShowPhoneDropdown(false);
  };

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

  /**
   * Refuse at the counter what the server would refuse at checkout.
   *
   * The server has always been the real gate -- it re-checks the whole cart
   * against stock inside the sale transaction and rejects it outright -- but
   * finding out only after the customer's items are rung up is a bad way to
   * learn the shelf is empty. This stops it happening at the moment of the
   * scan, while the customer is still standing there.
   */
  const stockBlockReason = (product) => {
    const available = Number(product.stock);
    if (!Number.isFinite(available)) return null;

    if (available <= 0) {
      return language === 'bn'
        ? `"${product.name}" এর স্টক শেষ — বিক্রি করা যাবে না।`
        : `"${product.name}" is out of stock and cannot be sold.`;
    }

    const inCart = cart.find((item) => item.id === product.id)?.quantity || 0;
    if (inCart + 1 > available) {
      return language === 'bn'
        ? `"${product.name}" এর স্টকে আছে ${available} টি, কার্টেই ${inCart} টি আছে।`
        : `Only ${available} of "${product.name}" in stock, and ${inCart} already in the cart.`;
    }
    return null;
  };

  const pickProduct = (product) => {
    const blocked = stockBlockReason(product);
    if (blocked) {
      toast.error(blocked);
      setScannedItem(product);
      setBarcodeInput('');
      document.getElementById('barcode-input')?.focus();
      return;
    }

    addToCart({ ...product, isGift: false, itemDiscount: 0 });
    // Show what was just scanned, so whoever is on the counter can see the
    // machine read the right label before the customer is charged for it.
    setScannedItem(product);
    setBarcodeInput('');
    document.getElementById('barcode-input')?.focus();
  };

  /** The + button stops at what the shelf actually holds. */
  const increaseQty = (item) => {
    const available = Number(item.stock);
    if (Number.isFinite(available) && item.quantity + 1 > available) {
      toast.error(
        language === 'bn'
          ? `স্টকে আছে মাত্র ${available} টি।`
          : `Only ${available} in stock.`
      );
      return;
    }
    updateCartItem(item.id, { quantity: item.quantity + 1 });
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

        {/* ---------------------------------------------------------------- */}
        {/* Left: scan / search, then the order                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="pos-left">
          <div className="pos-left-head">
            <div className="pos-title-row">
              <h2>{editingSaleId ? t(language, 'Edit Sale') : t(language, 'Point of Sale')}</h2>
              {/* Opens the drawer without a sale, for making change from an
                  earlier customer or putting the float in. Needs the printer's
                  "open cash drawer" setting switched on -- see utils/cashDrawer.js. */}
              <button
                type="button"
                className="btn-outline"
                onClick={() => openCashDrawer({ operator: user?.name })}
                title={language === 'bn'
                  ? 'বিক্রি ছাড়াই ড্রয়ার খুলুন (একটি No Sale স্লিপ ছাপবে)'
                  : 'Open the drawer without a sale (prints a No Sale slip)'}
              >
                <Wallet size={15} /> {t(language, 'Open Drawer')}
              </button>
            </div>

            <div className="barcode-wrap">
              <form onSubmit={handleBarcodeSubmit} className="barcode-form">
                <Search size={18} className="text-muted" />
                <input
                  id="barcode-input"
                  type="text"
                  placeholder={language === 'bn'
                    ? 'বারকোড স্ক্যান করুন বা পণ্যের নাম লিখুন…'
                    : 'Scan barcode or type a product name…'}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  autoComplete="off"
                />
                <button type="submit" className="btn-primary" disabled={scanning}>
                  {scanning ? t(language, 'Searching...') : t(language, 'Add')}
                </button>
              </form>

              {/* Typing narrows the catalogue to a short list. Picking one adds
                  it just as a scan would. */}
              {searchTerm && (
                <div className="search-results">
                  {searchResults.length === 0 ? (
                    <div className="search-empty">
                      {language === 'bn'
                        ? `"${barcodeInput}" এর সাথে কোনো পণ্য মিলল না।`
                        : `No product matches "${barcodeInput}".`}
                    </div>
                  ) : (
                    <>
                      <div className="sr-hint">
                        {searchResults.length} {language === 'bn' ? 'টি মিলেছে — যোগ করতে চাপুন' : 'matches — tap to add'}
                      </div>
                      {searchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`search-result ${item.stock <= 0 ? 'is-out' : ''}`}
                          onClick={() => pickProduct(item)}
                          disabled={item.stock <= 0}
                          title={item.stock <= 0
                            ? (language === 'bn' ? 'স্টক শেষ' : 'Out of stock')
                            : undefined}
                        >
                          <span className="sr-main">
                            <span className="sr-name">{item.name}</span>
                            <span className="sr-meta">
                              {item.variant ? `${item.variant} · ` : ''}{item.id}
                              {item.category ? ` · ${item.category}` : ''}
                            </span>
                          </span>
                          <span className="sr-price">
                            {item.mrp && Number(item.mrp) > Number(item.price) ? (
                              <span className="sr-was">৳{Number(item.mrp).toLocaleString()}</span>
                            ) : null}
                            ৳{Number(item.price).toLocaleString()}
                          </span>
                          <span className={`stock-pill ${item.stock <= 0 ? 'stock-empty' : item.stock <= 10 ? 'stock-low' : 'stock-ok'}`}>
                            {item.stock}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* What the scanner just read, so the counter can confirm the
                machine picked up the right label before the customer is
                charged for it. */}
            {scannedItem && (
              <div className={`scan-confirm ${scannedItem.stock <= 0 ? 'is-empty' : ''}`}>
                <Check size={15} />
                <span className="name">{scannedItem.name}</span>
                <span className="meta">
                  ৳{Number(scannedItem.price).toLocaleString()}
                  {scannedItem.variant ? ` · ${scannedItem.variant}` : ''}
                  {' · '}{language === 'bn' ? 'স্টক' : 'stock'} {scannedItem.stock}
                </span>
                {scannedItem.stock <= 0 && (
                  <span style={{ fontWeight: 700 }}>
                    {language === 'bn' ? '— স্টক শেষ, চেকআউটে আটকাবে' : '— out of stock, checkout will refuse it'}
                  </span>
                )}
                <span className="spacer" />
                <button className="btn-icon" title="Dismiss" onClick={() => setScannedItem(null)}>
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          <div className="cart-toolbar">
            <span>
              {cart.reduce((n, i) => n + i.quantity, 0)} {language === 'bn' ? 'টি আইটেম' : 'items'}
              {cart.length > 0 && <> · {cart.length} {language === 'bn' ? 'ধরন' : 'lines'}</>}
            </span>
            {cart.length > 0 && (
              <button
                className="btn-icon text-danger"
                title={t(language, 'Clear Cart')}
                onClick={async () => {
                  const isConfirmed = await showConfirmDialog({
                    title: language === 'bn' ? 'পুরো কার্ট মুছে ফেলবেন?' : 'Clear Cart?',
                    text: language === 'bn' ? 'কার্টের সব পণ্য মুছে ফেলা হবে।' : 'All items in the cart will be removed.',
                    confirmButtonText: language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, clear',
                    cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
                    isDanger: true,
                  });
                  if (isConfirmed) {
                    clearCart();
                    setScannedItem(null);
                    document.getElementById('barcode-input')?.focus();
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className="cart-lines">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-cart-icon"><ShoppingCart size={28} /></div>
                <h3>{t(language, 'No items in cart')}</h3>
                <p className="text-muted">
                  {language === 'bn'
                    ? 'উপরের বাক্সে বারকোড স্ক্যান করুন, অথবা পণ্যের নাম লিখে তালিকা থেকে বেছে নিন।'
                    : 'Scan a barcode in the box above, or type a product name and pick it from the list.'}
                </p>

                {/* Nothing can be scanned against an empty catalogue, so this
                    is the one place the sync is worth offering. */}
                {inventory.length === 0 && (
                  <button className="btn-outline" style={{ marginTop: '1rem' }} onClick={loadDummyData}>
                    <Database size={15} /> {language === 'bn' ? 'স্টক সিঙ্ক করুন' : 'Sync Inventory'}
                  </button>
                )}
              </div>
            ) : (
              cart.map(item => (
                <div className="cart-line" key={item.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="cl-name">
                      {item.name}
                      {item.isGift && <span className="cl-gift-tag">GIFT</span>}
                    </div>
                    <div className="cl-meta">
                      {item.variant ? `${item.variant} · ` : ''}{item.id}
                      {item.stock !== undefined ? ` · ${language === 'bn' ? 'স্টক' : 'stock'} ${item.stock}` : ''}
                    </div>
                    {Number.isFinite(Number(item.stock)) && item.quantity > Number(item.stock) && (
                      <div className="cl-overstock">
                        {language === 'bn'
                          ? `স্টকে আছে মাত্র ${item.stock} টি — এভাবে বিক্রি আটকে যাবে`
                          : `Only ${item.stock} in stock — this sale will be refused`}
                      </div>
                    )}
                  </div>

                  <div className="qty-stepper">
                    <button
                      type="button"
                      onClick={() => updateCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                      title="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="qty">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => increaseQty(item)}
                      title="Increase quantity"
                      disabled={Number.isFinite(Number(item.stock)) && item.quantity >= Number(item.stock)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <span className="cl-rate">× ৳{Number(item.price).toLocaleString()}</span>

                  <span className="cl-disc">
                    <span>{language === 'bn' ? 'ছাড়' : 'Disc'}</span>
                    <input
                      type="number"
                      min="0"
                      value={item.itemDiscount || ''}
                      onChange={(e) => updateCartItem(item.id, { itemDiscount: parseFloat(e.target.value) || 0 })}
                      disabled={item.isGift}
                      placeholder="0"
                    />
                  </span>

                  <span className="cl-tools">
                    <button
                      type="button"
                      className={`btn-icon gift-toggle-btn ${item.isGift ? 'is-gift' : ''}`}
                      title={item.isGift ? 'Gift (Price ৳0)' : 'Mark as Gift'}
                      onClick={() => toggleGift(item)}
                    >
                      <Gift size={15} strokeWidth={item.isGift ? 2.5 : 1.7} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon delete-item-btn"
                      title="Remove item"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>

                  <div className="cl-amount">
                    ৳{item.isGift ? 0 : ((item.price - (item.itemDiscount || 0)) * item.quantity).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Right: checkout                                                  */}
        {/* ---------------------------------------------------------------- */}
        <aside className="pos-right">
          <div className="order-head">
            <h3>{t(language, 'Checkout Details')}</h3>
            <span className="count">
              {cart.reduce((n, i) => n + i.quantity, 0)} {language === 'bn' ? 'টি আইটেম' : 'items'}
            </span>
          </div>

          <div className="order-scroll">
            {/* Who is buying */}
            <div className="field-block">
              <span className="lbl">
                <span>{t(language, 'Customer Details')} *</span>
                <button
                  type="button"
                  className={`walkin-btn ${customerInfo.name === 'Walk-in Customer' ? 'active' : ''}`}
                  onClick={handleWalkInCustomer}
                  title="Fill as Walk-in Customer"
                >
                  <Sparkles size={11} />
                  {language === 'bn' ? 'ওয়াক-ইন' : 'Walk-in'}
                </button>
              </span>

              <div className="input-with-icon">
                <User size={14} />
                <input
                  type="text"
                  placeholder={language === 'bn' ? 'কাস্টমারের নাম বা খুঁজুন…' : 'Customer name or search…'}
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
                        onClick={() => chooseCustomer(c)}
                      >
                        <div className="font-bold text-sm">{c.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                          {c.phone || ''}{c.due > 0 ? ` · ${language === 'bn' ? 'বকেয়া' : 'Due'} ৳${c.due}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="field-row">
                <div className="input-with-icon">
                  <Phone size={13} />
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'মোবাইল দিয়ে খুঁজুন' : 'Phone (search)'}
                    value={customerInfo.phone}
                    onChange={e => {
                      setCustomerInfo({ ...customerInfo, phone: e.target.value });
                      setShowPhoneDropdown(true);
                    }}
                    onFocus={() => setShowPhoneDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPhoneDropdown(false), 150)}
                    autoComplete="off"
                  />
                  {phoneSuggestions.length > 0 && (
                    <div className="customer-suggestions-dropdown">
                      {phoneSuggestions.map(c => (
                        <div
                          key={c.id}
                          className="customer-suggestion-item"
                          onMouseDown={(e) => { e.preventDefault(); chooseCustomer(c); }}
                        >
                          <div className="font-bold text-sm">{c.phone}</div>
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            {c.name}{c.due > 0 ? ` · ${language === 'bn' ? 'বকেয়া' : 'Due'} ৳${c.due}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="input-with-icon">
                  <MapPin size={13} />
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'ঠিকানা' : 'Address'}
                    value={customerInfo.location}
                    onChange={e => setCustomerInfo({ ...customerInfo, location: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Who is selling */}
            <div className="field-block">
              <span className="lbl">{t(language, 'Salesman')}</span>
              <div className="input-with-icon">
                <UserCheck size={13} />
                <select value={selectedSalesman} onChange={e => setSelectedSalesman(e.target.value)}>
                  {user?.role === 'Admin' && <option value="Admin">Admin (Main Counter)</option>}
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
            </div>

            {/* How they are paying */}
            <div className="field-block">
              <span className="lbl">{t(language, 'Payment Method')}</span>
              <div className="pay-segmented">
                <button
                  type="button"
                  className={paymentType === 'Cash' ? 'active' : ''}
                  onClick={() => setPaymentType('Cash')}
                >
                  <Banknote size={13} /> {t(language, 'Cash')}
                </button>
                <button
                  type="button"
                  className={paymentType === 'Baki' ? 'active' : ''}
                  onClick={() => setPaymentType('Baki')}
                >
                  <FileText size={13} /> {t(language, 'Due (Baki)')}
                </button>
                <button
                  type="button"
                  className={paymentType === 'Partial' ? 'active' : ''}
                  onClick={() => setPaymentType('Partial')}
                >
                  <CreditCard size={13} /> {t(language, 'Partial')}
                </button>
              </div>
            </div>

            {/* What it comes to */}
            <div className="sum-box">
              <div className="sum-line">
                <span className="text-muted">{t(language, 'Subtotal')}</span>
                <span className="val">৳{subtotal.toLocaleString()}</span>
              </div>

              <div className="sum-line">
                <span className="text-muted">{t(language, 'Discount')}</span>
                <span className="inline-amount">
                  <span className="prefix">৳</span>
                  <input
                    type="number"
                    value={invoiceDiscount || ''}
                    onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                    min="0"
                    placeholder="0"
                  />
                </span>
              </div>

              <div className="sum-total">
                <span className="label">{t(language, 'Total Payable')}</span>
                <span className="amount">৳{total.toLocaleString()}</span>
              </div>
            </div>

            {/* Cash */}
            {paymentType === 'Cash' && (
              <div className="field-block">
                <div className="sum-line">
                  <span className="text-muted">{t(language, 'Cash Received')}</span>
                  <span className="inline-amount">
                    <span className="prefix">৳</span>
                    <input
                      type="number"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      min="0"
                      placeholder={String(total)}
                    />
                  </span>
                </div>

                {total > 0 && (
                  <div className="cash-presets">
                    {getCashPresets(total).map((amt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`preset-chip ${Number(cashReceived) === amt ? 'active' : ''}`}
                        onClick={() => setCashReceived(String(amt))}
                      >
                        {amt === total ? `${language === 'bn' ? 'পুরো' : 'Exact'} ৳${amt}` : `৳${amt}`}
                      </button>
                    ))}
                  </div>
                )}

                {cashReceived !== '' && Number(cashReceived) > 0 && (
                  Number(cashReceived) < total ? (
                    <div className="pos-alert bad">
                      <span>
                        {language === 'bn'
                          ? `৳${(total - Number(cashReceived)).toLocaleString()} কম — বাকির জন্য Partial বেছে নিন`
                          : `৳${(total - Number(cashReceived)).toLocaleString()} short — choose Partial to record due`}
                      </span>
                    </div>
                  ) : (
                    <div className="pos-alert ok">
                      <span>{t(language, 'Change to Return')}</span>
                      <span>৳{(Number(cashReceived) - total).toLocaleString()}</span>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Partial */}
            {paymentType === 'Partial' && (
              <div className="field-block">
                <div className="sum-line">
                  <span className="text-muted">{t(language, 'Paid Amount')}</span>
                  <span className="inline-amount">
                    <span className="prefix">৳</span>
                    <input
                      type="number"
                      value={paidAmount || ''}
                      onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                      min="0"
                      max={total}
                      placeholder="0"
                    />
                  </span>
                </div>
                <div className={`pos-alert ${paidAmount > total ? 'bad' : 'info'}`}>
                  {paidAmount > total ? (
                    <span>
                      {language === 'bn'
                        ? `মোটের চেয়ে ৳${paidAmount - total} বেশি`
                        : `৳${paidAmount - total} more than the total`}
                    </span>
                  ) : (
                    <>
                      <span>{t(language, 'Due Amount')}</span>
                      <span>৳{Math.max(0, total - paidAmount).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Baki */}
            {paymentType === 'Baki' && (
              <div className="pos-alert info">
                <span>{language === 'bn' ? 'পুরোটাই কাস্টমারের বাকি' : 'Recorded as customer due'}</span>
                <span>৳{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Pinned: the action bar never scrolls away */}
          <div className="order-actions">
            <button
              type="button"
              className="proceed-btn"
              onClick={handleCheckout}
              disabled={!canCheckout}
            >
              <span className="pb-label">
                <Printer size={17} />
                {editingSaleId ? t(language, 'Update Sale & Print') : t(language, 'Process Sale & Print')}
              </span>
              <span className="pb-amount">৳{total.toLocaleString()}</span>
            </button>

            {!canCheckout && (
              <p className="checkout-hint">
                {cart.length === 0
                  ? (language === 'bn' ? 'আগে কার্টে পণ্য যোগ করুন' : 'Add an item to the cart first')
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

            <div className="checkout-secondary">
              {!editingSaleId && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleSaveDraft}
                  disabled={cart.length === 0}
                >
                  <FilePlus size={15} /> {t(language, 'Save Draft')}
                </button>
              )}

              {editingSaleId && (
                <button
                  type="button"
                  className="btn-outline text-danger"
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
        </aside>

      {/* The invoice, the moment the sale goes through */}
      {completedSale && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '780px' }}>
            <div className="drawer-header">
              <h3>
                {language === 'bn' ? 'পেমেন্ট ভাউচার' : 'Payment Voucher'} · {completedSale.invoiceId}
              </h3>
              <button className="drawer-close-btn" onClick={() => setCompletedSale(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: 0, background: '#fff' }}>
              <PaymentVoucher
                sale={fromCompletedSale(completedSale)}
                shopProfile={shopProfile}
                language={language}
                domId="printable-voucher"
              />

              {/* Kept off screen so the same sale can also be printed as the
                  full invoice without leaving the drawer. */}
              <div style={{ display: 'none' }}>
                <InvoiceDocument
                  sale={fromCompletedSale(completedSale)}
                  shopProfile={shopProfile}
                  language={language}
                  domId="printable-invoice"
                />
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
                {completedSale.dueAmount > 0
                  ? `${language === 'bn' ? 'বকেয়া' : 'Due'}: ৳${Number(completedSale.dueAmount).toLocaleString()}`
                  : (language === 'bn' ? 'সম্পূর্ণ পরিশোধিত' : 'Fully paid')}
              </span>
              <div className="flex-align-gap">
                <button className="btn-outline" onClick={() => setCompletedSale(null)}>
                  {language === 'bn' ? 'বন্ধ' : 'Close'}
                </button>
                <button
                  className="btn-outline"
                  onClick={() => printElement('printable-invoice', `Invoice-${completedSale.invoiceId}`)}
                >
                  <FileText size={16} /> {language === 'bn' ? 'চালান' : 'Invoice'}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => printElement('printable-voucher', `Voucher-${completedSale.invoiceId}`)}
                >
                  <Printer size={16} /> {language === 'bn' ? 'ভাউচার প্রিন্ট' : 'Print Voucher'}
                </button>
              </div>
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

      {/* Reprint an invoice from the history tab */}
      {selectedInvoice && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '780px' }}>
            <div className="drawer-header">
              <h3>{language === 'bn' ? 'চালান' : 'Invoice'} {selectedInvoice.id}</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedInvoice(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: 0, background: '#fff' }}>
              <InvoiceDocument
                sale={fromApiInvoice(selectedInvoice, customers)}
                shopProfile={shopProfile}
                language={language}
                domId="printable-single-invoice-pos"
              />
            </div>

            <div className="drawer-footer">
              <button className="btn-outline" onClick={() => setSelectedInvoice(null)}>
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
              <button
                className="btn-primary"
                onClick={() => printElement('printable-single-invoice-pos', `Invoice-${selectedInvoice.id}`)}
              >
                <Printer size={16} /> {language === 'bn' ? 'চালান প্রিন্ট' : 'Print Invoice'}
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
