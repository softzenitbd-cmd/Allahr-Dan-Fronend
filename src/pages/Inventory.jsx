import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, Search, Printer, Edit, Trash2, Settings2, Image as ImageIcon, 
  Upload, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  Loader2 
} from 'lucide-react';
import useStore from '../store/useStore';
import ReferenceDataDrawer from '../components/ReferenceDataDrawer';
import { printElement } from '../utils/pdfGenerator';
import { printBarcodeLabels } from '../utils/printLabels';
import { ProductService } from '../api/services';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
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
    deleteInventoryItem, language, shopProfile, refresh 
  } = useStore();

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

  const availableCategories = Array.from(new Set([
    'Panjabi', 'Shirt', 'Pant', 'T-Shirt', 'Polo', 'Pajama', 'Blazer', 'Accessories', 'Fabric',
    ...(categories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean),
    ...(inventory || []).map(i => i.category).filter(Boolean)
  ].map(c => (c || '').trim()).filter(Boolean)));

  const availableUnits = Array.from(new Set([
    'Pcs', 'Set', 'Box', 'Packet', 'Meter', 'Yard',
    ...(units || []).map(u => typeof u === 'string' ? u : u.name).filter(Boolean),
    ...(inventory || []).map(i => i.unit).filter(Boolean)
  ]));

  const [newProduct, setNewProduct] = useState({
    id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, mrp: 0, discount_price: 0, price: 0
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
      if (selectedCategory && selectedCategory !== 'All') params.category = selectedCategory;
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
  }, [currentPage, pageSize, searchTerm, selectedCategory, stockStatus, ordering]);

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
  }, [searchTerm, selectedCategory, stockStatus, ordering, pageSize]);

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
      mrp: 0,
      discount_price: 0,
      price: 0
    });
    setNewProductImage(null);
    setNewProductImagePreview(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item) => {
    const salePrice = item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price);
    const mrpPrice = item.mrp && Number(item.mrp) > 0 ? Number(item.mrp) : salePrice;
    setEditingItem({
      ...item,
      mrp: mrpPrice,
      discount_price: salePrice,
      price: salePrice,
    });
    setEditProductImage(null);
    setEditProductImagePreview(getProductImageUrl(item.image) || null);
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

    if (editProductImage) {
      const formData = new FormData();
      formData.append('name', editingItem.name);
      formData.append('category', editingItem.category || '');
      formData.append('unit', editingItem.unit || 'Pcs');
      if (editingItem.variant) formData.append('variant', editingItem.variant);
      formData.append('stock', parseInt(editingItem.stock) || 0);
      formData.append('mrp', mrpVal || saleVal);
      formData.append('discount_price', discVal || saleVal);
      formData.append('price', saleVal);
      formData.append('image', editProductImage);
      res = await updateInventoryItem(editingItem.id, formData);
    } else {
      const payload = {
        ...editingItem,
        mrp: mrpVal || saleVal,
        discount_price: discVal || saleVal,
        price: saleVal,
        stock: parseInt(editingItem.stock) || 0,
      };
      res = await updateInventoryItem(editingItem.id, payload);
    }

    if (res?.ok) {
      setEditingItem(null);
      setEditProductImage(null);
      setEditProductImagePreview(null);
      showSuccessAlert(language === 'bn' ? 'পণ্য সফলভাবে আপডেট হয়েছে!' : 'Product updated successfully!');
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

    if (newProductImage) {
      const formData = new FormData();
      formData.append('id', finalId);
      formData.append('name', finalName);
      formData.append('category', newProduct.category || 'Panjabi');
      formData.append('unit', newProduct.unit || 'Pcs');
      if (newProduct.variant) formData.append('variant', newProduct.variant);
      formData.append('stock', parseInt(newProduct.stock) || 0);
      formData.append('mrp', mrpVal || saleVal);
      formData.append('discount_price', discVal || saleVal);
      formData.append('price', saleVal);
      formData.append('image', newProductImage);
      res = await addInventoryItem(formData);
    } else {
      const payload = {
        ...newProduct,
        id: finalId,
        name: finalName,
        mrp: mrpVal || saleVal,
        discount_price: discVal || saleVal,
        price: saleVal,
        stock: parseInt(newProduct.stock) || 0,
      };
      res = await addInventoryItem(payload);
    }

    if (res?.ok) {
      setShowAddModal(false);
      setNewProduct({ id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, mrp: 0, discount_price: 0, price: 0 });
      setNewProductImage(null);
      setNewProductImagePreview(null);
      showSuccessAlert(language === 'bn' ? 'নতুন পণ্য সফলভাবে যুক্ত হয়েছে!' : 'Product added successfully!');
      await refresh('inventory');
      fetchPaginatedProducts(1);
    }
  };

  const handlePrintBarcode = (product) => {
    printBarcodeLabels(product, 1, "Allah'r Dan");
  };

  const totalItems = (inventory || []).reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const totalValue = (inventory || []).reduce((sum, item) => {
    const salePrice = item.discount_price && Number(item.discount_price) > 0 ? Number(item.discount_price) : Number(item.price);
    return sum + ((Number(item.stock) || 0) * (salePrice || 0));
  }, 0);

  const handlePrintInventoryList = () => {
    printElement('printable-inventory-list', 'Inventory');
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
          <button className="btn-primary flex-align-gap" style={{ width: 'fit-content', whiteSpace: 'nowrap' }} onClick={handleOpenAddModal}>
            <Plus size={18} /> {t(language, 'Add New Item')}
          </button>
        </div>
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
            {/* Category Filter */}
            <select 
              className="w-full" 
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'auto', minWidth: '140px' }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              title={language === 'bn' ? 'ক্যাটাগরি ফিল্টার' : 'Filter by Category'}
            >
              <option value="All">{t(language, 'All Categories')}</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {selectedCategory !== 'All' && (
              <button 
                type="button"
                className="btn-outline flex-align-gap" 
                style={{ 
                  padding: '0.35rem 0.65rem', 
                  borderRadius: '8px', 
                  fontSize: '0.85rem', 
                  color: 'var(--primary)', 
                  borderColor: 'var(--primary)',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)' 
                }}
                onClick={() => setSelectedCategory('All')}
                title={language === 'bn' ? 'ক্যাটাগরি ফিল্টার রিসেট করুন' : 'Clear Category Filter'}
              >
                <span>{selectedCategory}</span>
                <X size={14} />
              </button>
            )}

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
              <option value="low_stock">{language === 'bn' ? 'কম স্টক (Low)' : 'Low Stock'}</option>
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
                <th>{t(language, 'Stock')}</th>
                <th>{t(language, 'Price')} (BDT)</th>
                <th>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--primary)' }}>
                    <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                      <Loader2 size={20} className="animate-spin" />
                      <span>{language === 'bn' ? 'পণ্য লোড হচ্ছে...' : 'Loading products...'}</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
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
                      <span className={`badge ${item.stock <= 5 ? 'badge-danger' : item.stock <= 15 ? 'badge-warning' : 'badge-success'}`}>
                        {item.stock}
                      </span>
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
                    <td>
                      <div className="table-actions">
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
      <div id="printable-inventory-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '0.5rem', color: '#333' }}>Inventory Stock List</p>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', marginBottom: '1.5rem', color: '#666' }}>
            {selectedCategory !== 'All' ? `Category: ${selectedCategory}` : 'All Categories'}
          </p>
          
          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Barcode / ID</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Product Name</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Category</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left'}}>Variant</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>Stock</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>Unit</th>
                <th style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>Price (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.length > 0 ? paginatedProducts.map((item, idx) => (
                <tr key={idx}>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.id}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.name}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.category}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.variant || '-'}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center', fontWeight: 'bold'}}>{item.stock}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>{item.unit}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>
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
                  <td colSpan="7" style={{border: '1px solid #ccc', padding: '1rem', textAlign: 'center'}}>No items found.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="4" style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>Totals:</td>
                <td style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center'}}>{totalItems}</td>
                <td style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center'}}>-</td>
                <td style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>৳{totalValue.toLocaleString()}</td>
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
                      onChange={(e) => setNewProduct({...newProduct, id: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Name')} *</label>
                    <input 
                      type="text" 
                      className="w-full" 
                      required
                      placeholder="e.g. Silk Punjabi"
                      value={newProduct.name} 
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Category')} *</label>
                    <select 
                      className="w-full"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                    >
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant / Size / Color')}</label>
                    <input 
                      type="text" 
                      className="w-full" 
                      placeholder="e.g. XL, Red, 42"
                      value={newProduct.variant} 
                      onChange={(e) => setNewProduct({...newProduct, variant: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Unit')} *</label>
                    <select 
                      className="w-full"
                      value={newProduct.unit}
                      onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                    >
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Stock Quantity')} *</label>
                    <input 
                      type="number" 
                      className="w-full" 
                      required
                      min="0"
                      value={newProduct.stock} 
                      onChange={(e) => setNewProduct({...newProduct, stock: e.target.value})} 
                    />
                  </div>
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
                      onChange={(e) => setNewProduct({...newProduct, mrp: e.target.value})} 
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
                      onChange={(e) => setNewProduct({...newProduct, discount_price: e.target.value, price: e.target.value})} 
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
                      onChange={(e) => setEditingItem({...editingItem, name: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Category')} *</label>
                    <select 
                      className="w-full"
                      value={editingItem.category}
                      onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                    >
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant / Size / Color')}</label>
                    <input 
                      type="text" 
                      className="w-full" 
                      value={editingItem.variant || ''} 
                      onChange={(e) => setEditingItem({...editingItem, variant: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Unit')} *</label>
                    <select 
                      className="w-full"
                      value={editingItem.unit}
                      onChange={(e) => setEditingItem({...editingItem, unit: e.target.value})}
                    >
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Stock Quantity')} *</label>
                    <input 
                      type="number" 
                      className="w-full" 
                      required
                      min="0"
                      value={editingItem.stock} 
                      onChange={(e) => setEditingItem({...editingItem, stock: e.target.value})} 
                    />
                  </div>
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
                      onChange={(e) => setEditingItem({...editingItem, mrp: e.target.value})} 
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
                      onChange={(e) => setEditingItem({...editingItem, discount_price: e.target.value, price: e.target.value})} 
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
