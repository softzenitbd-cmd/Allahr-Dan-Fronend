import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import {
  Search, Plus, Minus, Trash2, Gift, Database, List, Printer, Eye,
  FilePlus, Edit, Wallet, ShoppingCart, User, UserCheck, Phone,
  MapPin, Sparkles, Banknote, CreditCard, FileText, Check, X, Smartphone, Download,
  RefreshCw, Wifi, WifiOff
} from 'lucide-react';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import InvoiceDocument, { fromCompletedSale, fromApiInvoice } from '../components/InvoiceDocument';
import PaymentVoucher from '../components/PaymentVoucher';
import ThermalReceipt from '../components/ThermalReceipt';
import { DEFAULT_SHOP_ADDRESS } from '../utils/shopConfig';
import { openCashDrawer } from '../utils/cashDrawer';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import Swal, { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import Expenses from './Expenses';
import './POS.css';
import { formatDate } from '../utils/date';

const MFS_OPTIONS = [
  { id: 'bKash', label: 'bKash (বিকাশ)' },
  { id: 'Nagad', label: 'Nagad (নগদ)' },
  { id: 'Rocket', label: 'Rocket (রকেট)' },
  { id: 'Binimoy', label: 'Binimoy (বিনিময় - Govt/BB)' },
  { id: 'Upay', label: 'Upay (উপায়)' },
  { id: 'Cellfin', label: 'Cellfin (সেলফিন)' },
  { id: 'Tap', label: 'Tap (ট্যাপ)' },
  { id: 'Bangla QR', label: 'Bangla QR (বাংলা কিউআর)' },
  { id: 'Other', label: 'Other MFS (অন্যান্য)' },
];

const POS = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    cart, inventory, staff, user, addToCart, removeFromCart, updateCartItem, clearCart, setCart,
    loadDummyData, processSale, deleteSale, lookupProduct, refresh, saveDraft, deleteDraft,
    drafts, sales, customers, language, shopProfile,
    offlineSalesQueue, isOnline, isSyncing, syncOfflineSales,
    posSalesmanId, setPosSalesmanId
  } = useStore();
  // Editing or deleting a sale reverses stock and balances, which the server
  // only lets an Admin do. Hiding the controls keeps a salesman from
  // confirming a destructive dialog and then meeting a 403.
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState('New'); // 'New' or 'History'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', location: '' });
  const [paymentType, setPaymentType] = useState('Cash'); // 'Cash' | 'Mobile Banking' | 'Split'
  const [splitCash, setSplitCash] = useState('');
  const [splitMfs, setSplitMfs] = useState('');
  const [mfsProvider, setMfsProvider] = useState('bKash');
  const [mfsTrxId, setMfsTrxId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  // Kept as a string so the box can sit empty, which means "paid the exact amount".
  const [cashReceived, setCashReceived] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);

  // The chosen salesman lives in the store, so leaving the POS for another
  // menu and coming back keeps whoever the counter picked until it is changed.
  const selectedSalesmanId = posSalesmanId;
  const setSelectedSalesmanId = setPosSalesmanId;

  // The logged-in user as the default salesman
  const loggedInSalesman = useMemo(() => {
    if (!user || user.role === 'Admin') {
      return { id: 'Admin', staff_code: 'Admin', name: 'Admin', role: 'Admin' };
    }
    const matched = (staff || []).find(
      s => (s.username && user.username && s.username.toLowerCase() === user.username.toLowerCase()) ||
        (s.name && user.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase()) ||
        String(s.id) === String(user.id) ||
        String(s.staff_code) === String(user.id)
    );
    if (matched) {
      return {
        id: matched.staff_code || matched.id,
        staff_code: matched.staff_code || matched.id,
        name: matched.name,
        role: matched.role || 'Salesman',
      };
    }
    return {
      id: user.id || 'Salesman',
      staff_code: user.id || 'Salesman',
      name: user.name || user.username || 'Salesman',
      role: user.role || 'Salesman',
    };
  }, [user, staff]);

  // Active salesman for current sale (enabled for manual selection, defaulting to logged-in user)
  const currentSalesman = useMemo(() => {
    const targetId = selectedSalesmanId || loggedInSalesman.id;
    if (targetId === 'Admin') {
      return { id: 'Admin', staff_code: 'Admin', name: 'Admin', role: 'Admin' };
    }
    const matched = (staff || []).find(
      s => String(s.id) === String(targetId) || String(s.staff_code) === String(targetId)
    );
    if (matched) {
      return {
        id: matched.staff_code || matched.id,
        staff_code: matched.staff_code || matched.id,
        name: matched.name,
        role: matched.role || 'Salesman',
      };
    }
    if (String(loggedInSalesman.id) === String(targetId)) {
      return loggedInSalesman;
    }
    return { id: targetId, staff_code: targetId, name: targetId, role: 'Salesman' };
  }, [selectedSalesmanId, loggedInSalesman, staff]);

  const [completedSale, setCompletedSale] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
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
    setCustomerInfo({
      id: c.id,
      customerCode: c.customer_code,
      name: c.name,
      phone: c.phone || '',
      location: c.location || ''
    });
    setShowCustomerDropdown(false);
    setShowPhoneDropdown(false);
  };

  const handleWalkInCustomer = () => {
    setCustomerInfo({ name: 'Walk-in Customer', phone: '', location: '' });
    setShowCustomerDropdown(false);
    setShowPhoneDropdown(false);
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
    refresh('inventory', 'staff');
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
      toast.error(language === 'bn' ? 'কাস্টমারের নাম আবশ্যক!' : 'Customer Name is explicitly required for all sales!');
      return;
    }

    const isSplit = paymentType === 'Split';
    const cashVal = isSplit ? (parseFloat(splitCash) || 0) : 0;
    const mfsVal = isSplit ? (parseFloat(splitMfs) || 0) : 0;
    const rec = isSplit ? (cashVal + mfsVal) : (cashReceived === '' ? total : (Number(cashReceived) || 0));
    const effectivePaid = (rec >= total && total > 0) ? total : (rec <= 0 ? 0 : rec);
    const effectiveDue = Math.max(0, total - effectivePaid);

    let effectiveMethodName;
    if (isSplit) {
      effectiveMethodName = language === 'bn'
        ? `ক্যাশ ৳${cashVal.toLocaleString()} + ${mfsProvider} ৳${mfsVal.toLocaleString()}`
        : `Cash ৳${cashVal.toLocaleString()} + ${mfsProvider} ৳${mfsVal.toLocaleString()}`;
    } else if (rec <= 0) {
      effectiveMethodName = language === 'bn' ? 'বাকি (Due)' : 'Due / Baki';
    } else if (rec < total) {
      effectiveMethodName = paymentType === 'Mobile Banking'
        ? (language === 'bn' ? `আংশিক জমা (${mfsProvider})` : `Partial (${mfsProvider})`)
        : (language === 'bn' ? 'আংশিক জমা (Partial)' : 'Partial (Cash)');
    } else {
      effectiveMethodName = paymentType === 'Mobile Banking'
        ? `Mobile Banking (${mfsProvider})`
        : (language === 'bn' ? 'নগদ (Cash)' : 'Cash');
    }

    // Previous sale reconciliation calculations (if editing)
    const prevPaidAmount = editingSale ? (Number(editingSale.paid_amount ?? editingSale.totalPaid) || 0) : 0;
    const prevTotalBill = editingSale ? (Number(editingSale.total ?? editingSale.grandTotal) || 0) : 0;
    const billDiff = editingSale ? (total - prevTotalBill) : 0;
    const diffAgainstPrevPaid = editingSale ? (total - prevPaidAmount) : 0;

    // SweetAlert confirmation modal before processing
    const alertHtml = `
      <div style="text-align: left; font-size: 13.5px; line-height: 1.6; color: #1e293b;">
        ${editingSale ? `
        <div style="background: #fdf4ff; border: 1.5px solid #d8b4fe; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-weight: 800; font-size: 13px; color: #7e22ce; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span>🔄 ${language === 'bn' ? 'পূর্ববর্তী চালানের হিসাব সমন্বয়' : 'Invoice Adjustment Breakdown'}</span>
            <span style="font-size: 11px; background: #fae8ff; color: #a21caf; padding: 2px 6px; border-radius: 4px;">${editingSale.invoice_number || editingSale.invoiceId || editingSale.id}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 3px;">
            <span style="color: #6b21a8;">${language === 'bn' ? 'আগের মোট বিল:' : 'Previous Total:'}</span>
            <strong>৳${prevTotalBill.toLocaleString()}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 3px;">
            <span style="color: #047857;">${language === 'bn' ? 'আগে পরিশোধিত (জমা):' : 'Previously Paid:'}</span>
            <strong style="color: #047857;">৳${prevPaidAmount.toLocaleString()}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-top: 5px; padding-top: 5px; border-top: 1px dashed #e9d5ff;">
            <span style="font-weight: 700; color: ${diffAgainstPrevPaid > 0 ? '#b91c1c' : (diffAgainstPrevPaid < 0 ? '#047857' : '#475569')};">
              ${diffAgainstPrevPaid > 0
          ? (language === 'bn' ? 'আগের জমার চেয়ে অতিরিক্ত দিতে হবে:' : 'Extra to Pay (vs Prev Paid):')
          : (diffAgainstPrevPaid < 0
            ? (language === 'bn' ? 'আগের জমার চেয়ে ফেরত দিতে হবে:' : 'Refund to Customer (vs Prev Paid):')
            : (language === 'bn' ? 'আগের জমার সমান (কোনো পার্থক্য নেই)' : 'Settled with Previous Paid'))}
            </span>
            <strong style="font-size: 13px; color: ${diffAgainstPrevPaid > 0 ? '#b91c1c' : (diffAgainstPrevPaid < 0 ? '#047857' : '#475569')};">
              ${diffAgainstPrevPaid > 0 ? `+৳${diffAgainstPrevPaid.toLocaleString()}` : (diffAgainstPrevPaid < 0 ? `−৳${Math.abs(diffAgainstPrevPaid).toLocaleString()}` : '৳0')}
            </strong>
          </div>
        </div>
        ` : ''}

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #64748b;">${language === 'bn' ? 'কাস্টমার:' : 'Customer:'}</span>
            <strong style="color: #0f172a;">${customerInfo.name}</strong>
          </div>
          ${customerInfo.phone ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #64748b;">${language === 'bn' ? 'মোবাইল:' : 'Phone:'}</span>
            <span style="color: #0f172a;">${customerInfo.phone}</span>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #64748b;">${language === 'bn' ? 'আইটেম সংখ্যা:' : 'Items:'}</span>
            <span style="color: #0f172a;">${cart.length} ${language === 'bn' ? 'টি' : 'items'} (${cart.reduce((n, i) => n + i.quantity, 0)} ${language === 'bn' ? 'পিস' : 'pcs'})</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">${language === 'bn' ? 'পেমেন্ট মেথড:' : 'Payment:'}</span>
            <strong style="color: #0284c7;">${effectiveMethodName}</strong>
          </div>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #1e3a8a; margin-bottom: 4px;">
            <span>${language === 'bn' ? 'নতুন মোট বিল:' : 'New Total Bill:'}</span>
            <span>৳${total.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: #047857; font-weight: 700; margin-bottom: 4px;">
            <span>${language === 'bn' ? 'বর্তমান পরিশোধ/জমা:' : 'Paid Now / Accounted:'}</span>
            <span>৳${effectivePaid.toLocaleString()}</span>
          </div>
          ${effectiveDue > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #b91c1c; font-weight: 700;">
            <span>${language === 'bn' ? 'বকেয়া (Due):' : 'Due Amount:'}</span>
            <span>৳${effectiveDue.toLocaleString()}</span>
          </div>` : ''}
          ${rec > total ? `
          <div style="display: flex; justify-content: space-between; color: #0284c7; font-weight: 700; margin-top: 4px;">
            <span>${language === 'bn' ? 'ফেরত টাকা (Change):' : 'Change to Return:'}</span>
            <span>৳${(rec - total).toLocaleString()}</span>
          </div>` : ''}
        </div>
      </div>
    `;

    const confirmResult = await Swal.fire({
      title: editingSaleId
        ? (language === 'bn' ? 'বিক্রয় আপডেট নিশ্চিত করুন?' : 'Confirm Sale Update?')
        : (language === 'bn' ? 'বিক্রয় সম্পন্ন করতে চান?' : 'Confirm Sale & Print?'),
      html: alertHtml,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, নিশ্চিত করুন' : 'Yes, Confirm',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusConfirm: true,
      padding: '1.25rem',
      borderRadius: '16px',
      customClass: {
        popup: 'swal2-modern-card',
      },
    });

    if (!confirmResult.isConfirmed) {
      return;
    }

    let autoPaymentType;
    let autoPaidAmount;
    let autoDueAmount;

    if (isSplit) {
      if (rec >= total && total > 0) {
        autoPaymentType = `Split (Cash + ${mfsProvider})`;
        autoPaidAmount = total;
        autoDueAmount = 0;
      } else if (rec <= 0) {
        autoPaymentType = 'Baki';
        autoPaidAmount = 0;
        autoDueAmount = total;
      } else {
        autoPaymentType = 'Partial';
        autoPaidAmount = rec;
        autoDueAmount = total - rec;
      }
    } else if (rec >= total && total > 0) {
      autoPaymentType = paymentType === 'Mobile Banking' ? `Mobile Banking (${mfsProvider})` : 'Cash';
      autoPaidAmount = total;
      autoDueAmount = 0;
    } else if (rec <= 0) {
      autoPaymentType = 'Baki';
      autoPaidAmount = 0;
      autoDueAmount = total;
    } else {
      // 0 < rec < total
      autoPaymentType = 'Partial';
      autoPaidAmount = rec;
      autoDueAmount = total - rec;
    }

    const salesmanObj = currentSalesman;
    const splitDetailsText = isSplit ? `Cash: ৳${cashVal.toLocaleString()} + ${mfsProvider}: ৳${mfsVal.toLocaleString()}` : undefined;
    const saleData = {
      cartItems: cart,
      paymentType: autoPaymentType,
      isSplit,
      cashPaid: isSplit ? cashVal : (paymentType === 'Cash' ? autoPaidAmount : 0),
      mfsPaid: isSplit ? mfsVal : (paymentType === 'Mobile Banking' ? autoPaidAmount : 0),
      mfsProvider: (paymentType === 'Mobile Banking' || isSplit) ? mfsProvider : undefined,
      mfsTrxId: (paymentType === 'Mobile Banking' || isSplit) && mfsTrxId?.trim() ? mfsTrxId.trim() : undefined,
      customerInfo,
      invoiceDiscount,
      salesman: salesmanObj,
      paidAmount: autoPaidAmount,
      account: 'Cash', // the shop keeps no bank: every method is drawer money
      splitDetails: splitDetailsText,
    };

    let computedNotes = isSplit
      ? `Split: Cash ৳${cashVal}, ${mfsProvider} ৳${mfsVal}${mfsTrxId?.trim() ? ` (TrxID: ${mfsTrxId.trim()})` : ''}`
      : (paymentType === 'Mobile Banking' && mfsTrxId?.trim() ? `TrxID: ${mfsTrxId.trim()}` : '');

    let originalInvoiceNumber = null;
    let originalDate = null;

    if (editingSale) {
      originalInvoiceNumber = editingSale.invoice_number || editingSale.invoiceId || editingSale.id;
      originalDate = editingSale.date;

      const editorName = user?.name || user?.username || 'Admin';
      const nowStr = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      const editEntry = `[সম্পাদনা: ${editorName} | ${nowStr}]`;

      const rawPast = (editingSale.notes || '').trim();
      const priorLogs = rawPast.match(/\[সম্পাদনা:[^\]]+\]/g) || [];
      const cleanedPast = rawPast.replace(/\[সম্পাদনা:[^\]]+\]/g, '').trim();

      const combinedBase = [cleanedPast, computedNotes].filter(Boolean).join(' | ');
      const allLogs = [...priorLogs, editEntry].join(' ');
      computedNotes = combinedBase ? `${combinedBase} ${allLogs}` : allLogs;
    }

    saleData.notes = computedNotes || undefined;
    if (originalInvoiceNumber) {
      saleData.id = originalInvoiceNumber;
      saleData.invoiceId = originalInvoiceNumber;
    }
    if (originalDate) {
      saleData.date = originalDate;
    }

    if (editingSaleId) {
      const delRes = await deleteSale(editingSaleId);
      if (!delRes?.ok) {
        toast.error(language === 'bn' ? 'পূর্বের চালান আপডেট প্রক্রিয়াকরণে সমস্যা হয়েছে।' : 'Failed to unwind previous sale for edit.');
        return;
      }
    }

    const res = await processSale(saleData);
    if (res?.ok) {
      const completedObj = {
        ...saleData,
        subtotal,
        total,
        date: res.invoice?.date || originalDate || new Date().toISOString(),
        invoiceId: res.invoice?.invoiceNumber || res.invoice?.invoice_number || res.invoice?.id || originalInvoiceNumber,
        invoiceNumber: res.invoice?.invoiceNumber || res.invoice?.invoice_number || res.invoice?.id || originalInvoiceNumber,
        paidAmount: Number(res.invoice?.paid_amount ?? autoPaidAmount) || 0,
        dueAmount: Number(res.invoice?.due_amount ?? autoDueAmount) || 0,
        cashReceived: rec > total ? rec : autoPaidAmount,
        changeGiven: rec > total ? rec - total : 0,
        splitDetails: splitDetailsText,
        notes: computedNotes,
        isOffline: Boolean(res.isOffline),
      };

      setCompletedSale(completedObj);
      clearCart();
      setCustomerInfo({ name: '', phone: '', location: '' });
      setInvoiceDiscount(0);
      setPaidAmount(0);
      setCashReceived('');
      setSplitCash('');
      setSplitMfs('');
      setPaymentType('Cash');
      setMfsProvider('bKash');
      setMfsTrxId('');
      setEditingSaleId(null);
      setEditingSale(null);
      
      if (res.isOffline) {
        toast.info(language === 'bn' ? 'অফলাইনে সেল সম্পন্ন হয়েছে! ইন্টারনেট সংযোগ পেলে এটি অটো-সিঙ্ক হবে।' : 'Sale completed in offline mode! It will auto-sync when online.');
      } else {
        toast.success(editingSale ? (language === 'bn' ? 'চালান সফলভাবে আপডেট করা হয়েছে!' : 'Invoice updated successfully!') : (language === 'bn' ? 'বিক্রয় সম্পন্ন হয়েছে!' : 'Sale processed successfully!'));
      }

      // Automatically trigger thermal printer
      setTimeout(() => {
        printElement('printable-thermal-receipt', `Receipt-${completedObj.invoiceId}`, { isThermal: true });
      }, 400);
    }
  };

  // Park the cart so the counter can serve someone else. The customer name is
  // not required here -- a draft is unfinished by definition.
  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      toast.error('Nothing to save. Add items to the cart first.');
      return;
    }
    const salesmanObj = currentSalesman;
    const isSplit = paymentType === 'Split';
    const actualPaymentType = isSplit
      ? `Split (Cash + ${mfsProvider})`
      : (paymentType === 'Mobile Banking' ? `Mobile Banking (${mfsProvider})` : paymentType);
    const res = await saveDraft({
      cartItems: cart,
      customerInfo,
      paymentType: actualPaymentType,
      invoiceDiscount,
      salesman: salesmanObj,
      total,
      isSplit,
      cashPaid: isSplit ? splitCash : undefined,
      mfsPaid: isSplit ? splitMfs : undefined,
      mfsProvider: (paymentType === 'Mobile Banking' || isSplit) ? mfsProvider : undefined,
      mfsTrxId: (paymentType === 'Mobile Banking' || isSplit) && mfsTrxId?.trim() ? mfsTrxId.trim() : undefined,
    });
    if (res?.ok) {
      clearCart();
      setCustomerInfo({ name: '', phone: '', location: '' });
      setInvoiceDiscount(0);
      setPaidAmount(0);
      setCashReceived('');
      setSplitCash('');
      setSplitMfs('');
      setScannedItem(null);
      toast.success(`Draft ${res.draft?.id || ''} saved.`);
    }
  };

  const handleResumeDraft = async (draft) => {
    if (cart.length > 0 && !window.confirm('This will replace what is in the cart. Continue?')) return;
    setCart(draft.cartItems || []);
    setCustomerInfo(draft.customerInfo || { name: '', phone: '', location: '' });
    if (draft.salesman?.id || draft.salesman?.staff_code) {
      setSelectedSalesmanId(draft.salesman.id || draft.salesman.staff_code);
    }
    if (draft.isSplit || draft.paymentType?.startsWith('Split')) {
      setPaymentType('Split');
      setSplitCash(draft.cashPaid ? String(draft.cashPaid) : '');
      setSplitMfs(draft.mfsPaid ? String(draft.mfsPaid) : '');
      if (draft.mfsProvider) setMfsProvider(draft.mfsProvider);
      else {
        const match = draft.paymentType?.match(/Split \(Cash \+ ([^)]+)\)/);
        if (match) setMfsProvider(match[1]);
      }
      if (draft.mfsTrxId) setMfsTrxId(draft.mfsTrxId);
    } else if (draft.paymentType?.startsWith('Mobile Banking') || ['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap', 'Bangla QR'].includes(draft.paymentType)) {
      setPaymentType('Mobile Banking');
      const match = draft.paymentType.match(/Mobile Banking \(([^)]+)\)/);
      if (match) setMfsProvider(match[1]);
      else if (['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap', 'Bangla QR'].includes(draft.paymentType)) setMfsProvider(draft.paymentType);
      if (draft.mfsTrxId) setMfsTrxId(draft.mfsTrxId);
    } else {
      setPaymentType(draft.paymentType || 'Cash');
    }
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

  const extractOriginalSplit = (sale) => {
    if (!sale) return { cash: 0, mfs: 0, totalPaid: 0 };
    let cash = sale.cashPaid !== undefined && sale.cashPaid !== null ? Number(sale.cashPaid) : 0;
    let mfs = sale.mfsPaid !== undefined && sale.mfsPaid !== null ? Number(sale.mfsPaid) : 0;
    const totalPaid = Number(sale.paid_amount ?? sale.totalPaid) || 0;

    // If not directly stored on object, try extracting from notes e.g. "Split: Cash ৳1000, bKash ৳2000"
    if (!cash && !mfs && sale.notes) {
      const cashMatch = sale.notes.match(/Cash[:\s]+৳?\s*([\d,.]+)/i);
      if (cashMatch) cash = parseFloat(cashMatch[1].replace(/,/g, '')) || 0;
      const mfsMatch = sale.notes.match(/(?:bKash|Nagad|Rocket|Binimoy|Upay|Cellfin|Tap|Bangla QR|MFS)[:\s]+৳?\s*([\d,.]+)/i);
      if (mfsMatch) mfs = parseFloat(mfsMatch[1].replace(/,/g, '')) || 0;
    }

    // If single payment or notes didn't specify split
    if (!cash && !mfs && totalPaid > 0) {
      if (sale.paymentType?.startsWith('Mobile Banking') || ['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap', 'Bangla QR'].includes(sale.paymentType)) {
        mfs = totalPaid;
      } else {
        cash = totalPaid;
      }
    }
    return { cash, mfs, totalPaid };
  };

  const handleEditSale = (sale) => {
    // Normalise items with numbers and safe fallbacks
    const mappedItems = (sale.items || []).map((item, idx) => ({
      id: item.id || item.product_code || `item-${idx}`,
      product_code: item.product_code || item.id,
      name: item.name || 'Product',
      variant: item.variant || '',
      unit: item.unit || 'pcs',
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1,
      itemDiscount: Number(item.itemDiscount || item.item_discount) || 0,
      isGift: Boolean(item.isGift || item.is_gift),
    }));
    setCart(mappedItems);

    const customer = customers.find(c => c.id === sale.customerId || c.customer_code === sale.customerId);
    setCustomerInfo({
      name: sale.customerName !== 'Walk-in Customer' ? (sale.customerName || '') : '',
      phone: customer?.phone || sale.customer_phone || '',
      location: customer?.location || sale.customer_location || ''
    });
    if (sale.salesmanId || sale.salesman_id) {
      setSelectedSalesmanId(sale.salesmanId || sale.salesman_id);
    }

    const { cash: origCash, mfs: origMfs, totalPaid: previousPaid } = extractOriginalSplit(sale);

    if (sale.isSplit || sale.paymentType?.startsWith('Split')) {
      setPaymentType('Split');
      setSplitCash(origCash > 0 ? String(origCash) : (previousPaid > 0 ? String(previousPaid) : '0'));
      setSplitMfs(origMfs > 0 ? String(origMfs) : '0');
      if (sale.mfsProvider) setMfsProvider(sale.mfsProvider);
      else {
        const match = sale.paymentType?.match(/Split \(Cash \+ ([^)]+)\)/);
        if (match) setMfsProvider(match[1]);
      }
      if (sale.mfsTrxId) setMfsTrxId(sale.mfsTrxId);
    } else if (sale.paymentType?.startsWith('Mobile Banking') || ['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap', 'Bangla QR'].includes(sale.paymentType)) {
      setPaymentType('Mobile Banking');
      const match = sale.paymentType.match(/Mobile Banking \(([^)]+)\)/);
      if (match) setMfsProvider(match[1]);
      else if (['bKash', 'Nagad', 'Rocket', 'Binimoy', 'Upay', 'Cellfin', 'Tap', 'Bangla QR'].includes(sale.paymentType)) setMfsProvider(sale.paymentType);
      if (sale.mfsTrxId) setMfsTrxId(sale.mfsTrxId);
      setSplitCash('');
      setSplitMfs('');
    } else {
      setPaymentType(sale.paymentType || 'Cash');
      setSplitCash('');
      setSplitMfs('');
    }

    setCashReceived(String(previousPaid));
    setPaidAmount(previousPaid);
    setInvoiceDiscount(Number(sale.invoiceDiscount ?? sale.invoice_discount) || 0);
    setEditingSaleId(sale.id || sale.invoice_number);
    setEditingSale(sale);
    setActiveTab('New');
  };

  useEffect(() => {
    if (location.state?.editSale) {
      handleEditSale(location.state.editSale);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

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
        <>
          {editingSale && (
            <div style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1.5px solid #3b82f6',
              borderRadius: '12px',
              padding: '12px 18px',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 3px 10px rgba(59, 130, 246, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>✏️</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#1e3a8a', fontSize: '15px' }}>
                      {language === 'bn' ? 'চালান সম্পাদনা মোড' : 'Invoice Edit Mode'}
                    </strong>
                    <span style={{ background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                      #{editingSale.invoice_number || editingSale.id}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#1e40af', marginTop: '3px' }}>
                    {language === 'bn' ? 'কাস্টমার:' : 'Customer:'} <strong>{customerInfo.name || editingSale.customerName || 'N/A'}</strong> | {language === 'bn' ? 'প্রয়োজনমতো পণ্য যোগ করুন বা বাদ দিন, মূল্য ও পরিশোধের হিসাব স্বয়ংক্রিয়ভাবে সামঞ্জস্য হবে।' : 'Add or remove products as needed; totals and balances will auto-adjust.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ borderColor: '#ef4444', color: '#ef4444', background: '#fff', fontSize: '12.5px', fontWeight: 700, padding: '6px 14px', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => {
                  if (window.confirm(language === 'bn' ? 'আপনি কি এই চালানটির সম্পাদনা বাতিল করতে চান?' : 'Do you want to cancel editing this invoice?')) {
                    setEditingSaleId(null);
                    setEditingSale(null);
                    clearCart();
                    setCustomerInfo({ name: '', phone: '', location: '' });
                    setInvoiceDiscount(0);
                    setPaidAmount(0);
                    setCashReceived('');
                    setSplitCash('');
                    setSplitMfs('');
                    setPaymentType('Cash');
                  }
                }}
              >
                ✕ {language === 'bn' ? 'সম্পাদনা বাতিল করুন' : 'Cancel Edit'}
              </button>
            </div>
          )}
          <div className="pos-container animate-fade-in">

            {/* ---------------------------------------------------------------- */}
            {/* Left: scan / search, then the order                              */}
            {/* ---------------------------------------------------------------- */}
            <section className="pos-left">
              <div className="pos-left-head">
                <div className="pos-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <h2>{editingSaleId ? t(language, 'Edit Sale') : t(language, 'Point of Sale')}</h2>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Online / Offline status badge */}
                    {isOnline ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#ecfdf5',
                          color: '#059669',
                          border: '1px solid #a7f3d0'
                        }}
                      >
                        <Wifi size={13} />
                        {language === 'bn' ? 'অনলাইন' : 'Online'}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca'
                        }}
                      >
                        <WifiOff size={13} />
                        {language === 'bn' ? 'অফলাইন মোড' : 'Offline Mode'}
                      </span>
                    )}

                    {/* Pending offline sales sync button */}
                    {(offlineSalesQueue || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() => syncOfflineSales()}
                        disabled={isSyncing}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          cursor: isSyncing ? 'not-allowed' : 'pointer'
                        }}
                        title={language === 'bn' ? 'ক্লিক করে অফলাইন সেলগুলো সার্ভারে সিঙ্ক করুন' : 'Click to sync offline sales to server'}
                      >
                        <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                        <span>
                          {isSyncing
                            ? (language === 'bn' ? 'সিঙ্ক হচ্ছে...' : 'Syncing...')
                            : `${offlineSalesQueue.length} ${language === 'bn' ? 'পেন্ডিং সিঙ্ক' : 'Pending Sync'}`}
                        </span>
                      </button>
                    )}

                    {/* Opens the drawer without a sale */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {customerInfo.customerCode && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--primary-soft)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          {language === 'bn' ? 'সংরক্ষিত কাস্টমার' : 'Saved Customer'}
                        </span>
                      )}
                      <button
                        type="button"
                        className={`walkin-btn ${customerInfo.name === 'Walk-in Customer' ? 'active' : ''}`}
                        onClick={handleWalkInCustomer}
                        title="Fill as Walk-in Customer"
                      >
                        <Sparkles size={11} />
                        {language === 'bn' ? 'ওয়াক-ইন' : 'Walk-in'}
                      </button>
                    </div>
                  </span>

                  <div className="input-with-icon">
                    <User size={14} />
                    <input
                      type="text"
                      placeholder={language === 'bn' ? 'কাস্টমারের নাম বা খুঁজুন…' : 'Customer name or search…'}
                      value={customerInfo.name}
                      onChange={e => {
                        setCustomerInfo(prev => ({
                          ...prev,
                          name: e.target.value,
                          id: undefined,
                          customerCode: undefined
                        }));
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setShowCustomerDropdown(false);
                      }}
                      autoComplete="off"
                    />
                    {showCustomerDropdown && customerSuggestions.length > 0 && (
                      <div className="customer-suggestions-dropdown" onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.7rem', background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <span>{language === 'bn' ? 'বিদ্যমান কাস্টমার (সিলেক্ট করতে ক্লিক করুন)' : 'Existing Customers'}</span>
                          <button
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              setShowCustomerDropdown(false);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0 4px', lineHeight: 1 }}
                            title="Close"
                          >
                            ✕
                          </button>
                        </div>
                        {customerSuggestions.map(c => (
                          <div
                            key={c.id}
                            className="customer-suggestion-item"
                            onMouseDown={e => {
                              e.preventDefault();
                              chooseCustomer(c);
                            }}
                          >
                            <div className="font-bold text-sm">{c.name}</div>
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                              {c.phone || ''}{c.due > 0 ? ` · ${language === 'bn' ? 'বকেয়া' : 'Due'} ৳${c.due}` : ''}
                            </div>
                          </div>
                        ))}
                        <div
                          className="customer-suggestion-item"
                          onMouseDown={e => {
                            e.preventDefault();
                            setShowCustomerDropdown(false);
                            document.getElementById('pos-customer-phone')?.focus();
                          }}
                          style={{
                            background: 'var(--primary-soft)',
                            color: 'var(--primary)',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            textAlign: 'center',
                            padding: '0.5rem 0.7rem',
                          }}
                        >
                          + {language === 'bn' ? 'নতুন কাস্টমার হিসেবে চালিয়ে যান (ফোন/ঠিকানা দিন)' : 'Continue as New Customer (Enter Phone/Address)'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="field-row">
                    <div className="input-with-icon">
                      <Phone size={13} />
                      <input
                        id="pos-customer-phone"
                        type="text"
                        placeholder={language === 'bn' ? 'মোবাইল দিয়ে খুঁজুন' : 'Phone (search)'}
                        value={customerInfo.phone}
                        onChange={e => {
                          setCustomerInfo(prev => ({
                            ...prev,
                            phone: e.target.value,
                            id: undefined,
                            customerCode: undefined
                          }));
                          setShowPhoneDropdown(true);
                        }}
                        onFocus={() => setShowPhoneDropdown(true)}
                        onBlur={() => setTimeout(() => setShowPhoneDropdown(false), 200)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') setShowPhoneDropdown(false);
                        }}
                        autoComplete="off"
                      />
                      {phoneSuggestions.length > 0 && (
                        <div className="customer-suggestions-dropdown" onMouseDown={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.7rem', background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <span>{language === 'bn' ? 'বিদ্যমান কাস্টমার (সিলেক্ট করতে ক্লিক করুন)' : 'Existing Customers'}</span>
                            <button
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                setShowPhoneDropdown(false);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0 4px', lineHeight: 1 }}
                              title="Close"
                            >
                              ✕
                            </button>
                          </div>
                          {phoneSuggestions.map(c => (
                            <div
                              key={c.id}
                              className="customer-suggestion-item"
                              onMouseDown={e => { e.preventDefault(); chooseCustomer(c); }}
                            >
                              <div className="font-bold text-sm">{c.phone}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                {c.name}{c.due > 0 ? ` · ${language === 'bn' ? 'বকেয়া' : 'Due'} ৳${c.due}` : ''}
                              </div>
                            </div>
                          ))}
                          <div
                            className="customer-suggestion-item"
                            onMouseDown={e => {
                              e.preventDefault();
                              setShowPhoneDropdown(false);
                              document.getElementById('pos-customer-location')?.focus();
                            }}
                            style={{
                              background: 'var(--primary-soft)',
                              color: 'var(--primary)',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              textAlign: 'center',
                              padding: '0.5rem 0.7rem',
                            }}
                          >
                            + {language === 'bn' ? 'এই নতুন নম্বরে কাস্টমার এন্ট্রি করুন' : 'Continue with this phone number'}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="input-with-icon">
                      <MapPin size={13} />
                      <input
                        id="pos-customer-location"
                        type="text"
                        placeholder={language === 'bn' ? 'ঠিকানা' : 'Address'}
                        value={customerInfo.location}
                        onChange={e => setCustomerInfo(prev => ({ ...prev, location: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Who is selling - enabled salesman selection */}
                <div className="field-block">
                  <span className="lbl">{t(language, 'Salesman')}</span>
                  <div className="input-with-icon">
                    <UserCheck size={13} />
                    <select
                      id="pos-salesman-select"
                      value={currentSalesman.id}
                      onChange={(e) => setSelectedSalesmanId(e.target.value)}
                    >
                      <option value="Admin">Admin (Admin)</option>
                      {(staff || []).map((s) => (
                        <option key={s.id || s.staff_code} value={s.staff_code || s.id}>
                          {s.name} ({s.role || 'Salesman'})
                        </option>
                      ))}
                      {loggedInSalesman.id !== 'Admin' && !(staff || []).some(s => String(s.id) === String(loggedInSalesman.id) || String(s.staff_code) === String(loggedInSalesman.id)) && (
                        <option value={loggedInSalesman.id}>
                          {loggedInSalesman.name} ({loggedInSalesman.role})
                        </option>
                      )}
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
                      <Banknote size={14} /> {t(language, 'Cash')}
                    </button>
                    <button
                      type="button"
                      className={paymentType === 'Mobile Banking' ? 'active' : ''}
                      onClick={() => setPaymentType('Mobile Banking')}
                    >
                      <Smartphone size={14} /> {language === 'bn' ? 'মোবাইল' : 'MFS'}
                    </button>
                    <button
                      type="button"
                      className={paymentType === 'Split' ? 'active' : ''}
                      onClick={() => setPaymentType('Split')}
                    >
                      <CreditCard size={14} /> {language === 'bn' ? 'ক্যাশ + MFS' : 'Cash + MFS'}
                    </button>
                  </div>
                </div>

                {/* Mobile Banking Options */}
                {paymentType === 'Mobile Banking' && (
                  <div className="field-block" style={{ marginTop: '0.4rem', padding: '0.65rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ marginBottom: '0.45rem' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-main)' }}>
                        {language === 'bn' ? 'মোবাইল ব্যাংকিং নির্বাচন করুন' : 'Select Mobile Banking'}
                      </label>
                      <select
                        className="form-control"
                        value={mfsProvider}
                        onChange={(e) => setMfsProvider(e.target.value)}
                        style={{
                          width: '100%',
                          height: '34px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-strong)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-main)',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          padding: '0 0.5rem',
                        }}
                      >
                        {MFS_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                        {language === 'bn' ? 'ট্রানজ্যাকশন আইডি / TrxID (অপশনাল)' : 'Transaction ID / TrxID (Optional)'}
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. 9J4K8L7M2N"
                        value={mfsTrxId}
                        onChange={(e) => setMfsTrxId(e.target.value)}
                        style={{
                          width: '100%',
                          height: '32px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          padding: '0 0.5rem',
                          fontSize: '0.8125rem',
                        }}
                      />
                    </div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>
                      ✓ {language === 'bn' ? `সম্পূর্ণ ৳${total.toLocaleString()} ${mfsProvider}-এর মাধ্যমে গ্রহণ হবে` : `Full ৳${total.toLocaleString()} will be received via ${mfsProvider}`}
                    </div>
                  </div>
                )}

                {/* Split Payment MFS Setup */}
                {paymentType === 'Split' && (
                  <div className="field-block" style={{ marginTop: '0.4rem', padding: '0.65rem 0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ marginBottom: '0.45rem' }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-main)' }}>
                        {language === 'bn' ? 'মোবাইল ব্যাংকিং নির্বাচন করুন' : 'Select Mobile Banking'}
                      </label>
                      <select
                        className="form-control"
                        value={mfsProvider}
                        onChange={(e) => setMfsProvider(e.target.value)}
                        style={{
                          width: '100%',
                          height: '34px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-strong)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-main)',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          padding: '0 0.5rem',
                        }}
                      >
                        {MFS_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                        {language === 'bn' ? 'MFS ট্রানজ্যাকশন আইডি / TrxID (অপশনাল)' : 'MFS TrxID (Optional)'}
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. 9J4K8L7M2N"
                        value={mfsTrxId}
                        onChange={(e) => setMfsTrxId(e.target.value)}
                        style={{
                          width: '100%',
                          height: '32px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          padding: '0 0.5rem',
                          fontSize: '0.8125rem',
                        }}
                      />
                    </div>
                  </div>
                )}

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

                {/* Invoice Reconciliation Card (Shown during Edit Sale) */}
                {editingSale && (() => {
                  const prevPaid = Number(editingSale.paid_amount ?? editingSale.totalPaid) || 0;
                  const prevBill = Number(editingSale.total ?? editingSale.grandTotal) || 0;
                  const billDiff = total - prevBill;
                  const diffAgainstPrevPaid = total - prevPaid;
                  const { cash: origCash, mfs: origMfs } = extractOriginalSplit(editingSale);

                  return (
                    <div
                      className="edit-reconciliation-card"
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        background: 'linear-gradient(135deg, rgba(243, 232, 255, 0.6) 0%, rgba(245, 243, 255, 0.9) 100%)',
                        border: '1.5px solid #d8b4fe',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 2px 8px rgba(147, 51, 234, 0.08)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem', paddingBottom: '0.35rem', borderBottom: '1px solid rgba(216, 180, 254, 0.6)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#7e22ce', fontWeight: 700, fontSize: '0.8rem' }}>
                          <FileText size={15} />
                          <span>{language === 'bn' ? 'চালান হিসাব সমন্বয় (পূর্ববর্তী তথ্য)' : 'Invoice Reconciliation'}</span>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9333ea', background: '#f3e8ff', padding: '1px 6px', borderRadius: '4px' }}>
                          #{editingSale.invoice_number || editingSale.invoiceId || editingSale.id}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', marginBottom: '0.45rem' }}>
                        <div style={{ background: '#ffffff', padding: '5px 7px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                          <div style={{ color: '#6b7280', fontSize: '0.68rem' }}>{language === 'bn' ? 'আগের মোট বিল' : 'Previous Total Bill'}</div>
                          <strong style={{ color: '#374151', fontSize: '0.82rem' }}>৳{prevBill.toLocaleString()}</strong>
                        </div>

                        <div style={{ background: '#ffffff', padding: '5px 7px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                          <div style={{ color: '#15803d', fontSize: '0.68rem' }}>
                            {language === 'bn' ? 'আগে পরিশোধিত (জমা)' : 'Previously Paid'}
                          </div>
                          <strong style={{ color: '#15803d', fontSize: '0.82rem' }}>৳{prevPaid.toLocaleString()}</strong>
                          {(origCash > 0 || origMfs > 0) && (
                            <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '1px' }}>
                              {origCash > 0 ? `ক্যাশ ৳${origCash.toLocaleString()}` : ''}
                              {origCash > 0 && origMfs > 0 ? ' + ' : ''}
                              {origMfs > 0 ? `MFS ৳${origMfs.toLocaleString()}` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bill variation indicator */}
                      <div style={{ background: '#ffffff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e9d5ff', marginBottom: '0.45rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                          <span style={{ color: '#4b5563' }}>{language === 'bn' ? 'বিলের পরিবর্তন:' : 'Bill Change:'}</span>
                          <strong style={{ color: billDiff > 0 ? '#b91c1c' : (billDiff < 0 ? '#15803d' : '#6b7280') }}>
                            {billDiff > 0 ? `+৳${billDiff.toLocaleString()} (পণ্য বেড়েছে)` : (billDiff < 0 ? `−৳${Math.abs(billDiff).toLocaleString()} (পণ্য কমেছে)` : 'অপরিবর্তিত (৳0)')}
                          </strong>
                        </div>

                        {/* Net Adjustment vs Previously Paid */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e5e7eb', fontSize: '0.77rem' }}>
                          <span style={{ fontWeight: 700, color: diffAgainstPrevPaid > 0 ? '#b91c1c' : (diffAgainstPrevPaid < 0 ? '#15803d' : '#4b5563') }}>
                            {diffAgainstPrevPaid > 0
                              ? (language === 'bn' ? '👉 আরও পরিশোধ করতে হবে:' : '👉 Extra to Pay:')
                              : (diffAgainstPrevPaid < 0
                                ? (language === 'bn' ? '👉 কাস্টমারকে ফেরত দিতে হবে:' : '👉 Refund to Customer:')
                                : (language === 'bn' ? '👉 আগের জমার সাথে সম্পূর্ণ সমন্বয়:' : '👉 Fully Settled:'))}
                          </span>
                          <strong style={{ fontSize: '0.875rem', fontWeight: 800, color: diffAgainstPrevPaid > 0 ? '#b91c1c' : (diffAgainstPrevPaid < 0 ? '#15803d' : '#4b5563') }}>
                            {diffAgainstPrevPaid > 0 ? `+৳${diffAgainstPrevPaid.toLocaleString()}` : (diffAgainstPrevPaid < 0 ? `−৳${Math.abs(diffAgainstPrevPaid).toLocaleString()}` : '৳0')}
                          </strong>
                        </div>
                      </div>

                      {/* One-click Action Buttons for Reconciliation */}
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="preset-chip"
                          style={{ fontSize: '0.68rem', padding: '3px 7px', background: '#f5f3ff', border: '1px solid #c084fc', color: '#6b21a8', fontWeight: 600 }}
                          onClick={() => {
                            if (paymentType === 'Split') {
                              // Adjust difference onto Cash
                              const diff = total - prevPaid;
                              setSplitCash(String(Math.max(0, origCash + diff)));
                              setSplitMfs(String(origMfs));
                            } else {
                              setCashReceived(String(total));
                            }
                          }}
                          title={language === 'bn' ? 'নতুন সম্পূর্ণ বিল পরিশোধ হিসেবে সমন্বয় করুন' : 'Settle to new total'}
                        >
                          ✓ {language === 'bn' ? 'নতুন বিল পুরো সমন্বয়' : 'Settle Full Bill'} (৳{total.toLocaleString()})
                        </button>

                        <button
                          type="button"
                          className="preset-chip"
                          style={{ fontSize: '0.68rem', padding: '3px 7px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontWeight: 600 }}
                          onClick={() => {
                            if (paymentType === 'Split') {
                              setSplitCash(String(origCash));
                              setSplitMfs(String(origMfs));
                            } else {
                              setCashReceived(String(prevPaid));
                            }
                          }}
                          title={language === 'bn' ? 'আগের জমার পরিমাণ সেট করুন' : 'Keep original paid amount'}
                        >
                          ↺ {language === 'bn' ? 'আগের জমা রাখুন' : 'Keep Prev Paid'} (৳{prevPaid.toLocaleString()})
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment Received Box: Split vs Standard Single */}
                {paymentType === 'Split' ? (
                  <div className="field-block" style={{ marginTop: '0.4rem', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <CreditCard size={15} />
                      <span>{language === 'bn' ? 'যৌথ পেমেন্ট বিভাজন (ক্যাশ + MFS)' : 'Split Payment (Cash + MFS)'}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.2rem' }}>
                          💵 {language === 'bn' ? 'নগদ জমা (Cash)' : 'Cash Paid'}
                        </label>
                        <div className="inline-amount" style={{ width: '100%' }}>
                          <span className="prefix">৳</span>
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            value={splitCash}
                            onChange={(e) => setSplitCash(e.target.value)}
                            style={{ width: '100%', fontWeight: 700, fontSize: '0.875rem' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.2rem' }}>
                          📱 {mfsProvider} {language === 'bn' ? 'জমা' : 'Paid'}
                        </label>
                        <div className="inline-amount" style={{ width: '100%' }}>
                          <span className="prefix">৳</span>
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            value={splitMfs}
                            onChange={(e) => setSplitMfs(e.target.value)}
                            style={{ width: '100%', fontWeight: 700, fontSize: '0.875rem' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick helper buttons */}
                    {total > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                        <button
                          type="button"
                          className="preset-chip"
                          style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                          onClick={() => {
                            const curCash = Number(splitCash) || 0;
                            setSplitMfs(String(Math.max(0, total - curCash)));
                          }}
                        >
                          {language === 'bn' ? `বাকিটা MFS-এ (${Math.max(0, total - (Number(splitCash) || 0))})` : 'Balance to MFS'}
                        </button>
                        <button
                          type="button"
                          className="preset-chip"
                          style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                          onClick={() => {
                            const curMfs = Number(splitMfs) || 0;
                            setSplitCash(String(Math.max(0, total - curMfs)));
                          }}
                        >
                          {language === 'bn' ? `বাকিটা ক্যাশে (${Math.max(0, total - (Number(splitMfs) || 0))})` : 'Balance to Cash'}
                        </button>
                        <button
                          type="button"
                          className="preset-chip"
                          style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                          onClick={() => {
                            const half = Math.round(total / 2);
                            setSplitCash(String(half));
                            setSplitMfs(String(total - half));
                          }}
                        >
                          50% / 50%
                        </button>

                        {/* Edit mode quick diff helper for split payment */}
                        {editingSale && (() => {
                          const prevPaid = Number(editingSale.paid_amount ?? editingSale.totalPaid) || 0;
                          const diff = total - prevPaid;
                          if (diff === 0) return null;
                          return (
                            <button
                              type="button"
                              className="preset-chip"
                              style={{ fontSize: '0.7rem', padding: '3px 8px', background: diff > 0 ? '#fef2f2' : '#f0fdf4', color: diff > 0 ? '#b91c1c' : '#15803d', borderColor: diff > 0 ? '#fca5a5' : '#86efac' }}
                              onClick={() => {
                                const curCash = Number(splitCash) || 0;
                                setSplitCash(String(Math.max(0, curCash + diff)));
                              }}
                            >
                              {diff > 0
                                ? (language === 'bn' ? `+ অতিরিক্ত ৳${diff.toLocaleString()} ক্যাশে যোগ` : `+ Add ৳${diff.toLocaleString()} to Cash`)
                                : (language === 'bn' ? `− ৳${Math.abs(diff).toLocaleString()} ক্যাশ থেকে কমান` : `− Reduce ৳${Math.abs(diff).toLocaleString()} from Cash`)}
                            </button>
                          );
                        })()}
                      </div>
                    )}

                    {/* Live Split Status Alert */}
                    {(() => {
                      const cashVal = Number(splitCash) || 0;
                      const mfsVal = Number(splitMfs) || 0;
                      const rec = cashVal + mfsVal;

                      if (rec <= 0) {
                        return (
                          <div className="pos-alert bad" style={{ marginTop: '0.35rem' }}>
                            <span>
                              ℹ️ {language === 'bn'
                                ? `সম্পূর্ণ বাকি (Full Due) — বকেয়া ৳${total.toLocaleString()}`
                                : `Full Due — ৳${total.toLocaleString()} will be recorded as Baki`}
                            </span>
                          </div>
                        );
                      }
                      if (rec > 0 && rec < total) {
                        return (
                          <div className="pos-alert info" style={{ marginTop: '0.35rem' }}>
                            <span>
                              ⚠️ {language === 'bn'
                                ? `মোট প্রাপ্ত: ৳${rec.toLocaleString()} (ক্যাশ: ৳${cashVal.toLocaleString()} + ${mfsProvider}: ৳${mfsVal.toLocaleString()}) | বাকি (Due): ৳${(total - rec).toLocaleString()}`
                                : `Total Received: ৳${rec.toLocaleString()} (Cash: ৳${cashVal.toLocaleString()} + ${mfsProvider}: ৳${mfsVal.toLocaleString()}) | Due: ৳${(total - rec).toLocaleString()}`}
                            </span>
                          </div>
                        );
                      }
                      if (rec > total) {
                        return (
                          <div className="pos-alert ok" style={{ marginTop: '0.35rem' }}>
                            <div>
                              <span>
                                {language === 'bn'
                                  ? `মোট জমা: ৳${rec.toLocaleString()} (ক্যাশ: ৳${cashVal.toLocaleString()} + ${mfsProvider}: ৳${mfsVal.toLocaleString()})`
                                  : `Total Received: ৳${rec.toLocaleString()}`}
                              </span>
                              <div style={{ color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                                {t(language, 'Change to Return')}: ৳{(rec - total).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="pos-alert ok" style={{ marginTop: '0.35rem' }}>
                          <span>
                            ✓ {language === 'bn'
                              ? `সম্পূর্ণ পরিশোধ (Paid) — ক্যাশ ৳${cashVal.toLocaleString()} + ${mfsProvider} ৳${mfsVal.toLocaleString()} = মোট ৳${total.toLocaleString()}`
                              : `Full Paid — Cash ৳${cashVal.toLocaleString()} + ${mfsProvider} ৳${mfsVal.toLocaleString()} = Total ৳${total.toLocaleString()}`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* Single Payment Received block (Cash or MFS) */
                  <div className="field-block" style={{ marginTop: '0.4rem' }}>
                    <div className="sum-line">
                      <span className="text-muted" style={{ fontWeight: 600 }}>
                        {paymentType === 'Mobile Banking'
                          ? (language === 'bn' ? 'মোবাইলে প্রাপ্ত টাকা' : 'MFS Received')
                          : t(language, 'Cash Received')}
                      </span>
                      <span className="inline-amount">
                        <span className="prefix">৳</span>
                        <input
                          type="number"
                          value={cashReceived}
                          onChange={e => setCashReceived(e.target.value)}
                          min="0"
                          placeholder="0"
                        />
                      </span>
                    </div>

                    {total > 0 && (
                      <div className="cash-presets" style={{ marginTop: '0.4rem' }}>
                        <button
                          type="button"
                          className={`preset-chip ${Number(cashReceived) === total && cashReceived !== '' ? 'active' : ''}`}
                          onClick={() => setCashReceived(String(total))}
                        >
                          {language === 'bn' ? 'পুরো পরিশোধ' : 'Exact'} ৳{total.toLocaleString()}
                        </button>
                        <button
                          type="button"
                          className={`preset-chip ${cashReceived === '' || Number(cashReceived) === 0 ? 'active' : ''}`}
                          onClick={() => setCashReceived('0')}
                          style={{ color: 'var(--danger)' }}
                        >
                          {language === 'bn' ? 'সম্পূর্ণ বাকি (৳0)' : 'Full Due (৳0)'}
                        </button>
                        {getCashPresets(total).filter(amt => amt !== total).slice(0, 3).map((amt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`preset-chip ${Number(cashReceived) === amt ? 'active' : ''}`}
                            onClick={() => setCashReceived(String(amt))}
                          >
                            ৳{amt.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Dynamic Auto Status Alert */}
                    {(() => {
                      const rec = Number(cashReceived) || 0;
                      if (rec <= 0) {
                        return (
                          <div className="pos-alert bad" style={{ marginTop: '0.45rem' }}>
                            <span>
                              ℹ️ {language === 'bn'
                                ? `সম্পূর্ণ বাকি (Full Due) — বকেয়া ৳${total.toLocaleString()}`
                                : `Full Due — ৳${total.toLocaleString()} will be recorded as Baki`}
                            </span>
                          </div>
                        );
                      }
                      if (rec > 0 && rec < total) {
                        return (
                          <div className="pos-alert info" style={{ marginTop: '0.45rem' }}>
                            <span>
                              ⚠️ {language === 'bn'
                                ? `আংশিক জমা: ৳${rec.toLocaleString()} | বাকি (Due): ৳${(total - rec).toLocaleString()}`
                                : `Partial: Paid ৳${rec.toLocaleString()} | Due: ৳${(total - rec).toLocaleString()}`}
                            </span>
                          </div>
                        );
                      }
                      if (rec > total) {
                        return (
                          <div className="pos-alert ok" style={{ marginTop: '0.45rem' }}>
                            <span>{t(language, 'Change to Return')}</span>
                            <span>৳{(rec - total).toLocaleString()}</span>
                          </div>
                        );
                      }
                      return (
                        <div className="pos-alert ok" style={{ marginTop: '0.45rem' }}>
                          <span>
                            ✓ {language === 'bn'
                              ? `সম্পূর্ণ পরিশোধ (Paid) — ৳${total.toLocaleString()}`
                              : `Full Paid — ৳${total.toLocaleString()}`}
                          </span>
                        </div>
                      );
                    })()}
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
                        setEditingSale(null);
                        clearCart();
                        setCustomerInfo({ name: '', phone: '', location: '' });
                        setInvoiceDiscount(0);
                        setPaidAmount(0);
                        setCashReceived('');
                        setSplitCash('');
                        setSplitMfs('');
                        setPaymentType('Cash');
                      }}
                    >
                      ✕ {t(language, 'Cancel Edit')}
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* The invoice, the moment the sale goes through */}
            {completedSale && createPortal(
              <div className="drawer-overlay">
                <div className="drawer-container" style={{ maxWidth: '440px' }}>
                  <div className="drawer-header">
                    <h3>
                      {language === 'bn' ? 'থার্মাল ক্যাশ মেমো' : 'Thermal Receipt'} · {completedSale.invoiceId}
                    </h3>
                    <button className="drawer-close-btn" onClick={() => setCompletedSale(null)}>
                      <X size={20} />
                    </button>
                  </div>

                  {completedSale.isOffline && (
                    <div style={{
                      padding: '8px 16px',
                      background: '#fffbeb',
                      borderBottom: '1px solid #fde68a',
                      color: '#b45309',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <WifiOff size={14} />
                      <span>{language === 'bn' ? 'এই সেলটি অফলাইনে সম্পন্ন হয়েছে। ইন্টারনেট সংযোগ পেলে এটি অটো-সিঙ্ক হবে।' : 'This sale was recorded offline. It will auto-sync when online.'}</span>
                    </div>
                  )}

                  <div className="drawer-body" style={{ padding: '16px 12px', background: '#f8fafc', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', width: '100%', maxWidth: '320px' }}>
                      <ThermalReceipt
                        sale={fromCompletedSale(completedSale)}
                        shopProfile={shopProfile}
                        language={language}
                        domId="printable-thermal-receipt"
                      />
                    </div>

                    {/* Off-screen elements for optional A4 Invoice and Voucher print/download */}
                    <div style={{ position: 'fixed', left: '-99999px', top: '0', opacity: 0, pointerEvents: 'none', zIndex: -100 }}>
                      <InvoiceDocument
                        sale={fromCompletedSale(completedSale)}
                        shopProfile={shopProfile}
                        language={language}
                        domId="printable-invoice"
                      />
                      <PaymentVoucher
                        sale={fromCompletedSale(completedSale)}
                        shopProfile={shopProfile}
                        language={language}
                        domId="printable-voucher"
                      />
                    </div>
                  </div>

                  <div className="drawer-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <button className="btn-outline" onClick={() => setCompletedSale(null)}>
                      {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
                    </button>
                    <div className="flex-align-gap" style={{ gap: '8px' }}>
                      <button
                        className="btn-outline flex-align-gap"
                        onClick={() => downloadElementAsPDF('printable-invoice', `Invoice-${completedSale.invoiceId}`)}
                        title="Download A4 size invoice as PDF"
                      >
                        <Download size={16} /> {language === 'bn' ? 'A4 PDF ডাউনলোড' : 'A4 Download PDF'}
                      </button>
                      <button
                        className="btn-outline flex-align-gap"
                        onClick={() => printElement('printable-invoice', `Invoice-${completedSale.invoiceId}`, { isThermal: false })}
                        title="Print A4 size invoice"
                      >
                        <FileText size={16} /> {language === 'bn' ? 'A4 চালান' : 'A4 Invoice'}
                      </button>
                      <button
                        className="btn-primary flex-align-gap"
                        onClick={() => printElement('printable-thermal-receipt', `Receipt-${completedSale.invoiceId}`, { isThermal: true })}
                      >
                        <Printer size={16} /> {language === 'bn' ? 'থার্মাল প্রিন্ট' : 'Thermal Print'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </>
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
                  <th style={{ textAlign: 'right', paddingRight: '0.85rem' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(s => (
                  <tr key={s.id}>
                    <td>{formatDate(s.date)}</td>
                    <td>{s.id}</td>
                    <td>{s.customerName || 'N/A'}</td>
                    <td>{s.items.length} items</td>
                    <td><span className={`badge ${s.paymentType === 'Cash' ? 'bg-success' : 'bg-warning'}`}>{s.paymentType}</span></td>
                    <td className="text-primary font-bold">৳{s.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
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
              <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
              <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#555', marginBottom: '0.75rem' }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
              <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '1rem' }}>Detailed Sales History</h3>
              {(startDate || endDate) && <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>Date Filter: {startDate || 'Any'} to {endDate || 'Any'}</p>}

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Date</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Invoice</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Customer</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Payment</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Item</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>Qty</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Price</th>
                    <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <React.Fragment key={sale.id}>
                      {sale.items.map((item, idx) => (
                        <tr key={`${sale.id}-${idx}`}>
                          {idx === 0 && (
                            <>
                              <td rowSpan={sale.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{formatDate(sale.date)}</td>
                              <td rowSpan={sale.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{sale.id}</td>
                              <td rowSpan={sale.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{sale.customerName || 'N/A'}</td>
                              <td rowSpan={sale.items.length} style={{ border: '1px solid #ccc', padding: '0.4rem', verticalAlign: 'top' }}>{sale.paymentType}</td>
                            </>
                          )}
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.name}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{item.price}</td>
                          <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{item.price * item.quantity}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f8f9fa' }}>
                        <td colSpan="7" style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>Invoice {sale.id} Total:</td>
                        <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>৳{sale.total}</td>
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
              <div style={{ display: 'none' }}>
                <ThermalReceipt
                  sale={fromApiInvoice(selectedInvoice, customers)}
                  shopProfile={shopProfile}
                  language={language}
                  domId="printable-single-invoice-pos-thermal"
                />
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn-outline" onClick={() => setSelectedInvoice(null)}>
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
              <div className="flex-align-gap" style={{ gap: '8px' }}>
                <button
                  className="btn-primary flex-align-gap"
                  onClick={() => printElement('printable-single-invoice-pos-thermal', `Receipt-${selectedInvoice.id}`, { isThermal: true })}
                >
                  <Printer size={16} /> {language === 'bn' ? 'থার্মাল প্রিন্ট' : 'Thermal Print'}
                </button>
                <button
                  className="btn-outline flex-align-gap"
                  onClick={() => printElement('printable-single-invoice-pos', `Invoice-${selectedInvoice.id}`, { isThermal: false })}
                >
                  <FileText size={16} /> {language === 'bn' ? 'A4 চালান' : 'A4 Invoice'}
                </button>
                <button
                  className="btn-outline flex-align-gap"
                  onClick={() => downloadElementAsPDF('printable-single-invoice-pos', `Invoice-${selectedInvoice.id}`)}
                  title="Download A4 size invoice as PDF"
                >
                  <Download size={16} /> {language === 'bn' ? 'A4 PDF ডাউনলোড' : 'A4 Download PDF'}
                </button>
              </div>
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
                  <th style={{ textAlign: 'right', paddingRight: '0.85rem' }}>{t(language, 'Actions')}</th>
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
                      <td>{formatDate(d.date)}</td>
                      <td>{d.id}</td>
                      <td>{d.customerInfo?.name || <span className="text-muted">—</span>}</td>
                      <td>{(d.cartItems || []).length} items</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>৳{Number(d.total || 0).toLocaleString()}</td>
                      <td className="text-muted">{d.salesman?.name || '—'}</td>
                      <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                        <div className="flex-align-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
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
