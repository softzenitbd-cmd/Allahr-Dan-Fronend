import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Printer, Eye, Download, Plus, Phone, Edit, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import { downloadAsPDF, printElement } from '../utils/pdfGenerator';
import { toast } from 'react-toastify';

const Suppliers = () => {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, purchases, settlements } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPerson, setSelectedPerson] = useState(null);

  const getSupplierTransactions = (supplierId) => {
    if (!supplierId) return [];
    
    const supplierPurchases = (purchases || []).filter(p => p.supplierId === supplierId).map(p => ({
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
      .filter(p => p.supplierId === supplierId && Number(p.paidAmount) > 0)
      .map(p => ({
        id: `${p.id}-paid`,
        date: p.date,
        type: 'Payment',
        description: `Paid on purchase ${p.id} (${p.paymentType})`,
        amount: Number(p.paidAmount),
        isCredit: false
      }));

    const supplierSettlements = (settlements || []).filter(s => s.targetId === supplierId && s.type === 'Supplier').map(s => ({
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

  const filteredList = suppliers.filter(
    (person) =>
      person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (person.phone && person.phone.includes(searchTerm))
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
      due: parseFloat(newSupplier.due) || 0,
    };
    const res = await addSupplier(supplierToSave);
    if (res?.ok) {
      setNewSupplier({ name: '', company: '', phone: '', email: '', location: '', due: '', notes: '' });
      setShowAddModal(false);
      toast.success(language === 'bn' ? 'সাপ্লায়ার সফলভাবে যুক্ত হয়েছে!' : 'Supplier added successfully!');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingPerson.name?.trim()) {
      toast.error(language === 'bn' ? 'সাপ্লায়ারের নাম দেওয়া আবশ্যক!' : 'Supplier name is required');
      return;
    }
    const due = parseFloat(editingPerson.due) || 0;
    const res = await updateSupplier(editingPerson.id, { ...editingPerson, name: editingPerson.name.trim(), due });
    if (res?.ok) {
      setEditingPerson(null);
      toast.success(language === 'bn' ? 'সাপ্লায়ার তথ্য আপডেট হয়েছে!' : 'Updated successfully!');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(language === 'bn' ? 'আপনি কি নিশ্চিত এই সাপ্লায়ার ডিলিট করতে চান?' : 'Are you sure you want to delete this record? This action cannot be undone.')) {
      const res = await deleteSupplier(id);
      if (res?.ok) {
        toast.success(language === 'bn' ? 'সাপ্লায়ার ডিলিট করা হয়েছে!' : 'Deleted successfully!');
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
        <div className="card-toolbar" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-bar">
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search suppliers by name or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="toolbar-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn-primary flex-align-gap" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> New Supplier
            </button>
            <button className="btn-outline flex-align-gap" onClick={() => window.print()}>
              <Printer size={16} /> Print List
            </button>
            <button className="btn-outline flex-align-gap text-info" onClick={() => downloadAsPDF('printable-suppliers-list', 'Suppliers_List.pdf')}>
              <Download size={16} /> Download PDF
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Total Purchase</th>
                <th>Total Paid</th>
                <th>Total Due (BDT)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-muted">No suppliers found.</td></tr>
              ) : (
                filteredList.map((person) => {
                  const pt = getSupplierTransactions(person.id);
                  const pTotalPurchased = pt.filter(t => t.type === 'Purchase').reduce((sum, t) => sum + t.amount, 0);
                  const pTotalPaid = pt.filter(t => t.type === 'Payment').reduce((sum, t) => sum + t.amount, 0);
                  return (
                    <tr key={person.id}>
                      <td>{person.id}</td>
                      <td>{person.name}</td>
                      <td className="flex-align-gap"><Phone size={14} className="text-muted" /> {person.phone || 'N/A'}</td>
                      <td>৳{pTotalPurchased.toLocaleString()}</td>
                      <td>৳{pTotalPaid.toLocaleString()}</td>
                      <td><span className={person.due > 0 ? "text-danger font-bold" : "text-success font-bold"}>৳{person.due.toLocaleString()}</span></td>
                      <td>
                        <div className="action-buttons flex-align-gap" style={{flexWrap:'nowrap'}}>
                          <button className="btn-icon" title="View & Print" onClick={() => setSelectedPerson(person)}>
                            <Printer size={16} />
                          </button>
                          <button className="btn-icon text-info" title="Edit" onClick={() => setEditingPerson({...person})}>
                            <Edit size={16} />
                          </button>
                          <button className="btn-icon text-danger" title="Delete" onClick={() => handleDelete(person.id)}>
                            <Trash2 size={16} />
                          </button>
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
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Company / Brand</label>
                    <input 
                      type="text" 
                      value={newSupplier.company} 
                      onChange={e => setNewSupplier({...newSupplier, company: e.target.value})} 
                      placeholder="e.g. Rahim Group of Industries" 
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
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Supplier Name *</label>
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
                  <div>
                    <label className="text-muted" style={{ display: 'block', marginBottom: '0.5rem' }}>Location / Address</label>
                    <input 
                      type="text" 
                      value={editingPerson.location || ''} 
                      onChange={e => setEditingPerson({...editingPerson, location: e.target.value})} 
                      style={{ width: '100%' }}
                    />
                  </div>
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

      {/* Print Single Person Drawer */}
      {selectedPerson && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Supplier Statement</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedPerson(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-person" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   Supplier Statement<br/>
                   Date: {new Date().toLocaleDateString()}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                   <p><strong>Name:</strong> {selectedPerson.name}</p>
                   <p><strong>Phone:</strong> {selectedPerson.phone || 'N/A'}</p>
                   <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                   
                   <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Total Purchase (মাল কেনা)</p>
                       <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>৳{totalPurchased.toLocaleString()}</p>
                     </div>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Total Paid (জমা)</p>
                       <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981' }}>৳{totalPaid.toLocaleString()}</p>
                     </div>
                     <div style={{ textAlign: 'center' }}>
                       <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>Current Due (বাকি)</p>
                       <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: selectedPerson.due > 0 ? '#ef4444' : '#10b981' }}>৳{selectedPerson.due.toLocaleString()}</p>
                     </div>
                   </div>
                   
                   {selectedPersonTransactions.length > 0 && (
                     <div style={{ marginTop: '1.5rem' }}>
                       <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Transaction History (লেনদেন)</h4>
                       <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                         <thead>
                           <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                             <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                             <th style={{ padding: '0.5rem', textAlign: 'left' }}>Details</th>
                             <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                           </tr>
                         </thead>
                         <tbody>
                           {selectedPersonTransactions.map(t => (
                             <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                               <td style={{ padding: '0.5rem' }}>{new Date(t.date).toLocaleDateString()}</td>
                               <td style={{ padding: '0.5rem' }}>{t.description}</td>
                               <td style={{ padding: '0.5rem', textAlign: 'right', color: t.isCredit ? 'red' : 'green' }}>
                                  {t.isCredit ? '+' : '-'}৳{t.amount.toLocaleString()}
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
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => downloadAsPDF('printable-single-person', `Supplier_${selectedPerson.name}.pdf`)}>
                <Download size={20} /> Download PDF
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
