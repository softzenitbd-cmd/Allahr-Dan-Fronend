import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, PlusCircle, Search, Printer, Edit, Trash2, Settings2, Image as ImageIcon,
  Upload, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, FileDown, Package, Boxes, BadgeDollarSign, ShieldCheck,
  AlertTriangle, History, Clock, PackagePlus, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import useStore from '../store/useStore';
import ReferenceDataDrawer from '../components/ReferenceDataDrawer';
import { printElement } from '../utils/pdfGenerator';
import { printBarcodeLabels, labelSpecFrom, LABEL_SHOP_NAME } from '../utils/printLabels';
import { ProductService } from '../api/services';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { DEFAULT_SHOP_ADDRESS } from '../utils/shopConfig';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import './Inventory.css';

const getProductImageUrl = (img) => {
  if (!img) return null;
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('blob:')) return img;
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${img.startsWith('/') ? '' : '/'}${img}`;
};

const Inventory = () => {
  const {
    inventory, categories, units, addInventoryItem, updateInventoryItem,
    deleteInventoryItem, recordProductDamage, fetchStockLogs, language, shopProfile, refresh, user,
  } = useStore();
  // The original/buying price is confidential to the business owner/admin.
  // The server only returns cost_price for authenticated admins;
  // the frontend securely renders the Original Price column & valuation only for admins.
  const isAdmin = Boolean(
    user && (
      user.role === 'Admin' ||
      String(user.role).toLowerCase() === 'admin' ||
      user.is_superuser ||
      user.is_staff ||
      user.role === 'Owner' ||
      user.role === 'SuperAdmin'
    )
  );

  // Server-side pagination & filter states
  const [paginatedProducts, setPaginatedProducts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [stockStatus, setStockStatus] = useState('All');
  const [ordering, setOrdering] = useState('newest');

  // Modals & drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReferenceDrawer, setShowReferenceDrawer] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newProductImage, setNewProductImage] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState(null);
  const [editProductImage, setEditProductImage] = useState(null);
  const [editProductImagePreview, setEditProductImagePreview] = useState(null);
  const [quickStockItem, setQuickStockItem] = useState(null);
  const [quickAddQty, setQuickAddQty] = useState('');
  const [isSavingQuickStock, setIsSavingQuickStock] = useState(false);

  // Quick Damage State
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [selectedDamageProduct, setSelectedDamageProduct] = useState(null);
  const [damageQty, setDamageQty] = useState('');
  const [damageReason, setDamageReason] = useState('নষ্ট / ক্ষতিগ্রস্ত পণ্য');
  const [damageCustomReason, setDamageCustomReason] = useState('');
  const [damageSearchTerm, setDamageSearchTerm] = useState('');
  const [isSavingDamage, setIsSavingDamage] = useState(false);

  // History Modals State
  const [showDamageHistoryModal, setShowDamageHistoryModal] = useState(false);
  const [showStockInHistoryModal, setShowStockInHistoryModal] = useState(false);
  const [showProductHistoryModal, setShowProductHistoryModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historySummary, setHistorySummary] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('all');
  const [historySubFilter, setHistorySubFilter] = useState('ALL');

  // The category tree as the server keeps it: top-level ones, and under each
  // the sub-categories that point at it. Names not yet registered as a
  // Category row (typed straight onto a product) are treated as top-level.
  const categoryRows = (categories || []).filter((c) => c && typeof c === 'object');
  const topCategories = categoryRows.filter((c) => !c.parent).map((c) => c.name);
  const subCategoriesOf = (parentName) =>
    categoryRows.filter((c) => c.parent_name === parentName).map((c) => c.name);
  const looseNames = Array.from(new Set(
    (inventory || []).map((i) => i.category).filter(Boolean)
  )).filter((name) => !categoryRows.some((c) => c.name === name));

  const availableCategories = Array.from(new Set([
    ...topCategories,
    ...categoryRows.filter((c) => c.parent).map((c) => c.name),
    ...looseNames,
  ].map((c) => (c || '').trim()).filter(Boolean)));

  /** The category <select> for the product form: sub-categories under their parent. */
  const renderCategoryOptions = () => (
    <>
      {[...topCategories, ...looseNames].map((top) => {
        const subs = subCategoriesOf(top);
        return subs.length === 0
          ? <option key={top} value={top}>{top}</option>
          : (
            <optgroup key={top} label={top}>
              <option value={top}>{top} ({language === 'bn' ? 'সাধারণ' : 'general'})</option>
              {subs.map((sub) => <option key={sub} value={sub}>{top} › {sub}</option>)}
            </optgroup>
          );
      })}
    </>
  );

  const availableUnits = Array.from(new Set([
    'Pcs', 'Set', 'Box', 'Packet', 'Meter', 'Yard',
    ...(units || []).map(u => typeof u === 'string' ? u : u.name).filter(Boolean),
    ...(inventory || []).map(i => i.unit).filter(Boolean)
  ]));

  const [newProduct, setNewProduct] = useState({
    id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, min_stock: 5, mrp: 0, discount_price: 0, price: 0, cost_price: ''
  });

  const calculateEan13CheckDigit = (twelveDigits) => {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(twelveDigits[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    return String((10 - (sum % 10)) % 10);
  };

  const getNextProductId = () => {
    const existingBases = (inventory || [])
      .map(i => String(i.id || i.product_code || '').trim())
      .filter(code => /^894\d{10}$/.test(code) || /^20\d{11}$/.test(code))
      .map(code => parseInt(code.slice(0, 12), 10))
      .filter(n => !isNaN(n) && n > 0);

    let nextBase = 894117000001;
    if (existingBases.length > 0) {
      nextBase = Math.max(...existingBases) + 1;
    }

    const baseStr = String(nextBase).padStart(12, '0');
    return `${baseStr}${calculateEan13CheckDigit(baseStr)}`;
  };

  // Fetch paginated products from backend
  const fetchPaginatedProducts = useCallback(async (targetPage = currentPage) => {
    setIsLoading(true);
    try {
      const params = {
        page: targetPage,
        page_size: pageSize,
      };
      if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();
      // A sub-category narrows to itself; a top-level one brings its subs along
      // (the server includes children when given a parent's name).
      const categoryParam = selectedSubCategory || selectedCategory;
      if (categoryParam && categoryParam !== 'All') params.category = categoryParam;
      if (stockStatus && stockStatus !== 'All') params.stock_status = stockStatus;
      if (ordering) params.ordering = ordering;


      const res = await ProductService.list(params);
      if (res && res.results) {
        setPaginatedProducts(res.results);
        setTotalCount(res.count ?? 0);
        setTotalPages(res.total_pages ?? Math.max(1, Math.ceil((res.count || 0) / pageSize)));
      } else if (Array.isArray(res)) {
        setPaginatedProducts(res);
        setTotalCount(res.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to fetch paginated products:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, selectedCategory, selectedSubCategory, stockStatus, ordering]);

  const isFirstRender = useRef(true);

  // Debounced query when filters/search change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      fetchPaginatedProducts(1);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchPaginatedProducts(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, selectedSubCategory, stockStatus, ordering, pageSize]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    fetchPaginatedProducts(newPage);
  };

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const handleOpenAddModal = () => {
    setNewProduct({
      id: getNextProductId(),
      name: '',
      category: availableCategories[0] || 'Panjabi',
      unit: availableUnits[0] || 'Pcs',
      variant: '',
      stock: 0,
      min_stock: 5,
      mrp: 0,
      discount_price: 0,
      price: 0,
      cost_price: ''
    });
    setNewProductImage(null);
    setNewProductImagePreview(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item) => {
    const salePrice = item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price);
    const mrpPrice = item.mrp && Number(item.mrp) > 0 ? Number(item.mrp) : salePrice;
    const alertLimit = item.min_stock !== undefined && item.min_stock !== null && item.min_stock !== '' ? item.min_stock : (item.minStock ?? 5);
    const curStock = parseInt(item.stock, 10) || 0;
    setEditingItem({
      ...item,
      initialStock: curStock,
      stockToAdd: '',
      stock: curStock,
      min_stock: alertLimit,
      minStock: alertLimit,
      cost_price: item.cost_price ?? item.costPrice ?? '',
      mrp: mrpPrice,
      discount_price: salePrice,
      price: salePrice,
    });
    setEditProductImage(null);
    setEditProductImagePreview(getProductImageUrl(item.image) || null);
  };

  const handleOpenQuickStock = (item) => {
    setQuickStockItem(item);
    setQuickAddQty('');
  };

  const handleQuickStockSubmit = async (e) => {
    e.preventDefault();
    if (!quickStockItem) return;
    const addQty = parseInt(quickAddQty, 10);
    if (!addQty || addQty <= 0) {
      toast.warning(language === 'bn' ? 'দয়া করে যোগ করার সঠিক সংখ্যা দিন।' : 'Please enter a valid quantity to add.');
      return;
    }
    const currentStock = parseInt(quickStockItem.stock, 10) || 0;
    const newTotalStock = currentStock + addQty;

    setIsSavingQuickStock(true);
    const res = await updateInventoryItem(quickStockItem.id, {
      ...quickStockItem,
      stock: newTotalStock,
    });
    setIsSavingQuickStock(false);

    if (res?.ok) {
      showSuccessAlert(
        language === 'bn'
          ? `'${quickStockItem.name}' পণ্যে ${addQty} টি নতুন স্টক যোগ করা হয়েছে! মোট স্টক: ${newTotalStock} টি`
          : `Added ${addQty} stock to '${quickStockItem.name}'! Total stock: ${newTotalStock}`
      );
      setQuickStockItem(null);
      setQuickAddQty('');
      await refresh('inventory');
      fetchPaginatedProducts(currentPage);
    } else {
      toast.error(res?.message || (language === 'bn' ? 'স্টক আপডেট ব্যর্থ হয়েছে।' : 'Failed to update stock.'));
    }
  };

  const handleOpenDamageModal = (item = null) => {
    setSelectedDamageProduct(item);
    setDamageQty('');
    setDamageReason('নষ্ট / ক্ষতিগ্রস্ত পণ্য');
    setDamageCustomReason('');
    setDamageSearchTerm('');
    setShowDamageModal(true);
  };

  const handleDamageSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDamageProduct) {
      toast.error(language === 'bn' ? 'অনুগ্রহ করে একটি পণ্য নির্বাচন করুন।' : 'Please select a product.');
      return;
    }
    const qty = parseInt(damageQty, 10);
    const currentStock = parseInt(selectedDamageProduct.stock, 10) || 0;
    if (!qty || qty <= 0) {
      toast.warning(language === 'bn' ? 'দয়া করে বাদ দেওয়ার সঠিক সংখ্যা দিন।' : 'Please enter a valid quantity.');
      return;
    }
    if (qty > currentStock) {
      toast.error(
        language === 'bn'
          ? `স্টকে পর্যাপ্ত পরিমাণ নেই! বর্তমান স্টক: ${currentStock} ${selectedDamageProduct.unit || 'Pcs'}`
          : `Not enough stock! Current stock: ${currentStock} ${selectedDamageProduct.unit || 'Pcs'}`
      );
      return;
    }

    const finalReason = (damageReason === 'অন্যান্য' || damageReason === 'Other')
      ? (damageCustomReason.trim() || (language === 'bn' ? 'নষ্ট / ক্ষতিগ্রস্ত পণ্য' : 'Damaged / Waste'))
      : damageReason;

    setIsSavingDamage(true);
    const res = await recordProductDamage({
      product_code: selectedDamageProduct.product_code || selectedDamageProduct.id,
      quantity: qty,
      reason: finalReason,
    });
    setIsSavingDamage(false);

    if (res?.ok) {
      const newBal = currentStock - qty;
      showSuccessAlert(
        language === 'bn'
          ? `'${selectedDamageProduct.name}' পণ্য থেকে ${qty} ${selectedDamageProduct.unit || 'টি'} ড্যামেজ হিসেবে বাদ দেওয়া হয়েছে! বর্তমান স্টক: ${newBal} টি`
          : `Deducted ${qty} damaged units from '${selectedDamageProduct.name}'! Current stock: ${newBal}`
      );
      setShowDamageModal(false);
      setSelectedDamageProduct(null);
      setDamageQty('');
      await refresh('inventory');
      fetchPaginatedProducts(currentPage);
    } else {
      toast.error(res?.message || (language === 'bn' ? 'ড্যামেজ রেকর্ড সম্পন্ন করা যায়নি।' : 'Failed to record damage.'));
    }
  };

  const formatTimeAgo = (iso) => {
    if (!iso) return '';
    const then = new Date(iso);
    const mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return language === 'bn' ? 'এইমাত্র' : 'just now';
    if (mins < 60) return language === 'bn' ? `${mins} মি. আগে` : `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return language === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? (language === 'bn' ? 'গতকাল' : 'yesterday') : (language === 'bn' ? `${days} দিন আগে` : `${days} days ago`);
  };

  const getDateRangeForFilter = (filter) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (filter === 'today') {
      return { start_date: todayStr, end_date: todayStr };
    }
    if (filter === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      return { start_date: past.toISOString().split('T')[0], end_date: todayStr };
    }
    if (filter === '30days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      return { start_date: past.toISOString().split('T')[0], end_date: todayStr };
    }
    return {};
  };

  const loadDamageHistory = useCallback(async (dateFilter = historyDateFilter, search = historySearch) => {
    setIsHistoryLoading(true);
    const dateParams = getDateRangeForFilter(dateFilter);
    const params = {
      movement_type: 'DAMAGE',
      limit: 500,
      ...dateParams,
    };
    if (search && search.trim()) params.search = search.trim();
    const res = await fetchStockLogs(params);
    if (res?.ok) {
      setHistoryLogs(res.rows || []);
      setHistorySummary(res.summary || null);
    }
    setIsHistoryLoading(false);
  }, [fetchStockLogs, historyDateFilter, historySearch]);

  const loadStockInHistory = useCallback(async (dateFilter = historyDateFilter, search = historySearch, subFilter = historySubFilter) => {
    setIsHistoryLoading(true);
    const dateParams = getDateRangeForFilter(dateFilter);
    const params = {
      direction: 'in',
      limit: 500,
      ...dateParams,
    };
    if (subFilter && subFilter !== 'ALL') {
      params.movement_type = subFilter;
    }
    if (search && search.trim()) params.search = search.trim();
    const res = await fetchStockLogs(params);
    if (res?.ok) {
      setHistoryLogs(res.rows || []);
      setHistorySummary(res.summary || null);
    }
    setIsHistoryLoading(false);
  }, [fetchStockLogs, historyDateFilter, historySearch, historySubFilter]);

  const loadProductHistory = useCallback(async (prod, subFilter = historySubFilter) => {
    if (!prod) return;
    setIsHistoryLoading(true);
    const params = {
      product: prod.product_code || prod.id,
      limit: 500,
    };
    if (subFilter === 'DAMAGE') {
      params.movement_type = 'DAMAGE';
    } else {
      // In inventory, sale history is not shown; only stock additions
      params.direction = 'in';
      if (subFilter && subFilter !== 'IN' && subFilter !== 'ALL') {
        params.movement_type = subFilter;
      }
    }

    const res = await fetchStockLogs(params);
    if (res?.ok) {
      // Guarantee sales never appear in inventory history
      const rows = (res.rows || []).filter(r => r.movement_type !== 'SALE');
      setHistoryLogs(rows);
      setHistorySummary(res.summary || null);
    }
    setIsHistoryLoading(false);
  }, [fetchStockLogs, historySubFilter]);

  const handleOpenDamageHistory = () => {
    setHistorySearch('');
    setHistoryDateFilter('all');
    setShowDamageHistoryModal(true);
    loadDamageHistory('all', '');
  };

  const handleOpenStockInHistory = () => {
    setHistorySearch('');
    setHistoryDateFilter('all');
    setHistorySubFilter('ALL');
    setShowStockInHistoryModal(true);
    loadStockInHistory('all', '', 'ALL');
  };

  const handleOpenProductHistory = (item) => {
    setHistoryProduct(item);
    setHistorySubFilter('IN');
    setShowProductHistoryModal(true);
    loadProductHistory(item, 'IN');
  };

  const handleImageSelect = (file, isEdit = false) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'bn' ? 'অনুগ্রহ করে একটি সঠিক ছবি ফাইল নির্বাচন করুন।' : 'Please select a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'bn' ? 'ছবির সাইজ সর্বোচ্চ ৫MB হতে পারবে।' : 'Image size must be less than 5MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (isEdit) {
      setEditProductImage(file);
      setEditProductImagePreview(previewUrl);
    } else {
      setNewProductImage(file);
      setNewProductImagePreview(previewUrl);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    let res;
    const mrpVal = parseFloat(editingItem.mrp) || 0;
    const discVal = parseFloat(editingItem.discount_price) || 0;
    const saleVal = discVal > 0 ? discVal : (parseFloat(editingItem.price) || mrpVal);
    const minVal = parseInt(editingItem.min_stock !== undefined && editingItem.min_stock !== '' ? editingItem.min_stock : 5);

    if (editProductImage) {
      const formData = new FormData();
      formData.append('name', editingItem.name);
      formData.append('category', editingItem.category || '');
      formData.append('unit', editingItem.unit || 'Pcs');
      if (editingItem.variant) formData.append('variant', editingItem.variant);
      formData.append('stock', parseInt(editingItem.stock) || 0);
      formData.append('min_stock', minVal);
      formData.append('minStock', minVal);
      formData.append('mrp', mrpVal || saleVal);
      formData.append('discount_price', discVal || saleVal);
      formData.append('price', saleVal);
      if (isAdmin) formData.append('cost_price', parseFloat(editingItem.cost_price) || 0);
      formData.append('image', editProductImage);
      res = await updateInventoryItem(editingItem.id, formData);
    } else {
      const { minStock, initialStock, stockToAdd, image, ...restEditingItem } = editingItem;
      const payload = {
        ...restEditingItem,
        mrp: mrpVal || saleVal,
        discount_price: discVal || saleVal,
        price: saleVal,
        stock: parseInt(editingItem.stock) || 0,
        min_stock: minVal,
        minStock: minVal,
        ...(isAdmin ? { cost_price: parseFloat(editingItem.cost_price) || 0 } : {}),
      };
      // If user removed the existing image by clicking "X":
      if (!editProductImagePreview && editingItem.image) {
        payload.image = null;
      }
      res = await updateInventoryItem(editingItem.id, payload);
    }

    if (res?.ok) {
      const addedCount = parseInt(editingItem.stockToAdd, 10);
      const msg = (addedCount && addedCount > 0)
        ? (language === 'bn'
            ? `'${editingItem.name}' পণ্য আপডেট হয়েছে! আগের ${editingItem.initialStock ?? 0} টির সাথে ${addedCount} টি যোগ হয়ে মোট স্টক: ${editingItem.stock} টি`
            : `Updated '${editingItem.name}'! Added ${addedCount} to previous ${editingItem.initialStock ?? 0}, total: ${editingItem.stock}`)
        : (language === 'bn' ? 'পণ্য সফলভাবে আপডেট হয়েছে!' : 'Product updated successfully!');
      setEditingItem(null);
      setEditProductImage(null);
      setEditProductImagePreview(null);
      showSuccessAlert(msg);
      await refresh('inventory');
      fetchPaginatedProducts(currentPage);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'পণ্যটি ডিলিট করবেন?' : 'Delete Product?',
      text: language === 'bn' ? 'আপনি কি নিশ্চিত এই পণ্যটি ডিলিট করতে চান?' : 'Are you sure you want to delete this item?',
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, ডিলিট করুন' : 'Yes, delete',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = await deleteInventoryItem(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'পণ্য ডিলিট করা হয়েছে!' : 'Product deleted!');
        await refresh('inventory');
        fetchPaginatedProducts(currentPage);
      }
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    const finalId = (newProduct.id || '').trim() || getNextProductId();
    const finalName = (newProduct.name || '').trim();
    if (!finalName) {
      toast.error(language === 'bn' ? 'পণ্যের নাম দেওয়া আবশ্যক!' : 'Product name is required!');
      return;
    }

    let res;
    const mrpVal = parseFloat(newProduct.mrp) || 0;
    const discVal = parseFloat(newProduct.discount_price) || 0;
    const saleVal = discVal > 0 ? discVal : (parseFloat(newProduct.price) || mrpVal);
    const minVal = parseInt(newProduct.min_stock !== undefined && newProduct.min_stock !== '' ? newProduct.min_stock : 5);

    // Check if a product with this ID or Barcode already exists in inventory
    const existingProduct = (inventory || []).find(
      (p) => String(p.id).trim().toLowerCase() === finalId.toLowerCase() ||
             String(p.product_code).trim().toLowerCase() === finalId.toLowerCase()
    );

    if (existingProduct) {
      const addedQty = parseInt(newProduct.stock, 10) || 0;
      const prevStock = parseInt(existingProduct.stock, 10) || 0;
      const newTotalStock = prevStock + addedQty;

      let updateRes;
      if (newProductImage) {
        const formData = new FormData();
        formData.append('name', finalName || existingProduct.name);
        formData.append('category', newProduct.category || existingProduct.category || 'Panjabi');
        formData.append('unit', newProduct.unit || existingProduct.unit || 'Pcs');
        if (newProduct.variant || existingProduct.variant) formData.append('variant', newProduct.variant || existingProduct.variant || '');
        formData.append('stock', newTotalStock);
        formData.append('min_stock', minVal);
        formData.append('minStock', minVal);
        formData.append('mrp', mrpVal || existingProduct.mrp || saleVal);
        formData.append('discount_price', discVal || existingProduct.discount_price || saleVal);
        formData.append('price', saleVal || existingProduct.price);
        if (isAdmin && newProduct.cost_price) formData.append('cost_price', parseFloat(newProduct.cost_price) || 0);
        formData.append('image', newProductImage);
        updateRes = await updateInventoryItem(existingProduct.id, formData);
      } else {
        const payload = {
          name: finalName || existingProduct.name,
          category: newProduct.category || existingProduct.category,
          unit: newProduct.unit || existingProduct.unit || 'Pcs',
          variant: newProduct.variant || existingProduct.variant,
          mrp: mrpVal || existingProduct.mrp || saleVal,
          discount_price: discVal || existingProduct.discount_price || saleVal,
          price: saleVal || existingProduct.price,
          stock: newTotalStock,
          min_stock: minVal,
          minStock: minVal,
          ...(isAdmin && newProduct.cost_price ? { cost_price: parseFloat(newProduct.cost_price) || 0 } : {}),
        };
        updateRes = await updateInventoryItem(existingProduct.id, payload);
      }

      if (updateRes?.ok) {
        setShowAddModal(false);
        setNewProduct({ id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, min_stock: 5, mrp: 0, discount_price: 0, price: 0, cost_price: '' });
        setNewProductImage(null);
        setNewProductImagePreview(null);
        showSuccessAlert(
          language === 'bn'
            ? `'${existingProduct.name}' পণ্যে আগের ${prevStock} টির সাথে নতুন ${addedQty} টি যোগ করা হয়েছে! মোট স্টক: ${newTotalStock} টি`
            : `Added ${addedQty} stock to '${existingProduct.name}' (Previously: ${prevStock})! Total stock: ${newTotalStock}`
        );
        await refresh('inventory');
        fetchPaginatedProducts(1);
        return;
      } else {
        toast.error(updateRes?.message || (language === 'bn' ? 'স্টক যোগ করা ব্যর্থ হয়েছে।' : 'Failed to update stock.'));
        return;
      }
    }

    if (newProductImage) {
      const formData = new FormData();
      formData.append('id', finalId);
      formData.append('name', finalName);
      formData.append('category', newProduct.category || 'Panjabi');
      formData.append('unit', newProduct.unit || 'Pcs');
      if (newProduct.variant) formData.append('variant', newProduct.variant);
      formData.append('stock', parseInt(newProduct.stock) || 0);
      formData.append('min_stock', minVal);
      formData.append('minStock', minVal);
      formData.append('mrp', mrpVal || saleVal);
      formData.append('discount_price', discVal || saleVal);
      formData.append('price', saleVal);
      if (isAdmin) formData.append('cost_price', parseFloat(newProduct.cost_price) || 0);
      formData.append('image', newProductImage);
      res = await addInventoryItem(formData);
    } else {
      const { minStock, ...restNewProduct } = newProduct;
      const payload = {
        ...restNewProduct,
        id: finalId,
        name: finalName,
        mrp: mrpVal || saleVal,
        discount_price: discVal || saleVal,
        price: saleVal,
        stock: parseInt(newProduct.stock) || 0,
        min_stock: minVal,
        minStock: minVal,
        ...(isAdmin ? { cost_price: parseFloat(newProduct.cost_price) || 0 } : {}),
      };
      res = await addInventoryItem(payload);
    }

    if (res?.ok) {
      setShowAddModal(false);
      setNewProduct({ id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, min_stock: 5, mrp: 0, discount_price: 0, price: 0, cost_price: '' });
      setNewProductImage(null);
      setNewProductImagePreview(null);
      showSuccessAlert(language === 'bn' ? 'নতুন পণ্য সফলভাবে যুক্ত হয়েছে!' : 'Product added successfully!');
      await refresh('inventory');
      fetchPaginatedProducts(1);
    }
  };

  const handlePrintBarcode = (product) => {
    printBarcodeLabels(product, 1, LABEL_SHOP_NAME, labelSpecFrom(shopProfile));
  };

  const totalItems = (inventory || []).reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const totalValue = (inventory || []).reduce((sum, item) => {
    const salePrice = item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price);
    return sum + ((Number(item.stock) || 0) * (salePrice || 0));
  }, 0);

  const handlePrintInventoryList = () => {
    printElement('printable-inventory-list', 'Inventory');
  };

  // What the shelves are worth at what the shop paid for them. Built from the
  // full catalogue in the store rather than the current page, so a filter on
  // screen never shrinks the total on paper.
  const valuationRows = (inventory || []).map((p) => {
    const qty = Number(p.stock) || 0;
    const cost = Number(p.cost_price) || 0;
    const retail = Number(p.discount_price) > 0 ? Number(p.discount_price) : (Number(p.price) || 0);
    return { ...p, qty, cost, retail, costValue: qty * cost, retailValue: qty * retail };
  });
  const valuation = valuationRows.reduce((acc, r) => ({
    units: acc.units + r.qty,
    costValue: acc.costValue + r.costValue,
    retailValue: acc.retailValue + r.retailValue,
    missingCost: acc.missingCost + (r.qty > 0 && r.cost <= 0 ? 1 : 0),
  }), { units: 0, costValue: 0, retailValue: 0, missingCost: 0 });

  const lowStockCount = (inventory || []).filter((item) => {
    const limit = Number(item.min_stock !== undefined && item.min_stock !== null && item.min_stock !== '' ? item.min_stock : (item.minStock ?? 5));
    return Number(item.stock) <= limit;
  }).length;

  const handleDownloadValuation = () => {
    printElement('printable-valuation', `Inventory-Valuation-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div className="inventory-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Inventory Management')}</h1>
          <p className="text-muted">{language === 'bn' ? 'আপনার স্টক, ক্যাটাগরি এবং বারকোড ম্যানেজ করুন।' : 'Manage your stock, categories, and generate barcodes.'}</p>
        </div>
        <div className="flex-align-gap">
          <button className="btn-outline flex-align-gap" onClick={handlePrintInventoryList}>
            <Printer size={18} /> {t(language, 'Print List' || 'Print')}
          </button>
          {isAdmin && (
            <button
              className="btn-outline flex-align-gap"
              onClick={handleDownloadValuation}
              title={language === 'bn' ? 'সব পণ্যের ক্রয়মূল্যসহ মোট স্টক ভ্যালুয়েশন (PDF)' : 'Every product at cost price, with the total stock valuation (PDF)'}
            >
              <FileDown size={18} /> {language === 'bn' ? 'ভ্যালুয়েশন PDF' : 'Valuation PDF'}
            </button>
          )}
          <button
            className="btn-outline flex-align-gap"
            style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 600 }}
            onClick={handleOpenStockInHistory}
            title={language === 'bn' ? 'কবে কত পিস পণ্য যোগ করেছেন তার ইতিহাস দেখুন' : 'View Stock In / Product Addition History'}
          >
            <PackagePlus size={17} /> {language === 'bn' ? 'স্টক অ্যাড হিস্ট্রি' : 'Stock In History'}
          </button>
          <button
            className="btn-outline flex-align-gap"
            style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', fontWeight: 600 }}
            onClick={() => handleOpenDamageModal(null)}
            title={language === 'bn' ? 'ক্ষতিগ্রস্ত / নষ্ট পণ্য স্টক থেকে বাদ দিন' : 'Deduct damaged products from stock'}
          >
            <AlertTriangle size={17} /> {language === 'bn' ? 'ড্যামেজ এন্ট্রি' : 'Damage Entry'}
          </button>
          <button
            className="btn-outline flex-align-gap"
            style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff1f2', fontWeight: 600 }}
            onClick={handleOpenDamageHistory}
            title={language === 'bn' ? 'সকল ড্যামেজ পণ্যের ইতিহাস ও রিপোর্ট দেখুন' : 'View Damaged Products History'}
          >
            <History size={17} /> {language === 'bn' ? 'ড্যামেজ হিস্ট্রি' : 'Damage History'}
          </button>
          <button className="btn-primary flex-align-gap" style={{ width: 'fit-content', whiteSpace: 'nowrap' }} onClick={handleOpenAddModal}>
            <Plus size={18} /> {t(language, 'Add New Item')}
          </button>
        </div>
      </div>

      {/* Inventory Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${isAdmin ? '200px' : '230px'}, 1fr))`,
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'মোট পণ্য' : 'Total Items'}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {totalCount || (inventory || []).length}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
            <Boxes size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'মোট স্টক পরিমাণ' : 'Total Stock Qty'}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {valuation.units || totalItems}
            </div>
          </div>
        </div>

        <div
          className="card"
          onClick={() => {
            setCurrentPage(1);
            setStockStatus(prev => (prev === 'low_stock' ? 'All' : 'low_stock'));
          }}
          style={{
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: 0,
            cursor: 'pointer',
            border: stockStatus === 'low_stock' ? '2px solid #f59e0b' : undefined,
            background: stockStatus === 'low_stock' ? 'rgba(245, 158, 11, 0.1)' : undefined,
            boxShadow: stockStatus === 'low_stock' ? '0 0 12px rgba(245, 158, 11, 0.25)' : undefined,
            transition: 'all 0.2s ease',
          }}
          title={language === 'bn' ? 'ক্লিক করে শুধু স্টক এলার্ট পণ্যগুলো দেখুন' : 'Click to show only stock alert items'}
        >
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'স্টক এলার্ট' : 'Stock Alert'}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: lowStockCount > 0 ? '#d97706' : 'var(--text-main)' }}>
              {lowStockCount} {language === 'bn' ? 'টি পণ্য' : 'items'}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0, borderLeft: '4px solid #0891b2' }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(8, 145, 178, 0.12)', color: '#0891b2' }}>
            <BadgeDollarSign size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'স্টক ভ্যালু (Inventory Value)' : 'Inventory Value'}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0891b2' }}>
              ৳{(valuation.retailValue || totalValue).toLocaleString()}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0, borderLeft: '4px solid #059669' }}>
            <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(5, 150, 105, 0.12)', color: '#059669' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {language === 'bn' ? 'আসল স্টক মূল্য' : 'Original Stock Value'}
                </span>
                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(5, 150, 105, 0.15)', color: '#059669', fontWeight: 600 }}>
                  Admin
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#059669' }}>
                ৳{valuation.costValue.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category browse: top-level categories, then the sub-categories of
          the one chosen. Products under the chosen branch fill the table. */}
      <div className="category-browse">
        <div className="cb-row">
          <span className="cb-label">{language === 'bn' ? 'ক্যাটাগরি' : 'Category'}</span>
          <button
            type="button"
            className={`cb-chip ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('All'); setSelectedSubCategory(''); }}
          >
            {language === 'bn' ? 'সব' : 'All'}
          </button>
          {[...topCategories, ...looseNames].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cb-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => { setSelectedCategory(cat); setSelectedSubCategory(''); }}
            >
              {cat}
              {subCategoriesOf(cat).length > 0 && <span className="cb-count">{subCategoriesOf(cat).length}</span>}
            </button>
          ))}
        </div>

        {selectedCategory !== 'All' && subCategoriesOf(selectedCategory).length > 0 && (
          <div className="cb-row sub">
            <span className="cb-label">{language === 'bn' ? 'সাব-ক্যাটাগরি' : 'Sub-category'}</span>
            <button
              type="button"
              className={`cb-chip ${!selectedSubCategory ? 'active' : ''}`}
              onClick={() => setSelectedSubCategory('')}
            >
              {language === 'bn' ? `সব ${selectedCategory}` : `All ${selectedCategory}`}
            </button>
            {subCategoriesOf(selectedCategory).map((sub) => (
              <button
                key={sub}
                type="button"
                className={`cb-chip ${selectedSubCategory === sub ? 'active' : ''}`}
                onClick={() => setSelectedSubCategory(sub)}
              >
                {sub}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-toolbar">
          <div className="search-bar">
            <Search size={18} className="text-muted" />
            <input
              type="text"
              placeholder={language === 'bn' ? 'নাম বা বারকোড দিয়ে খুঁজুন...' : 'Search by name or barcode...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="toolbar-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Category filter lives in the browse strip below the toolbar */}
            {/* Stock Status Filter */}
            <select
              className="w-full"
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'auto', minWidth: '130px' }}
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value)}
              title={language === 'bn' ? 'স্টক ফিল্টার' : 'Filter by Stock'}
            >
              <option value="All">{language === 'bn' ? 'সব স্টক' : 'All Stock'}</option>
              <option value="in_stock">{language === 'bn' ? 'স্টকে আছে' : 'In Stock'}</option>
              <option value="low_stock">{language === 'bn' ? 'স্টক এলার্ট (Alert)' : 'Stock Alert'}</option>
              <option value="out_of_stock">{language === 'bn' ? 'স্টক শেষ (Out)' : 'Out of Stock'}</option>
            </select>

            {/* Sort / Ordering Filter */}
            <select
              className="w-full"
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'auto', minWidth: '135px' }}
              value={ordering}
              onChange={(e) => setOrdering(e.target.value)}
              title={language === 'bn' ? 'সাজান' : 'Sort Order'}
            >
              <option value="newest">{language === 'bn' ? 'সর্বশেষ যুক্ত' : 'Newest'}</option>
              <option value="oldest">{language === 'bn' ? 'পুরাতন' : 'Oldest'}</option>
              <option value="name_asc">{language === 'bn' ? 'নাম (A - Z)' : 'Name (A-Z)'}</option>
              <option value="name_desc">{language === 'bn' ? 'নাম (Z - A)' : 'Name (Z-A)'}</option>
              <option value="price_asc">{language === 'bn' ? 'মূল্য (কম থেকে বেশি)' : 'Price (Low to High)'}</option>
              <option value="price_desc">{language === 'bn' ? 'মূল্য (বেশি থেকে কম)' : 'Price (High to Low)'}</option>
              <option value="stock_asc">{language === 'bn' ? 'স্টক (কম থেকে বেশি)' : 'Stock (Low to High)'}</option>
              <option value="stock_desc">{language === 'bn' ? 'স্টক (বেশি থেকে কম)' : 'Stock (High to Low)'}</option>
            </select>

            {/* Reference drawer manages categories and units */}
            <button
              type="button"
              className="btn-outline"
              onClick={() => setShowReferenceDrawer(true)}
              title={language === 'bn' ? 'ক্যাটাগরি ও ইউনিট ম্যানেজ করুন' : 'Manage Categories & Units'}
            >
              <Settings2 size={16} />
              <span>{t(language, 'Manage')}</span>
            </button>
          </div>
        </div>

        {stockStatus === 'low_stock' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 1rem',
            margin: '0 1.25rem 1rem 1.25rem',
            borderRadius: '8px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#b45309',
            fontSize: '0.88rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <AlertTriangle size={16} />
              <span>
                {language === 'bn'
                  ? `শুধুমাত্র স্টক এলার্ট পণ্যগুলো ফিল্টার করা হয়েছে (${totalCount || paginatedProducts.length}টি)`
                  : `Showing only stock alert products (${totalCount || paginatedProducts.length} items)`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                setStockStatus('All');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#b45309',
                cursor: 'pointer',
                fontWeight: 600,
                textDecoration: 'underline',
                fontSize: '0.82rem'
              }}
            >
              {language === 'bn' ? 'ফিল্টার সরান (সব পণ্য দেখুন)' : 'Clear Filter (Show All)'}
            </button>
          </div>
        )}

        <div className="table-responsive inventory-table-loading">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '56px', textAlign: 'center' }}>{t(language, 'Image')}</th>
                <th>{t(language, 'ID/Barcode' || 'ID')}</th>
                <th>{t(language, 'Item Name')}</th>
                <th>{t(language, 'Category')}</th>
                <th>{t(language, 'Variant' || 'Variant')}</th>
                <th>{t(language, 'Unit')}</th>
                <th>{language === 'bn' ? 'স্টক ও এলার্ট' : 'Stock & Alert'}</th>
                <th>{t(language, 'Price')} (BDT)</th>
                {isAdmin && (
                  <th style={{ whiteSpace: 'nowrap', color: '#059669' }}>
                    {language === 'bn' ? 'আসল দাম (Original)' : 'Original Price'}
                  </th>
                )}
                <th>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--primary)' }}>
                    <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                      <Loader2 size={20} className="animate-spin" />
                      <span>{language === 'bn' ? 'পণ্য লোড হচ্ছে...' : 'Loading products...'}</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'এই ফিল্টারে কোনো পণ্য পাওয়া যায়নি।' : 'No products found matching the filter criteria.'}
                  </td>
                </tr>
              ) : (
                paginatedProducts.map(item => (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'center' }}>
                      {item.image ? (
                        <img
                          src={getProductImageUrl(item.image)}
                          alt={item.name}
                          className="product-table-thumb"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="product-table-thumb-placeholder">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 'bold' }}>{item.id}</span>
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      <span className="badge badge-secondary">{item.category}</span>
                    </td>
                    <td>{item.variant || '-'}</td>
                    <td>{item.unit}</td>
                    <td>
                      {(() => {
                        const alertLimit = item.min_stock !== undefined && item.min_stock !== null ? Number(item.min_stock) : 5;
                        const stockQty = Number(item.stock) || 0;
                        const isOutOfStock = stockQty <= 0;
                        const isLowStock = stockQty > 0 && stockQty <= alertLimit;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                            <span
                              className={`badge ${
                                isOutOfStock
                                  ? 'badge-danger'
                                  : isLowStock
                                  ? 'badge-warning'
                                  : 'badge-success'
                              }`}
                              style={{ fontWeight: 'bold', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                              title={language === 'bn' ? 'ক্লিক করে দ্রুত স্টক যোগ করুন (+)' : 'Click to quickly add stock (+)'}
                              onClick={() => handleOpenQuickStock(item)}
                            >
                              {isLowStock && <AlertTriangle size={12} />}
                              {stockQty}
                              <PlusCircle size={11} style={{ marginLeft: '2px', opacity: 0.8 }} />
                            </span>
                            <span style={{ fontSize: '0.72rem', color: isLowStock ? '#d97706' : 'var(--text-muted)' }}>
                              {language === 'bn' ? `এলার্ট: ≤${alertLimit}` : `Alert: ≤${alertLimit}`}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {item.mrp && Number(item.mrp) > (item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            ৳{Number(item.mrp).toLocaleString()}
                          </span>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.95rem' }}>
                            ৳{(item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)).toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 'bold' }}>
                          ৳{(item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)).toLocaleString()}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#059669' }}>
                          {Number(item.cost_price ?? item.costPrice) > 0
                            ? `৳${Number(item.cost_price ?? item.costPrice).toLocaleString()}`
                            : (language === 'bn' ? 'দেওয়া নেই' : '—')}
                        </span>
                      </td>
                    )}
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-icon text-success"
                          style={{ color: '#059669', background: '#ecfdf5' }}
                          title={language === 'bn' ? 'স্টক যোগ করুন (+)' : 'Add Stock (+)'}
                          onClick={() => handleOpenQuickStock(item)}
                        >
                          <PlusCircle size={16} />
                        </button>
                        <button
                          className="btn-icon text-danger"
                          style={{ color: '#dc2626', background: '#fef2f2' }}
                          title={language === 'bn' ? 'ড্যামেজ পণ্য বাদ দিন (-)' : 'Record Damaged Stock (-)'}
                          onClick={() => handleOpenDamageModal(item)}
                        >
                          <AlertTriangle size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          style={{ color: '#059669', background: '#ecfdf5' }}
                          title={language === 'bn' ? 'পণ্য যোগের ইতিহাস দেখুন (+)' : 'View Product Addition History (+)'}
                          onClick={() => handleOpenProductHistory(item)}
                        >
                          <PackagePlus size={15} />
                        </button>
                        <button
                          className="btn-icon text-secondary"
                          title="Print Barcode"
                          onClick={() => handlePrintBarcode(item)}
                        >
                          <Printer size={16} />
                        </button>
                        <button className="btn-icon text-primary" title="Edit" onClick={() => handleOpenEditModal(item)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(item.id)}>
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

        {/* Pagination Controls */}
        <div className="pagination-container">
          <div className="pagination-info">
            {language === 'bn' ? (
              totalCount > 0 ? (
                <>মোট <strong>{totalCount}</strong> টির মধ্যে <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, totalCount)}</strong> টি দেখানো হচ্ছে</>
              ) : 'কোনো পণ্য পাওয়া যায়নি'
            ) : (
              totalCount > 0 ? (
                <>Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> products</>
              ) : 'No products found'
            )}
          </div>

          <div className="pagination-controls">
            <label className="flex-align-gap" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>{language === 'bn' ? 'প্রতি পেজে:' : 'Per page:'}</span>
              <select
                className="pagination-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <div className="pagination-pages">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || isLoading}
                title={language === 'bn' ? 'প্রথম পেজ' : 'First Page'}
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                title={language === 'bn' ? 'আগের পেজ' : 'Previous Page'}
              >
                <ChevronLeft size={16} />
              </button>

              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={`page-${p}`}
                    type="button"
                    className={`pagination-btn ${p === currentPage ? 'active' : ''}`}
                    onClick={() => handlePageChange(p)}
                    disabled={isLoading}
                  >
                    {p}
                  </button>
                )
              ))}

              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages === 0 || isLoading}
                title={language === 'bn' ? 'পরের পেজ' : 'Next Page'}
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0 || isLoading}
                title={language === 'bn' ? 'শেষ পেজ' : 'Last Page'}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Printable Inventory List (Excel Style) */}
      {isAdmin && (
        <div style={{ display: 'none' }}>
          <div id="printable-valuation" style={{ padding: '1.25rem', background: '#fff', color: '#111827', fontSize: '12px' }}>
            <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>{shopProfile?.shop_name || 'Allahr dan gents point'}</div>
              <div style={{ color: '#4b5563', fontSize: '11px' }}>{shopProfile?.address || DEFAULT_SHOP_ADDRESS}</div>
              <div style={{ marginTop: '6px', fontWeight: 700, letterSpacing: '0.1em', fontSize: '13px' }}>INVENTORY VALUATION SUMMARY</div>
              <div style={{ fontSize: '11px', color: '#4b5563' }}>
                As on {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · Confidential — cost prices
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', margin: '10px 0 12px' }}>
              {[
                ['Products', valuationRows.length.toLocaleString()],
                ['Units in stock', valuation.units.toLocaleString()],
                ['Stock value at cost', `৳ ${valuation.costValue.toLocaleString()}`],
                ['Stock value at retail', `৳ ${valuation.retailValue.toLocaleString()}`],
                ['Potential profit', `৳ ${(valuation.retailValue - valuation.costValue).toLocaleString()}`],
              ].map(([label, value]) => (
                <div key={label} style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 8px' }}>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>{value}</div>
                </div>
              ))}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {['#', 'Code', 'Product', 'Category', 'Qty', 'Cost', 'Cost Value', 'Retail', 'Retail Value'].map((h, i) => (
                    <th key={h} style={{ border: '1px solid #d1d5db', padding: '5px 6px', textAlign: i >= 4 ? 'right' : 'left', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valuationRows.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', color: '#6b7280' }}>{i + 1}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px' }}>{r.id}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', fontWeight: 600 }}>{r.name}{r.variant ? ` — ${r.variant}` : ''}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px' }}>{r.parent_category ? `${r.parent_category} › ` : ''}{r.category}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'right' }}>{r.qty} {r.unit}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'right', color: r.cost > 0 ? '#111827' : '#b91c1c' }}>{r.cost > 0 ? r.cost.toLocaleString() : 'not set'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>{r.costValue.toLocaleString()}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'right' }}>{r.retail.toLocaleString()}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '4px 6px', textAlign: 'right' }}>{r.retailValue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f3f4f6', fontWeight: 800 }}>
                  <td colSpan={4} style={{ border: '1px solid #d1d5db', padding: '6px' }}>TOTAL</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'right' }}>{valuation.units.toLocaleString()}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '6px' }} />
                  <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'right' }}>৳ {valuation.costValue.toLocaleString()}</td>
                  <td style={{ border: '1px solid #d1d5db', padding: '6px' }} />
                  <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'right' }}>৳ {valuation.retailValue.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>

            {valuation.missingCost > 0 && (
              <div style={{ marginTop: '8px', fontSize: '10px', color: '#92400e' }}>
                Note: {valuation.missingCost} product{valuation.missingCost === 1 ? '' : 's'} in stock have no cost price set, so they count as ৳0 above and the total is understated.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', fontSize: '11px' }}>
              <div style={{ borderTop: '1px solid #111827', paddingTop: '3px', width: '160px', textAlign: 'center' }}>Prepared by</div>
              <div style={{ borderTop: '1px solid #111827', paddingTop: '3px', width: '160px', textAlign: 'center' }}>Proprietor</div>
            </div>
          </div>
        </div>
      )}

      <div id="printable-inventory-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '0.5rem', color: '#333' }}>Inventory Stock List</p>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', marginBottom: '1.5rem', color: '#666' }}>
            {selectedCategory !== 'All' ? `Category: ${selectedCategory}` : 'All Categories'}
          </p>

          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Barcode / ID</th>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Product Name</th>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Category</th>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Variant</th>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>Stock</th>
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>Unit</th>
                {isAdmin && <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', color: '#059669' }}>Original Price</th>}
                <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Price (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.length > 0 ? paginatedProducts.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.id}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.category}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{item.variant || '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center', fontWeight: 'bold' }}>{item.stock}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center' }}>{item.unit}</td>
                  {isAdmin && (
                    <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                      {Number(item.cost_price ?? item.costPrice) > 0 ? `৳${Number(item.cost_price ?? item.costPrice).toLocaleString()}` : '—'}
                    </td>
                  )}
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>
                    {item.mrp && Number(item.mrp) > (item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)) ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#888', marginRight: '6px' }}>৳{Number(item.mrp).toLocaleString()}</span>
                        <b>৳{(item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)).toLocaleString()}</b>
                      </>
                    ) : (
                      `৳${(item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price)).toLocaleString()}`
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} style={{ border: '1px solid #ccc', padding: '1rem', textAlign: 'center' }}>No items found.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="4" style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Totals:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>{totalItems}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>-</td>
                {isAdmin && (
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: '#059669' }}>৳{valuation.costValue.toLocaleString()}</td>
                )}
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>৳{totalValue.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add Product Drawer */}
      {showAddModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Add New Item')}</h2>
              <button className="drawer-close-btn" onClick={() => setShowAddModal(false)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <form id="add-product-form" onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  {/* Product Image Dropzone */}
                  <div className="product-image-upload-section">
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Image')}</label>
                    {newProductImagePreview ? (
                      <div className="product-image-preview-wrapper">
                        <img src={newProductImagePreview} alt="Preview" className="product-image-preview-img" />
                        <button
                          type="button"
                          className="remove-preview-btn"
                          onClick={() => { setNewProductImage(null); setNewProductImagePreview(null); }}
                          title="Remove image"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <label className="product-image-dropzone">
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={e => handleImageSelect(e.target.files?.[0], false)}
                          style={{ display: 'none' }}
                        />
                        <div className="dropzone-content">
                          <Upload size={22} className="text-muted" />
                          <div className="dropzone-text">
                            <span className="font-semibold text-primary">{language === 'bn' ? 'ছবি আপলোড করুন' : 'Click to upload image'}</span>
                            <span className="text-xs text-muted block mt-0.5">PNG, JPG, WEBP (Max 5MB)</span>
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label className="text-muted text-sm">{t(language, 'ID/Barcode' || 'Product ID / Barcode')} *</label>
                      <button
                        type="button"
                        className="text-xs text-info"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        onClick={() => setNewProduct({ ...newProduct, id: getNextProductId() })}
                      >
                        {language === 'bn' ? 'আইডি অটো-জেনারেট করুন' : 'Auto Generate ID'}
                      </button>
                    </div>
                    <input
                      type="text"
                      className="w-full"
                      required
                      placeholder="e.g. 8941170000013"
                      value={newProduct.id}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = (inventory || []).find(
                          (p) => val.trim() && (
                            String(p.id).trim().toLowerCase() === val.trim().toLowerCase() ||
                            String(p.product_code).trim().toLowerCase() === val.trim().toLowerCase()
                          )
                        );
                        if (match) {
                          setNewProduct((prev) => ({
                            ...prev,
                            id: val,
                            name: match.name || prev.name,
                            category: match.category || prev.category,
                            unit: match.unit || prev.unit,
                            variant: match.variant || prev.variant,
                            mrp: match.mrp || prev.mrp,
                            discount_price: match.discount_price || prev.discount_price,
                            price: match.price || prev.price,
                            cost_price: match.cost_price ?? prev.cost_price,
                            min_stock: match.min_stock ?? prev.min_stock,
                          }));
                        } else {
                          setNewProduct((prev) => ({ ...prev, id: val }));
                        }
                      }}
                    />
                    {(() => {
                      const match = (inventory || []).find(
                        (p) => newProduct.id && (
                          String(p.id).trim().toLowerCase() === String(newProduct.id).trim().toLowerCase() ||
                          String(p.product_code).trim().toLowerCase() === String(newProduct.id).trim().toLowerCase()
                        )
                      );
                      if (!match) return null;
                      const addedNum = parseInt(newProduct.stock, 10) || 0;
                      const curNum = Number(match.stock) || 0;
                      return (
                        <div style={{
                          background: '#eff6ff',
                          border: '1px solid #93c5fd',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          marginTop: '6px',
                          fontSize: '0.84rem',
                          color: '#1e40af',
                        }}>
                          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>📦</span>
                            <span>{language === 'bn' ? 'বিদ্যমান পণ্য পাওয়া গেছে!' : 'Existing Product Found!'}</span>
                          </div>
                          <div style={{ marginTop: '3px' }}>
                            <strong>{match.name}</strong> · {language === 'bn' ? 'বর্তমান স্টক:' : 'Current Stock:'}{' '}
                            <span style={{ color: '#059669', fontWeight: 800, fontSize: '0.95rem' }}>
                              {curNum} {match.unit || 'Pcs'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#2563eb', marginTop: '2px' }}>
                            {language === 'bn'
                              ? `নিচে স্টক দিলে তা আগের ${curNum} টির সাথে প্লাস হয়ে মোট হবে: ${curNum + addedNum} টি`
                              : `New stock will be added to ${curNum}. Total: ${curNum + addedNum}`}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Name')} *</label>
                    <input
                      type="text"
                      className="w-full"
                      required
                      placeholder="e.g. Silk Punjabi"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Category')} *</label>
                    <select
                      className="w-full"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    >
                      {renderCategoryOptions()}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant / Size / Color')}</label>
                    <input
                      type="text"
                      className="w-full"
                      placeholder="e.g. XL, Red, 42"
                      value={newProduct.variant}
                      onChange={(e) => setNewProduct({ ...newProduct, variant: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Unit')} *</label>
                    <select
                      className="w-full"
                      value={newProduct.unit}
                      onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                    >
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {(() => {
                      const match = (inventory || []).find(
                        (p) => newProduct.id && (
                          String(p.id).trim().toLowerCase() === String(newProduct.id).trim().toLowerCase() ||
                          String(p.product_code).trim().toLowerCase() === String(newProduct.id).trim().toLowerCase()
                        )
                      );
                      const addedNum = parseInt(newProduct.stock, 10) || 0;
                      const curNum = match ? (Number(match.stock) || 0) : 0;
                      return (
                        <>
                          <label className="text-muted text-sm block mb-1">
                            {match
                              ? (language === 'bn' ? 'নতুন যোগ করার স্টক (+)' : 'Quantity to Add (+)')
                              : t(language, 'Stock Quantity')} *
                          </label>
                          <input
                            type="number"
                            className="w-full"
                            required
                            min="0"
                            placeholder={match ? (language === 'bn' ? 'যেমন: ২০' : 'e.g. 20') : '0'}
                            value={newProduct.stock}
                            onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                          />
                          {match && (
                            <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                              {language === 'bn'
                                ? `➔ মোট স্টক হবে: ${curNum} + ${addedNum} = ${curNum + addedNum} টি`
                                : `➔ New Total: ${curNum} + ${addedNum} = ${curNum + addedNum}`}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'স্টক এলার্ট লিমিট (Alert Minimum)' : 'Stock Alert Limit (Min)'} *
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      required
                      min="0"
                      placeholder="e.g. 5"
                      value={newProduct.min_stock ?? 5}
                      onChange={(e) => setNewProduct({ ...newProduct, min_stock: e.target.value })}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {language === 'bn' ? 'স্টক এই পরিমাণের সমান বা নিচে নামলে এলার্ট দেখাবে।' : 'Alerts when stock is at or below this quantity.'}
                    </span>
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="text-muted text-sm block mb-1">
                        {language === 'bn' ? 'ক্রয় মূল্য (শুধু এডমিন)' : 'Original / Cost Price (admin only)'} (BDT)
                      </label>
                      <input
                        type="number"
                        className="w-full"
                        min="0"
                        step="any"
                        placeholder="e.g. 900"
                        value={newProduct.cost_price ?? ''}
                        onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'MRP মূল্য (কাটা দেখাবে)' : 'MRP Price (Cut/Strikethrough)'} (BDT)
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      min="0"
                      step="any"
                      placeholder="e.g. 1500"
                      value={newProduct.mrp}
                      onChange={(e) => setNewProduct({ ...newProduct, mrp: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'বিক্রয় মূল্য (Discount/Sale Price)' : 'Discount/Sale Price'} (BDT) *
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      required
                      min="0"
                      step="any"
                      placeholder="e.g. 1400"
                      value={newProduct.discount_price}
                      onChange={(e) => setNewProduct({ ...newProduct, discount_price: e.target.value, price: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline flex-1" onClick={() => setShowAddModal(false)}>
                  {t(language, 'Cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {t(language, 'Save Item')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Product Drawer */}
      {editingItem && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Edit Item')}</h2>
              <button className="drawer-close-btn" onClick={() => setEditingItem(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <form id="edit-product-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  {/* Product Image Dropzone */}
                  <div className="product-image-upload-section">
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Image')}</label>
                    {editProductImagePreview ? (
                      <div className="product-image-preview-wrapper">
                        <img src={editProductImagePreview} alt="Preview" className="product-image-preview-img" />
                        <button
                          type="button"
                          className="remove-preview-btn"
                          onClick={() => { setEditProductImage(null); setEditProductImagePreview(null); }}
                          title="Remove image"
                        >
                          <X size={15} />
                        </button>
                        <div className="preview-action-row">
                          <label className="change-preview-label">
                            <Upload size={13} />
                            <span>{language === 'bn' ? 'ছবি পরিবর্তন' : 'Change'}</span>
                            <input
                              type="file"
                              accept="image/png, image/jpeg, image/webp"
                              onChange={e => handleImageSelect(e.target.files?.[0], true)}
                              style={{ display: 'none' }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="product-image-dropzone">
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={e => handleImageSelect(e.target.files?.[0], true)}
                          style={{ display: 'none' }}
                        />
                        <div className="dropzone-content">
                          <Upload size={22} className="text-muted" />
                          <div className="dropzone-text">
                            <span className="font-semibold text-primary">{language === 'bn' ? 'ছবি আপলোড করুন' : 'Click to upload image'}</span>
                            <span className="text-xs text-muted block mt-0.5">PNG, JPG, WEBP (Max 5MB)</span>
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'ID/Barcode' || 'Product ID / Barcode')}</label>
                    <input type="text" className="w-full" disabled value={editingItem.id} />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Name')} *</label>
                    <input
                      type="text"
                      className="w-full"
                      required
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Category')} *</label>
                    <select
                      className="w-full"
                      value={editingItem.category}
                      onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    >
                      {renderCategoryOptions()}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant / Size / Color')}</label>
                    <input
                      type="text"
                      className="w-full"
                      value={editingItem.variant || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, variant: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Unit')} *</label>
                    <select
                      className="w-full"
                      value={editingItem.unit}
                      onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    >
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="text-sm text-muted font-medium">{language === 'bn' ? 'বর্তমান স্টক:' : 'Current Stock:'}</span>
                      <span className="badge badge-primary" style={{ fontWeight: 800, fontSize: '0.95rem', padding: '4px 10px' }}>
                        {editingItem.initialStock ?? editingItem.stock} {editingItem.unit || 'Pcs'}
                      </span>
                    </div>

                    <label className="text-muted text-sm block mb-1 font-semibold" style={{ color: '#0f172a' }}>
                      {language === 'bn' ? '➕ নতুন স্টক যোগ করুন (Add Quantity +):' : '➕ Add More Stock (+):'}
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      min="0"
                      placeholder={language === 'bn' ? 'যেমন: ২০' : 'e.g. 20'}
                      value={editingItem.stockToAdd ?? ''}
                      onChange={(e) => {
                        const addVal = e.target.value;
                        const addNum = parseInt(addVal, 10) || 0;
                        const base = Number(editingItem.initialStock ?? 0);
                        setEditingItem({
                          ...editingItem,
                          stockToAdd: addVal,
                          stock: base + addNum,
                        });
                      }}
                      style={{ marginBottom: '6px' }}
                    />

                    {/* Quick Preset Buttons */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {[5, 10, 20, 50, 100].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className="btn-outline"
                          style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', fontWeight: 600 }}
                          onClick={() => {
                            const curAdd = parseInt(editingItem.stockToAdd, 10) || 0;
                            const newAdd = curAdd + num;
                            const base = Number(editingItem.initialStock ?? 0);
                            setEditingItem({
                              ...editingItem,
                              stockToAdd: String(newAdd),
                              stock: base + newAdd,
                            });
                          }}
                        >
                          +{num}
                        </button>
                      ))}
                      {editingItem.stockToAdd && (
                        <button
                          type="button"
                          className="btn-outline text-muted"
                          style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px' }}
                          onClick={() => {
                            const base = Number(editingItem.initialStock ?? 0);
                            setEditingItem({
                              ...editingItem,
                              stockToAdd: '',
                              stock: base,
                            });
                          }}
                        >
                          {language === 'bn' ? 'রিসেট' : 'Reset'}
                        </button>
                      )}
                    </div>

                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="text-sm font-semibold" style={{ color: '#0f172a' }}>
                          {language === 'bn' ? 'মোট চূড়ান্ত স্টক:' : 'Total Final Stock:'} *
                        </label>
                        {editingItem.stockToAdd && parseInt(editingItem.stockToAdd, 10) > 0 && (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
                            {editingItem.initialStock} + {editingItem.stockToAdd} = {editingItem.stock}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        className="w-full"
                        required
                        min="0"
                        style={{ fontWeight: 'bold' }}
                        value={editingItem.stock}
                        onChange={(e) => setEditingItem({ ...editingItem, stock: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'স্টক এলার্ট লিমিট (Alert Minimum)' : 'Stock Alert Limit (Min)'} *
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      required
                      min="0"
                      placeholder="e.g. 5"
                      value={editingItem.min_stock ?? 5}
                      onChange={(e) => setEditingItem({ ...editingItem, min_stock: e.target.value })}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {language === 'bn' ? 'স্টক এই পরিমাণের সমান বা নিচে নামলে এলার্ট দেখাবে।' : 'Alerts when stock is at or below this quantity.'}
                    </span>
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="text-muted text-sm block mb-1">
                        {language === 'bn' ? 'ক্রয় মূল্য (শুধু এডমিন)' : 'Original / Cost Price (admin only)'} (BDT)
                      </label>
                      <input
                        type="number"
                        className="w-full"
                        min="0"
                        step="any"
                        placeholder="e.g. 900"
                        value={editingItem.cost_price ?? ''}
                        onChange={(e) => setEditingItem({ ...editingItem, cost_price: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'MRP মূল্য (কাটা দেখাবে)' : 'MRP Price (Cut/Strikethrough)'} (BDT)
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      min="0"
                      step="any"
                      placeholder="e.g. 1500"
                      value={editingItem.mrp || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, mrp: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">
                      {language === 'bn' ? 'বিক্রয় মূল্য (Discount/Sale Price)' : 'Discount/Sale Price'} (BDT) *
                    </label>
                    <input
                      type="number"
                      className="w-full"
                      required
                      min="0"
                      step="any"
                      placeholder="e.g. 1400"
                      value={editingItem.discount_price || editingItem.price || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, discount_price: e.target.value, price: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline flex-1" onClick={() => setEditingItem(null)}>
                  {t(language, 'Cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {t(language, 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Add Stock Modal */}
      {quickStockItem && createPortal(
        <div className="drawer-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="drawer-container" style={{ width: '100%', maxWidth: '440px', height: 'auto', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="drawer-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#059669', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>{language === 'bn' ? 'স্টক যোগ করুন' : 'Add Stock'}</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {quickStockItem.id}</span>
                </div>
              </div>
              <button className="drawer-close-btn" onClick={() => setQuickStockItem(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleQuickStockSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drawer-body" style={{ padding: '16px 20px', maxHeight: 'calc(90vh - 140px)', overflowY: 'auto' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{quickStockItem.name}</div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                    {quickStockItem.category} {quickStockItem.variant ? `· ${quickStockItem.variant}` : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                    <span style={{ fontSize: '0.88rem', color: '#475563', fontWeight: 500 }}>{language === 'bn' ? 'বর্তমান স্টক:' : 'Current Stock:'}</span>
                    <span className="badge badge-primary" style={{ fontSize: '1rem', fontWeight: 800, padding: '4px 12px' }}>
                      {Number(quickStockItem.stock) || 0} {quickStockItem.unit || 'Pcs'}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="text-sm font-semibold block mb-1.5" style={{ color: '#0f172a' }}>
                    {language === 'bn' ? 'নতুন কতটি স্টক যোগ করতে চান? (+)' : 'Quantity to Add (+)'} *
                  </label>
                  <input
                    type="number"
                    className="w-full"
                    autoFocus
                    required
                    min="1"
                    placeholder={language === 'bn' ? 'যেমন: ২০' : 'e.g. 20'}
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    style={{ fontSize: '1.2rem', padding: '10px 14px', fontWeight: 700, borderRadius: '8px' }}
                  />

                  {/* Quick Preset Buttons */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {[5, 10, 20, 50, 100].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', fontWeight: 600 }}
                        onClick={() => {
                          const current = parseInt(quickAddQty, 10) || 0;
                          setQuickAddQty(String(current + qty));
                        }}
                      >
                        +{qty}
                      </button>
                    ))}
                    {quickAddQty && (
                      <button
                        type="button"
                        className="btn-outline text-muted"
                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => setQuickAddQty('')}
                      >
                        {language === 'bn' ? 'রিসেট' : 'Reset'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Calculation preview */}
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>
                      {language === 'bn' ? 'হিসাব (যোগফল):' : 'Calculation:'}
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#15803d', fontWeight: 500, marginTop: '2px' }}>
                      {Number(quickStockItem.stock) || 0} + {parseInt(quickAddQty, 10) || 0}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 500 }}>
                      {language === 'bn' ? 'মোট নতুন স্টক হবে' : 'New Total Stock'}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#15803d' }}>
                      {(Number(quickStockItem.stock) || 0) + (parseInt(quickAddQty, 10) || 0)} {quickStockItem.unit || 'Pcs'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="drawer-footer" style={{ padding: '12px 20px', gap: '10px', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" className="btn-outline flex-1" onClick={() => setQuickStockItem(null)}>
                  {t(language, 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={isSavingQuickStock || !quickAddQty || parseInt(quickAddQty, 10) <= 0}
                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 700 }}
                >
                  {isSavingQuickStock
                    ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...')
                    : (language === 'bn' ? '💾 স্টক যোগ করুন' : '💾 Add Stock')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Damage Product Modal */}
      {showDamageModal && createPortal(
        <div className="drawer-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="drawer-container" style={{ width: '100%', maxWidth: '460px', height: 'auto', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)' }}>
            <div className="drawer-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 18px', background: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, color: '#991b1b' }}>
                    {language === 'bn' ? 'ক্ষতিগ্রস্ত / ড্যামেজ পণ্য বাদ দিন' : 'Record Damaged Stock'}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                    {language === 'bn' ? 'ইনভেন্টরি স্টক থেকে বাদ যাবে (-)' : 'Will deduct from available inventory'}
                  </span>
                </div>
              </div>
              <button className="drawer-close-btn" onClick={() => { setShowDamageModal(false); setSelectedDamageProduct(null); }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDamageSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drawer-body" style={{ padding: '16px 20px', maxHeight: 'calc(90vh - 140px)', overflowY: 'auto' }}>
                {/* Product selector if not already selected */}
                {!selectedDamageProduct ? (
                  <div style={{ marginBottom: '16px' }}>
                    <label className="text-sm font-semibold block mb-1.5" style={{ color: '#0f172a' }}>
                      {language === 'bn' ? 'কোন পণ্যটি ড্যামেজ হয়েছে? (পণ্য নির্বাচন করুন)' : 'Select Damaged Product'} *
                    </label>
                    <input
                      type="text"
                      className="w-full mb-2"
                      placeholder={language === 'bn' ? 'নাম বা বারকোড দিয়ে খুঁজুন...' : 'Search by name or barcode...'}
                      value={damageSearchTerm}
                      onChange={(e) => setDamageSearchTerm(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '0.9rem', borderRadius: '6px' }}
                    />
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      {(inventory || [])
                        .filter((p) => {
                          if (!damageSearchTerm.trim()) return true;
                          const term = damageSearchTerm.toLowerCase();
                          return (p.name || '').toLowerCase().includes(term) ||
                                 String(p.id || '').toLowerCase().includes(term) ||
                                 String(p.product_code || '').toLowerCase().includes(term);
                        })
                        .slice(0, 30)
                        .map((p) => (
                          <div
                            key={p.id}
                            onClick={() => setSelectedDamageProduct(p)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f1f5f9',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {p.product_code || p.id} {p.category ? `· ${p.category}` : ''}
                              </div>
                            </div>
                            <span className="badge" style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1d4ed8' }}>
                              স্টক: {p.stock} {p.unit || 'Pcs'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{selectedDamageProduct.name}</div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                          ID/কোড: {selectedDamageProduct.product_code || selectedDamageProduct.id} {selectedDamageProduct.variant ? `· ${selectedDamageProduct.variant}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedDamageProduct(null)}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {language === 'bn' ? 'বদলান' : 'Change'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                      <span style={{ fontSize: '0.88rem', color: '#475563', fontWeight: 500 }}>{language === 'bn' ? 'বর্তমান স্টক:' : 'Current Stock:'}</span>
                      <span className="badge badge-primary" style={{ fontSize: '1rem', fontWeight: 800, padding: '4px 12px' }}>
                        {Number(selectedDamageProduct.stock) || 0} {selectedDamageProduct.unit || 'Pcs'}
                      </span>
                    </div>
                  </div>
                )}

                {selectedDamageProduct && (
                  <>
                    {/* Quantity input */}
                    <div style={{ marginBottom: '16px' }}>
                      <label className="text-sm font-semibold block mb-1.5" style={{ color: '#0f172a' }}>
                        {language === 'bn' ? 'কত পিস ড্যামেজ হয়েছে? (-)' : 'Damage Quantity (-)'} *
                      </label>
                      <input
                        type="number"
                        className="w-full"
                        autoFocus
                        required
                        min="1"
                        max={Number(selectedDamageProduct.stock) || 0}
                        placeholder={language === 'bn' ? 'যেমন: ২' : 'e.g. 2'}
                        value={damageQty}
                        onChange={(e) => setDamageQty(e.target.value)}
                        style={{ fontSize: '1.2rem', padding: '10px 14px', fontWeight: 700, borderRadius: '8px', borderColor: '#fca5a5' }}
                      />

                      {/* Quick Preset Buttons */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {[1, 2, 5, 10].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            className="btn-outline"
                            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', fontWeight: 600, color: '#dc2626', borderColor: '#fecaca' }}
                            onClick={() => {
                              const current = parseInt(damageQty, 10) || 0;
                              const nextVal = Math.min(current + qty, Number(selectedDamageProduct.stock) || 0);
                              setDamageQty(String(nextVal));
                            }}
                          >
                            +{qty}
                          </button>
                        ))}
                        {damageQty && (
                          <button
                            type="button"
                            className="btn-outline text-muted"
                            style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}
                            onClick={() => setDamageQty('')}
                          >
                            {language === 'bn' ? 'রিসেট' : 'Reset'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reason Selector */}
                    <div style={{ marginBottom: '16px' }}>
                      <label className="text-sm font-semibold block mb-1.5" style={{ color: '#0f172a' }}>
                        {language === 'bn' ? 'ড্যামেজের কারণ' : 'Reason for Damage'}
                      </label>
                      <select
                        className="w-full"
                        value={damageReason}
                        onChange={(e) => setDamageReason(e.target.value)}
                        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                      >
                        <option value="নষ্ট / ক্ষতিগ্রস্ত পণ্য">নষ্ট / ক্ষতিগ্রস্ত পণ্য (Damaged)</option>
                        <option value="ভাঙা / ফেটে গেছে">ভাঙা / ফেটে গেছে (Broken / Cracked)</option>
                        <option value="মেয়াদোত্তীর্ণ">মেয়াদোত্তীর্ণ (Expired)</option>
                        <option value="দাগ বা ফেব্রিক ত্রুটি">দাগ বা ফেব্রিক ত্রুটি (Fabric Defect / Stain)</option>
                        <option value="প্যাকিং নষ্ট / ডিসপ্লে ড্যামেজ">প্যাকিং নষ্ট / ডিসপ্লে ড্যামেজ (Packaging / Display Damaged)</option>
                        <option value="হারিয়ে গেছে / ঘাটতি">হারিয়ে গেছে / ঘাটতি (Lost / Missing)</option>
                        <option value="অন্যান্য">অন্যান্য কারণ (Other Reason)</option>
                      </select>

                      {damageReason === 'অন্যান্য' && (
                        <input
                          type="text"
                          className="w-full mt-2"
                          placeholder={language === 'bn' ? 'কারণ বিস্তারিত লিখুন...' : 'Specify the reason...'}
                          value={damageCustomReason}
                          onChange={(e) => setDamageCustomReason(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '0.88rem' }}
                        />
                      )}
                    </div>

                    {/* Calculation preview */}
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>
                          {language === 'bn' ? 'হিসাব (বিয়োগফল):' : 'Calculation:'}
                        </div>
                        <div style={{ fontSize: '0.88rem', color: '#b91c1c', fontWeight: 500, marginTop: '2px' }}>
                          {Number(selectedDamageProduct.stock) || 0} - {parseInt(damageQty, 10) || 0}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 500 }}>
                          {language === 'bn' ? 'বাদ দেওয়ার পর নতুন স্টক' : 'Balance After Damage'}
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#dc2626' }}>
                          {Math.max(0, (Number(selectedDamageProduct.stock) || 0) - (parseInt(damageQty, 10) || 0))} {selectedDamageProduct.unit || 'Pcs'}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="drawer-footer" style={{ padding: '12px 20px', gap: '10px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="btn-outline flex-1"
                  onClick={() => { setShowDamageModal(false); setSelectedDamageProduct(null); }}
                >
                  {t(language, 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={isSavingDamage || !selectedDamageProduct || !damageQty || parseInt(damageQty, 10) <= 0 || parseInt(damageQty, 10) > (Number(selectedDamageProduct?.stock) || 0)}
                  style={{ background: '#dc2626', borderColor: '#dc2626', fontWeight: 700 }}
                >
                  {isSavingDamage
                    ? (language === 'bn' ? 'প্রসেসিং হচ্ছে...' : 'Processing...')
                    : (language === 'bn' ? '⚠️ ড্যামেজ হিসেবে বাদ দিন' : '⚠️ Deduct Damaged Stock')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 1. Damage History Modal */}
      {showDamageHistoryModal && createPortal(
        <div className="drawer-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="drawer-container" style={{ width: '100%', maxWidth: '940px', height: 'auto', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, color: '#991b1b' }}>
                    {language === 'bn' ? 'ক্ষতিগ্রস্ত / ড্যামেজ পণ্যের ইতিহাস' : 'Damaged Products History'}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'কবে কোন পণ্য কত পিস নষ্ট বা ড্যামেজ হিসেবে বাদ দেওয়া হয়েছে' : 'Audit of all damaged and wasted stock deductions'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  onClick={() => printElement('printable-damage-history', 'DamageHistory')}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                >
                  <Printer size={15} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                </button>
                <button className="drawer-close-btn" onClick={() => setShowDamageHistoryModal(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px' }}>
                <div className="search-bar" style={{ margin: 0, width: '100%' }}>
                  <Search size={16} className="text-muted" />
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'পণ্য বা বারকোড দিয়ে খুঁজুন...' : 'Search by product or barcode...'}
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      loadDamageHistory(historyDateFilter, e.target.value);
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {[
                  { id: 'all', bn: 'সব সময়', en: 'All Time' },
                  { id: 'today', bn: 'আজকে', en: 'Today' },
                  { id: '7days', bn: 'বিগত ৭ দিন', en: 'Last 7 Days' },
                  { id: '30days', bn: 'বিগত ৩০ দিন', en: 'Last 30 Days' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    style={{
                      padding: '5px 11px',
                      borderRadius: '20px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: historyDateFilter === f.id ? '#dc2626' : '#cbd5e1',
                      background: historyDateFilter === f.id ? '#fef2f2' : '#ffffff',
                      color: historyDateFilter === f.id ? '#dc2626' : '#475563',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setHistoryDateFilter(f.id);
                      loadDamageHistory(f.id, historySearch);
                    }}
                  >
                    {language === 'bn' ? f.bn : f.en}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px 18px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {language === 'bn' ? 'মোট ড্যামেজ এন্ট্রি' : 'Damage Incidents'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {historyLogs.length}
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {language === 'bn' ? 'মোট ক্ষতি / নষ্ট পিস' : 'Total Units Lost'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>
                  -{historyLogs.reduce((sum, r) => sum + Math.abs(r.quantity_changed || 0), 0)} Pcs
                </div>
              </div>
            </div>

            <div className="drawer-body" style={{ padding: '14px 18px', maxHeight: 'calc(90vh - 230px)', overflowY: 'auto' }}>
              {isHistoryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>{language === 'bn' ? 'ড্যামেজ হিস্ট্রি লোড হচ্ছে...' : 'Loading damage history...'}</div>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                  <AlertTriangle size={36} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                    {language === 'bn' ? 'কোনো ড্যামেজ রেকর্ড পাওয়া যায়নি' : 'No damage records found'}
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                    {language === 'bn' ? 'পণ্য ড্যামেজ এন্ট্রি করলে তার সকল ইতিহাস এখানে সংরক্ষিত থাকবে।' : 'Recorded damage entries will appear here.'}
                  </div>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                    <thead>
                      <tr>
                        <th>{language === 'bn' ? 'তারিখ ও সময়' : 'Date & Time'}</th>
                        <th>{language === 'bn' ? 'পণ্যের নাম ও কোড' : 'Product'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'ড্যামেজ পরিমাণ' : 'Damaged Qty'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'অবশিষ্ট স্টক' : 'Balance After'}</th>
                        <th>{language === 'bn' ? 'কারণ' : 'Reason'}</th>
                        <th>{language === 'bn' ? 'রেফারেন্স আইডি' : 'Ref Code'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map(r => {
                        const when = new Date(r.created_at);
                        const unit = r.unit || 'pcs';
                        return (
                          <tr key={r.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600 }}>{when.toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatTimeAgo(r.created_at)}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.product_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.product_code}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '12px', background: '#fee2e2', color: '#dc2626', fontWeight: 800, fontSize: '0.86rem' }}>
                                -{Math.abs(r.quantity_changed)} {unit}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                              {r.balance_after} {unit}
                            </td>
                            <td>
                              <span style={{ color: '#475563', fontSize: '0.85rem' }}>{r.reason || '—'}</span>
                            </td>
                            <td>
                              <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                {r.reference_id || '—'}
                              </code>
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
        </div>,
        document.body
      )}

      {/* 2. Stock In / Product Add History Modal */}
      {showStockInHistoryModal && createPortal(
        <div className="drawer-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="drawer-container" style={{ width: '100%', maxWidth: '960px', height: 'auto', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#059669', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, color: '#065f46' }}>
                    {language === 'bn' ? 'পণ্য যোগের ইতিহাস (Stock In History)' : 'Product Addition History'}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'কবে কোন পণ্য কত পিস যোগ করেছেন তার বিস্তারিত হিসাব' : 'Track when and how many units of each product were added into stock'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  onClick={() => printElement('printable-stockin-history', 'StockInHistory')}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                >
                  <Printer size={15} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                </button>
                <button className="drawer-close-btn" onClick={() => setShowStockInHistoryModal(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px' }}>
                <div className="search-bar" style={{ margin: 0, width: '100%' }}>
                  <Search size={16} className="text-muted" />
                  <input
                    type="text"
                    placeholder={language === 'bn' ? 'পণ্য বা বারকোড দিয়ে খুঁজুন...' : 'Search by product or barcode...'}
                    value={historySearch}
                    onChange={(e) => {
                      setHistorySearch(e.target.value);
                      loadStockInHistory(historyDateFilter, e.target.value, historySubFilter);
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={historySubFilter}
                  onChange={(e) => {
                    setHistorySubFilter(e.target.value);
                    loadStockInHistory(historyDateFilter, historySearch, e.target.value);
                  }}
                  style={{ fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px' }}
                >
                  <option value="ALL">{language === 'bn' ? 'সব ধরণের যোগ (All In)' : 'All Additions'}</option>
                  <option value="PURCHASE">{language === 'bn' ? 'ক্রয় / প্রারম্ভিক স্টক (Purchases)' : 'Purchases'}</option>
                  <option value="ADJUSTMENT">{language === 'bn' ? 'ম্যানুয়াল / কুইক যোগ (Adjustments)' : 'Adjustments'}</option>
                  <option value="CUSTOMER_RETURN">{language === 'bn' ? 'কাস্টমার ফেরত (Returns)' : 'Customer Returns'}</option>
                </select>
                {[
                  { id: 'all', bn: 'সব সময়', en: 'All Time' },
                  { id: 'today', bn: 'আজকে', en: 'Today' },
                  { id: '7days', bn: '৭ দিন', en: '7 Days' },
                  { id: '30days', bn: '৩০ দিন', en: '30 Days' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    style={{
                      padding: '5px 11px',
                      borderRadius: '20px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: historyDateFilter === f.id ? '#059669' : '#cbd5e1',
                      background: historyDateFilter === f.id ? '#ecfdf5' : '#ffffff',
                      color: historyDateFilter === f.id ? '#059669' : '#475563',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setHistoryDateFilter(f.id);
                      loadStockInHistory(f.id, historySearch, historySubFilter);
                    }}
                  >
                    {language === 'bn' ? f.bn : f.en}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px 18px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  {language === 'bn' ? 'মোট যোগ এন্ট্রি' : 'Total Add Entries'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {historyLogs.length}
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>
                  {language === 'bn' ? 'মোট যোগকৃত পিস (Total Pieces Added)' : 'Total Pieces Added'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                  +{historyLogs.reduce((sum, r) => sum + (r.quantity_changed > 0 ? r.quantity_changed : 0), 0)} Pcs
                </div>
              </div>
            </div>

            <div className="drawer-body" style={{ padding: '14px 18px', maxHeight: 'calc(90vh - 230px)', overflowY: 'auto' }}>
              {isHistoryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>{language === 'bn' ? 'পণ্য যোগের ইতিহাস লোড হচ্ছে...' : 'Loading addition history...'}</div>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                  <PackagePlus size={36} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                    {language === 'bn' ? 'কোনো পণ্য যোগের রেকর্ড পাওয়া যায়নি' : 'No addition records found'}
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                    {language === 'bn' ? 'নতুন পণ্য এন্ট্রি বা স্টক যোগ করলে তার সকল হিসাব এখানে থাকবে।' : 'Purchases and stock adjustments will appear here.'}
                  </div>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                    <thead>
                      <tr>
                        <th>{language === 'bn' ? 'তারিখ ও সময়' : 'Date & Time'}</th>
                        <th>{language === 'bn' ? 'পণ্যের নাম ও কোড' : 'Product'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'যোগকৃত পরিমাণ' : 'Added Qty'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'যোগের পর স্টক' : 'Balance After'}</th>
                        <th>{language === 'bn' ? 'যোগের ধরন' : 'Source / Type'}</th>
                        <th>{language === 'bn' ? 'চালান / রেফারেন্স' : 'Ref Code'}</th>
                        <th>{language === 'bn' ? 'বিবরণ / নোট' : 'Note'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map(r => {
                        const when = new Date(r.created_at);
                        const unit = r.unit || 'pcs';
                        let typeLabel = r.movement_type;
                        if (r.movement_type === 'PURCHASE') {
                          typeLabel = r.reference_id?.startsWith('INIT')
                            ? (language === 'bn' ? 'নতুন পণ্য অন্তর্ভুক্তি' : 'Initial Stock')
                            : (language === 'bn' ? 'ক্রয় চালান' : 'Purchase');
                        } else if (r.movement_type === 'ADJUSTMENT') {
                          typeLabel = language === 'bn' ? 'ম্যানুয়াল / কুইক যোগ' : 'Quick Add';
                        } else if (r.movement_type === 'CUSTOMER_RETURN') {
                          typeLabel = language === 'bn' ? 'কাস্টমার ফেরত' : 'Customer Return';
                        } else if (r.movement_type === 'SR_RETURN') {
                          typeLabel = language === 'bn' ? 'এসআর ফেরত' : 'SR Return';
                        }

                        return (
                          <tr key={r.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600 }}>{when.toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatTimeAgo(r.created_at)}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.product_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.product_code}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '12px', background: '#d1fae5', color: '#047857', fontWeight: 800, fontSize: '0.86rem' }}>
                                +{r.quantity_changed} {unit}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                              {r.balance_after} {unit}
                            </td>
                            <td>
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontSize: '0.78rem', fontWeight: 600 }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td>
                              <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                {r.reference_id || '—'}
                              </code>
                            </td>
                            <td>
                              <span style={{ color: '#475563', fontSize: '0.82rem' }}>{r.reason || '—'}</span>
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
        </div>,
        document.body
      )}

      {/* 3. Single Product Add History Modal */}
      {showProductHistoryModal && historyProduct && createPortal(
        <div className="drawer-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="drawer-container" style={{ width: '100%', maxWidth: '900px', height: 'auto', maxHeight: '90vh', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-header" style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#059669', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, color: '#065f46' }}>
                    {historyProduct.name} - {language === 'bn' ? 'পণ্য যোগের ইতিহাস' : 'Product Addition History'}
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {language === 'bn'
                      ? `কোড: ${historyProduct.product_code || historyProduct.id} · ${historyProduct.category || ''} · কবে কত পিস পণ্য যোগ হয়েছে তার হিসাব`
                      : `Code: ${historyProduct.product_code || historyProduct.id} · ${historyProduct.category || ''} · All addition and stock in history`}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  onClick={() => printElement('printable-product-history', 'ProductAddHistory')}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                >
                  <Printer size={15} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                </button>
                <button className="drawer-close-btn" onClick={() => { setShowProductHistoryModal(false); setHistoryProduct(null); }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Product Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{language === 'bn' ? 'বর্তমান স্টক' : 'Current Stock'}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {Number(historyProduct.stock) || 0} {historyProduct.unit || 'Pcs'}
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600 }}>{language === 'bn' ? 'মোট যোগকৃত মাল (+)' : 'Total Pieces Added (+)'}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                  +{historyLogs.filter(r => r.quantity_changed > 0).reduce((sum, r) => sum + r.quantity_changed, 0)} {historyProduct.unit || 'Pcs'}
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{language === 'bn' ? 'মোট যোগ এন্ট্রি' : 'Total Add Entries'}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155' }}>
                  {historyLogs.length}
                </div>
              </div>
            </div>

            {/* Filter Pills */}
            <div style={{ padding: '10px 18px', background: '#ffffff', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'IN', labelBn: '📦 সকল পণ্য যোগ (+)', labelEn: 'All Additions (+)' },
                { id: 'PURCHASE', labelBn: 'ক্রয় / প্রারম্ভিক স্টক', labelEn: 'Purchases / Initial' },
                { id: 'ADJUSTMENT', labelBn: 'ম্যানুয়াল / কুইক যোগ', labelEn: 'Quick / Manual Add' },
                { id: 'CUSTOMER_RETURN', labelBn: 'কাস্টমার ফেরত', labelEn: 'Returns' },
                { id: 'DAMAGE', labelBn: '⚠️ ড্যামেজ হিস্ট্রি (-)', labelEn: 'Damage History (-)' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: historySubFilter === tab.id ? (tab.id === 'DAMAGE' ? '#dc2626' : '#059669') : '#cbd5e1',
                    background: historySubFilter === tab.id ? (tab.id === 'DAMAGE' ? '#fef2f2' : '#ecfdf5') : '#ffffff',
                    color: historySubFilter === tab.id ? (tab.id === 'DAMAGE' ? '#dc2626' : '#059669') : '#475563',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setHistorySubFilter(tab.id);
                    loadProductHistory(historyProduct, tab.id);
                  }}
                >
                  {language === 'bn' ? tab.labelBn : tab.labelEn}
                </button>
              ))}
            </div>

            <div className="drawer-body" style={{ padding: '14px 18px', maxHeight: 'calc(90vh - 230px)', overflowY: 'auto' }}>
              {isHistoryLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>{language === 'bn' ? 'ইতিহাস লোড হচ্ছে...' : 'Loading history...'}</div>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                  <PackagePlus size={36} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                    {language === 'bn' ? 'কোনো পণ্য যোগের ইতিহাস পাওয়া যায়নি' : 'No addition history found for this product'}
                  </div>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                    <thead>
                      <tr>
                        <th>{language === 'bn' ? 'তারিখ ও সময়' : 'Date & Time'}</th>
                        <th>{language === 'bn' ? 'যোগের ধরন' : 'Source / Type'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'যোগকৃত পরিমাণ' : 'Added Qty'}</th>
                        <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'যোগের পর স্টক' : 'Balance After'}</th>
                        <th>{language === 'bn' ? 'চালান / রেফারেন্স' : 'Ref Code'}</th>
                        <th>{language === 'bn' ? 'বিবরণ / নোট' : 'Note / Reason'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map(r => {
                        const when = new Date(r.created_at);
                        const isIn = r.quantity_changed > 0;
                        const isDamage = r.movement_type === 'DAMAGE';
                        const colour = isDamage ? '#dc2626' : '#059669';
                        const unit = r.unit || historyProduct.unit || 'pcs';

                        let label = r.movement_type;
                        if (isDamage) label = language === 'bn' ? '⚠️ ড্যামেজ / নষ্ট' : '⚠️ Damaged';
                        else if (r.movement_type === 'PURCHASE' && r.reference_id?.startsWith('INIT')) label = language === 'bn' ? 'নতুন পণ্য (প্রারম্ভিক স্টক)' : 'Initial Stock';
                        else if (r.movement_type === 'PURCHASE') label = language === 'bn' ? 'ক্রয় চালান' : 'Purchase Bill';
                        else if (r.movement_type === 'ADJUSTMENT' && isIn) label = language === 'bn' ? 'কুইক / ম্যানুয়াল যোগ' : 'Quick Stock Add';
                        else if (r.movement_type === 'CUSTOMER_RETURN') label = language === 'bn' ? 'কাস্টমার ফেরত' : 'Customer Return';
                        else if (r.movement_type === 'SR_RETURN') label = language === 'bn' ? 'এসআর ফেরত' : 'SR Return';

                        return (
                          <tr key={r.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600 }}>{when.toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatTimeAgo(r.created_at)}
                              </div>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: `${colour}18`, color: colour, fontSize: '0.8rem', fontWeight: 600 }}>
                                {isDamage ? <AlertTriangle size={12} /> : <PackagePlus size={12} />}
                                {label}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ fontWeight: 800, color: colour }}>
                                {isIn ? `+${r.quantity_changed}` : r.quantity_changed} {unit}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                              {r.balance_after} {unit}
                            </td>
                            <td>
                              <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                {r.reference_id || '—'}
                              </code>
                            </td>
                            <td>
                              <span style={{ color: '#475563', fontSize: '0.82rem' }}>{r.reason || '—'}</span>
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
        </div>,
        document.body
      )}

      {/* Hidden Printable Elements */}
      <div style={{ display: 'none' }}>
        <div id="printable-damage-history" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '0.5rem' }}>ক্ষতিগ্রস্ত / ড্যামেজ পণ্য রিপোর্ট (Damage Report)</h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>তারিখ: {new Date().toLocaleDateString()}</p>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>তারিখ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>পণ্যের নাম ও কোড</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>ড্যামেজ পরিমাণ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>অবশিষ্ট স্টক</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>কারণ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>রেফারেন্স</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map(r => (
                <tr key={r.id}>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.product_name} ({r.product_code})</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center', color: 'red', fontWeight: 'bold' }}>-{Math.abs(r.quantity_changed)} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>{r.balance_after} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reason || '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reference_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div id="printable-stockin-history" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '0.5rem' }}>পণ্য যোগের ইতিহাস রিপোর্ট (Stock In History Report)</h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>তারিখ: {new Date().toLocaleDateString()}</p>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>তারিখ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>পণ্যের নাম ও কোড</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>যোগকৃত পরিমাণ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>যোগের পর স্টক</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>ধরন</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>চালান / রেফারেন্স</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>বিবরণ</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map(r => (
                <tr key={r.id}>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.product_name} ({r.product_code})</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center', color: 'green', fontWeight: 'bold' }}>+{r.quantity_changed} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>{r.balance_after} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.movement_type}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reference_id || '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div id="printable-product-history" style={{ padding: '2rem', background: '#fff', color: '#000' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <h3 style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            পণ্য যোগের ইতিহাস রিপোর্ট (Product Add History): {historyProduct?.name} ({historyProduct?.product_code || historyProduct?.id})
          </h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>
            বর্তমান স্টক: {historyProduct?.stock} {historyProduct?.unit || 'Pcs'} · প্রিন্টের তারিখ: {new Date().toLocaleDateString()}
          </p>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>তারিখ ও সময়</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>যোগের ধরন</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>যোগকৃত পরিমাণ</th>
                <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>যোগের পর স্টক</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>চালান / রেফারেন্স</th>
                <th style={{ border: '1px solid #ccc', padding: '6px' }}>বিবরণ / নোট</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map(r => (
                <tr key={r.id}>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>
                    {r.movement_type === 'PURCHASE' && r.reference_id?.startsWith('INIT') ? 'নতুন পণ্য (প্রারম্ভিক)' : r.movement_type === 'PURCHASE' ? 'ক্রয় চালান' : r.movement_type === 'ADJUSTMENT' ? 'কুইক যোগ' : r.movement_type === 'DAMAGE' ? 'ড্যামেজ' : r.movement_type}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center', fontWeight: 'bold', color: r.quantity_changed > 0 ? 'green' : 'red' }}>
                    {r.quantity_changed > 0 ? `+${r.quantity_changed}` : r.quantity_changed} {r.unit || 'pcs'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>{r.balance_after} {r.unit || 'pcs'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reference_id || '-'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '6px' }}>{r.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reference Data Drawer */}
      {showReferenceDrawer && (
        <ReferenceDataDrawer
          onClose={() => setShowReferenceDrawer(false)}
        />
      )}
    </div>
  );
};

export default Inventory;
