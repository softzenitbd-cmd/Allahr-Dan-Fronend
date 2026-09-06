import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, PieChart, DollarSign, Printer, Eye, Download, Edit, Trash2 } from 'lucide-react';

import { toast } from 'react-toastify';
import useStore from '../store/useStore';
import { downloadAsPDF, printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';

const DEFAULT_CATEGORIES = ['Shop Rent', 'Electricity Bill', 'Transport', 'Staff Cost', 'Marketing', 'Others'];

const Expenses = () => {
  const { expenses, expenseCategories, addExpense, updateExpense, deleteExpense, language } = useStore();
  const [showModal, setShowModal] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  // Dynamic Categories from backend and store
  const dynamicCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...(expenseCategories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean),
    ...expenses.map(e => e.category).filter(Boolean)
  ]));

  const [newExpense, setNewExpense] = useState({ date: todayStr, category: dynamicCategories[0] || 'Shop Rent', amount: '', description: '' });
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  const [showReport, setShowReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));
  const totalDailyExpense = expenses.filter(e => e.date === todayStr).reduce((acc, curr) => acc + curr.amount, 0);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(newExpense.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error(language === 'bn' ? 'সঠিক খরচের পরিমাণ লিখুন (০-এর বেশি)' : 'Please enter a valid expense amount greater than 0');
      return;
    }
    const finalDescription = (newExpense.description || '').trim() || newExpense.category || 'Shop Expense';
    
    const res = await addExpense({
      ...newExpense,
      amount: parsedAmount,
      description: finalDescription,
      date: newExpense.date || todayStr,
    });

    if (res?.ok) {
      setShowModal(false);
      setNewExpense({ date: todayStr, category: dynamicCategories[0] || 'Shop Rent', amount: '', description: '' });
      toast.success(language === 'bn' ? 'খরচ সফলভাবে যুক্ত হয়েছে' : 'Expense recorded successfully');
    }
  };

  const handleEditExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(editingExpense.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error(language === 'bn' ? 'সঠিক খরচের পরিমাণ লিখুন (০-এর বেশি)' : 'Please enter a valid expense amount greater than 0');
      return;
    }
    const finalDescription = (editingExpense.description || '').trim() || editingExpense.category || 'Shop Expense';

    const res = await updateExpense(editingExpense.id, {
      ...editingExpense,
      amount: parsedAmount,
      description: finalDescription,
      date: editingExpense.date || todayStr,
    });

    if (res?.ok) {
      setEditingExpense(null);
      toast.success(language === 'bn' ? 'খরচ সফলভাবে আপডেট হয়েছে' : 'Expense updated successfully');
    }
  };

  const handleDeleteExpense = (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      deleteExpense(id);
    }
  };

  // Monthly Report Calculations
  const monthlyExpenses = expenses.filter(e => e.date && e.date.startsWith(reportMonth));
  const totalMonthlyExpense = monthlyExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const categoryTotals = dynamicCategories.map(cat => ({
    category: cat,
    amount: monthlyExpenses.filter(e => e.category === cat).reduce((acc, curr) => acc + curr.amount, 0)
  })).filter(c => c.amount > 0);

  // Add dynamically added categories if they exist in data but not in dynamicCategories list
  const extraCategories = [...new Set(monthlyExpenses.map(e => e.category))].filter(cat => !dynamicCategories.includes(cat));
  extraCategories.forEach(cat => {
    categoryTotals.push({
      category: cat,
      amount: monthlyExpenses.filter(e => e.category === cat).reduce((acc, curr) => acc + curr.amount, 0)
    });
  });

  return (
    <div className="expenses-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Expenses')}</h1>
          <p className="text-muted">{language === 'bn' ? 'দোকানের দৈনন্দিন খরচ হিসাব রাখুন।' : 'Track daily and monthly shop expenses.'}</p>
        </div>
        <button className="btn-primary flex-align-gap" onClick={() => setShowModal(true)}>
          <Plus size={18} /> {t(language, 'Add Expense' || 'Add Expense')}
        </button>
      </div>

      <div className="grid responsive-grid-3" style={{ marginBottom: '1.5rem' }}>
        <div className="card flex-align-gap" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div className="flex-align-gap w-full" style={{ justifyContent: 'space-between', width: '100%' }}>
             <h3 className="text-muted text-sm">{t(language, 'Today\'s Expense' || 'Today\'s Expense')}</h3>
             <DollarSign className="text-danger" size={20} />
          </div>
          <p className="text-xl font-bold mt-2 text-danger" style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>৳{totalDailyExpense.toLocaleString()}</p>
        </div>
      </div>
      
      <div className="grid">
        <div className="card">
          <div className="card-toolbar" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3>{t(language, 'Recent Expenses' || 'Recent Expenses')}</h3>
            <div className="flex-align-gap">
              <button className="btn-outline flex-align-gap" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowReport(true)}>
                <PieChart size={16} /> {t(language, 'Monthly Report' || 'Monthly Report')}
              </button>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => {
                printElement('printable-expenses-list', 'Expenses');
              }}>
                <Printer size={16} /> Print List
              </button>
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => downloadAsPDF('printable-expenses-list', 'Expenses_List.pdf')}>
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Date')}</th>
                  <th>{t(language, 'Category')}</th>
                  <th>{t(language, 'Description')}</th>
                  <th>{t(language, 'Amount' || 'Amount')} (BDT)</th>
                  <th style={{textAlign:'center'}}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 50).map(exp => ( // show only recent 50
                  <tr key={exp.id}>
                    <td>{exp.date}</td>
                    <td>{exp.category}</td>
                    <td>{exp.description}</td>
                    <td className="text-danger font-bold">৳{exp.amount.toLocaleString()}</td>
                    <td style={{textAlign:'center'}}>
                      <div className="flex-align-gap" style={{justifyContent:'center', flexWrap: 'nowrap'}}>
                        <button className="btn-icon" title="View & Print" onClick={() => setSelectedExpense(exp)}>
                          <Eye size={16} />
                        </button>
                        <button className="btn-icon text-info" title="Edit" onClick={() => setEditingExpense(exp)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon text-danger" title="Delete" onClick={() => handleDeleteExpense(exp.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan="5" className="text-center text-muted">No expenses recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hidden Printable Expenses List (Excel Style) */}
      <div id="printable-expenses-list" style={{ display: 'none' }}>
        <div style={{ padding: '1.5rem', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '1.5rem', color: '#333' }}>
            Expense List
          </p>
          
          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>Date</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>Category</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left'}}>Description</th>
                <th style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>Amount (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length > 0 ? expenses.map((exp) => (
                <tr key={exp.id}>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{exp.date}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{exp.category}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem'}}>{exp.description}</td>
                  <td style={{border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right'}}>৳{exp.amount.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" style={{border: '1px solid #ccc', padding: '1rem', textAlign: 'center'}}>No expenses recorded.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="3" style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right'}}>Total Expense:</td>
                <td style={{border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: 'red'}}>
                  ৳{expenses.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add Expense Drawer */}
      {showModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Add Expense' || 'Add New Expense')}</h2>
              <button className="drawer-close-btn" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form id="add-expense-form" onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="form-group mb-4 mt-4">
                  <label>Date</label>
                  <input 
                    type="date"
                    className="w-full"
                    required
                    value={newExpense.date}
                    onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Category</label>
                  <select 
                    className="w-full"
                    value={newExpense.category} 
                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  >
                    {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="form-group mb-4">
                  <label>Amount (BDT)</label>
                  <input 
                    type="number" 
                    className="w-full"
                    required 
                    min="1"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Description (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full"
                    placeholder={language === 'bn' ? 'বিবরণ (ঐচ্ছিক)' : 'e.g. Monthly shop rent'}
                    value={newExpense.description}
                    onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Expense Drawer */}
      {editingExpense && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Edit Expense')}</h2>
              <button className="drawer-close-btn" onClick={() => setEditingExpense(null)}>
                <X size={24} />
              </button>
            </div>
            <form id="edit-expense-form" onSubmit={handleEditExpense} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="form-group mb-4 mt-4">
                  <label>Date</label>
                  <input 
                    type="date"
                    className="w-full"
                    required
                    value={editingExpense.date}
                    onChange={e => setEditingExpense({...editingExpense, date: e.target.value})}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Category</label>
                  <select 
                    className="w-full"
                    value={editingExpense.category} 
                    onChange={e => setEditingExpense({...editingExpense, category: e.target.value})}
                  >
                    {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="form-group mb-4">
                  <label>Amount (BDT)</label>
                  <input 
                    type="number" 
                    className="w-full"
                    required 
                    min="1"
                    value={editingExpense.amount}
                    onChange={e => setEditingExpense({...editingExpense, amount: e.target.value})}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Description (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full"
                    placeholder={language === 'bn' ? 'বিবরণ (ঐচ্ছিক)' : 'e.g. Monthly shop rent'}
                    value={editingExpense.description}
                    onChange={e => setEditingExpense({...editingExpense, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setEditingExpense(null)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save Changes')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Monthly Report Drawer */}
      {showReport && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '600px', width: '100%' }}>
            <div className="drawer-header">
              <h2>Monthly Expense Report</h2>
              <button className="drawer-close-btn text-danger" onClick={() => setShowReport(false)}><X size={24}/></button>
            </div>
            
            <div className="drawer-body">
              <div className="form-group mb-4">
                <label>Select Month</label>
                <input 
                  type="month" 
                  className="w-full p-2 bg-input border border-gray-700 rounded text-main"
                  value={reportMonth}
                  onChange={e => setReportMonth(e.target.value)}
                />
              </div>

              <div id="printable-monthly-expense">
                <div className="card bg-input" style={{ marginBottom: '1.5rem' }}>
                  <h3 className="text-muted text-sm text-center">Total Monthly Expense ({reportMonth})</h3>
                  <p className="text-2xl font-bold mt-2 text-danger text-center">৳{totalMonthlyExpense.toLocaleString()}</p>
                </div>

                <h4>Breakdown by Category</h4>
                <div className="table-responsive mt-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="text-right">Total Amount (BDT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryTotals.length === 0 ? (
                        <tr><td colSpan="2" className="text-center text-muted">No expenses found for this month.</td></tr>
                      ) : (
                        categoryTotals.map((cat, idx) => (
                          <tr key={idx}>
                            <td>{cat.category}</td>
                            <td className="text-right font-bold text-danger">৳{cat.amount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div className="drawer-footer" style={{ gap: '1rem' }}>
              <button className="btn-primary flex-align-gap w-full center-content" onClick={() => {
                 printElement('printable-monthly-expense', 'Expenses');
              }}>
                <Printer size={18} /> Print Report
              </button>
              <button className="btn-outline flex-align-gap text-info w-full center-content" onClick={() => downloadAsPDF('printable-monthly-expense', `Monthly_Expenses_${reportMonth}.pdf`)}>
                <Download size={18} /> Download PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Single Expense Drawer */}
      {selectedExpense && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Expense Voucher</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedExpense(null)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-expense" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                 <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allah Dan Gents Point</h2>
                 <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                   Expense Voucher<br/>
                   ID: {selectedExpense.id}<br/>
                   Date: {selectedExpense.date}
                 </p>
                 <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                 
                 <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                   <p><strong>Category:</strong> {selectedExpense.category}</p>
                   <p><strong>Description:</strong> {selectedExpense.description}</p>
                   <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                   <p style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: 'red' }}><strong>Amount:</strong> ৳{selectedExpense.amount.toLocaleString()}</p>
                 </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                 printElement('printable-single-expense', 'Expenses');
              }}>
                <Printer size={20} /> Print Document
              </button>
              <button className="btn-outline flex-align-gap text-info" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => downloadAsPDF('printable-single-expense', `Expense_Voucher_${selectedExpense.id}.pdf`)}>
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

export default Expenses;
