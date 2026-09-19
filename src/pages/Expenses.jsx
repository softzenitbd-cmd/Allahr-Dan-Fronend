import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, PieChart, DollarSign, Printer, Eye, Edit, Trash2 } from 'lucide-react';

import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';
import useStore from '../store/useStore';
import { printElement } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';

const DEFAULT_CATEGORIES = ['Shop Rent', 'Electricity Bill', 'Transport', 'Staff Cost', 'Marketing', 'Others'];

const Expenses = () => {
  const {
    expenses, expenseCategories, staff, payrolls,
    addExpense, updateExpense, deleteExpense, generatePayslip,
    ensureLoaded, language,
  } = useStore();
  const [showModal, setShowModal] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (typeof ensureLoaded === 'function') {
      ensureLoaded('expenses', 'staff', 'payrolls');
    }
  }, [ensureLoaded]);

  // Dynamic Categories from backend and store
  const dynamicCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...(expenseCategories || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean),
    ...expenses.map(e => e.category).filter(Boolean)
  ]));

  const [newExpense, setNewExpense] = useState({ date: todayStr, category: dynamicCategories[0] || 'Shop Rent', amount: '', description: '', staffId: '' });
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  const [showReport, setShowReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));
  const totalDailyExpense = expenses.filter(e => e.date === todayStr).reduce((acc, curr) => acc + curr.amount, 0);

  // Live calculation for staff cost salary adjustment & excess due
  const selectedStaffMember = useMemo(() => {
    if (!newExpense.staffId) return null;
    return (staff || []).find(s => String(s.id) === String(newExpense.staffId) || s.staff_code === newExpense.staffId) || null;
  }, [staff, newExpense.staffId]);

  const staffSalaryCalc = useMemo(() => {
    if (!selectedStaffMember) return null;
    const baseSalary = Number(selectedStaffMember.baseSalary || selectedStaffMember.base_salary) || 0;
    const selectedMonth = (newExpense.date || todayStr).substring(0, 7);
    const currPayroll = (payrolls || []).find(p => 
      (String(p.staffId) === String(selectedStaffMember.id) || p.staffId === selectedStaffMember.staff_code) && 
      p.month === selectedMonth
    );

    const netPay = currPayroll ? Number(currPayroll.netPay || currPayroll.net_pay || 0) : baseSalary;
    const paidSoFar = currPayroll ? Number(currPayroll.paidAmount || currPayroll.paid_amount || 0) : 0;
    const remainingSalary = Math.max(0, netPay - paidSoFar);
    const currentDue = Number(selectedStaffMember.due) || 0;

    const parsedAmt = parseFloat(newExpense.amount) || 0;
    const adjustedFromSalary = Math.min(parsedAmt, remainingSalary);
    const addedToDue = Math.max(0, parsedAmt - remainingSalary);

    return {
      baseSalary,
      selectedMonth,
      netPay,
      paidSoFar,
      remainingSalary,
      currentDue,
      parsedAmt,
      adjustedFromSalary,
      addedToDue,
    };
  }, [selectedStaffMember, newExpense.date, newExpense.amount, payrolls, todayStr]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(newExpense.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error(language === 'bn' ? 'সঠিক খরচের পরিমাণ লিখুন (০-এর বেশি)' : 'Please enter a valid expense amount greater than 0');
      return;
    }
    const finalDescription = (newExpense.description || '').trim() || newExpense.category || 'Shop Expense';

    const isStaffCostWithStaff = newExpense.category === 'Staff Cost' && Boolean(newExpense.staffId);

    let res;
    if (isStaffCostWithStaff) {
      const selectedMonth = (newExpense.date || todayStr).substring(0, 7);
      res = await generatePayslip({
        staffId: newExpense.staffId,
        month: selectedMonth,
        year: selectedMonth.split('-')[0],
        amount: parsedAmount,
        paymentMethod: 'Cash',
        notes: finalDescription,
      });
    } else {
      res = await addExpense({
        ...newExpense,
        staff: newExpense.staffId || undefined,
        staffId: newExpense.staffId || undefined,
        amount: parsedAmount,
        description: finalDescription,
        date: newExpense.date || todayStr,
      });
    }

    if (res?.ok) {
      setShowModal(false);
      setNewExpense({ date: todayStr, category: dynamicCategories[0] || 'Shop Rent', amount: '', description: '', staffId: '' });
      if (isStaffCostWithStaff && staffSalaryCalc) {
        if (staffSalaryCalc.addedToDue > 0) {
          toast.success(
            language === 'bn'
              ? `স্টাফ খরচ যুক্ত হয়েছে! বেতন থেকে সমন্বয়: ৳${staffSalaryCalc.adjustedFromSalary.toLocaleString()} এবং বকেয়া (Due) জমা: ৳${staffSalaryCalc.addedToDue.toLocaleString()}`
              : `Expense recorded! Adjusted from salary: ৳${staffSalaryCalc.adjustedFromSalary} & Due added: ৳${staffSalaryCalc.addedToDue}`
          );
        } else {
          toast.success(
            language === 'bn'
              ? `স্টাফ খরচ যুক্ত হয়েছে! পুরো ৳${staffSalaryCalc.adjustedFromSalary.toLocaleString()} টাকা এই মাসের বেতন থেকে সমন্বয় হয়েছে।`
              : `Expense recorded and ৳${staffSalaryCalc.adjustedFromSalary} fully adjusted from salary.`
          );
        }
      } else {
        toast.success(language === 'bn' ? 'খরচ সফলভাবে যুক্ত হয়েছে' : 'Expense recorded successfully');
      }
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
      staff: editingExpense.staffId || editingExpense.staff || undefined,
      staffId: editingExpense.staffId || editingExpense.staff || undefined,
      amount: parsedAmount,
      description: finalDescription,
      date: editingExpense.date || todayStr,
    });

    if (res?.ok) {
      setEditingExpense(null);
      toast.success(language === 'bn' ? 'খরচ সফলভাবে আপডেট হয়েছে' : 'Expense updated successfully');
    }
  };

  const handleDeleteExpense = async (id) => {
    const isConfirmed = await showConfirmDialog({
      title: 'খরচ ডিলিট করবেন?',
      text: 'আপনি কি নিশ্চিত এই খরচ রেকর্ডটি ডিলিট করতে চান?',
      confirmButtonText: 'হ্যাঁ, ডিলিট করুন',
      cancelButtonText: 'বাতিল',
      isDanger: true,
    });
    if (isConfirmed) {
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
                  <th style={{ textAlign: 'right', paddingRight: '0.85rem' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 50).map(exp => ( // show only recent 50
                  <tr key={exp.id}>
                    <td>{exp.date}</td>
                    <td>
                      <span>{exp.category}</span>
                      {exp.staffName && (
                        <span className="badge" style={{ marginLeft: '0.4rem', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', display: 'inline-block' }}>
                          👤 {exp.staffName}
                        </span>
                      )}
                    </td>
                    <td>{exp.description}</td>
                    <td className="text-danger font-bold">৳{exp.amount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
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
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
          <p style={{ textAlign: 'center', fontSize: '1rem', marginBottom: '1.5rem', color: '#333' }}>
            Expense List
          </p>

          <table style={{ width: '100%', fontSize: '0.85rem', color: '#000', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Date</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Category</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Description</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Amount (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length > 0 ? expenses.map((exp) => (
                <tr key={exp.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{exp.date}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{exp.category}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{exp.description}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{exp.amount.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" style={{ border: '1px solid #ccc', padding: '1rem', textAlign: 'center' }}>No expenses recorded.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td colSpan="3" style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right' }}>Total Expense:</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'right', color: 'red' }}>
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
                    onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Category</label>
                  <select
                    className="w-full"
                    value={newExpense.category}
                    onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                  >
                    {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                {(newExpense.category === 'Staff Cost' || newExpense.staffId) && (
                  <div className="form-group mb-4" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{language === 'bn' ? 'কর্মী নির্বাচন করুন (Staff)' : 'Select Staff'}</span>
                      <span className="text-xs text-muted">({language === 'bn' ? 'ঐচ্ছিক' : 'Optional'})</span>
                    </label>
                    <select
                      className="w-full mt-1"
                      value={newExpense.staffId || ''}
                      onChange={e => setNewExpense({ ...newExpense, staffId: e.target.value })}
                    >
                      <option value="">{language === 'bn' ? '-- কর্মী নির্বাচন করুন --' : '-- Select Staff --'}</option>
                      {(staff || []).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role || 'Staff'}) — {language === 'bn' ? 'চলতি বকেয়া' : 'Current Due'}: ৳{s.due || 0}
                        </option>
                      ))}
                    </select>
                    {staffSalaryCalc && (
                      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem', marginTop: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: '4px' }}>
                          <span style={{ color: '#475569', fontWeight: 600 }}>
                            {language === 'bn' ? `চলতি মাসের বাকি বেতন (${staffSalaryCalc.selectedMonth}):` : `Remaining Salary (${staffSalaryCalc.selectedMonth}):`}
                          </span>
                          <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.9rem' }}>
                            ৳{staffSalaryCalc.remainingSalary.toLocaleString()}
                          </span>
                        </div>
                        {staffSalaryCalc.parsedAmt > 0 && (
                          <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', marginTop: '4px', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534' }}>
                              <span>{language === 'bn' ? 'বেতন থেকে সমন্বয় হবে:' : 'Adjusted from Salary:'}</span>
                              <strong style={{ color: '#15803d' }}>৳{staffSalaryCalc.adjustedFromSalary.toLocaleString()}</strong>
                            </div>
                            {staffSalaryCalc.addedToDue > 0 ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', marginTop: '3px', fontWeight: 700 }}>
                                <span>{language === 'bn' ? 'বেতনের অতিরিক্ত (বকেয়া/Due জমা):' : 'Excess (Added to Due):'}</span>
                                <strong style={{ color: '#dc2626' }}>+৳{staffSalaryCalc.addedToDue.toLocaleString()}</strong>
                              </div>
                            ) : (
                              <div style={{ color: '#15803d', fontSize: '0.73rem', marginTop: '3px', fontWeight: 600 }}>
                                ✓ {language === 'bn' ? 'পুরো টাকাই চলতি মাসের বেতন থেকে সমন্বয় হবে (কোনো বকেয়া হবে না)' : 'Fully adjusted from salary (no due added)'}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          ℹ️ {language === 'bn' ? 'খরচের টাকা প্রথমে বেতন থেকে কাটা হবে, বেতনের চেয়ে বেশি হলে অতিরিক্ত টাকা বকেয়া (Due) হবে।' : 'Expense will first adjust against monthly salary; excess will become due.'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="form-group mb-4">
                  <label>Amount (BDT)</label>
                  <input
                    type="number"
                    className="w-full"
                    required
                    min="1"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Description (Optional)</label>
                  <input
                    type="text"
                    className="w-full"
                    placeholder={language === 'bn' ? 'বিবরণ (ঐচ্ছিক)' : 'e.g. Monthly shop rent'}
                    value={newExpense.description}
                    onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
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
                    onChange={e => setEditingExpense({ ...editingExpense, date: e.target.value })}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Category</label>
                  <select
                    className="w-full"
                    value={editingExpense.category}
                    onChange={e => setEditingExpense({ ...editingExpense, category: e.target.value })}
                  >
                    {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                {(editingExpense.category === 'Staff Cost' || editingExpense.staffId || editingExpense.staff) && (
                  <div className="form-group mb-4" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{language === 'bn' ? 'কর্মী নির্বাচন করুন (Staff)' : 'Select Staff'}</span>
                      <span className="text-xs text-muted">({language === 'bn' ? 'ঐচ্ছিক' : 'Optional'})</span>
                    </label>
                    <select
                      className="w-full mt-1"
                      value={editingExpense.staffId || editingExpense.staff || ''}
                      onChange={e => setEditingExpense({ ...editingExpense, staffId: e.target.value, staff: e.target.value })}
                    >
                      <option value="">{language === 'bn' ? '-- কর্মী নির্বাচন করুন --' : '-- Select Staff --'}</option>
                      {(staff || []).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role || 'Staff'}) — {language === 'bn' ? 'চলতি বকেয়া' : 'Current Due'}: ৳{s.due || 0}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group mb-4">
                  <label>Amount (BDT)</label>
                  <input
                    type="number"
                    className="w-full"
                    required
                    min="1"
                    value={editingExpense.amount}
                    onChange={e => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                  />
                </div>
                <div className="form-group mb-4">
                  <label>Description (Optional)</label>
                  <input
                    type="text"
                    className="w-full"
                    placeholder={language === 'bn' ? 'বিবরণ (ঐচ্ছিক)' : 'e.g. Monthly shop rent'}
                    value={editingExpense.description}
                    onChange={e => setEditingExpense({ ...editingExpense, description: e.target.value })}
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
              <button className="drawer-close-btn text-danger" onClick={() => setShowReport(false)}><X size={24} /></button>
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
                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
                <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                  Expense Voucher<br />
                  ID: {selectedExpense.id}<br />
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
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Expenses;
