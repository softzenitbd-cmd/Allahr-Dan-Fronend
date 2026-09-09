import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, MessageSquare, Phone, Printer, Eye, Plus, Edit, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';

const Customers = () => {
  const { customers, suppliers, settleCustomerDue, settleSupplierDue, sales, purchases, settlements, sendSms, language, addCustomer, updateCustomer, deleteCustomer, updateSupplier, deleteSupplier } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Customer'); // Customer or Supplier
  const [smsModal, setSmsModal] = useState({ show: false, target: null, message: '' });
  const [settleModal, setSettleModal] = useState({ show: false, target: null, amount: '', date: '' });
  const [selectedPerson, setSelectedPerson] = useState(null);

  // Add/Edit Customer Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', location: '', due: '', notes: '' });

  // Compute Ledger for selected person
  let personLedger = [];
  if (selectedPerson) {
    const personSettlements = (settlements || []).filter(s => s.targetId === selectedPerson.id).map(s => ({
      id: s.id,
      date: s.date,
      description: 'Payment / Settlement',
      amount: s.amount,
      type: 'payment' // decreases due
    }));

    // What goes on the account is whatever a document left unpaid, whichever
    // payment type produced it. Filtering on 'Baki' hid every partly-paid sale
    // and purchase, and charging the full total over-stated the ones it kept.
    if (activeTab === 'Customer') {
      const personSales = (sales || [])
        .filter(s => s.customerId === selectedPerson.id && Number(s.due_amount) > 0)
        .map(s => ({
          id: s.id,
          date: s.date,
          description: Number(s.paid_amount) > 0
            ? `Partial Sale (${s.items.length} items) - total ৳${s.total}, paid ৳${s.paid_amount}`
            : `Baki Sale (${s.items.length} items)`,
          amount: Number(s.due_amount),
          type: 'charge' // increases due
        }));
      personLedger = [...personSales, ...personSettlements];
    } else {
      const personPurchases = (purchases || [])
        .filter(p => p.supplierId === selectedPerson.id && Number(p.dueAmount) > 0)
        .map(p => ({
          id: p.id,
          date: p.date,
          description: Number(p.paidAmount) > 0
            ? `Partial Purchase (${p.items.length} items) - total ৳${p.total}, paid ৳${p.paidAmount}`
            : `Baki Purchase (${p.items.length} items)`,
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

  const currentList = activeTab === 'Customer' ? customers : suppliers;

  const filteredList = currentList.filter(
    (person) =>
      person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      person.phone.includes(searchTerm)
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
      toast.error('Please enter a valid amount to settle.');
      return;
    }

    const res = activeTab === 'Customer'
      ? await settleCustomerDue(settleModal.target.id, amount, settleModal.date)
      : await settleSupplierDue(settleModal.target.id, amount, settleModal.date);

    if (res?.ok) {
      toast.success(`Successfully settled ৳${amount} for ${settleModal.target.name}`);
      setSettleModal({ show: false, target: null, amount: '', date: '' });
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
    const payload = { ...editingPerson, name: editingPerson.name.trim(), due };
    const res = activeTab === 'Customer' 
      ? await updateCustomer(editingPerson.id, payload)
      : await updateSupplier(editingPerson.id, payload);

    if (res?.ok) {
      setEditingPerson(null);
      showSuccessAlert(language === 'bn' ? 'তথ্য সফলভাবে আপডেট হয়েছে!' : 'Updated successfully!');
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await showConfirmDialog({
      title: language === 'bn' ? 'রেকর্ডটি মুছে ফেলবেন?' : 'Delete Record?',
      text: language === 'bn' ? 'আপনি কি নিশ্চিত এই রেকর্ডটি মুছে ফেলতে চান? এই কাজটি আর ফিরিয়ে আনা যাবে না।' : 'Are you sure you want to delete this record? This action cannot be undone.',
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, delete',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
      isDanger: true,
    });
    if (isConfirmed) {
      const res = activeTab === 'Customer' ? await deleteCustomer(id) : await deleteSupplier(id);
      if (res?.ok) {
        showSuccessAlert(language === 'bn' ? 'সফলভাবে মুছে ফেলা হয়েছে!' : 'Deleted successfully!');
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
        <div className="card-toolbar" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="segmented-control" style={{ maxWidth: '400px' }}>
            <button 
              className={activeTab === 'Customer' ? 'active' : ''}
              onClick={() => setActiveTab('Customer')}
            >
              {t(language, 'Customers Due')}
            </button>
            <button 
              className={activeTab === 'Supplier' ? 'active' : ''}
              onClick={() => setActiveTab('Supplier')}
            >
              {t(language, 'Suppliers Due')}
            </button>
          </div>
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
                <th>{t(language, 'Phone')}</th>
                <th>{t(language, 'Total Due')}</th>
                <th>{t(language, 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted">No records found.</td></tr>
              ) : (
                filteredList.map((person) => (
                  <tr key={person.id}>
                    <td>{person.id}</td>
                    <td>{person.name}</td>
                    <td className="flex-align-gap"><Phone size={14} className="text-muted" /> {person.phone}</td>
                    <td><span className="text-danger font-bold">৳{person.due}</span></td>
                    <td>
                      <div className="action-buttons flex-align-gap" style={{flexWrap:'nowrap'}}>
                        <button className="btn-icon" title="View & Print" onClick={() => setSelectedPerson(person)}>
                          <Printer size={16} />
                        </button>
                        <button className="btn-outline" style={{padding:'0.2rem 0.5rem', fontSize:'0.8rem'}} onClick={() => setSettleModal({ show: true, target: person, amount: person.due, date: new Date().toISOString().split('T')[0] })}>{t(language, 'Settle Due' || 'Settle')}</button>
                        {activeTab === 'Customer' && (
                          <button 
                            className="btn-primary flex-align-gap" style={{padding:'0.2rem 0.5rem', fontSize:'0.8rem'}}
                            onClick={() => setSmsModal({ show: true, target: person, message: `Dear ${person.name}, your due amount is ৳${person.due}. Please settle your account.` })}
                          >
                            <MessageSquare size={14} /> SMS
                          </button>
                        )}
                        <button className="btn-icon text-info" title="Edit" onClick={() => setEditingPerson({...person})}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(person.id)}>
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

      {/* Hidden Printable List (Excel Style) */}
      <div id="printable-customers-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '1.5rem', color: '#333' }}>
            {activeTab === 'Customer' ? 'Customers' : 'Suppliers'} Due List
          </p>
          
          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>ID</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>Name</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>Phone</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>Total Due (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length > 0 ? filteredList.map((person) => (
                <tr key={person.id}>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{person.id}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{person.name}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{person.phone}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>৳{person.due.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" style={{border: '1px solid #ccc', padding: '1rem', textAlign: 'center'}}>No records found.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="3" style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>Total Due:</td>
                <td style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: 'red'}}>
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
          <div className="drawer-container" style={{ maxWidth: '400px' }}>
            <div className="drawer-header">
              <h2>{t(language, 'Settle Due')}</h2>
              <button className="drawer-close-btn" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '' })}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
                      onChange={e => setSettleModal({...settleModal, amount: e.target.value})} 
                      required 
                      min="1"
                      max={settleModal.target?.due}
                      step="any"
                    />
                    <small className="text-muted">{language === 'bn' ? 'বকেয়া পরিশোধের পরিমাণ লিখুন।' : 'Enter the amount they are paying to clear the due.'}</small>
                  </div>
                  <div>
                    <label className="text-muted text-sm block mb-1">{t(language, 'Date')}</label>
                    <input 
                      type="date" 
                      className="w-full" 
                      value={settleModal.date} 
                      onChange={e => setSettleModal({...settleModal, date: e.target.value})} 
                      required 
                    />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setSettleModal({ show: false, target: null, amount: '', date: '' })}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save')}</button>
              </div>
            </form>
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
                      onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} 
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
                      onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} 
                      placeholder="e.g. 01712345678" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                    <input 
                      type="text" 
                      value={newCustomer.location} 
                      onChange={e => setNewCustomer({...newCustomer, location: e.target.value})} 
                      placeholder="e.g. Dhaka" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Opening Balance (Due)</label>
                    <input 
                      type="number" 
                      value={newCustomer.due} 
                      onChange={e => setNewCustomer({...newCustomer, due: e.target.value})} 
                      placeholder="e.g. 5000" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Notes / Remarks</label>
                    <textarea 
                      value={newCustomer.notes} 
                      onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})} 
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
                      onChange={e => setEditingPerson({...editingPerson, name: e.target.value})} 
                      required 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Phone Number</label>
                    <input 
                      type="text" 
                      value={editingPerson.phone || ''} 
                      onChange={e => setEditingPerson({...editingPerson, phone: e.target.value})} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  {activeTab === 'Customer' && (
                    <div>
                      <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                      <input 
                        type="text" 
                        value={editingPerson.location || ''} 
                        onChange={e => setEditingPerson({...editingPerson, location: e.target.value})} 
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Total Due (BDT)</label>
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
              <div id="printable-single-person" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   Due Statement<br/>
                   Date: {new Date().toLocaleDateString()}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                   <p><strong>Name:</strong> {selectedPerson.name}</p>
                   <p><strong>Phone:</strong> {selectedPerson.phone}</p>
                   <p><strong>Type:</strong> {activeTab}</p>
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
                             {tx.type === 'payment' ? `৳${tx.amount.toLocaleString()}` : '-'}
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
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                 printElement('printable-single-person', 'Customers');
              }}>
                <Printer size={20} /> Print Document
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Customers;
