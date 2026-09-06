import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import { Plus, Search, Printer, Edit, Trash2, Download, Settings2, Image as ImageIcon, Upload, X } from 'lucide-react';
import useStore from '../store/useStore';
import ReferenceDataDrawer from '../components/ReferenceDataDrawer';
import { downloadAsPDF, printElement } from '../utils/pdfGenerator';
import { printBarcodeLabels } from '../utils/printLabels';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import './Inventory.css';

const getProductImageUrl = (img) => {
  if (!img) return null;
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('blob:')) return img;
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${img.startsWith('/') ? '' : '/'}${img}`;
};

const Inventory = () => {
  const { inventory, categories, units, addInventoryItem, updateInventoryItem, deleteInventoryItem, language } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('All Time');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showReferenceDrawer, setShowReferenceDrawer] = useState(false);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [printQuantity, setPrintQuantity] = useState(21); // Default to 21 (3x7 grid)
  const [newProductImage, setNewProductImage] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState(null);
  const [editProductImage, setEditProductImage] = useState(null);
  const [editProductImagePreview, setEditProductImagePreview] = useState(null);

  const availableCategories = Array.from(new Set([
    'Panjabi', 'Shirt', 'Pant', 'T-Shirt', 'Polo', 'Pajama', 'Blazer', 'Accessories', 'Fabric',
    ...(categories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean),
    ...inventory.map(i => i.category).filter(Boolean)
  ]));

  const availableUnits = Array.from(new Set([
    'Pcs', 'Set', 'Box', 'Packet', 'Meter', 'Yard',
    ...(units || []).map(u => typeof u === 'string' ? u : u.name).filter(Boolean),
    ...inventory.map(i => i.unit).filter(Boolean)
  ]));

  const [newProduct, setNewProduct] = useState({
    id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, price: 0
  });

  const getNextProductId = () => {
    const numericCodes = (inventory || [])
      .map(i => parseInt(i.id || i.product_code))
      .filter(n => !isNaN(n) && n > 0);
    if (numericCodes.length > 0) {
      return String(Math.max(...numericCodes) + 1);
    }
    return '10006';
  };

  const handleOpenAddModal = () => {
    setNewProduct({
      id: getNextProductId(),
      name: '',
      category: availableCategories[0] || 'Panjabi',
      unit: availableUnits[0] || 'Pcs',
      variant: '',
      stock: 0,
      price: 0
    });
    setNewProductImage(null);
    setNewProductImagePreview(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
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
    if (editProductImage) {
      const formData = new FormData();
      formData.append('name', editingItem.name);
      formData.append('category', editingItem.category || '');
      formData.append('unit', editingItem.unit || 'Pcs');
      if (editingItem.variant) formData.append('variant', editingItem.variant);
      formData.append('stock', parseInt(editingItem.stock) || 0);
      formData.append('price', parseFloat(editingItem.price) || 0);
      formData.append('image', editProductImage);
      res = await updateInventoryItem(editingItem.id, formData);
    } else {
      const payload = {
        ...editingItem,
        price: parseFloat(editingItem.price) || 0,
        stock: parseInt(editingItem.stock) || 0,
      };
      res = await updateInventoryItem(editingItem.id, payload);
    }

    if (res?.ok) {
      setEditingItem(null);
      setEditProductImage(null);
      setEditProductImagePreview(null);
      toast.success(language === 'bn' ? 'পণ্য সফলভাবে আপডেট হয়েছে!' : 'Product updated successfully!');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত এই পণ্যটি ডিলিট করতে চান?' : 'Are you sure you want to delete this item?')) {
      const res = await deleteInventoryItem(id);
      if (res?.ok) {
        toast.success(language === 'bn' ? 'পণ্য ডিলিট করা হয়েছে!' : 'Product deleted!');
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
    if (newProductImage) {
      const formData = new FormData();
      formData.append('id', finalId);
      formData.append('name', finalName);
      formData.append('category', newProduct.category || 'Panjabi');
      formData.append('unit', newProduct.unit || 'Pcs');
      if (newProduct.variant) formData.append('variant', newProduct.variant);
      formData.append('stock', parseInt(newProduct.stock) || 0);
      formData.append('price', parseFloat(newProduct.price) || 0);
      formData.append('image', newProductImage);
      res = await addInventoryItem(formData);
    } else {
      const payload = {
        ...newProduct,
        id: finalId,
        name: finalName,
        price: parseFloat(newProduct.price) || 0,
        stock: parseInt(newProduct.stock) || 0,
      };
      res = await addInventoryItem(payload);
    }

    if (res?.ok) {
      setShowAddModal(false);
      setNewProduct({ id: '', name: '', category: 'Panjabi', unit: 'Pcs', variant: '', stock: 0, price: 0 });
      setNewProductImage(null);
      setNewProductImagePreview(null);
      toast.success(language === 'bn' ? 'নতুন পণ্য সফলভাবে যুক্ত হয়েছে!' : 'Product added successfully!');
    }
  };

  const handlePrintBarcode = (product) => {
    setSelectedProduct(product);
    setShowBarcodeModal(true);
  };

  const filteredInventory = inventory.filter(item => {
    // 1. Text Search Filter
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.id.includes(searchTerm);
    if (!matchesSearch) return false;

    // 2. Date Filter
    if (filterDate === 'All Time') return true;
    
    if (!item.dateAdded) return true; // If no date, just include it to be safe
    
    const itemDate = new Date(item.dateAdded);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (filterDate === 'Today') {
      return itemDate >= today;
    } else if (filterDate === 'Weekly') {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return itemDate >= lastWeek;
    } else if (filterDate === 'Monthly') {
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return itemDate >= lastMonth;
    } else if (filterDate === 'Custom' && customDateRange.start && customDateRange.end) {
      const start = new Date(customDateRange.start);
      const end = new Date(customDateRange.end);
      end.setHours(23,59,59,999);
      return itemDate >= start && itemDate <= end;
    }
    
    return true;
  });

  const totalItems = filteredInventory.reduce((sum, item) => sum + item.stock, 0);
  const totalValue = filteredInventory.reduce((sum, item) => sum + (item.stock * item.price), 0);

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
          <button className="btn-outline flex-align-gap text-info" onClick={() => downloadAsPDF('printable-inventory-list', 'Inventory_List.pdf')}>
            <Download size={18} /> {t(language, 'Download PDF' || 'Download')}
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
              placeholder={t(language, 'Search')} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select 
              className="w-full" 
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'auto' }}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            >
              <option value="All Time">All Time</option>
              <option value="Today">Today</option>
              <option value="Weekly">Last 7 Days</option>
              <option value="Monthly">Last 30 Days</option>
              <option value="Custom">Custom Date</option>
            </select>
            
            {filterDate === 'Custom' && (
              <div className="flex-align-gap" style={{ background: 'var(--surface-color)', padding: '0.2rem', borderRadius: '8px' }}>
                <input 
                  type="date" 
                  style={{ padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  value={customDateRange.start}
                  onChange={(e) => setCustomDateRange({...customDateRange, start: e.target.value})}
                />
                <span className="text-muted">to</span>
                <input 
                  type="date" 
                  style={{ padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  value={customDateRange.end}
                  onChange={(e) => setCustomDateRange({...customDateRange, end: e.target.value})}
                />
              </div>
            )}
            <button className="btn-outline" onClick={() => setShowCategoriesModal(true)}>
              {t(language, 'Categories')} ({availableCategories.length})
            </button>
            <button className="btn-outline" onClick={() => setShowUnitsModal(true)}>
              {t(language, 'Units')} ({availableUnits.length})
            </button>
            {/* The two buttons above summarise what is in use. This one edits
                the underlying lists -- rename a typo, drop an unused entry. */}
            <button className="btn-outline flex-align-gap text-info" onClick={() => setShowReferenceDrawer(true)}>
              <Settings2 size={16} /> {t(language, 'Manage')}
            </button>
          </div>
        </div>

        <div className="table-responsive">
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
              {filteredInventory.map(item => (
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
                  <td className="font-semibold">{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.variant || '-'}</td>
                  <td>{item.unit}</td>
                  <td>
                    <span className={`stock-badge ${item.stock < 50 ? 'warning' : 'success'}`}>
                      {item.stock}
                    </span>
                  </td>
                  <td className="font-semibold">৳{item.price}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Print Barcode" onClick={() => handlePrintBarcode(item)}>
                        <Printer size={16} />
                      </button>
                      <button className="btn-icon text-info" title="Edit" onClick={() => handleOpenEditModal(item)}>
                        <Edit size={16} />
                      </button>
                      <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden Printable Inventory List (Excel Style) */}
      <div id="printable-inventory-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '0.5rem', color: '#333' }}>Inventory Stock List</p>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', marginBottom: '1.5rem', color: '#666' }}>
            Date Filter: {filterDate} {filterDate === 'Custom' ? `(${customDateRange.start} to ${customDateRange.end})` : ''}
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
              {filteredInventory.length > 0 ? filteredInventory.map((item, idx) => (
                <tr key={idx}>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.id}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.name}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.category}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{item.variant || '-'}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center', fontWeight: 'bold'}}>{item.stock}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'center'}}>{item.unit}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>৳{item.price.toLocaleString()}</td>
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

      {/* Barcode Drawer */}
      {showBarcodeModal && selectedProduct && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Generate Barcode</h2>
              <button className="drawer-close-btn" onClick={() => setShowBarcodeModal(false)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label>Number of Stickers:</label>
                <input 
                  type="number" 
                  value={printQuantity} 
                  onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))} 
                  style={{ width: '80px', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div id="printable-barcode" style={{ background: '#fff', padding: '1rem', borderRadius: '12px', width: '100%' }}>
                {/* A4 Sheet grid emulation for printing */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {Array.from({ length: printQuantity }).map((_, i) => (
                    <div key={i} style={{ border: '1px dashed #ccc', padding: '1rem', textAlign: 'center' }}>
                      <Barcode value={selectedProduct.id} width={1.5} height={40} fontSize={14} />
                      <p style={{ margin: '0.2rem 0 0 0', fontWeight: 'bold', fontSize: '0.9rem', color: '#000' }}>
                        {selectedProduct.name}
                      </p>
                      {selectedProduct.variant && (
                         <p style={{ margin: '0', fontSize: '0.8rem', color: '#333' }}>Var: {selectedProduct.variant}</p>
                      )}
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem', color: '#000' }}>৳{selectedProduct.price}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => printBarcodeLabels(selectedProduct, printQuantity)}>
                <Printer size={20} /> Print Labels ({printQuantity})
              </button>
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => downloadAsPDF('printable-barcode', `Barcode_${selectedProduct.name}.pdf`)}>
                <Download size={20} /> Download PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
                      value={newProduct.id} 
                      onChange={e => setNewProduct({...newProduct, id: e.target.value})} 
                      required 
                      placeholder={`e.g. ${getNextProductId()}`} 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Item Name')} *</label>
                    <input type="text" className="w-full" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required placeholder="e.g. Sugar 1kg" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Category')}</label>
                      <input 
                        list="inventory-category-options"
                        type="text" 
                        className="w-full" 
                        value={newProduct.category} 
                        onChange={e => setNewProduct({...newProduct, category: e.target.value})} 
                        placeholder="e.g. Panjabi" 
                      />
                      <datalist id="inventory-category-options">
                        {availableCategories.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant')}</label>
                      <input type="text" className="w-full" value={newProduct.variant} onChange={e => setNewProduct({...newProduct, variant: e.target.value})} placeholder="e.g. Red, XL, 40" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Unit')}</label>
                      <select className="w-full" value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})}>
                        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Stock')}</label>
                      <input type="number" className="w-full" min="0" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Price')} (BDT)</label>
                    <input type="number" className="w-full" min="0" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary flex-align-gap"><Plus size={18} /> {t(language, 'Save')}</button>
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
                  {/* Edit Product Image Dropzone */}
                  <div className="product-image-upload-section">
                    <label className="text-muted text-sm block mb-1">{t(language, 'Product Image')}</label>
                    {editProductImagePreview ? (
                      <div className="product-image-preview-wrapper">
                        <img src={editProductImagePreview} alt="Preview" className="product-image-preview-img" />
                        <div className="preview-action-row">
                          <label className="change-preview-label" title="Change image">
                            <input 
                              type="file" 
                              accept="image/png, image/jpeg, image/webp" 
                              onChange={e => handleImageSelect(e.target.files?.[0], true)} 
                              style={{ display: 'none' }}
                            />
                            <Upload size={13} /> {language === 'bn' ? 'ছবি পরিবর্তন' : 'Change'}
                          </label>
                          <button
                            type="button"
                            className="remove-preview-btn"
                            onClick={() => { setEditProductImage(null); setEditProductImagePreview(null); }}
                            title="Remove image"
                          >
                            <X size={15} />
                          </button>
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
                            <span className="font-semibold text-primary">{language === 'bn' ? 'ছবি যোগ করুন' : 'Click to upload image'}</span>
                            <span className="text-xs text-muted block mt-0.5">PNG, JPG, WEBP (Max 5MB)</span>
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'ID/Barcode' || 'Product ID / Barcode')} *</label>
                    <input type="text" className="w-full" value={editingItem.id} disabled style={{ backgroundColor: '#f3f4f6' }} />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Item Name')} *</label>
                    <input type="text" className="w-full" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Category')}</label>
                      <input 
                        list="inventory-category-options-edit"
                        type="text" 
                        className="w-full" 
                        value={editingItem.category} 
                        onChange={e => setEditingItem({...editingItem, category: e.target.value})} 
                      />
                      <datalist id="inventory-category-options-edit">
                        {availableCategories.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Variant' || 'Variant')}</label>
                      <input type="text" className="w-full" value={editingItem.variant || ''} onChange={e => setEditingItem({...editingItem, variant: e.target.value})} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Unit')}</label>
                      <select className="w-full" value={editingItem.unit} onChange={e => setEditingItem({...editingItem, unit: e.target.value})}>
                        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-muted text-sm block mb-1">{t(language, 'Stock')}</label>
                      <input type="number" className="w-full" min="0" value={editingItem.stock} onChange={e => setEditingItem({...editingItem, stock: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Price')} (BDT)</label>
                    <input type="number" className="w-full" min="0" value={editingItem.price} onChange={e => setEditingItem({...editingItem, price: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setEditingItem(null)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary flex-align-gap"><Edit size={18} /> {t(language, 'Save Changes')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Categories Summary Drawer */}
      {showCategoriesModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '500px' }}>
            <div className="drawer-header">
              <h2>{t(language, 'Categories')} ({availableCategories.length})</h2>
              <button className="drawer-close-btn" onClick={() => setShowCategoriesModal(false)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <div className="drawer-body">
              <p className="text-muted mb-4">{language === 'bn' ? 'বর্তমান স্টকে থাকা ক্যাটাগরি এবং প্রোডাক্ট সংখ্যা:' : 'Active categories and products in stock:'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {availableCategories.map((cat, idx) => {
                  const count = inventory.filter(i => (i.category || '').toLowerCase() === cat.toLowerCase()).length;
                  return (
                    <div key={idx} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: '600' }}>{cat}</span>
                      <span className="stock-badge success">{count} {language === 'bn' ? 'টি পণ্য' : 'products'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn-primary w-full" onClick={() => setShowCategoriesModal(false)}>{t(language, 'Close')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Units Summary Drawer */}
      {showUnitsModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '500px' }}>
            <div className="drawer-header">
              <h2>{t(language, 'Units')} ({availableUnits.length})</h2>
              <button className="drawer-close-btn" onClick={() => setShowUnitsModal(false)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <div className="drawer-body">
              <p className="text-muted mb-4">{language === 'bn' ? 'ব্যবহৃত এককসমূহ:' : 'Measurement units currently configured:'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {availableUnits.map((u, idx) => {
                  const count = inventory.filter(i => (i.unit || '').toLowerCase() === u.toLowerCase()).length;
                  return (
                    <div key={idx} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: '600' }}>{u}</span>
                      <span className="stock-badge warning">{count} {language === 'bn' ? 'আইটেম' : 'items'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn-primary w-full" onClick={() => setShowUnitsModal(false)}>{t(language, 'Close')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showReferenceDrawer && <ReferenceDataDrawer onClose={() => setShowReferenceDrawer(false)} />}
    </div>
  );
};

export default Inventory;
