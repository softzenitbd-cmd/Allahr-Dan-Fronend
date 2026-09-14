import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, MessageSquare, Phone, Printer, Eye, Plus, Edit, Trash2, RotateCcw, History, Receipt, X } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import PrintablePayment from '../components/PrintablePayment';

const Customers = () => {
  const {
    customers,
    deletedCustomers,
    suppliers,
    deletedSuppliers,
    settleCustomerDue,
    settleSupplierDue,
    sales,
    purchases,
    settlements,
    sendSms,
    language,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    restoreCustomer,
    permanentDeleteCustomer,
    updateSupplier,
    deleteSupplier,
    restoreSupplier,
    permanentDeleteSupplier,
    refresh,
    ensureLoaded,
    shopProfile,
    user
  } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Customer'); // Customer, Supplier, or Deleted
  const [deletedType, setDeletedType] = useState('Customer'); // Customer or Supplier in Deleted tab
  const [smsModal, setSmsModal] = useState({ show: false, target: null, message: '' });
  const [settleModal, setSettleModal] = useState({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' });
  const [receiptModal, setReceiptModal] = useState({ show: false, settlement: null, party: null });
  const [selectedPerson, setSelectedPerson] = useState(null);

  // Add/Edit Customer Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', location: '', due: '', notes: '' });

  // Fetch needed slices on mount & refresh deleted lists when switching to Deleted tab
  useEffect(() => {
    ensureLoaded?.('customers', 'suppliers', 'sales', 'purchases', 'settlements');
  }, []);

  useEffect(() => {
    if (activeTab === 'Deleted') {
      refresh?.('deletedCustomers', 'deletedSuppliers');
    }
  }, [activeTab]);

  // Compute Ledger for selected person
  let personLedger = [];
  if (selectedPerson) {
    const isPersonCustomer = (activeTab === 'Customer') ||
      (activeTab === 'Deleted' && (deletedType === 'Customer' || selectedPerson.customer_code)) ||
      Boolean(selectedPerson.customer_code);

    const personSettlements = (settlements || []).filter(s =>
      s.targetId === selectedPerson.id ||
      s.targetId === selectedPerson.customer_code ||
      s.targetId === selectedPerson.supplier_code
    ).map(s => ({
      id: s.id,
      date: s.date,
      description: 'Payment / Settlement',
      amount: s.amount,
      type: 'payment' // decreases due
    }));

    if (isPersonCustomer) {
      const personSales = (sales || [])
        .filter(s => (s.customerId === selectedPerson.id || s.customerId === selectedPerson.customer_code || String(s.customerId) === String(selectedPerson.id)) && Number(s.due_amount) > 0)
        .map(s => ({
          id: s.id,
          date: s.date,
          description: Number(s.paid_amount) > 0
            ? `Partial Sale (${s.items?.length || 0} items) - total ৳${s.total}, paid ৳${s.paid_amount}`
            : `Baki Sale (${s.items?.length || 0} items)`,
          amount: Number(s.due_amount),
          type: 'charge' // increases due
        }));
      personLedger = [...personSales, ...personSettlements];
    } else {
      const personPurchases = (purchases || [])
        .filter(p => (p.supplierId === selectedPerson.id || p.supplierId === selectedPerson.supplier_code || String(p.supplierId) === String(selectedPerson.id)) && Number(p.dueAmount) > 0)
        .map(p => ({
          id: p.id,
          date: p.date,
          description: Number(p.paidAmount) > 0
            ? `Partial Purchase (${p.items?.length || 0} items) - total ৳${p.total}, paid ৳${p.paidAmount}`
            : `Baki Purchase (${p.items?.length || 0} items)`,
          amount: Number(p.dueAmount),
          type: 'charge' // increases due
        }));
      personLedger = [...personPurchases, ...personSettlements];
    }

    // Same day: charges before payments, so a payment never appears to settle
    // a sale that has not been billed yet.
    personLedger.sort((a, b) => {
      const dayA = String(a.date).slice(0, 10);
      const dayB = String(b.date).slice(0, 10);
      if (dayA !== dayB) return dayA < dayB ? -1 : 1;
      if (a.type !== b.type) return a.type === 'charge' ? -1 : 1;
      return String(a.date) < String(b.date) ? -1 : 1;
    });

    // The balance opens at whatever they already owed before any of this, which
    // is what makes the closing figure agree with the due on their record.
    let balance = Number(selectedPerson.opening_due) || 0;
    personLedger = personLedger.map(tx => {
      if (tx.type === 'charge') balance += tx.amount;
      else if (tx.type === 'payment') balance -= tx.amount;
      return { ...tx, balance };
    });
  }

  const currentList = activeTab === 'Customer'
    ? (customers || [])
    : activeTab === 'Supplier'
      ? (suppliers || [])
      : (deletedType === 'Customer' ? (deletedCustomers || []) : (deletedSuppliers || []));

  const filteredList = currentList.filter(
    (person) =>
      (person.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (person.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (person.phone || '').includes(searchTerm) ||
      (person.id || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleSendSMS = async (e) => {
    e.preventDefault();
    const result = await sendSms(smsModal.message, [smsModal.target.id], []);
    if (result?.ok) {
      setSmsModal({ show: false, target: null, message: '' });
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

    const isCustomer = activeTab === 'Customer' || (!activeTab.includes('Supplier') && !targetObj.supplier_code);

    const res = isCustomer
      ? await settleCustomerDue(targetObj.id, amount, dateToUse, { method: methodToUse, notes: notesToUse })
      : await settleSupplierDue(targetObj.id, amount, dateToUse, { method: methodToUse, notes: notesToUse });

    if (res?.ok) {
      toast.success(
        language === 'bn'
          ? `${targetObj.name}-এর ৳${amount.toLocaleString()} সফলভাবে সমন্বয় করা হয়েছে!`
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
        type: isCustomer ? 'Customer' : 'Supplier',
        targetId: targetObj.id,
        partyName: targetObj.name,
      };

      setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' });
      setReceiptModal({ show: true, settlement: settlementObj, party: targetObj });
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name?.trim()) {
      toast.error(language === 'bn' ? 'কাস্টমারের নাম দেওয়া আবশ্যক!' : 'Name is required');
      return;
    }
    const customerToSave = {
      ...newCustomer,
      name: newCustomer.name.trim(),
      due: parseFloat(newCustomer.due) || 0,
    };
    const res = await addCustomer(customerToSave);
    if (res?.ok) {
      setNewCustomer({ name: '', phone: '', location: '', due: '', notes: '' });
      setShowAddModal(false);
      showSuccessAlert(language === 'bn' ? 'কাস্টমার সফলভাবে যুক্ত হয়েছে!' : 'Customer added successfully!');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingPerson.name?.trim()) {
      toast.error(language === 'bn' ? 'কাস্টমারের নাম দেওয়া আবশ্যক!' : 'Name is required');
      return;
    }
    const due = parseFloat(editingPerson.due) || 0;
    const payload = {
      ...editingPerson,
      name: editingPerson.name.trim(),
      company: (editingPerson.company || '').trim(),
      due,
    };
    const res = activeTab === 'Customer'
      ? await updateCustomer(editingPerson.id, payload)
      : await updateSupplier(editingPerson.id, payload);

    if (res?.ok) {
      setEditingPerson(null);
      showSuccessAlert(language === 'bn' ? 'তথ্য সফলভাবে আপডেট হয়েছে!' : 'Updated successfully!');
    }
  };

  const handleDelete = async (id, isSupplier = activeTab === 'Supplier') => {
    const isConfirmed = await showConfirmDialog({
      title: isSupplier
        ? (language === 'bn' ? 'সাপ্লায়ার মুছে ফেলবেন?' : 'Delete Supplier?')
        : (language === 'bn' ? 'কাস্টমার মুছে ফেলবেন?' : 'Delete Customer?'),
      text: isSupplier
        ? (language === 'bn'
          ? 'আপনি কি নিশ্চিত এই সাপ্লায়ার মুছে ফেলতে চান? মুছে ফেলা হলেও তার সকল ক্রয় ও লেনদেনের হিস্ট্রি সংরক্ষিত থাকবে এবং Deleted History ট্যাব থেকে যেকোনো সময় দেখা যাবে।'
          : 'Are you sure you want to delete this supplier? Full purchase and transaction history will be safely preserved in the Deleted History tab.')
        : (language === 'bn'
          ? 'আপনি কি নিশ্চিত এই কাস্টমার মুছে ফেলতে চান? মুছে ফেলা হলেও তার সকল সেলস ও লেনদেনের হিস্ট্রি সংরক্ষিত থাকবে এবং Deleted History ট্যাব থেকে যেকোনো সময় দেখা যাবে।'
          : 'Are you sure you want to delete this customer? Full transaction and sales history will be safely preserved in the Deleted History tab.'),
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = isSupplier ? await deleteSupplier(id) : await deleteCustomer(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'সফলভাবে মুছে ফেলা হয়েছে এবং হিস্ট্রিতে সংরক্ষিত রয়েছে!' : 'Deleted successfully! History is saved in Deleted History tab.');
      }
    }
  };

  const handleRestore = async (id, isSupplier = (activeTab === 'Deleted' ? deletedType === 'Supplier' : activeTab === 'Supplier')) => {
    const isConfirmed = await showConfirmDialog({
      title: isSupplier
        ? (language === 'bn' ? 'সাপ্লায়ার রিস্টোর করবেন?' : 'Restore Supplier?')
        : (language === 'bn' ? 'কাস্টমার রিস্টোর করবেন?' : 'Restore Customer?'),
      text: isSupplier
        ? (language === 'bn'
          ? 'এই সাপ্লায়ারকে কি পুনরায় সক্রিয় (Active) তালিকায় ফিরিয়ে আনতে চান?'
          : 'Do you want to restore this supplier back to active status?')
        : (language === 'bn'
          ? 'এই কাস্টমারকে কি পুনরায় সক্রিয় (Active) তালিকায় ফিরিয়ে আনতে চান?'
          : 'Do you want to restore this customer back to active status?'),
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, রিস্টোর' : 'Yes, restore',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: false,
    });
    if (isConfirmed) {
      const res = isSupplier ? await restoreSupplier(id) : await restoreCustomer(id);
      if (res?.ok) {
        showSuccessAlert(isSupplier
          ? (language === 'bn' ? 'সাপ্লায়ার সফলভাবে রিস্টোর হয়েছে!' : 'Supplier restored successfully!')
          : (language === 'bn' ? 'কাস্টমার সফলভাবে রিস্টোর হয়েছে!' : 'Customer restored successfully!')
        );
      }
    }
  };

  const handlePermanentDelete = async (id, name, isSupplier = (activeTab === 'Deleted' ? deletedType === 'Supplier' : activeTab === 'Supplier')) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'স্থায়ীভাবে মুছে ফেলবেন?' : 'Permanently Delete?',
      text: isSupplier
        ? (language === 'bn'
          ? `আপনি কি নিশ্চিত '${name}' সাপ্লায়ারকে ডাটাবেজ থেকে সম্পূর্ণ স্থায়ীভাবে মুছে ফেলতে চান? এই কাজটি আর কখনই ফিরিয়ে আনা যাবে না!`
          : `Are you sure you want to permanently delete supplier '${name}' from the database? This action CANNOT be undone!`)
        : (language === 'bn'
          ? `আপনি কি নিশ্চিত '${name}' কাস্টমারকে ডাটাবেজ থেকে সম্পূর্ণ স্থায়ীভাবে মুছে ফেলতে চান? এই কাজটি আর কখনই ফিরিয়ে আনা যাবে না!`
          : `Are you sure you want to permanently delete customer '${name}' from the database? This action CANNOT be undone!`),
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, স্থায়ীভাবে মুছুন' : 'Yes, Delete Permanently',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = isSupplier ? await permanentDeleteSupplier(id) : await permanentDeleteCustomer(id);
      if (res?.ok) {
        showSuccessAlert(isSupplier
          ? (language === 'bn' ? 'সাপ্লায়ার স্থায়ীভাবে মুছে ফেলা হয়েছে!' : 'Supplier permanently deleted!')
          : (language === 'bn' ? 'কাস্টমার স্থায়ীভাবে মুছে ফেলা হয়েছে!' : 'Customer permanently deleted!')
        );
      }
    }
  };

  return (
    <div className="customers-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Customers & Dues')}</h1>
          <p className="text-muted">{language === 'bn' ? 'কাস্টমার এবং সাপ্লায়ারদের বকেয়া ম্যানেজ করুন।' : 'Manage Baki (Due) for both customers and suppliers. Send SMS reminders.'}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-toolbar" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="segmented-control" style={{ maxWidth: '540px' }}>
            <button
              className={activeTab === 'Customer' ? 'active' : ''}
              onClick={() => setActiveTab('Customer')}
            >
              {t(language, 'Customers Due')} ({customers?.length || 0})
            </button>
            <button
              className={activeTab === 'Supplier' ? 'active' : ''}
              onClick={() => setActiveTab('Supplier')}
            >
              {t(language, 'Suppliers Due')} ({suppliers?.length || 0})
            </button>
            <button
              className={activeTab === 'Deleted' ? 'active' : ''}
              onClick={() => setActiveTab('Deleted')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <History size={14} />
              {language === 'bn' ? 'মুছে ফেলা হিস্ট্রি' : 'Deleted History'} {((deletedCustomers?.length || 0) + (deletedSuppliers?.length || 0)) > 0 ? `(${((deletedCustomers?.length || 0) + (deletedSuppliers?.length || 0))})` : ''}
            </button>
          </div>

          {activeTab === 'Deleted' && (
            <div className="segmented-control" style={{ maxWidth: '320px' }}>
              <button
                className={deletedType === 'Customer' ? 'active' : ''}
                onClick={() => setDeletedType('Customer')}
              >
                {language === 'bn' ? 'কাস্টমার' : 'Customers'} ({deletedCustomers?.length || 0})
              </button>
              <button
                className={deletedType === 'Supplier' ? 'active' : ''}
                onClick={() => setDeletedType('Supplier')}
              >
                {language === 'bn' ? 'সাপ্লায়ার' : 'Suppliers'} ({deletedSuppliers?.length || 0})
              </button>
            </div>
          )}

          <div className="search-bar">
            <Search size={18} className="text-muted" />
            <input
              type="text"
              placeholder={t(language, 'Search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {activeTab === 'Customer' && (
              <button className="btn-primary flex-align-gap" onClick={() => setShowAddModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                New Customer
              </button>
            )}
            <button className="btn-outline flex-align-gap" onClick={() => {
              printElement('printable-customers-list', 'Customers');
            }}>
              <Printer size={16} /> Print List
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t(language, 'Name')}</th>
                {activeTab === 'Supplier' && <th>{language === 'bn' ? 'ব্র্যান্ড / কোম্পানি' : 'Brand / Company'}</th>}
                <th>{t(language, 'Phone')}</th>
                <th>{t(language, 'Total Due')}</th>
                {activeTab === 'Deleted' && <th>{language === 'bn' ? 'মুছে ফেলার তারিখ' : 'Deleted At'}</th>}
                <th>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan={activeTab === 'Supplier' ? 6 : (activeTab === 'Deleted' ? 6 : 5)} className="text-center text-muted">{language === 'bn' ? 'কোনো রেকর্ড পাওয়া যায়নি।' : 'No records found.'}</td></tr>
              ) : (
                filteredList.map((person) => {
                  const isSupplierRow = activeTab === 'Supplier' || (activeTab === 'Deleted' && (deletedType === 'Supplier' || Boolean(person.supplier_code)));
                  return (
                    <tr key={person.id}>
                      <td>{person.id}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{person.name}</span>
                          {activeTab === 'Deleted' && (
                            <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>
                              {isSupplierRow ? (language === 'bn' ? 'মুছে ফেলা সাপ্লায়ার' : 'Deleted Supplier') : (language === 'bn' ? 'মুছে ফেলা কাস্টমার' : 'Deleted Customer')}
                            </span>
                          )}
                        </div>
                      </td>
                      {activeTab === 'Supplier' && (
                        <td>
                          {person.company ? (
                            <span className="badge badge-secondary" style={{ fontSize: '0.8rem', padding: '2px 6px' }}>
                              {person.company}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      )}
                      <td className="flex-align-gap"><Phone size={14} className="text-muted" /> {person.phone || '-'}</td>
                      <td><span className="text-danger font-bold">৳{person.due}</span></td>
                      {activeTab === 'Deleted' && (
                        <td style={{ fontSize: '0.85rem', color: '#666' }}>
                          {person.deleted_at ? new Date(person.deleted_at).toLocaleString() : '-'}
                        </td>
                      )}
                      <td>
                        <div className="action-buttons flex-align-gap" style={{ flexWrap: 'nowrap' }}>
                          <button
                            className="btn-outline flex-align-gap"
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem', color: 'var(--primary)', borderColor: 'rgba(59,130,246,0.35)', fontWeight: 600 }}
                            title={language === 'bn' ? 'কাস্টমারের হিস্ট্রি ও লেজার দেখুন (Details)' : 'View Details & Ledger'}
                            onClick={() => setSelectedPerson(person)}
                          >
                            <Eye size={14} /> Details
                          </button>
                          {activeTab !== 'Deleted' && (
                            <>
                              <button className="btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setSettleModal({ show: true, target: person, amount: person.due, date: new Date().toISOString().split('T')[0] })}>{t(language, 'Settle Due' || 'Settle')}</button>
                              {activeTab === 'Customer' && (
                                <button
                                  className="btn-primary flex-align-gap" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                                  onClick={() => setSmsModal({ show: true, target: person, message: `Dear ${person.name}, your due amount is ৳${person.due}. Please settle your account.` })}
                                >
                                  <MessageSquare size={14} /> SMS
                                </button>
                              )}
                              <button className="btn-icon text-info" title="Edit" onClick={() => setEditingPerson({ ...person })}>
                                <Edit size={16} />
                              </button>
                              <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(person.id, isSupplierRow)}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          {activeTab === 'Deleted' && (
                            <>
                              <button
                                className="btn-outline flex-align-gap"
                                style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: '#059669', borderColor: '#059669' }}
                                title={isSupplierRow ? (language === 'bn' ? 'সাপ্লায়ার রিস্টোর করুন' : 'Restore Supplier') : (language === 'bn' ? 'কাস্টমার রিস্টোর করুন' : 'Restore Customer')}
                                onClick={() => handleRestore(person.id, isSupplierRow)}
                              >
                                <RotateCcw size={14} /> {language === 'bn' ? 'রিস্টোর' : 'Restore'}
                              </button>
                              <button
                                className="btn-icon text-danger"
                                title={language === 'bn' ? 'স্থায়ীভাবে মুছে ফেলুন' : 'Permanently Delete'}
                                onClick={() => handlePermanentDelete(person.id, person.name, isSupplierRow)}
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

      {/* Hidden Printable List (Excel Style) */}
      <div id="printable-customers-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '1.5rem', color: '#333' }}>
            {activeTab === 'Customer' ? 'Customers' : 'Suppliers'} Due List
          </p>

          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>ID</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Name</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Phone</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Due (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length > 0 ? filteredList.map((person) => (
                <tr key={person.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{person.id}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{person.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{person.phone}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{person.due.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" style={{ border: '1px solid #ccc', padding: '1rem', textAlign: 'center' }}>No records found.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="3" style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Due:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: 'red' }}>
                  ৳{filteredList.reduce((sum, item) => sum + item.due, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Settle Due Drawer */}
      {settleModal.show && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '420px' }}>
            <div className="drawer-header">
              <h2>{t(language, 'Settle Due')}</h2>
              <button className="drawer-close-btn" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' })}>
                <X size={20} />
              </button>
            </div>
            <form id="settle-form" onSubmit={handleSettle} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <p className="mb-4 text-muted">
                  {language === 'bn' ? 'বর্তমান বকেয়া:' : 'Current Due:'} <strong className="text-danger">৳{settleModal.target?.due}</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'পরিশোধের পরিমাণ' : 'Amount to Settle'} (BDT)</label>
                    <input
                      type="number"
                      className="w-full"
                      value={settleModal.amount}
                      onChange={e => setSettleModal({ ...settleModal, amount: e.target.value })}
                      required
                      min="1"
                      max={settleModal.target?.due}
                      step="any"
                      placeholder="e.g. 1000"
                    />
                    <small className="text-muted">{language === 'bn' ? 'বকেয়া পরিশোধের পরিমাণ লিখুন।' : 'Enter the amount they are paying to clear the due.'}</small>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Date')}</label>
                    <input
                      type="date"
                      className="w-full"
                      value={settleModal.date}
                      onChange={e => setSettleModal({ ...settleModal, date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{language === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}</label>
                    <select
                      className="w-full"
                      value={settleModal.method || 'Cash'}
                      onChange={e => setSettleModal({ ...settleModal, method: e.target.value })}
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
                      onChange={e => setSettleModal({ ...settleModal, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '', method: 'Cash', notes: '' })}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{language === 'bn' ? 'পরিশোধ ও রসিদ তৈরি' : 'Confirm & Generate Receipt'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Settle Due Money Receipt / Payment Voucher Modal */}
      {receiptModal.show && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-container card animate-scale-up" style={{ maxWidth: '750px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div className="modal-header" style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                <Printer size={18} className="text-primary" />
                {receiptModal.settlement?.type === 'Supplier'
                  ? (language === 'bn' ? 'পেমেন্ট ভাউচার (Payment Voucher)' : 'Payment Voucher')
                  : (language === 'bn' ? 'টাকা জমার রসিদ (Money Receipt)' : 'Money Receipt')}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-primary flex-align-gap"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => printElement('printable-payment-receipt', `Receipt-${receiptModal.settlement?.id}`, { isThermal: false })}
                >
                  <Printer size={14} /> {language === 'bn' ? 'A4 প্রিন্ট' : 'Print A4'}
                </button>
                <button
                  type="button"
                  className="btn-outline flex-align-gap"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => printElement('printable-payment-receipt-thermal', `Receipt-${receiptModal.settlement?.id}`, { isThermal: true })}
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
                  domId="printable-payment-receipt"
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
                  domId="printable-payment-receipt-thermal"
                  isThermal={true}
                  language={language}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                {language === 'bn' ? 'রসিদটি প্রিন্ট করে কাস্টমার বা সাপ্লায়ারকে প্রদান করুন।' : 'Print this receipt for customer or supplier records.'}
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

      {/* Add Customer Drawer */}
      {showAddModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Add New Customer</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setShowAddModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form id="add-customer-form" onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Customer Name *</label>
                    <input
                      type="text"
                      value={newCustomer.name}
                      onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      placeholder="e.g. Rahim Rahman"
                      required
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Phone Number</label>
                    <input
                      type="text"
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      placeholder="e.g. 01712345678"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                    <input
                      type="text"
                      value={newCustomer.location}
                      onChange={e => setNewCustomer({ ...newCustomer, location: e.target.value })}
                      placeholder="e.g. Dhaka"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Opening Balance (Due)</label>
                    <input
                      type="number"
                      value={newCustomer.due}
                      onChange={e => setNewCustomer({ ...newCustomer, due: e.target.value })}
                      placeholder="e.g. 5000"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Notes / Remarks</label>
                    <textarea
                      value={newCustomer.notes}
                      onChange={e => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                      placeholder="Any additional information..."
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Customer</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Person Drawer */}
      {editingPerson && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Edit {activeTab === 'Customer' ? 'Customer' : 'Supplier'}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setEditingPerson(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form id="edit-person-form" onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Name *</label>
                    <input
                      type="text"
                      value={editingPerson.name}
                      onChange={e => setEditingPerson({ ...editingPerson, name: e.target.value })}
                      required
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Phone Number</label>
                    <input
                      type="text"
                      value={editingPerson.phone || ''}
                      onChange={e => setEditingPerson({ ...editingPerson, phone: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  {activeTab === 'Customer' && (
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                      <input
                        type="text"
                        value={editingPerson.location || ''}
                        onChange={e => setEditingPerson({ ...editingPerson, location: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                  {activeTab === 'Supplier' && (
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>
                        {language === 'bn' ? 'কোম্পানি / ব্র্যান্ড নেম' : 'Company / Brand Name'}
                      </label>
                      <input
                        type="text"
                        value={editingPerson.company || ''}
                        onChange={e => setEditingPerson({ ...editingPerson, company: e.target.value })}
                        placeholder={language === 'bn' ? 'যেমন: বাটা, এপেক্স' : 'e.g. Bata, Apex'}
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Total Due (BDT)</label>
                    <input
                      type="number"
                      value={editingPerson.due}
                      onChange={e => setEditingPerson({ ...editingPerson, due: e.target.value })}
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

      {/* SMS Drawer */}
      {smsModal.show && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>Send SMS</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setSmsModal({ show: false, target: null, message: '' })}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form id="sms-form" onSubmit={handleSendSMS} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <p className="mb-4 text-muted">To: {smsModal.target?.name} ({smsModal.target?.phone})</p>
                <textarea
                  className="w-full"
                  rows="4"
                  value={smsModal.message}
                  onChange={(e) => setSmsModal({ ...smsModal, message: e.target.value })}
                  required
                />
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setSmsModal({ show: false, target: null, message: '' })}>Cancel</button>
                <button type="submit" className="btn-primary flex-align-gap"><MessageSquare size={16} /> Send</button>
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
              <h3 style={{ margin: 0 }}>Due Statement</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedPerson(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              {(() => {
                const isSelectedSupplier = activeTab === 'Supplier' || (activeTab === 'Deleted' && (deletedType === 'Supplier' || Boolean(selectedPerson.supplier_code)));
                return (
                  <div id="printable-single-person" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                      {(selectedPerson.is_deleted || activeTab === 'Deleted')
                        ? (isSelectedSupplier ? 'Deleted Supplier Due & Transaction Statement' : 'Deleted Customer Due & Transaction Statement')
                        : (isSelectedSupplier ? 'Supplier Due Statement' : 'Due Statement')
                      }<br />
                      Date: {new Date().toLocaleDateString()}
                    </p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

                    <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <p style={{ margin: 0 }}><strong>Name:</strong> {selectedPerson.name}</p>
                        {(selectedPerson.is_deleted || activeTab === 'Deleted') && (
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: 'bold' }}>
                            {isSelectedSupplier
                              ? (language === 'bn' ? 'মুছে ফেলা সাপ্লায়ার হিস্ট্রি (আর্কাইভ)' : 'Deleted Supplier Record')
                              : (language === 'bn' ? 'মুছে ফেলা কাস্টমার হিস্ট্রি (আর্কাইভ)' : 'Deleted Customer Record')
                            }
                          </span>
                        )}
                      </div>
                      <p><strong>Phone:</strong> {selectedPerson.phone || '-'}</p>
                      <p><strong>Type:</strong> {
                        selectedPerson.is_deleted || activeTab === 'Deleted'
                          ? (isSelectedSupplier ? (language === 'bn' ? 'সাপ্লায়ার (মুছে ফেলা হিস্ট্রি)' : 'Supplier (Deleted Record)') : (language === 'bn' ? 'কাস্টমার (মুছে ফেলা হিস্ট্রি)' : 'Customer (Deleted Record)'))
                          : (isSelectedSupplier ? (language === 'bn' ? 'সাপ্লায়ার' : 'Supplier') : (language === 'bn' ? 'কাস্টমার' : 'Customer'))
                      }</p>
                      {selectedPerson.deleted_at && (
                        <p style={{ fontSize: '0.85rem', color: '#666' }}>
                          <strong>{language === 'bn' ? 'মুছে ফেলার তারিখ:' : 'Deleted At:'}</strong> {new Date(selectedPerson.deleted_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#000' }}>Transaction Ledger</h4>
                    <table style={{ width: '100%', fontSize: '0.8rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Date</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Description</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Charge (Baki)</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Payment (Settle)</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personLedger.length > 0 ? (
                          personLedger.map((tx) => (
                            <tr key={tx.id}>
                              <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{new Date(tx.date).toLocaleDateString()}</td>
                              <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{tx.description}</td>
                              <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', color: tx.type === 'charge' ? 'red' : 'inherit' }}>
                                {tx.type === 'charge' ? `৳${tx.amount.toLocaleString()}` : '-'}
                              </td>
                              <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', color: tx.type === 'payment' ? 'green' : 'inherit' }}>
                                {tx.type === 'payment' ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                                    <span>৳{tx.amount.toLocaleString()}</span>
                                    <button
                                      type="button"
                                      className="btn-icon"
                                      title={language === 'bn' ? 'রসিদ প্রিন্ট করুন' : 'Print Payment Receipt'}
                                      style={{ width: '22px', height: '22px', padding: 0, color: 'var(--primary)' }}
                                      onClick={() => setReceiptModal({
                                        show: true,
                                        settlement: {
                                          id: tx.id,
                                          amount: tx.amount,
                                          date: tx.date,
                                          remainingDue: Math.max(0, tx.balance),
                                          previousDue: Math.max(0, tx.balance) + tx.amount,
                                          type: isSelectedSupplier ? 'Supplier' : 'Customer',
                                          targetId: selectedPerson.id,
                                          partyName: selectedPerson.name,
                                        },
                                        party: selectedPerson,
                                      })}
                                    >
                                      <Printer size={13} />
                                    </button>
                                  </div>
                                ) : '-'}
                              </td>
                              <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>
                                ৳{Math.max(0, tx.balance).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" style={{ border: '1px solid #ccc', padding: '1rem', textAlign: 'center', color: '#666' }}>No transactions found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                      <p style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'red' }}><strong>Current Due:</strong> ৳{selectedPerson.due.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                printElement('printable-single-person', 'Customers');
              }}>
                <Printer size={20} /> Print Document
              </button>
              {(selectedPerson.is_deleted || activeTab === 'Deleted') && (() => {
                const isSelectedSupplier = activeTab === 'Supplier' || (activeTab === 'Deleted' && (deletedType === 'Supplier' || Boolean(selectedPerson.supplier_code)));
                return (
                  <>
                    <button
                      className="btn-outline flex-align-gap"
                      style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '99px', color: '#059669', borderColor: '#059669' }}
                      onClick={async () => {
                        await handleRestore(selectedPerson.id, isSelectedSupplier);
                        setSelectedPerson(null);
                      }}
                    >
                      <RotateCcw size={18} /> {isSelectedSupplier ? (language === 'bn' ? 'সাপ্লায়ার রিস্টোর করুন' : 'Restore Supplier') : (language === 'bn' ? 'কাস্টমার রিস্টোর করুন' : 'Restore Customer')}
                    </button>
                    <button
                      className="btn-outline flex-align-gap"
                      style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '99px', color: '#dc2626', borderColor: '#dc2626' }}
                      onClick={async () => {
                        await handlePermanentDelete(selectedPerson.id, selectedPerson.name, isSelectedSupplier);
                        setSelectedPerson(null);
                      }}
                    >
                      <Trash2 size={18} /> {language === 'bn' ? 'স্থায়ীভাবে মুছুন' : 'Permanently Delete'}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Customers;
