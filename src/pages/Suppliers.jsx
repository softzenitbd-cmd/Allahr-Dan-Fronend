import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Printer, Eye, Plus, Phone, Edit, Trash2, RotateCcw, History, Receipt, X } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import PrintablePayment from '../components/PrintablePayment';

const Suppliers = () => {
  const { 
    suppliers, 
    deletedSuppliers, 
    addSupplier, 
    updateSupplier, 
    deleteSupplier, 
    restoreSupplier, 
    permanentDeleteSupplier, 
    purchases, 
    settlements, 
    language,
    refresh,
    ensureLoaded,
    settleSupplierDue,
    shopProfile,
    user
  } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Active'); // Active or Deleted
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [settleModal, setSettleModal] = useState({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' });
  const [receiptModal, setReceiptModal] = useState({ show: false, settlement: null, party: null });

  useEffect(() => {
    ensureLoaded?.('suppliers', 'purchases', 'settlements');
  }, []);

  useEffect(() => {
    if (activeTab === 'Deleted') {
      refresh?.('deletedSuppliers');
    }
  }, [activeTab]);

  const getSupplierTransactions = (supplierId) => {
    if (!supplierId) return [];
    
    const supplierPurchases = (purchases || []).filter(p => p.supplierId === supplierId || p.supplierId === selectedPerson?.supplier_code || String(p.supplierId) === String(supplierId)).map(p => ({
      id: p.id,
      date: p.date,
      type: 'Purchase',
      description: `Purchase (${p.paymentType})`,
      amount: p.total,
      isCredit: true
    }));

    // Money handed over at the counter is a payment too. Counting only later
    // settlements made a cash purchase look entirely unpaid, even though the
    // Due column beside it correctly read zero.
    const paidOnPurchase = (purchases || [])
      .filter(p => (p.supplierId === supplierId || p.supplierId === selectedPerson?.supplier_code || String(p.supplierId) === String(supplierId)) && Number(p.paidAmount) > 0)
      .map(p => ({
        id: `${p.id}-paid`,
        date: p.date,
        type: 'Payment',
        description: `Paid on purchase ${p.id} (${p.paymentType})`,
        amount: Number(p.paidAmount),
        isCredit: false
      }));

    const supplierSettlements = (settlements || []).filter(s => (s.targetId === supplierId || s.targetId === selectedPerson?.supplier_code) && s.type === 'Supplier').map(s => ({
      id: s.id,
      date: s.date,
      type: 'Payment',
      description: 'Payment to Supplier',
      amount: s.amount,
      isCredit: false
    }));

    return [...supplierPurchases, ...paidOnPurchase, ...supplierSettlements].sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const selectedPersonTransactions = selectedPerson ? getSupplierTransactions(selectedPerson.id) : [];
  const totalPurchased = selectedPersonTransactions.filter(t => t.type === 'Purchase').reduce((sum, t) => sum + t.amount, 0);
  const totalPaid = selectedPersonTransactions.filter(t => t.type === 'Payment').reduce((sum, t) => sum + t.amount, 0);
  
  // Add/Edit Supplier Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [newSupplier, setNewSupplier] = useState({ name: '', company: '', phone: '', email: '', location: '', due: '', notes: '' });

  const currentList = activeTab === 'Active' ? (suppliers || []) : (deletedSuppliers || []);

  const filteredList = currentList.filter(
    (person) =>
      (person.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (person.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (person.phone && person.phone.includes(searchTerm)) ||
      (person.id && String(person.id).toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const handleAddSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.name?.trim()) {
      toast.error(language === 'bn' ? 'সাপ্লায়ারের নাম দেওয়া আবশ্যক!' : 'Supplier name is required');
      return;
    }
    const supplierToSave = {
      ...newSupplier,
      name: newSupplier.name.trim(),
      company: (newSupplier.company || '').trim(),
      due: parseFloat(newSupplier.due) || 0,
    };
    const res = await addSupplier(supplierToSave);
    if (res?.ok) {
      setNewSupplier({ name: '', company: '', phone: '', email: '', location: '', due: '', notes: '' });
      setShowAddModal(false);
      showSuccessAlert(language === 'bn' ? 'সাপ্লায়ার সফলভাবে যুক্ত হয়েছে!' : 'Supplier added successfully!');
    }
  };

  const handleSettle = async (e) => {
    e.preventDefault();
    const amount = parseFloat(settleModal.amount);
    if (!amount || amount <= 0) {
      toast.error(language === 'bn' ? 'অনুগ্রহ করে সঠিক পরিমাণ লিখুন।' : 'Please enter a valid amount to settle.');
      return;
    }

    const previousDue = Number(settleModal.target?.due || 0);
    const targetObj = { ...settleModal.target };
    const dateToUse = settleModal.date || new Date().toISOString().split('T')[0];
    const methodToUse = settleModal.method || 'Cash';
    const notesToUse = settleModal.notes || '';

    const res = await settleSupplierDue(targetObj.id, amount, dateToUse, { method: methodToUse, notes: notesToUse });

    if (res?.ok) {
      toast.success(
        language === 'bn'
          ? `${targetObj.name}-এর ৳${amount.toLocaleString()} সফলভাবে পরিশোধ ও সমন্বয় করা হয়েছে!`
          : `Successfully settled ৳${amount.toLocaleString()} for ${targetObj.name}`
      );

      const settlementObj = {
        id: res.data?.id || res.data?.settlement_code || 'REC-' + Date.now().toString().slice(-6),
        amount,
        previousDue,
        remainingDue: Math.max(0, previousDue - amount),
        date: dateToUse,
        method: methodToUse,
        notes: notesToUse,
        type: 'Supplier',
        targetId: targetObj.id,
        partyName: targetObj.name,
      };

      setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' });
      setReceiptModal({ show: true, settlement: settlementObj, party: targetObj });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingPerson.name?.trim()) {
      toast.error(language === 'bn' ? 'সাপ্লায়ারের নাম দেওয়া আবশ্যক!' : 'Supplier name is required');
      return;
    }
    const due = parseFloat(editingPerson.due) || 0;
    const res = await updateSupplier(editingPerson.id, {
      ...editingPerson,
      name: editingPerson.name.trim(),
      company: (editingPerson.company || '').trim(),
      phone: (editingPerson.phone || '').trim(),
      location: (editingPerson.location || '').trim(),
      due,
    });
    if (res?.ok) {
      setEditingPerson(null);
      showSuccessAlert(language === 'bn' ? 'সাপ্লায়ার তথ্য আপডেট হয়েছে!' : 'Updated successfully!');
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'সাপ্লায়ার মুছে ফেলবেন?' : 'Delete Supplier?',
      text: language === 'bn' 
        ? 'আপনি কি নিশ্চিত এই সাপ্লায়ার মুছে ফেলতে চান? মুছে ফেলা হলেও তার সকল ক্রয় ও লেনদেনের হিস্ট্রি সংরক্ষিত থাকবে এবং Deleted History ট্যাব থেকে যেকোনো সময় দেখা যাবে।' 
        : 'Are you sure you want to delete this supplier? Full purchase and transaction history will be safely preserved in the Deleted History tab.',
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = await deleteSupplier(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'সাপ্লায়ার সফলভাবে মুছে ফেলা হয়েছে এবং হিস্ট্রিতে সংরক্ষিত রয়েছে!' : 'Deleted successfully! History is saved in Deleted History tab.');
      }
    }
  };

  const handleRestore = async (id) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'সাপ্লায়ার রিস্টোর করবেন?' : 'Restore Supplier?',
      text: language === 'bn' 
        ? 'এই সাপ্লায়ারকে কি পুনরায় সক্রিয় (Active) তালিকায় ফিরিয়ে আনতে চান?' 
        : 'Do you want to restore this supplier back to active status?',
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, রিস্টোর' : 'Yes, restore',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: false,
    });
    if (isConfirmed) {
      const res = await restoreSupplier(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'সাপ্লায়ার সফলভাবে রিস্টোর হয়েছে!' : 'Supplier restored successfully!');
      }
    }
  };

  const handlePermanentDelete = async (id, name) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'স্থায়ীভাবে মুছে ফেলবেন?' : 'Permanently Delete?',
      text: language === 'bn' 
        ? `আপনি কি নিশ্চিত '${name}' সাপ্লায়ারকে ডাটাবেজ থেকে সম্পূর্ণ স্থায়ীভাবে মুছে ফেলতে চান? এই কাজটি আর কখনই ফিরিয়ে আনা যাবে না!` 
        : `Are you sure you want to permanently delete supplier '${name}' from the database? This action CANNOT be undone!`,
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, স্থায়ীভাবে মুছুন' : 'Yes, Delete Permanently',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = await permanentDeleteSupplier(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'সাপ্লায়ার স্থায়ীভাবে মুছে ফেলা হয়েছে!' : 'Supplier permanently deleted!');
      }
    }
  };

  return (
    <div className="customers-page animate-fade-in" id="printable-suppliers-list">
      <div className="page-header">
        <div>
          <h1>Suppliers Management</h1>
          <p className="text-muted">Manage your suppliers, add new ones, and track dues.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-toolbar" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="segmented-control" style={{ maxWidth: '420px' }}>
            <button 
              className={activeTab === 'Active' ? 'active' : ''}
              onClick={() => setActiveTab('Active')}
            >
              {language === 'bn' ? 'সক্রিয় সাপ্লায়ার' : 'Active Suppliers'} ({suppliers?.length || 0})
            </button>
            <button 
              className={activeTab === 'Deleted' ? 'active' : ''}
              onClick={() => setActiveTab('Deleted')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <History size={14} />
              {language === 'bn' ? 'মুছে ফেলা হিস্ট্রি' : 'Deleted History'} {deletedSuppliers?.length ? `(${deletedSuppliers.length})` : ''}
            </button>
          </div>

          <div className="search-bar">
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder={language === 'bn' ? 'নাম বা ফোন দিয়ে খুঁজুন...' : 'Search suppliers by name or phone...'} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {activeTab === 'Active' && (
              <button className="btn-primary flex-align-gap" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> {language === 'bn' ? 'নতুন সাপ্লায়ার' : 'New Supplier'}
              </button>
            )}
            <button className="btn-outline flex-align-gap" onClick={() => window.print()}>
              <Printer size={16} /> {language === 'bn' ? 'তালিকা প্রিন্ট' : 'Print List'}
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{language === 'bn' ? 'নাম' : 'Name'}</th>
                <th>{language === 'bn' ? 'ব্র্যান্ড / কোম্পানি' : 'Brand / Company'}</th>
                <th>{language === 'bn' ? 'ফোন' : 'Phone'}</th>
                <th>{language === 'bn' ? 'মোট মাল কেনা' : 'Total Purchase'}</th>
                <th>{language === 'bn' ? 'মোট জমা' : 'Total Paid'}</th>
                <th>{language === 'bn' ? 'বর্তমান বাকি' : 'Total Due (BDT)'}</th>
                {activeTab === 'Deleted' && <th>{language === 'bn' ? 'মুছে ফেলার তারিখ' : 'Deleted At'}</th>}
                <th>{language === 'bn' ? 'অ্যাকশন' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan={activeTab === 'Deleted' ? 9 : 8} className="text-center text-muted">{language === 'bn' ? 'কোনো রেকর্ড পাওয়া যায়নি।' : 'No records found.'}</td></tr>
              ) : (
                filteredList.map((person) => {
                  const pt = getSupplierTransactions(person.id);
                  const pTotalPurchased = pt.filter(t => t.type === 'Purchase').reduce((sum, t) => sum + t.amount, 0);
                  const pTotalPaid = pt.filter(t => t.type === 'Payment').reduce((sum, t) => sum + t.amount, 0);
                  return (
                    <tr key={person.id}>
                      <td>{person.id}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>{person.name}</span>
                          {activeTab === 'Deleted' && (
                            <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>
                              {language === 'bn' ? 'মুছে ফেলা' : 'Deleted'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {person.company ? (
                          <span className="badge badge-secondary" style={{ fontSize: '0.82rem', fontWeight: 500, padding: '3px 8px' }}>
                            {person.company}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="flex-align-gap"><Phone size={14} className="text-muted" /> {person.phone || 'N/A'}</td>
                      <td>৳{pTotalPurchased.toLocaleString()}</td>
                      <td>৳{pTotalPaid.toLocaleString()}</td>
                      <td><span className={person.due > 0 ? "text-danger font-bold" : "text-success font-bold"}>৳{person.due.toLocaleString()}</span></td>
                      {activeTab === 'Deleted' && (
                        <td style={{ fontSize: '0.85rem', color: '#666' }}>
                          {person.deleted_at ? new Date(person.deleted_at).toLocaleString() : '-'}
                        </td>
                      )}
                      <td>
                        <div className="action-buttons flex-align-gap" style={{flexWrap:'nowrap'}}>
                          <button 
                            className="btn-outline flex-align-gap" 
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem', color: 'var(--primary)', borderColor: 'rgba(59,130,246,0.35)', fontWeight: 600 }}
                            title={language === 'bn' ? 'সাপ্লায়ারের হিস্ট্রি ও লেজার দেখুন (Details)' : 'View Details & Ledger'} 
                            onClick={() => setSelectedPerson(person)}
                          >
                            <Eye size={14} /> Details
                          </button>
                          {activeTab === 'Active' && (
                            <>
                              {person.due > 0 && (
                                <button
                                  className="btn-outline"
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                  onClick={() => setSettleModal({ show: true, target: person, amount: person.due, date: new Date().toISOString().split('T')[0], method: 'Cash', notes: '' })}
                                >
                                  {language === 'bn' ? 'বকেয়া পরিশোধ' : 'Settle Due'}
                                </button>
                              )}
                              <button className="btn-icon text-info" title="Edit" onClick={() => setEditingPerson({ ...person, company: person.company || '' })}>
                                <Edit size={16} />
                              </button>
                              <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(person.id)}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          {activeTab === 'Deleted' && (
                            <>
                              <button 
                                className="btn-outline flex-align-gap" 
                                style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: '#059669', borderColor: '#059669' }} 
                                title={language === 'bn' ? 'সাপ্লায়ার রিস্টোর করুন' : 'Restore Supplier'} 
                                onClick={() => handleRestore(person.id)}
                              >
                                <RotateCcw size={14} /> {language === 'bn' ? 'রিস্টোর' : 'Restore'}
                              </button>
                              <button 
                                className="btn-icon text-danger" 
                                title={language === 'bn' ? 'স্থায়ীভাবে মুছে ফেলুন' : 'Permanently Delete'} 
                                onClick={() => handlePermanentDelete(person.id, person.name)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Drawer */}
      {showAddModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Add New Supplier</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setShowAddModal(false)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <form id="add-supplier-form" onSubmit={handleAddSupplier} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Supplier Name *</label>
                    <input 
                      type="text" 
                      value={newSupplier.name} 
                      onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} 
                      required 
                      placeholder="e.g. Rahim Text" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'কোম্পানি / ব্র্যান্ড নেম' : 'Company / Brand Name'}
                    </label>
                    <input 
                      type="text" 
                      value={newSupplier.company} 
                      onChange={e => setNewSupplier({...newSupplier, company: e.target.value})} 
                      placeholder={language === 'bn' ? 'যেমন: বাটা, এপেক্স, রহিম টেক্স' : 'e.g. Bata, Apex, Rahim Group'} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Phone Number</label>
                    <input 
                      type="text" 
                      value={newSupplier.phone} 
                      onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} 
                      placeholder="e.g. 01712345678" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Email Address</label>
                    <input 
                      type="email" 
                      value={newSupplier.email} 
                      onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} 
                      placeholder="e.g. rahim@example.com" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                    <input 
                      type="text" 
                      value={newSupplier.location} 
                      onChange={e => setNewSupplier({...newSupplier, location: e.target.value})} 
                      placeholder="e.g. Dhaka" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Opening Balance (Due)</label>
                    <input 
                      type="number" 
                      value={newSupplier.due} 
                      onChange={e => setNewSupplier({...newSupplier, due: e.target.value})} 
                      placeholder="e.g. 5000" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Notes / Remarks</label>
                    <textarea 
                      value={newSupplier.notes} 
                      onChange={e => setNewSupplier({...newSupplier, notes: e.target.value})} 
                      placeholder="Any additional information..." 
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Supplier</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Supplier Drawer */}
      {editingPerson && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Edit Supplier</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setEditingPerson(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <form id="edit-supplier-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'সাপ্লায়ারের নাম' : 'Supplier Name'} *
                    </label>
                    <input 
                      type="text" 
                      value={editingPerson.name} 
                      onChange={e => setEditingPerson({...editingPerson, name: e.target.value})} 
                      required 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'কোম্পানি / ব্র্যান্ড নেম' : 'Company / Brand Name'}
                    </label>
                    <input 
                      type="text" 
                      value={editingPerson.company || ''} 
                      onChange={e => setEditingPerson({...editingPerson, company: e.target.value})} 
                      placeholder={language === 'bn' ? 'যেমন: বাটা, এপেক্স, রহিম টেক্স' : 'e.g. Bata, Apex, Rahim Group'}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'ফোন নম্বর' : 'Phone Number'}
                    </label>
                    <input 
                      type="text" 
                      value={editingPerson.phone || ''} 
                      onChange={e => setEditingPerson({...editingPerson, phone: e.target.value})} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'ঠিকানা / লোকেশন' : 'Location / Address'}
                    </label>
                    <input 
                      type="text" 
                      value={editingPerson.location || ''} 
                      onChange={e => setEditingPerson({...editingPerson, location: e.target.value})} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {language === 'bn' ? 'বর্তমান বাকি' : 'Total Due'} (BDT)
                    </label>
                    <input 
                      type="number" 
                      value={editingPerson.due} 
                      onChange={e => setEditingPerson({...editingPerson, due: e.target.value})} 
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setEditingPerson(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Print Single Person Drawer */}
      {selectedPerson && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h3 style={{ margin: 0 }}>Supplier Statement</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedPerson(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-person" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   {(selectedPerson.is_deleted || activeTab === 'Deleted') ? 'Deleted Supplier Due & Transaction Statement' : 'Supplier Statement'}<br/>
                   Date: {new Date().toLocaleDateString()}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <p style={{ margin: 0 }}><strong>Name:</strong> {selectedPerson.name}</p>
                     {(selectedPerson.is_deleted || activeTab === 'Deleted') && (
                       <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: 'bold' }}>
                         {language === 'bn' ? 'মুছে ফেলা হিস্ট্রি (আর্কাইভ)' : 'Deleted Supplier Record'}
                       </span>
                     )}
                   </div>
                   <p style={{ margin: 0 }}><strong>Phone:</strong> {selectedPerson.phone || 'N/A'}</p>
                   {selectedPerson.company && (
                     <p style={{ margin: 0 }}>
                       <strong>{language === 'bn' ? 'ব্র্যান্ড / কোম্পানি:' : 'Company / Brand:'}</strong> {selectedPerson.company}
                     </p>
                   )}
                   {selectedPerson.deleted_at && (
                     <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
                       <strong>{language === 'bn' ? 'মুছে ফেলার তারিখ:' : 'Deleted At:'}</strong> {new Date(selectedPerson.deleted_at).toLocaleString()}
                     </p>
                   )}
                   <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                   
                   <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-color)', marginTop: '1rem' }}>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Purchase (মাল কেনা)</p>
                       <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>৳{totalPurchased.toLocaleString()}</p>
                     </div>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Paid (জমা)</p>
                       <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--success)' }}>৳{totalPaid.toLocaleString()}</p>
                     </div>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Current Due (বাকি)</p>
                       <p style={{ fontSize: '1.05rem', fontWeight: 700, color: selectedPerson.due > 0 ? 'var(--danger)' : 'var(--success)' }}>৳{selectedPerson.due.toLocaleString()}</p>
                     </div>
                   </div>
                   
                   {selectedPersonTransactions.length > 0 && (
                     <div style={{ marginTop: '1.5rem' }}>
                       <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Transaction History (লেনদেন)</h4>
                       <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                         <thead>
                           <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                             <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                             <th style={{ padding: '0.5rem', textAlign: 'left' }}>Details</th>
                             <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                           </tr>
                         </thead>
                         <tbody>
                           {selectedPersonTransactions.map(t => (
                             <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                               <td style={{ padding: '0.5rem' }}>{new Date(t.date).toLocaleDateString()}</td>
                               <td style={{ padding: '0.5rem' }}>{t.description}</td>
                               <td style={{ padding: '0.5rem', textAlign: 'right', color: t.isCredit ? 'red' : 'green' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                                    <span>{t.isCredit ? '+' : '-'}৳{t.amount.toLocaleString()}</span>
                                    {!t.isCredit && (
                                      <button
                                        type="button"
                                        className="btn-icon"
                                        title={language === 'bn' ? 'ভাউচার প্রিন্ট করুন' : 'Print Payment Voucher'}
                                        style={{ width: '22px', height: '22px', padding: 0, color: 'var(--primary)' }}
                                        onClick={() => setReceiptModal({
                                          show: true,
                                          settlement: {
                                            id: t.id,
                                            amount: t.amount,
                                            date: t.date,
                                            type: 'Supplier',
                                            targetId: selectedPerson.id,
                                            partyName: selectedPerson.name,
                                          },
                                          party: selectedPerson,
                                        })}
                                      >
                                        <Printer size={13} />
                                      </button>
                                    )}
                                  </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   )}
                 </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                 printElement('printable-single-person', 'Suppliers');
              }}>
                <Printer size={20} /> Print Document
              </button>
              {(selectedPerson.is_deleted || activeTab === 'Deleted') && (
                <>
                  <button 
                    className="btn-outline flex-align-gap" 
                    style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '99px', color: '#059669', borderColor: '#059669' }}
                    onClick={async () => {
                      await handleRestore(selectedPerson.id);
                      setSelectedPerson(null);
                    }}
                  >
                    <RotateCcw size={18} /> {language === 'bn' ? 'সাপ্লায়ার রিস্টোর করুন' : 'Restore Supplier'}
                  </button>
                  <button 
                    className="btn-outline flex-align-gap" 
                    style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '99px', color: '#dc2626', borderColor: '#dc2626' }}
                    onClick={async () => {
                      await handlePermanentDelete(selectedPerson.id, selectedPerson.name);
                      setSelectedPerson(null);
                    }}
                  >
                    <Trash2 size={18} /> {language === 'bn' ? 'স্থায়ীভাবে মুছুন' : 'Permanently Delete'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settle Due Drawer */}
      {settleModal.show && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '420px' }}>
            <div className="drawer-header">
              <h2>{language === 'bn' ? 'সাপ্লায়ার বকেয়া পরিশোধ' : 'Settle Supplier Due'}</h2>
              <button className="drawer-close-btn" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' })}>
                <X size={20} />
              </button>
            </div>
            <form id="settle-supplier-form" onSubmit={handleSettle} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <p className="mb-4 text-muted">
                  {language === 'bn' ? 'বর্তমান বাকি:' : 'Current Due:'} <strong className="text-danger">৳{settleModal.target?.due?.toLocaleString()}</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'পরিশোধের পরিমাণ' : 'Amount to Pay'} (BDT)</label>
                    <input 
                      type="number" 
                      className="w-full" 
                      value={settleModal.amount} 
                      onChange={e => setSettleModal({...settleModal, amount: e.target.value})} 
                      required 
                      min="1"
                      max={settleModal.target?.due}
                      step="any"
                      placeholder="e.g. 5000"
                    />
                    <small className="text-muted">{language === 'bn' ? 'সাপ্লায়ারকে বকেয়া পরিশোধের পরিমাণ লিখুন।' : 'Enter the amount you are paying to clear the due.'}</small>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'তারিখ' : 'Date'}</label>
                    <input 
                      type="date" 
                      className="w-full" 
                      value={settleModal.date} 
                      onChange={e => setSettleModal({...settleModal, date: e.target.value})} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}</label>
                    <select
                      className="w-full"
                      value={settleModal.method || 'Cash'}
                      onChange={e => setSettleModal({...settleModal, method: e.target.value})}
                    >
                      <option value="Cash">{language === 'bn' ? 'ক্যাশ (নগদ)' : 'Cash'}</option>
                      <option value="Bank">{language === 'bn' ? 'ব্যাংক ট্রান্সফার' : 'Bank Transfer'}</option>
                      <option value="bKash">bKash (বিকাশ)</option>
                      <option value="Nagad">Nagad (নগদ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'মন্তব্য (ঐচ্ছিক)' : 'Notes / Reference'}</label>
                    <input
                      type="text"
                      className="w-full"
                      placeholder={language === 'bn' ? 'যেমন: চেক নং বা লেনদেন রেফারেন্স' : 'e.g. Check / Txn reference'}
                      value={settleModal.notes || ''}
                      onChange={e => setSettleModal({...settleModal, notes: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' })}>{language === 'bn' ? 'বাতিল' : 'Cancel'}</button>
                <button type="submit" className="btn-primary">{language === 'bn' ? 'পরিশোধ ও ভাউচার তৈরি' : 'Confirm & Generate Voucher'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Supplier Payment Voucher Modal */}
      {receiptModal.show && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-container card animate-scale-up" style={{ maxWidth: '750px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div className="modal-header" style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                <Printer size={18} className="text-primary" />
                {language === 'bn' ? 'পেমেন্ট ভাউচার (Payment Voucher)' : 'Payment Voucher'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-primary flex-align-gap"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => printElement('printable-supplier-voucher', `Voucher-${receiptModal.settlement?.id}`, { isThermal: false })}
                >
                  <Printer size={14} /> {language === 'bn' ? 'A4 প্রিন্ট' : 'Print A4'}
                </button>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => printElement('printable-supplier-voucher-thermal', `Voucher-${receiptModal.settlement?.id}`, { isThermal: true })}
                >
                  <Receipt size={14} /> {language === 'bn' ? 'থার্মাল প্রিন্ট' : 'Thermal (80mm)'}
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setReceiptModal({ show: false, settlement: null, party: null })}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: '1.25rem', background: 'var(--bg-subtle)' }}>
              {/* On-screen Standard Preview */}
              <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 4px 18px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <PrintablePayment
                  settlement={receiptModal.settlement}
                  party={receiptModal.party}
                  shopProfile={shopProfile}
                  operatorName={user?.name || user?.username || 'Admin'}
                  domId="printable-supplier-voucher"
                  isThermal={false}
                  language={language}
                />
              </div>

              {/* Hidden Thermal Element for printElement */}
              <div style={{ display: 'none' }}>
                <PrintablePayment
                  settlement={receiptModal.settlement}
                  party={receiptModal.party}
                  shopProfile={shopProfile}
                  operatorName={user?.name || user?.username || 'Admin'}
                  domId="printable-supplier-voucher-thermal"
                  isThermal={true}
                  language={language}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                {language === 'bn' ? 'ভাউচারটি প্রিন্ট করে সাপ্লায়ারকে প্রদান করুন।' : 'Print this voucher for supplier records.'}
              </span>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setReceiptModal({ show: false, settlement: null, party: null })}
              >
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Suppliers;
