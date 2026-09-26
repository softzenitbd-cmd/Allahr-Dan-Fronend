import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, Calendar, DollarSign, Award, Plus, Check, X, Eye, Printer, Edit, Trash2, History, Download } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { formatDate, formatDateTime, formatTime } from '../utils/date';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';

const HR = () => {
  const [activeTab, setActiveTab] = useState('Staff');
  const { staff, attendance, leaves, payrolls, addStaff, updateStaff, deleteStaff, markAttendance, addLeaveRequest, updateLeaveStatus, generatePayslip, generateMonthPayroll, settleStaffDue, fetchPayrollAttendance, fetchStaffMoneyHistory, language } = useStore();

  // Modals state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Salesman', baseSalary: '', phone: '', address: '', bankAccount: '', username: '', password: '' });
  const [editingStaff, setEditingStaff] = useState(null);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [newLeave, setNewLeave] = useState({ staffId: '', type: 'Casual', reason: '', date: new Date().toISOString().split('T')[0] });

  const [selectedStaff, setSelectedStaff] = useState(null);

  // Bonus and flexible payment inputs for payroll
  const [bonuses, setBonuses] = useState({});
  const [payInputs, setPayInputs] = useState({});
  const [viewPayrollDetails, setViewPayrollDetails] = useState(null);

  // Settle Staff Due modal state
  const [settleStaffModal, setSettleStaffModal] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleMethod, setSettleMethod] = useState('Cash');
  const [settleNotes, setSettleNotes] = useState('');

  // Dates
  const todayStr = new Date().toISOString().split('T')[0];
  const [attDate, setAttDate] = useState(todayStr);
  const [payrollMonth, setPayrollMonth] = useState(todayStr.substring(0, 7)); // YYYY-MM
  // The month's register per staff member (absent, half days, suggested cut),
  // and the cut the payer has chosen -- all of it, part, or none.
  const [payrollAtt, setPayrollAtt] = useState({});
  const [deductions, setDeductions] = useState({});
  // Advance to take out of this salary, per staff (undefined = not adjusting).
  const [advAdjust, setAdvAdjust] = useState({});
  // The money-taken history drawer.
  const [moneyHistory, setMoneyHistory] = useState(null); // { staff, data }
  const openMoneyHistory = async (s) => {
    setMoneyHistory({ staff: s, data: null });
    const data = await fetchStaffMoneyHistory(s.id);
    setMoneyHistory((cur) => (cur && cur.staff.id === s.id ? { staff: s, data: data || { entries: [], totals: {}, due: Number(s.due || 0) } } : cur));
  };
  useEffect(() => {
    if (activeTab !== 'Payroll') return;
    let live = true;
    fetchPayrollAttendance(payrollMonth).then((rows) => {
      if (live) setPayrollAtt(Object.fromEntries(rows.map((r) => [r.staffId, r])));
    });
    return () => { live = false; };
  }, [activeTab, payrollMonth, attendance, payrolls, fetchPayrollAttendance]);
  useEffect(() => { setDeductions({}); setBonuses({}); setPayInputs({}); setAdvAdjust({}); }, [payrollMonth]);
  const [attViewMode, setAttViewMode] = useState('monthly'); // 'monthly' | 'daily'
  const [attReportMonth, setAttReportMonth] = useState(todayStr.substring(0, 7)); // YYYY-MM
  const [attStaffFilter, setAttStaffFilter] = useState(''); // '' for all, or staff id
  const [attCustomStart, setAttCustomStart] = useState('');
  const [attCustomEnd, setAttCustomEnd] = useState('');

  const formatStatementDate = (dStr) => {
    if (!dStr) return '';
    const [y, m, d] = dStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = String(d).padStart(2, '0');
    const monthName = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${monthName} ${year}`;
  };

  // Helper to generate days of a given YYYY-MM month or custom range
  const getDaysInMonth = (monthStr, customStart, customEnd) => {
    if (customStart && customEnd) {
      const days = [];
      const cur = new Date(customStart);
      const end = new Date(customEnd);
      let dayNumber = 1;
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const dayName = cur.toLocaleDateString('en-US', { weekday: 'long' });
        days.push({ dayNumber, dateStr, dayName, isFriday: cur.getDay() === 5 });
        cur.setDate(cur.getDate() + 1);
        dayNumber++;
      }
      return days;
    }
    if (!monthStr) return [];
    const [year, month] = monthStr.split('-').map(Number);
    const numDays = new Date(year, month, 0).getDate();
    const days = [];
    for (let d = 1; d <= numDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;
      const dateObj = new Date(year, month - 1, d);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      days.push({ dayNumber: d, dateStr, dayName, isFriday: dateObj.getDay() === 5 });
    }
    return days;
  };

  // Handlers
  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.name?.trim()) return toast.error(language === 'bn' ? 'কর্মীর নাম আবশ্যক' : 'Name is required');
    const trimmedUsername = newStaff.username?.trim();
    if (!trimmedUsername) {
      return toast.error(language === 'bn' ? 'ইউজারনেম আবশ্যক' : 'Username is required');
    }

    const duplicate = (staff || []).some(
      s => s.username && s.username.trim().toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicate) {
      return toast.error(language === 'bn' ? `ইউজারনেম '${trimmedUsername}' ইতোমধ্যে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।` : `Username '${trimmedUsername}' is already taken!`);
    }

    const res = await addStaff({
      ...newStaff,
      name: newStaff.name.trim(),
      username: trimmedUsername,
      baseSalary: parseFloat(newStaff.baseSalary) || 0,
      joinDate: todayStr
    });
    if (res?.ok) {
      setShowAddStaffModal(false);
      setNewStaff({ name: '', role: 'Salesman', baseSalary: '', phone: '', address: '', bankAccount: '', username: '', password: '' });
      toast.success(language === 'bn' ? 'কর্মী সফলভাবে যোগ করা হয়েছে!' : 'Staff added successfully!');
    }
  };

  const handleEditStaff = async (e) => {
    e.preventDefault();
    if (!editingStaff.name?.trim()) return toast.error(language === 'bn' ? 'কর্মীর নাম আবশ্যক' : 'Name is required');
    const trimmedUsername = editingStaff.username?.trim();
    if (trimmedUsername) {
      const duplicate = (staff || []).some(
        s => s.id !== editingStaff.id && s.username && s.username.trim().toLowerCase() === trimmedUsername.toLowerCase()
      );
      if (duplicate) {
        return toast.error(language === 'bn' ? `ইউজারনেম '${trimmedUsername}' অন্য কর্মীর জন্য ইতোমধ্যে ব্যবহৃত হয়েছে!` : `Username '${trimmedUsername}' is already taken by another staff member!`);
      }
    }

    const res = await updateStaff(editingStaff.id, {
      ...editingStaff,
      name: editingStaff.name.trim(),
      username: trimmedUsername || '',
      baseSalary: parseFloat(editingStaff.baseSalary) || 0
    });
    if (res?.ok) {
      setEditingStaff(null);
      toast.success(language === 'bn' ? 'তথ্য সফলভাবে আপডেট করা হয়েছে!' : 'Staff updated successfully!');
    }
  };

  const handleDeleteStaff = async (id) => {
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      const res = await deleteStaff(id);
      if (res?.ok) {
        toast.success('Staff deleted successfully!');
      }
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!newLeave.staffId) return toast.error('Please select a staff');
    const res = await addLeaveRequest({
      ...newLeave
    });
    if (res?.ok) {
      setShowLeaveModal(false);
      setNewLeave({ staffId: '', type: 'Casual', reason: '', date: todayStr });
      toast.success('Leave request submitted!');
    }
  };

  const handlePaySalaryInstallment = async (staffMember, presentDays, bonus, customAmount, cut = 0, adjust = 0) => {
    const existingPayroll = (payrolls || []).find(p => (p.staffId === staffMember.id || p.staff_id === staffMember.id) && p.month === payrollMonth);
    const paidSoFar = existingPayroll ? Number(existingPayroll.paidAmount || existingPayroll.paid_amount || 0) : 0;
    const baseSalary = existingPayroll && paidSoFar > 0 ? Number(existingPayroll.baseSalary ?? existingPayroll.base_salary ?? staffMember.baseSalary ?? 0) : Number(staffMember.baseSalary || 0);
    const isFullyPaid = existingPayroll ? Boolean(existingPayroll.is_paid) : false;
    const totalNetPay = isFullyPaid
      ? Number(existingPayroll.netPay || existingPayroll.net_pay || 0)
      : Math.max(0, Math.round(baseSalary + bonus - cut));
    if (!isFullyPaid && paidSoFar > totalNetPay + 0.005) {
      return toast.error(language === 'bn'
        ? `এই মাসে আগেই ৳${paidSoFar.toLocaleString()} দেওয়া হয়েছে — কর্তনের পরে বেতন এর চেয়ে কম হতে পারে না।`
        : `৳${paidSoFar.toLocaleString()} is already paid this month — the salary after the cut cannot be less.`);
    }
    const salaryLeft = Math.max(0, Math.round(totalNetPay - paidSoFar));
    // An advance taken earlier, settled out of this salary: no cash moves for it.
    const adj = Math.max(0, Math.min(Number(adjust) || 0, Number(staffMember.due || 0), salaryLeft));
    const remainingDue = salaryLeft - adj;

    let payAmount = customAmount !== undefined && customAmount !== '' ? parseFloat(customAmount) : remainingDue;
    if (isNaN(payAmount) || payAmount < 0 || (payAmount === 0 && adj <= 0)) {
      return toast.error(language === 'bn' ? 'সঠিক টাকার পরিমাণ লিখুন (০-এর বেশি)' : 'Please enter a valid amount greater than 0');
    }

    const excess = payAmount > remainingDue ? Math.round(payAmount - remainingDue) : 0;
    if (excess > 0) {
      const confirmed = window.confirm(
        language === 'bn'
          ? `অবশিষ্ট বেতন ৳${remainingDue}। আপনি পরিশোধ করছেন ৳${payAmount}। অতিরিক্ত ৳${excess} কর্মীর বকেয়া (Due)-তে জমা হবে। আপনি কি নিশ্চিত?`
          : `Remaining salary is ৳${remainingDue}. You are paying ৳${payAmount}. Excess ৳${excess} will be added to the staff member's due balance. Continue?`
      );
      if (!confirmed) return;
    }

    const res = await generatePayslip({
      month: payrollMonth,
      year: payrollMonth.split('-')[0],
      staffId: staffMember.id,
      staffName: staffMember.name,
      presentDays,
      baseSalary: staffMember.baseSalary,
      bonus,
      ...(isFullyPaid ? {} : { deduction: cut }),
      ...(adj > 0 ? { adjustAdvance: adj } : {}),
      amount: payAmount,
      paymentMethod: 'Cash',
      notes: excess > 0 ? `Salary: ৳${payAmount - excess}, Advance Due: ৳${excess}` : `Salary installment: ৳${payAmount}`,
    });

    if (res?.ok) {
      setPayInputs(prev => ({ ...prev, [staffMember.id]: '' }));
      setAdvAdjust(prev => { const next = { ...prev }; delete next[staffMember.id]; return next; });
      const adjText = adj > 0
        ? (language === 'bn' ? ` (অগ্রিম ৳${adj.toLocaleString()} বেতন থেকে কাটা হয়েছে)` : ` (advance ৳${adj.toLocaleString()} taken out of salary)`)
        : '';
      toast.success(
        language === 'bn'
          ? `${staffMember.name}-কে ৳${payAmount.toLocaleString()} টাকা দেওয়া হয়েছে${adjText}`
          : `Paid ৳${payAmount.toLocaleString()} to ${staffMember.name}${adjText}`
      );
    }
  };

  const [generatingMonth, setGeneratingMonth] = useState(false);
  /** Work out this month's salary for every active staff member, paying nobody. */
  const handleGenerateMonthPayroll = async () => {
    const monthLabel = new Date(`${payrollMonth}-01T00:00:00`).toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric' });
    const ok = await showConfirmDialog({
      title: language === 'bn' ? `${monthLabel} — বেতন তৈরি করবেন?` : `Generate payroll for ${monthLabel}?`,
      text: language === 'bn'
        ? 'সব স্টাফের হাজিরা দেখে বেতন, কর্তন আর বোনাস হিসাব হবে। কোনো টাকা দেওয়া হবে না — পরে "টাকা দিন" দিয়ে দেবেন। যাদের বেতন পুরো দেওয়া হয়ে গেছে তারা বাদ থাকবে।'
        : "Salary, deduction and bonus are worked out from everyone's attendance. No money is paid now — pay later with Pay. Anyone already paid in full is left as is.",
      confirmButtonText: language === 'bn' ? 'হ্যাঁ, তৈরি করুন' : 'Yes, generate',
      cancelButtonText: language === 'bn' ? 'বাতিল' : 'Cancel',
    });
    if (!ok) return;
    // What is typed on screen (bonus, an adjusted cut) goes along.
    const items = staff
      .map((s) => ({
        staffId: s.id,
        ...(bonuses[s.id] !== undefined ? { bonus: bonuses[s.id] } : {}),
        ...(deductions[s.id] !== undefined && deductions[s.id] !== '' ? { deduction: Number(deductions[s.id]) || 0 } : {}),
      }))
      .filter((it) => Object.keys(it).length > 1);
    setGeneratingMonth(true);
    const res = await generateMonthPayroll(payrollMonth, items);
    setGeneratingMonth(false);
    if (!res?.ok) return;
    const { created = [], updated = [], skipped = [], totalNetPay = 0 } = res.result || {};
    setDeductions({});
    setBonuses({});
    const done = created.length + updated.length;
    const skippedText = skipped.length
      ? (language === 'bn'
        ? ` বাদ: ${skipped.map((x) => `${x.name} (${x.reason === 'already paid' ? 'আগেই পরিশোধিত' : x.reason === 'no salary set' ? 'বেতন সেট নেই' : x.reason})`).join(', ')}।`
        : ` Skipped: ${skipped.map((x) => `${x.name} (${x.reason})`).join(', ')}.`)
      : '';
    showSuccessAlert(language === 'bn'
      ? `${monthLabel}: ${done} জনের বেতন তৈরি হয়েছে — মোট ৳${Number(totalNetPay).toLocaleString()}।${skippedText}`
      : `${monthLabel}: payroll ready for ${done} staff — total ৳${Number(totalNetPay).toLocaleString()}.${skippedText}`);
  };

  const openSettleStaff = (s) => {
    setSettleStaffModal(s);
    setSettleAmount(String(s.due || ''));
    setSettleDate(todayStr);
    setSettleMethod('Cash');
    setSettleNotes('');
  };

  const handleSettleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!settleStaffModal) return;
    const amountVal = parseFloat(settleAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return toast.error(language === 'bn' ? 'সঠিক টাকার পরিমাণ দিন' : 'Please enter a valid amount');
    }
    const maxDue = parseFloat(settleStaffModal.due || 0);
    if (amountVal > maxDue + 0.01) {
      return toast.error(language === 'bn' ? `সর্বোচ্চ বকেয়া ৳${maxDue}` : `Amount exceeds outstanding due ৳${maxDue}`);
    }

    const res = await settleStaffDue(settleStaffModal.id, amountVal, settleDate, {
      method: settleMethod,
      notes: settleNotes || (language === 'bn' ? 'স্টাফের বকেয়া জমা' : 'Staff due recovery'),
    });

    if (res?.ok) {
      setSettleStaffModal(null);
      toast.success(language === 'bn' ? 'বকেয়া সফলভাবে জমা নেওয়া হয়েছে!' : 'Staff due settled successfully!');
    }
  };

  return (
    <div className="hr-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1>{t(language, 'HR & Payroll')}</h1>
          <p className="text-muted">{language === 'bn' ? 'স্টাফ, হাজিরা, ছুটি এবং বেতন ম্যানেজ করুন।' : 'Manage staff, attendance, leave, salary, and bonuses.'}</p>
        </div>
        {activeTab === 'Staff' && (
          <button className="btn-primary flex-align-gap" onClick={() => setShowAddStaffModal(true)}>
            <Plus size={18} /> {t(language, 'Add Staff' || 'Add Staff')}
          </button>
        )}
        {activeTab === 'Leave' && (
          <button className="btn-primary flex-align-gap" onClick={() => setShowLeaveModal(true)}>
            <Plus size={18} /> {t(language, 'Apply Leave' || 'Apply Leave')}
          </button>
        )}
      </div>

      <div className="card glass">
        <div className="card-toolbar" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', overflowX: 'auto' }}>
          <div className="return-type-selector">
            <button className={`type-btn ${activeTab === 'Staff' ? 'active' : ''}`} onClick={() => setActiveTab('Staff')}>
              <Users size={18} className="inline-block mr-2" /> {t(language, 'Staff List' || 'Staff List')}
            </button>
            <button className={`type-btn ${activeTab === 'Attendance' ? 'active' : ''}`} onClick={() => setActiveTab('Attendance')}>
              <Calendar size={18} className="inline-block mr-2" /> {t(language, 'Attendance' || 'Attendance')}
            </button>
            <button className={`type-btn ${activeTab === 'Leave' ? 'active' : ''}`} onClick={() => setActiveTab('Leave')}>
              <Users size={18} className="inline-block mr-2" /> {t(language, 'Leave Requests' || 'Leave Requests')}
            </button>
            <button className={`type-btn ${activeTab === 'Payroll' ? 'active' : ''}`} onClick={() => setActiveTab('Payroll')}>
              <DollarSign size={18} className="inline-block mr-2" /> {t(language, 'Payroll & Bonus' || 'Payroll & Bonus')}
            </button>
          </div>
        </div>

        <div className="tab-content mt-4">
          {activeTab === 'Staff' && (
            <div>
              <h3>{t(language, 'Staff List' || 'All Staff')}</h3>
              {staff.length === 0 ? <p className="text-muted mt-4">No staff added yet.</p> : (
                <div className="table-responsive">
                  <table className="data-table mt-4">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>{t(language, 'Name')}</th>
                        <th>{t(language, 'Role' || 'Role')}</th>
                        <th>{t(language, 'Phone')}</th>
                        <th>{t(language, 'Bank Account' || 'Bank Account')}</th>
                        <th>{t(language, 'Base Salary' || 'Base Salary')} (BDT)</th>
                        <th>{language === 'bn' ? 'বকেয়া (Due)' : 'Due'} (BDT)</th>
                        <th>{t(language, 'Join Date' || 'Join Date')}</th>
                        <th>{t(language, 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map(s => (
                        <tr key={s.id}>
                          <td>{s.id}</td>
                          <td>{s.name}</td>
                          <td>{s.role}</td>
                          <td>{s.phone || 'N/A'}</td>
                          <td>{s.bankAccount || 'N/A'}</td>
                          <td>৳{Number(s.baseSalary || 0).toLocaleString()}</td>
                          <td>
                            <div className="flex-align-gap" style={{ alignItems: 'center' }}>
                              <span className={Number(s.due || 0) > 0 ? "text-danger font-bold" : "text-muted"}>
                                ৳{Number(s.due || 0).toLocaleString()}
                              </span>
                              {Number(s.due || 0) > 0 && (
                                <button
                                  type="button"
                                  className="btn-outline text-success"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                  title={language === 'bn' ? 'বকেয়া জমা নিন' : 'Settle Staff Due'}
                                  onClick={() => openSettleStaff(s)}
                                >
                                  <DollarSign size={12} /> {language === 'bn' ? 'জমা' : 'Settle'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-icon"
                                title={language === 'bn' ? 'টাকা নেওয়ার ইতিহাস' : 'Money taken history'}
                                onClick={() => openMoneyHistory(s)}
                              >
                                <History size={14} />
                              </button>
                            </div>
                          </td>
                          <td>{formatDate(s.joinDate)}</td>
                          <td>
                            <div className="action-buttons flex-align-gap" style={{ flexWrap: 'nowrap' }}>
                              <button className="btn-icon text-info" title="Edit" onClick={() => setEditingStaff(s)}>
                                <Edit size={16} />
                              </button>
                              <button className="btn-icon text-danger" title="Delete" onClick={() => handleDeleteStaff(s.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Attendance' && (
            <div>
              {/* Top View Mode Switcher */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div className="card glass" style={{ padding: '0.35rem', display: 'inline-flex', gap: '0.4rem', margin: 0 }}>
                  <button
                    type="button"
                    className={`type-btn ${attViewMode === 'monthly' ? 'active' : ''}`}
                    onClick={() => setAttViewMode('monthly')}
                    style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}
                  >
                    <Calendar size={16} className="inline mr-1" /> {language === 'bn' ? 'মাসিক হাজিরা রিপোর্ট' : 'Monthly Report'}
                  </button>
                  <button
                    type="button"
                    className={`type-btn ${attViewMode === 'daily' ? 'active' : ''}`}
                    onClick={() => setAttViewMode('daily')}
                    style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}
                  >
                    <Check size={16} className="inline mr-1" /> {language === 'bn' ? 'দৈনিক হাজিরা এন্ট্রি' : 'Daily Entry'}
                  </button>
                </div>

                {/* Mode specific action bar */}
                {attViewMode === 'monthly' ? (
                  <div className="flex-align-gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="text-muted text-sm">{language === 'bn' ? 'মাস:' : 'Month:'}</span>
                      <input
                        type="month"
                        className="p-2 bg-input border border-gray-700 rounded text-main"
                        value={attReportMonth}
                        onChange={(e) => {
                          setAttReportMonth(e.target.value);
                          setAttCustomStart('');
                          setAttCustomEnd('');
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="text-muted text-sm">{language === 'bn' ? 'তারিখ রেঞ্জ:' : 'Range:'}</span>
                      <input
                        type="date"
                        className="p-2 bg-input border border-gray-700 rounded text-main text-xs"
                        value={attCustomStart}
                        placeholder="Start Date"
                        onChange={(e) => setAttCustomStart(e.target.value)}
                        title="Start Date"
                      />
                      <span className="text-muted text-xs">-</span>
                      <input
                        type="date"
                        className="p-2 bg-input border border-gray-700 rounded text-main text-xs"
                        value={attCustomEnd}
                        placeholder="End Date"
                        onChange={(e) => setAttCustomEnd(e.target.value)}
                        title="End Date"
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="text-muted text-sm">{language === 'bn' ? 'কর্মী:' : 'Staff:'}</span>
                      <select
                        className="p-2 bg-input border border-gray-700 rounded text-main"
                        value={attStaffFilter}
                        onChange={(e) => setAttStaffFilter(e.target.value)}
                        style={{ minWidth: '160px' }}
                      >
                        <option value="">{language === 'bn' ? 'সকল কর্মী (All Staff)' : 'All Staff'}</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role || 'Staff'})</option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn-outline flex-align-gap"
                      onClick={() => {
                        const targetStaff = staff.find(s => s.id === attStaffFilter);
                        const fname = targetStaff 
                          ? `Attendance-Statement-${targetStaff.name}-${attReportMonth}`
                          : `Monthly-Attendance-AllStaff-${attReportMonth}`;
                        downloadElementAsPDF('printable-monthly-attendance', fname);
                      }}
                      title={language === 'bn' ? '১ মাসের হাজিরা PDF ডাউনলোড করুন' : 'Download 1-Month Attendance as PDF'}
                    >
                      <Download size={16} /> {language === 'bn' ? '১ মাসের PDF ডাউনলোড' : 'Download Month PDF'}
                    </button>
                    <button
                      className="btn-primary flex-align-gap"
                      onClick={() => {
                        const targetStaff = staff.find(s => s.id === attStaffFilter);
                        const docTitle = targetStaff
                          ? `Attendance Statement - ${targetStaff.name}`
                          : `Monthly Attendance (${attReportMonth})`;
                        printElement('printable-monthly-attendance', docTitle);
                      }}
                      title={language === 'bn' ? 'প্রিন্ট করুন' : 'Print'}
                    >
                      <Printer size={16} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                    </button>
                  </div>
                ) : (
                  <div className="flex-align-gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="text-muted text-sm">{language === 'bn' ? 'তারিখ:' : 'Date:'}</span>
                      <input
                        type="date"
                        className="p-2 bg-input border border-gray-700 rounded text-main"
                        value={attDate}
                        onChange={(e) => setAttDate(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn-outline flex-align-gap"
                      onClick={() => downloadElementAsPDF('printable-daily-attendance', `Daily-Attendance-${attDate}`)}
                      title={language === 'bn' ? 'এই দিনের হাজিরা PDF ডাউনলোড করুন' : 'Download Daily Attendance as PDF'}
                    >
                      <Download size={16} /> {language === 'bn' ? 'PDF ডাউনলোড' : 'Download PDF'}
                    </button>
                    <button
                      className="btn-primary flex-align-gap"
                      onClick={() => printElement('printable-daily-attendance', `Attendance-${attDate}`)}
                    >
                      <Printer size={16} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                    </button>
                  </div>
                )}
              </div>

              {/* View 1: Monthly Attendance Report */}
              {attViewMode === 'monthly' && (
                <div>
                  {(() => {
                    const daysInMonth = getDaysInMonth(attReportMonth, attCustomStart, attCustomEnd);
                    const firstDayStr = daysInMonth[0]?.dateStr || `${attReportMonth}-01`;
                    const lastDayStr = daysInMonth[daysInMonth.length - 1]?.dateStr || `${attReportMonth}-30`;
                    const periodText = `${formatStatementDate(firstDayStr)} - ${formatStatementDate(lastDayStr)}`;

                    const monthlyRecords = (attendance || []).filter(a => {
                      if (attCustomStart && attCustomEnd) {
                        return a.date >= attCustomStart && a.date <= attCustomEnd;
                      }
                      return a.date && a.date.startsWith(attReportMonth);
                    });

                    const selectedStaffMember = staff.find(s => s.id === attStaffFilter);

                    if (selectedStaffMember) {
                      // Individual Staff Monthly Report Matching Exact Photo Layout
                      const staffRecs = monthlyRecords.filter(a => a.staffId === selectedStaffMember.id);

                      return (
                        <div>
                          {/* Top Controls Bar (Hidden on Print) */}
                          <div className="card glass mb-3 hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.65rem 1rem' }}>
                            <button
                              className="btn-outline btn-sm"
                              onClick={() => setAttStaffFilter('')}
                            >
                              ← {language === 'bn' ? 'সকল কর্মীর তালিকায় ফিরে যান' : 'Back to All Staff'}
                            </button>
                            <div className="flex-align-gap">
                              <button
                                className="btn-outline btn-sm flex-align-gap"
                                onClick={() => {
                                  downloadElementAsPDF('printable-monthly-attendance', `Attendance-Statement-${selectedStaffMember.name}-${attReportMonth}`);
                                }}
                              >
                                <Download size={14} /> {language === 'bn' ? 'PDF ডাউনলোড' : 'Download PDF'}
                              </button>
                              <button
                                className="btn-primary btn-sm flex-align-gap"
                                onClick={() => {
                                  printElement('printable-monthly-attendance', `Attendance Statement - ${selectedStaffMember.name}`);
                                }}
                              >
                                <Printer size={14} /> {language === 'bn' ? 'প্রিন্ট' : 'Print'}
                              </button>
                            </div>
                          </div>

                          {/* EXACT STATEMENT DOCUMENT CONTAINER MATCHING USER PHOTO */}
                          <div id="printable-monthly-attendance" style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', color: '#111827' }}>
                            
                            {/* Mint Green Header Banner */}
                            <div className="statement-header-banner" style={{
                              background: '#ecf8f3',
                              border: '1px solid #d0ebe1',
                              borderRadius: '12px',
                              padding: '1.25rem 1.6rem',
                              marginBottom: '1.25rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '1rem'
                            }}>
                              <div>
                                <h2 className="statement-title-name" style={{
                                  fontSize: '1.85rem',
                                  fontWeight: 800,
                                  color: '#134e4a',
                                  margin: 0,
                                  letterSpacing: '-0.5px'
                                }}>
                                  {selectedStaffMember.name.toLowerCase()}
                                </h2>
                                <p className="statement-subtitle" style={{
                                  fontSize: '0.88rem',
                                  color: '#3f6e65',
                                  margin: '4px 0 0 0',
                                  fontWeight: 600
                                }}>
                                  ID: {selectedStaffMember.id} &nbsp;&nbsp;|&nbsp;&nbsp; Role: {selectedStaffMember.role || 'Admin'}
                                </p>
                              </div>

                              <div style={{ textAlign: 'right' }}>
                                <div className="statement-period-label" style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  color: '#0f766e',
                                  marginBottom: '5px'
                                }}>
                                  Statement Period
                                </div>
                                <div className="statement-period-badge" style={{
                                  background: '#ffffff',
                                  border: '1px solid #c7e6d6',
                                  borderRadius: '8px',
                                  padding: '6px 16px',
                                  fontSize: '0.92rem',
                                  fontWeight: 700,
                                  color: '#134e4a',
                                  display: 'inline-block',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                }}>
                                  {periodText}
                                </div>
                              </div>
                            </div>

                            {/* 10-Column Clean White Table matching photo */}
                            <div className="statement-table-card" style={{
                              background: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '10px',
                              overflowX: 'auto'
                            }}>
                              <table className="statement-table" style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '13px',
                                margin: 0,
                                textAlign: 'left'
                              }}>
                                <thead>
                                  <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: '11px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DATE</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: '11px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DAY</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '11px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.04em' }}>STATUS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {daysInMonth.map(d => {
                                    const attRecord = staffRecs.find(a => a.date === d.dateStr);
                                    const stat = attRecord ? attRecord.status : '';
                                    return (
                                      <tr key={d.dateStr} style={{ borderBottom: '1px solid #f3f4f6', background: d.isFriday ? '#fcfdfd' : '#ffffff' }}>
                                        <td style={{ padding: '11px 16px', fontWeight: 600, color: '#111827' }}>{d.dateStr}</td>
                                        <td style={{ padding: '11px 16px', color: '#6b7280' }}>{d.dayName}</td>
                                        <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                                          {stat === 'Present' ? (
                                            <span className="statement-badge-present" style={{
                                              background: '#ecfdf5',
                                              border: '1px solid #a7f3d0',
                                              color: '#047857',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              Present
                                            </span>
                                          ) : stat === 'Absent' ? (
                                            <span className="statement-badge-absent" style={{
                                              background: '#fee2e2',
                                              border: '1px solid #fecaca',
                                              color: '#dc2626',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              Absent
                                            </span>
                                          ) : stat === 'Half Day' ? (
                                            <span className="statement-badge-halfday" style={{
                                              background: '#fef3c7',
                                              border: '1px solid #fde68a',
                                              color: '#d97706',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              Half Day
                                            </span>
                                          ) : stat === 'Late' ? (
                                            <span className="statement-badge-late" style={{
                                              background: '#dbeafe',
                                              border: '1px solid #bfdbfe',
                                              color: '#1d4ed8',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              Late
                                            </span>
                                          ) : stat === 'Leave' ? (
                                            <span className="statement-badge-leave" style={{
                                              background: '#f3f4f6',
                                              border: '1px solid #e5e7eb',
                                              color: '#4b5563',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              Leave
                                            </span>
                                          ) : stat ? (
                                            <span style={{
                                              background: '#f1f5f9',
                                              border: '1px solid #cbd5e1',
                                              color: '#334155',
                                              borderRadius: '4px',
                                              padding: '3px 12px',
                                              fontSize: '11px',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              {stat}
                                            </span>
                                          ) : (
                                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                                              {d.isFriday ? 'Weekend' : '-'}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // All Staff Monthly Summary
                      const allStaffSummary = staff.map(s => {
                        const sRecs = monthlyRecords.filter(a => a.staffId === s.id);
                        const fullP = sRecs.filter(a => a.status === 'Present').length;
                        const halfD = sRecs.filter(a => a.status === 'Half Day').length;
                        const lateC = sRecs.filter(a => a.status === 'Late').length;
                        const absC = sRecs.filter(a => a.status === 'Absent').length;
                        const leaveC = sRecs.filter(a => a.status === 'Leave').length;
                        const effDays = fullP + (halfD * 0.5);
                        return { ...s, fullP, halfD, lateC, absC, leaveC, effDays, totalRecords: sRecs.length };
                      });

                      const totalPShop = allStaffSummary.reduce((sum, s) => sum + s.fullP, 0);
                      const totalHShop = allStaffSummary.reduce((sum, s) => sum + s.halfD, 0);
                      const totalLShop = allStaffSummary.reduce((sum, s) => sum + s.lateC, 0);
                      const totalAShop = allStaffSummary.reduce((sum, s) => sum + s.absC, 0);
                      const totalLeaveShop = allStaffSummary.reduce((sum, s) => sum + s.leaveC, 0);

                      return (
                        <div>
                          {/* Shop Monthly KPIs */}
                          <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid var(--primary)' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'মোট স্টাফ' : 'Total Staff'}</span>
                              <strong className="text-lg">{staff.length} {language === 'bn' ? 'জন' : ''}</strong>
                            </div>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #16a34a' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'মোট পূর্ণ উপস্থিতি' : 'Total Present'}</span>
                              <strong className="text-lg text-success">{totalPShop} {language === 'bn' ? 'দিন' : ''}</strong>
                            </div>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #d97706' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'মোট হাফ ডে' : 'Total Half Day'}</span>
                              <strong className="text-lg text-warning">{totalHShop} {language === 'bn' ? 'টি' : ''}</strong>
                            </div>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #0284c7' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'দেরিতে উপস্থিতি' : 'Total Late'}</span>
                              <strong className="text-lg text-info">{totalLShop} {language === 'bn' ? 'দিন' : ''}</strong>
                            </div>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #dc2626' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'অনুপস্থিতি' : 'Total Absent'}</span>
                              <strong className="text-lg text-danger">{totalAShop} {language === 'bn' ? 'দিন' : ''}</strong>
                            </div>
                            <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #6b7280' }}>
                              <span className="text-muted text-xs block">{language === 'bn' ? 'ছুটি' : 'Total Leave'}</span>
                              <strong className="text-lg text-muted">{totalLeaveShop} {language === 'bn' ? 'দিন' : ''}</strong>
                            </div>
                          </div>

                          {/* All Staff Summary Table */}
                          <div id="printable-monthly-attendance" className="table-responsive card glass" style={{ padding: '1rem' }}>
                            <div className="print-report-header" style={{ display: 'none' }}>
                              <div style={{ textAlign: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #333', paddingBottom: '0.75rem' }}>
                                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: 700, color: '#111' }}>Allahr dan gents point</h2>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 600, color: '#333' }}>
                                  {language === 'bn' ? 'মাসিক সকল স্টাফ হাজিরা বিবরণী' : 'All Staff Monthly Attendance Report'} ({attReportMonth})
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                                  {language === 'bn' ? 'মাস' : 'Month'}: {attReportMonth} | {language === 'bn' ? 'মোট স্টাফ' : 'Total Staff'}: {staff.length} জন | {language === 'bn' ? 'মাসের মোট দিন' : 'Total Days'}: {daysInMonth.length} দিন
                                </p>
                              </div>
                              <table style={{ width: '100%', marginBottom: '1rem', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <tbody>
                                  <tr style={{ background: '#f8fafc' }}>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'মোট স্টাফ' : 'Staff'}:</strong> {staff.length} {language === 'bn' ? 'জন' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'মোট পূর্ণ উপস্থিতি' : 'Present'}:</strong> {totalPShop} {language === 'bn' ? 'দিন' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'মোট হাফ ডে' : 'Half Day'}:</strong> {totalHShop} {language === 'bn' ? 'টি' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'দেরিতে উপস্থিতি' : 'Late'}:</strong> {totalLShop} {language === 'bn' ? 'দিন' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'অনুপস্থিতি' : 'Absent'}:</strong> {totalAShop} {language === 'bn' ? 'দিন' : ''}</td>
                                    <td style={{ textAlign: 'center', padding: '6px' }}><strong>{language === 'bn' ? 'ছুটি' : 'Leave'}:</strong> {totalLeaveShop} {language === 'bn' ? 'দিন' : ''}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>{language === 'bn' ? 'নাম' : 'Name'}</th>
                                  <th>{language === 'bn' ? 'পদবী' : 'Role'}</th>
                                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'উপস্থিত' : 'Present'}</th>
                                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'হাফ ডে' : 'Half Day'}</th>
                                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'দেরি' : 'Late'}</th>
                                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</th>
                                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'ছুটি' : 'Leave'}</th>
                                  <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'কার্যকর দিন' : 'Effective Days'}</th>
                                  <th className="hide-on-print" style={{ textAlign: 'center' }}>{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allStaffSummary.map(s => (
                                  <tr key={s.id}>
                                    <td><code>{s.id}</code></td>
                                    <td className="font-bold">{s.name}</td>
                                    <td>{s.role || 'Staff'}</td>
                                    <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 'bold' }}>{s.fullP}</td>
                                    <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 'bold' }}>{s.halfD}</td>
                                    <td style={{ textAlign: 'center', color: '#0284c7' }}>{s.lateC}</td>
                                    <td style={{ textAlign: 'center', color: '#dc2626' }}>{s.absC}</td>
                                    <td style={{ textAlign: 'center', color: '#6b7280' }}>{s.leaveC}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', color: '#2563eb' }}>
                                      {s.effDays} / {daysInMonth.length}
                                    </td>
                                    <td className="hide-on-print" style={{ textAlign: 'center' }}>
                                      <button
                                        className="btn-outline btn-sm flex-align-gap"
                                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex' }}
                                        onClick={() => setAttStaffFilter(s.id)}
                                        title={language === 'bn' ? 'এই কর্মীর ১ মাসের হাজিরা শিট দেখুন' : "View staff's monthly sheet"}
                                      >
                                        <Eye size={14} /> {language === 'bn' ? '১ মাসের শিট' : 'Month Sheet'}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {allStaffSummary.length === 0 && (
                                  <tr><td colSpan="10" className="text-center text-muted">{language === 'bn' ? 'কোনো কর্মী পাওয়া যায়নি।' : 'No staff found.'}</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}

              {/* View 2: Daily Attendance Entry & Single Day Report */}
              {attViewMode === 'daily' && (
                <div>
                  {/* Summary KPIs for selected date */}
                  <div className="grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid var(--primary)' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'মোট স্টাফ' : 'Total Staff'}</span>
                      <strong className="text-lg">{staff.length}</strong>
                    </div>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #16a34a' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'উপস্থিত' : 'Present'}</span>
                      <strong className="text-lg text-success">{attendance.filter(a => a.date === attDate && a.status === 'Present').length}</strong>
                    </div>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #d97706' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'হাফ ডে' : 'Half Day'}</span>
                      <strong className="text-lg text-warning">{attendance.filter(a => a.date === attDate && a.status === 'Half Day').length}</strong>
                    </div>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #0284c7' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'দেরিতে' : 'Late'}</span>
                      <strong className="text-lg text-info">{attendance.filter(a => a.date === attDate && a.status === 'Late').length}</strong>
                    </div>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #dc2626' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</span>
                      <strong className="text-lg text-danger">{attendance.filter(a => a.date === attDate && a.status === 'Absent').length}</strong>
                    </div>
                    <div className="card bg-input text-center" style={{ padding: '0.6rem', borderLeft: '3px solid #6b7280' }}>
                      <span className="text-muted text-xs block">{language === 'bn' ? 'ছুটি' : 'On Leave'}</span>
                      <strong className="text-lg text-muted">{attendance.filter(a => a.date === attDate && a.status === 'Leave').length}</strong>
                    </div>
                  </div>

                  {staff.length === 0 ? <p className="text-muted">{language === 'bn' ? 'কোনো স্টাফ পাওয়া যায়নি।' : 'No staff found. Please add staff first.'}</p> : (
                    <div id="printable-daily-attendance" className="table-responsive card glass" style={{ padding: '1rem' }}>
                      <div className="print-report-header" style={{ display: 'none' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #333', paddingBottom: '0.75rem' }}>
                          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: 700, color: '#111' }}>Allahr dan gents point</h2>
                          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 600, color: '#333' }}>
                            {language === 'bn' ? 'দৈনিক স্টাফ হাজিরা বিবরণী' : 'Daily Staff Attendance Sheet'}
                          </h3>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                            {language === 'bn' ? 'তারিখ' : 'Date'}: {attDate} | {language === 'bn' ? 'মোট স্টাফ' : 'Total Staff'}: {staff.length} জন | {language === 'bn' ? 'কার্যকর উপস্থিত' : 'Effective Present'}: {attendance.filter(a => a.date === attDate && a.status === 'Present').length + (attendance.filter(a => a.date === attDate && a.status === 'Half Day').length * 0.5)} দিন
                          </p>
                        </div>
                      </div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>{t(language, 'Name')}</th>
                            <th>{t(language, 'Role' || 'Role')}</th>
                            <th>{t(language, 'Status' || 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staff.map(s => {
                            const existingAtt = attendance.find(a => a.staffId === s.id && a.date === attDate);
                            const status = existingAtt ? existingAtt.status : '';
                            return (
                              <tr key={s.id}>
                                <td><code>{s.id}</code></td>
                                <td className="font-bold">{s.name}</td>
                                <td>{s.role || 'Staff'}</td>
                                <td>
                                  <span className="print-only-status" style={{ display: 'none', fontWeight: 'bold' }}>
                                    {status === 'Present' && '✓ উপস্থিত (Present)'}
                                    {status === 'Half Day' && '½ হাফ ডে (Half Day)'}
                                    {status === 'Late' && '⏰ দেরিতে (Late)'}
                                    {status === 'Absent' && '✗ অনুপস্থিত (Absent)'}
                                    {status === 'Leave' && '🏖️ ছুটি (On Leave)'}
                                    {!status && '—'}
                                  </span>
                                  <select
                                    className="p-2 bg-input border border-gray-700 rounded hide-on-print"
                                    value={status}
                                    onChange={(e) => markAttendance(s.id, attDate, e.target.value)}
                                  >
                                    <option value="" disabled>{language === 'bn' ? 'স্ট্যাটাস দিন' : 'Mark Status'}</option>
                                    <option value="Present">{language === 'bn' ? 'উপস্থিত (Present)' : 'Present'}</option>
                                    <option value="Half Day">{language === 'bn' ? 'হাফ ডে (Half Day)' : 'Half Day'}</option>
                                    <option value="Late">{language === 'bn' ? 'দেরিতে (Late)' : 'Late'}</option>
                                    <option value="Absent">{language === 'bn' ? 'অনুপস্থিত (Absent)' : 'Absent'}</option>
                                    <option value="Leave">{language === 'bn' ? 'ছুটি (On Leave)' : 'On Leave'}</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Leave' && (
            <div>
              <h3>{t(language, 'Leave Requests' || 'Leave Requests')}</h3>
              {leaves.length === 0 ? <div className="text-center text-muted py-8">No leave requests.</div> : (
                <div className="table-responsive">
                  <table className="data-table mt-4">
                    <thead>
                      <tr>
                        <th>{t(language, 'Date')}</th>
                        <th>{t(language, 'Name' || 'Staff Name')}</th>
                        <th>{t(language, 'Leave Type' || 'Type')}</th>
                        <th>{t(language, 'Reason' || 'Reason')}</th>
                        <th>{t(language, 'Status' || 'Status')}</th>
                        <th>{t(language, 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.map(l => {
                        const staffMember = staff.find(s => s.id === l.staffId);
                        return (
                          <tr key={l.id}>
                            <td>{formatDate(l.date)}</td>
                            <td>{staffMember ? staffMember.name : 'Unknown'}</td>
                            <td>{l.type}</td>
                            <td>{l.reason}</td>
                            <td>
                              <span className={`badge ${l.status === 'Approved' ? 'bg-success text-white px-2 py-1 rounded' : l.status === 'Rejected' ? 'bg-danger text-white px-2 py-1 rounded' : 'bg-warning text-black px-2 py-1 rounded'}`}>
                                {l.status}
                              </span>
                            </td>
                            <td>
                              {l.status === 'Pending' && (
                                <div className="flex-align-gap">
                                  <button className="btn-outline text-success" style={{ padding: '0.2rem 0.5rem' }} onClick={() => updateLeaveStatus(l.id, 'Approved')}><Check size={16} /></button>
                                  <button className="btn-outline text-danger" style={{ padding: '0.2rem 0.5rem' }} onClick={() => updateLeaveStatus(l.id, 'Rejected')}><X size={16} /></button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Payroll' && (
            <div>
              <div className="flex-align-gap mb-4" style={{ justifyContent: 'space-between' }}>
                <h3>{t(language, 'Payroll & Bonus' || 'Monthly Payroll Summary')}</h3>
                <div className="flex-align-gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="month"
                    className="p-2 bg-input border border-gray-700 rounded text-main"
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary flex-align-gap"
                    onClick={handleGenerateMonthPayroll}
                    disabled={generatingMonth || staff.length === 0}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <DollarSign size={16} />
                    {generatingMonth
                      ? (language === 'bn' ? 'তৈরি হচ্ছে…' : 'Generating…')
                      : (language === 'bn' ? 'এই মাসের বেতন তৈরি করুন' : 'Generate Payroll')}
                  </button>
                </div>
              </div>
              {(() => {
                const monthRows = (payrolls || []).filter((pr) => pr.month === payrollMonth);
                if (!monthRows.length) {
                  return (
                    <div className="payroll-month-note">
                      {language === 'bn'
                        ? 'এই মাসের বেতন এখনো তৈরি হয়নি। হাজিরা ঠিক আছে কিনা দেখে "এই মাসের বেতন তৈরি করুন" চাপুন।'
                        : 'Payroll for this month is not generated yet. Check attendance, then press Generate Payroll.'}
                    </div>
                  );
                }
                const net = monthRows.reduce((a, pr) => a + Number(pr.netPay || 0), 0);
                const paid = monthRows.reduce((a, pr) => a + Number(pr.paidAmount || 0), 0);
                const cutSum = monthRows.reduce((a, pr) => a + Number(pr.deduction || 0), 0);
                return (
                  <div className="payroll-month-strip">
                    <div><span>{language === 'bn' ? 'তৈরি হয়েছে' : 'Generated'}</span><b>{monthRows.length} {language === 'bn' ? 'জন' : 'staff'}</b></div>
                    <div><span>{language === 'bn' ? 'মোট বেতন' : 'Total salary'}</span><b>৳{net.toLocaleString()}</b></div>
                    <div><span>{language === 'bn' ? 'কর্তন' : 'Deducted'}</span><b className="text-danger">৳{cutSum.toLocaleString()}</b></div>
                    <div><span>{language === 'bn' ? 'দেওয়া হয়েছে' : 'Paid'}</span><b className="text-success">৳{paid.toLocaleString()}</b></div>
                    <div><span>{language === 'bn' ? 'বাকি' : 'Remaining'}</span><b className="text-danger">৳{Math.max(0, net - paid).toLocaleString()}</b></div>
                  </div>
                );
              })()}
              {staff.length === 0 ? <p className="text-muted">No staff to generate payroll.</p> : (
                <div className="table-responsive">
                  <table className="data-table mt-4">
                    <thead>
                      <tr>
                        <th>{t(language, 'Name' || 'Staff Name')}</th>
                        <th>{t(language, 'Days Present' || 'Days Present')}</th>
                        <th>{t(language, 'Base Salary' || 'Base Salary')} (BDT)</th>
                        <th>{language === 'bn' ? 'কর্তন (অনুপস্থিতি)' : 'Deduction (absence)'}</th>
                        <th>{t(language, 'Bonus' || 'Bonus')}</th>
                        <th>{language === 'bn' ? 'মোট প্রদেয়' : 'Total Net'} (BDT)</th>
                        <th>{language === 'bn' ? 'পরিশোধিত' : 'Paid Amount'} (BDT)</th>
                        <th>{language === 'bn' ? 'অবশিষ্ট পাওনা' : 'Remaining'} (BDT)</th>
                        <th>{t(language, 'Status' || 'Status')}</th>
                        <th>{language === 'bn' ? 'কিস্তি পরিশোধ' : 'Pay Installment'}</th>
                        <th>{language === 'bn' ? 'বিবরণ' : 'Details'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map(s => {
                        const att = payrollAtt[s.id] || null;
                        const fullDays = att ? att.present + att.late : attendance.filter(a => a.staffId === s.id && (a.status === 'Present' || a.status === 'Late') && a.date.startsWith(payrollMonth)).length;
                        const halfDays = att ? att.halfDay : attendance.filter(a => a.staffId === s.id && a.status === 'Half Day' && a.date.startsWith(payrollMonth)).length;
                        const absentDays = att ? att.absent : attendance.filter(a => a.staffId === s.id && a.status === 'Absent' && a.date.startsWith(payrollMonth)).length;
                        const leaveDays = att ? att.leave : 0;
                        const monthDays = att ? att.daysInMonth : 30;
                        const presentDays = fullDays + (halfDays * 0.5);
                        const existingPayroll = (payrolls || []).find(p => (p.staffId === s.id || p.staff_id === s.id) && p.month === payrollMonth);
                        const bonus = bonuses[s.id] !== undefined ? bonuses[s.id] : (existingPayroll ? Number(existingPayroll.bonus || 0) : 0);
                        const paidAmount = existingPayroll ? Number(existingPayroll.paidAmount || existingPayroll.paid_amount || 0) : 0;
                        const isFullyPaid = existingPayroll ? Boolean(existingPayroll.is_paid) : false;
                        // Once money has gone out the month's salary is fixed at what it was.
                        const baseSalary = existingPayroll && paidAmount > 0 ? Number(existingPayroll.baseSalary ?? existingPayroll.base_salary ?? s.baseSalary ?? 0) : Number(s.baseSalary || 0);
                        const dayRate = att ? Number(att.dayRate) : (monthDays ? baseSalary / monthDays : 0);
                        const autoCut = att ? Number(att.autoDeduction) : Math.round(dayRate * (absentDays + halfDays * 0.5));
                        const savedCut = existingPayroll ? Number(existingPayroll.deduction || 0) : null;
                        const cutInput = deductions[s.id];
                        const cut = isFullyPaid
                          ? Number(existingPayroll.deduction || 0)
                          : Math.max(0, Number(cutInput !== undefined && cutInput !== '' ? cutInput : (savedCut !== null && Number(existingPayroll.deduction || 0) !== Number(existingPayroll.autoDeduction || 0) ? savedCut : autoCut)) || 0);
                        const totalNetPay = isFullyPaid
                          ? Number(existingPayroll.netPay || existingPayroll.net_pay || 0)
                          : Math.max(0, Math.round(baseSalary + bonus - cut));
                        const remainingDue = Math.max(0, Math.round(totalNetPay - paidAmount));
                        const isPartial = paidAmount > 0 && !isFullyPaid;

                        const currentPayInput = payInputs[s.id] !== undefined ? payInputs[s.id] : '';
                        const staffDue = Number(s.due || 0);
                        const advOn = advAdjust[s.id] !== undefined;
                        const advAmount = advOn ? Math.max(0, Math.min(Number(advAdjust[s.id]) || 0, staffDue, remainingDue)) : 0;
                        const cashLeft = remainingDue - advAmount;
                        const numInput = parseFloat(currentPayInput);
                        const hasExcess = !isNaN(numInput) && numInput > cashLeft;
                        const excessAmount = hasExcess ? Math.round(numInput - cashLeft) : 0;

                        return (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.name}</strong>
                              <div className="text-xs text-muted">{s.role || 'Staff'}</div>
                              {staffDue > 0 && (
                                <div className="text-xs text-danger" style={{ fontWeight: 700 }}>
                                  {language === 'bn' ? 'অগ্রিম/বকেয়া' : 'Advance/due'} ৳{staffDue.toLocaleString()}
                                </div>
                              )}
                              <button type="button" className="money-history-link" onClick={() => openMoneyHistory(s)}>
                                <History size={11} /> {language === 'bn' ? 'টাকা নেওয়ার ইতিহাস' : 'Money taken'}
                              </button>
                            </td>
                            <td>
                              <strong>{presentDays}</strong> / {monthDays}
                              <div className="payroll-att-chips">
                                {absentDays > 0 && <span className="pa-chip pa-absent">{language === 'bn' ? 'অনুপস্থিত' : 'Absent'} {absentDays}</span>}
                                {halfDays > 0 && <span className="pa-chip pa-half">{language === 'bn' ? 'হাফ ডে' : 'Half'} {halfDays}</span>}
                                {leaveDays > 0 && <span className="pa-chip pa-leave">{language === 'bn' ? 'ছুটি' : 'Leave'} {leaveDays}</span>}
                              </div>
                            </td>
                            <td>৳{baseSalary.toLocaleString()}</td>
                            <td>
                              {isFullyPaid ? (
                                <span className={cut > 0 ? 'text-danger font-bold' : 'text-muted'}>
                                  {cut > 0 ? `−৳${cut.toLocaleString()}` : (autoCut > 0 || Number(existingPayroll?.autoDeduction) > 0 ? (language === 'bn' ? 'কাটা হয়নি' : 'Not cut') : '—')}
                                </span>
                              ) : (
                                <div className="payroll-cut">
                                  <div className="flex-align-gap" style={{ alignItems: 'center' }}>
                                    <span className="text-danger" style={{ fontWeight: 700 }}>−৳</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={cutInput !== undefined ? cutInput : cut}
                                      onChange={(e) => setDeductions({ ...deductions, [s.id]: e.target.value })}
                                      style={{ width: '75px', padding: '0.2rem 0.35rem', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    />
                                  </div>
                                  {autoCut > 0 ? (
                                    <>
                                      <small className="text-muted">
                                        {language === 'bn'
                                          ? `হাজিরা অনুযায়ী ৳${autoCut.toLocaleString()} (${absentDays + halfDays * 0.5} দিন × ৳${Math.round(dayRate).toLocaleString()})`
                                          : `By attendance ৳${autoCut.toLocaleString()} (${absentDays + halfDays * 0.5} days × ৳${Math.round(dayRate).toLocaleString()})`}
                                      </small>
                                      <div className="payroll-cut-btns">
                                        <button type="button" className={cut === autoCut ? 'active' : ''} onClick={() => setDeductions({ ...deductions, [s.id]: String(autoCut) })}>
                                          {language === 'bn' ? 'কাটুন' : 'Cut'}
                                        </button>
                                        <button type="button" className={cut === 0 ? 'active' : ''} onClick={() => setDeductions({ ...deductions, [s.id]: '0' })}>
                                          {language === 'bn' ? 'কাটবেন না' : "Don't cut"}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <small className="text-muted">{language === 'bn' ? 'অনুপস্থিতি নেই' : 'No absence'}</small>
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              {isFullyPaid ? (
                                <span>৳{bonus.toLocaleString()}</span>
                              ) : (
                                <div className="flex-align-gap" style={{ alignItems: 'center' }}>
                                  <Award size={14} className="text-warning" />
                                  <input
                                    type="number"
                                    value={bonus}
                                    onChange={(e) => setBonuses({ ...bonuses, [s.id]: parseFloat(e.target.value) || 0 })}
                                    style={{ width: '65px', padding: '0.2rem 0.35rem', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="text-primary font-bold">৳{totalNetPay.toLocaleString()}</td>
                            <td className="text-success font-bold">৳{paidAmount.toLocaleString()}</td>
                            <td className={remainingDue > 0 ? "text-danger font-bold" : "text-muted"}>
                              ৳{remainingDue.toLocaleString()}
                            </td>
                            <td>
                              {isFullyPaid ? (
                                <span className="badge" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  ✓ {language === 'bn' ? 'পরিশোধিত' : 'Paid'}
                                </span>
                              ) : isPartial ? (
                                <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  ⏳ {language === 'bn' ? 'আংশিক' : 'Partial'}
                                </span>
                              ) : (
                                <span className="badge" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                  {language === 'bn' ? 'বাকি' : 'Pending'}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div className="flex-align-gap" style={{ alignItems: 'center' }}>
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder={cashLeft > 0 ? String(cashLeft) : (language === 'bn' ? 'পরিমাণ' : 'Amount')}
                                    value={currentPayInput}
                                    onChange={(e) => setPayInputs({ ...payInputs, [s.id]: e.target.value })}
                                    style={{ width: '85px', padding: '0.25rem 0.4rem', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                                  />
                                  <button
                                    className="btn-primary"
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                    onClick={() => handlePaySalaryInstallment(s, presentDays, bonus, currentPayInput, cut, advAmount)}
                                  >
                                    {language === 'bn' ? 'টাকা দিন' : 'Pay'}
                                  </button>
                                </div>
                                {staffDue > 0 && remainingDue > 0 && (
                                  <div className="adv-adjust">
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={advOn}
                                        onChange={(e) => setAdvAdjust((prev) => {
                                          const next = { ...prev };
                                          if (e.target.checked) next[s.id] = String(Math.min(staffDue, remainingDue));
                                          else delete next[s.id];
                                          return next;
                                        })}
                                      />
                                      {language === 'bn' ? 'অগ্রিম বেতন থেকে কাটুন' : 'Take advance out of salary'}
                                    </label>
                                    {advOn && (
                                      <div className="flex-align-gap" style={{ alignItems: 'center' }}>
                                        <span>৳</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max={Math.min(staffDue, remainingDue)}
                                          value={advAdjust[s.id]}
                                          onChange={(e) => setAdvAdjust({ ...advAdjust, [s.id]: e.target.value })}
                                        />
                                        <small className="text-muted">/ ৳{staffDue.toLocaleString()}</small>
                                      </div>
                                    )}
                                    {advOn && advAmount > 0 && (
                                      <small className="text-muted">
                                        {language === 'bn'
                                          ? `বেতন ৳${remainingDue.toLocaleString()} = অগ্রিম কাটা ৳${advAmount.toLocaleString()} + নগদ ৳${cashLeft.toLocaleString()}`
                                          : `Salary ৳${remainingDue.toLocaleString()} = advance ৳${advAmount.toLocaleString()} + cash ৳${cashLeft.toLocaleString()}`}
                                      </small>
                                    )}
                                  </div>
                                )}
                                {hasExcess && (
                                  <small className="text-warning" style={{ fontSize: '0.72rem', lineHeight: '1.2' }}>
                                    ⚠️ অতিরিক্ত ৳{excessAmount.toLocaleString()} Due-তে যাবে
                                  </small>
                                )}
                              </div>
                            </td>
                            <td>
                              {existingPayroll ? (
                                <button
                                  className="btn-icon text-info"
                                  title={language === 'bn' ? 'পরিশোধের ইতিহাস / রসিদ' : 'Payment History & Payslip'}
                                  onClick={() => setViewPayrollDetails({ staff: s, payroll: existingPayroll })}
                                >
                                  <Eye size={16} />
                                </button>
                              ) : (
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Staff Drawer */}
      {showAddStaffModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Add Staff' || 'Add New Staff')}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setShowAddStaffModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form id="add-staff-form" onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="responsive-grid-2">
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Name</label>
                    <input required type="text" className="w-full" placeholder="e.g. Rahim" value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Role</label>
                    <select className="w-full" value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}>
                      <option value="Salesman">Salesman</option>
                      <option value="Manager">Manager</option>
                      <option value="Delivery">Delivery</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Base Salary (BDT)</label>
                    <input required type="number" min="0" className="w-full" placeholder="e.g. 15000" value={newStaff.baseSalary} onChange={e => setNewStaff({ ...newStaff, baseSalary: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Phone</label>
                    <input type="text" className="w-full" placeholder="e.g. 01700000000" value={newStaff.phone} onChange={e => setNewStaff({ ...newStaff, phone: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="text-muted mb-1 block">Address</label>
                    <input type="text" className="w-full" placeholder="e.g. Dhaka" value={newStaff.address} onChange={e => setNewStaff({ ...newStaff, address: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="text-muted mb-1 block">Bank Account Number</label>
                    <input type="text" className="w-full" placeholder="Account No" value={newStaff.bankAccount} onChange={e => setNewStaff({ ...newStaff, bankAccount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Username *</label>
                    <input required type="text" className="w-full" placeholder="Login ID (Unique)" value={newStaff.username} onChange={e => setNewStaff({ ...newStaff, username: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Password *</label>
                    <input required type="password" className="w-full" placeholder="Secret" value={newStaff.password} onChange={e => setNewStaff({ ...newStaff, password: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowAddStaffModal(false)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save' || 'Add Staff')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Staff Drawer */}
      {editingStaff && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Edit Staff')}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setEditingStaff(null)}>
                <X size={24} />
              </button>
            </div>
            <form id="edit-staff-form" onSubmit={handleEditStaff} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="responsive-grid-2">
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Name</label>
                    <input required type="text" className="w-full" value={editingStaff.name} onChange={e => setEditingStaff({ ...editingStaff, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Role</label>
                    <select className="w-full" value={editingStaff.role} onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })}>
                      <option value="Salesman">Salesman</option>
                      <option value="Manager">Manager</option>
                      <option value="Delivery">Delivery</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Base Salary (BDT)</label>
                    <input required type="number" min="0" className="w-full" value={editingStaff.baseSalary} onChange={e => setEditingStaff({ ...editingStaff, baseSalary: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Phone</label>
                    <input type="text" className="w-full" value={editingStaff.phone} onChange={e => setEditingStaff({ ...editingStaff, phone: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="text-muted mb-1 block">Address</label>
                    <input type="text" className="w-full" value={editingStaff.address} onChange={e => setEditingStaff({ ...editingStaff, address: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="text-muted mb-1 block">Bank Account Number</label>
                    <input type="text" className="w-full" value={editingStaff.bankAccount} onChange={e => setEditingStaff({ ...editingStaff, bankAccount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Username</label>
                    <input type="text" className="w-full" value={editingStaff.username} onChange={e => setEditingStaff({ ...editingStaff, username: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="text-muted mb-1 block">Password</label>
                    <input type="text" className="w-full" placeholder="Leave blank to keep same" value={editingStaff.password} onChange={e => setEditingStaff({ ...editingStaff, password: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setEditingStaff(null)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save Changes')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Apply Leave Drawer */}
      {showLeaveModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{t(language, 'Apply Leave' || 'Apply Leave')}</h2>
              <button type="button" className="drawer-close-btn" onClick={() => setShowLeaveModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form id="apply-leave-form" onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="form-group mb-4">
                  <label>Date</label>
                  <input required type="date" className="w-full" value={newLeave.date} onChange={e => setNewLeave({ ...newLeave, date: e.target.value })} />
                </div>
                <div className="form-group mb-4">
                  <label>Staff</label>
                  <select className="w-full" required value={newLeave.staffId} onChange={e => setNewLeave({ ...newLeave, staffId: e.target.value })}>
                    <option value="" disabled>Select Staff</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group mb-4">
                  <label>Leave Type</label>
                  <select className="w-full" value={newLeave.type} onChange={e => setNewLeave({ ...newLeave, type: e.target.value })}>
                    <option value="Casual">Casual</option>
                    <option value="Sick">Sick</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
                <div className="form-group mb-4">
                  <label>Reason</label>
                  <input required type="text" className="w-full" value={newLeave.reason} onChange={e => setNewLeave({ ...newLeave, reason: e.target.value })} />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setShowLeaveModal(false)}>{t(language, 'Cancel')}</button>
                <button type="submit" className="btn-primary">{t(language, 'Save' || 'Submit Request')}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* View & Print Staff Drawer */}
      {selectedStaff && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">

            <div className="drawer-header">
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Staff Profile Document</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedStaff(null)}>
                <X size={24} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-staff" style={{ padding: '1.5rem', color: '#1e293b' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', borderBottom: '3px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '2.5rem' }}>
                  <h2 style={{ fontSize: '2.4rem', fontWeight: 'bold', margin: '0 0 0.5rem', color: '#0f172a' }}>Allahr dan gents point</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px' }}>Staff Details Document</p>
                </div>

                {/* Identity */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#0f172a' }}>{selectedStaff.name}</h3>
                    <p style={{ margin: 0, color: '#475569', fontSize: '1.2rem', fontWeight: '500' }}>{selectedStaff.role} <span style={{ opacity: 0.5 }}>•</span> ID: {selectedStaff.id}</p>
                  </div>
                  <div style={{ textAlign: 'right', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 0.25rem', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Join Date</p>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#0f172a', fontSize: '1.2rem' }}>{formatDate(selectedStaff.joinDate)}</p>
                  </div>
                </div>

                {/* Table of Details */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3rem', fontSize: '0.9rem' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1.25rem 0', color: '#64748b', width: '40%' }}>Phone Number</td>
                      <td style={{ padding: '1.25rem 0', fontWeight: '600', textAlign: 'right' }}>{selectedStaff.phone || 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1.25rem 0', color: '#64748b' }}>Address</td>
                      <td style={{ padding: '1.25rem 0', fontWeight: '600', textAlign: 'right' }}>{selectedStaff.address || 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1.25rem 0', color: '#64748b' }}>System Username</td>
                      <td style={{ padding: '1.25rem 0', fontWeight: '600', textAlign: 'right' }}>{selectedStaff.username || 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1.25rem 0', color: '#64748b' }}>System Password</td>
                      <td style={{ padding: '1.25rem 0', fontWeight: '600', textAlign: 'right' }}>{selectedStaff.password ? '••••••••' : 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '1.25rem 0', color: '#64748b' }}>Bank Account</td>
                      <td style={{ padding: '1.25rem 0', fontWeight: '600', textAlign: 'right' }}>{selectedStaff.bankAccount || 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Salary Highlight */}
                <div style={{ backgroundColor: '#f0fdf4', padding: '1.5rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '2px solid #bbf7d0' }}>
                  <span style={{ color: '#166534', fontWeight: '700', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Monthly Base Salary</span>
                  <span style={{ fontWeight: '900', fontSize: '2.5rem', color: '#14532d' }}>৳{selectedStaff.baseSalary.toLocaleString()}</span>
                </div>

                <div style={{ textAlign: 'center', marginTop: '3rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Document Generated on {formatDate(new Date())} at {formatTime(new Date())}
                </div>
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
              <button className="btn-primary flex-align-gap" style={{ padding: '1rem 3rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                printElement('printable-single-staff', 'HR');
              }}>
                <Printer size={20} /> Print Document
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settle Staff Due Modal */}
      {settleStaffModal && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '480px', width: '100%' }}>
            <div className="drawer-header">
              <h2>💰 {language === 'bn' ? 'স্টাফের বকেয়া জমা নিন' : 'Settle Staff Due'}</h2>
              <button className="drawer-close-btn" onClick={() => setSettleStaffModal(null)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSettleStaffSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-body">
                <div className="card mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className="text-muted">{language === 'bn' ? 'কর্মীর নাম:' : 'Staff Name:'}</span>
                    <strong>{settleStaffModal.name} ({settleStaffModal.role || 'Staff'})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="text-muted">{language === 'bn' ? 'মোট বকেয়া (Due):' : 'Total Due:'}</span>
                    <strong className="text-danger font-bold" style={{ fontSize: '1.25rem' }}>৳{Number(settleStaffModal.due || 0).toLocaleString()}</strong>
                  </div>
                </div>

                <div className="form-group mb-4">
                  <label>{language === 'bn' ? 'জমার পরিমাণ (BDT)' : 'Settlement Amount (BDT)'}</label>
                  <input
                    type="number"
                    className="w-full"
                    required
                    min="1"
                    max={settleStaffModal.due}
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="e.g. 1000"
                  />
                </div>

                <div className="form-group mb-4">
                  <label>{language === 'bn' ? 'তারিখ' : 'Date'}</label>
                  <input
                    type="date"
                    className="w-full"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                  />
                </div>

                <div className="form-group mb-4">
                  <label>{language === 'bn' ? 'পদ্ধতি' : 'Payment Method'}</label>
                  <select
                    className="w-full"
                    value={settleMethod}
                    onChange={(e) => setSettleMethod(e.target.value)}
                  >
                    <option value="Cash">Cash (নগদ ক্যাশ)</option>
                  </select>
                </div>

                <div className="form-group mb-4">
                  <label>{language === 'bn' ? 'মন্তব্য (ঐচ্ছিক)' : 'Notes (Optional)'}</label>
                  <input
                    type="text"
                    className="w-full"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    placeholder={language === 'bn' ? 'যেমন: অগ্রিম সমন্বয় / নগদ জমা' : 'e.g. Returned advance'}
                  />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn-outline" onClick={() => setSettleStaffModal(null)}>
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button type="submit" className="btn-primary flex-align-gap">
                  <Check size={16} /> {language === 'bn' ? 'জমা নিশ্চিত করুন' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Money taken by a staff member: advances, repayments, salary adjustments */}
      {moneyHistory && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header">
              <h2>{language === 'bn' ? 'টাকা নেওয়ার ইতিহাস' : 'Money taken'} — {moneyHistory.staff.name}</h2>
              <button className="drawer-close-btn" onClick={() => setMoneyHistory(null)}>
                <X size={22} />
              </button>
            </div>
            <div className="drawer-body">
              {!moneyHistory.data ? (
                <p className="text-muted">{language === 'bn' ? 'লোড হচ্ছে…' : 'Loading…'}</p>
              ) : (() => {
                const d = moneyHistory.data;
                const KIND = {
                  advance: { bn: 'অগ্রিম নিয়েছে', en: 'Advance taken', sign: '+', cls: 'mh-in' },
                  shortfall: { bn: 'SR ঘাটতি', en: 'SR shortfall', sign: '+', cls: 'mh-in' },
                  adjusted: { bn: 'বেতন থেকে কাটা', en: 'Taken from salary', sign: '−', cls: 'mh-out' },
                  repaid: { bn: 'ফেরত দিয়েছে', en: 'Paid back', sign: '−', cls: 'mh-out' },
                };
                return (
                  <>
                    <div className="mh-summary">
                      <div><span>{language === 'bn' ? 'এখন বকেয়া' : 'Owes now'}</span><b className={d.due > 0 ? 'text-danger' : ''}>৳{Number(d.due || 0).toLocaleString()}</b></div>
                      <div><span>{language === 'bn' ? 'মোট নিয়েছে' : 'Taken'}</span><b>৳{Number(d.totals?.taken || 0).toLocaleString()}</b></div>
                      <div><span>{language === 'bn' ? 'বেতন থেকে কাটা' : 'From salary'}</span><b>৳{Number(d.totals?.adjusted || 0).toLocaleString()}</b></div>
                      <div><span>{language === 'bn' ? 'ফেরত দিয়েছে' : 'Paid back'}</span><b>৳{Number(d.totals?.repaid || 0).toLocaleString()}</b></div>
                    </div>
                    {d.entries.length === 0 ? (
                      <p className="text-muted">{language === 'bn' ? 'এই স্টাফ এখনো কোনো অগ্রিম নেয়নি।' : 'No advances yet.'}</p>
                    ) : (
                      <table className="data-table mh-table">
                        <thead>
                          <tr>
                            <th>{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                            <th>{language === 'bn' ? 'ধরন' : 'Type'}</th>
                            <th>{language === 'bn' ? 'বিবরণ' : 'Details'}</th>
                            <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'টাকা' : 'Amount'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.entries.map((e, i) => {
                            const k = KIND[e.kind] || KIND.advance;
                            return (
                              <tr key={`${e.ref}-${i}`}>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(e.date)}</td>
                                <td><span className={`mh-kind ${k.cls}`}>{language === 'bn' ? k.bn : k.en}</span></td>
                                <td className="text-sm text-muted">{e.note}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }} className={k.cls}>{k.sign}৳{Number(e.amount).toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <p className="text-xs text-muted" style={{ marginTop: '0.75rem' }}>
                      {language === 'bn'
                        ? 'Expense থেকে স্টাফ বেছে টাকা দিলে সেটা অগ্রিম হিসেবে এখানে আসে। বেতন দেওয়ার সময় Payroll-এ "অগ্রিম বেতন থেকে কাটুন" দিয়ে সমন্বয় করা যায়, বা স্টাফ তালিকার "জমা" দিয়ে ফেরত নেওয়া যায়।'
                        : 'Money given from Expenses with a staff member picked shows here as an advance. Settle it from the salary in Payroll ("Take advance out of salary") or take it back with Settle in the staff list.'}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Payroll Details & Payslip Modal */}
      {viewPayrollDetails && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container" style={{ maxWidth: '650px', width: '100%' }}>
            <div className="drawer-header">
              <h2>📄 {language === 'bn' ? 'বেতন পরিশোধের বিবরণী' : 'Payroll Statement & Payslip'}</h2>
              <button className="drawer-close-btn" onClick={() => setViewPayrollDetails(null)}>
                <X size={24} />
              </button>
            </div>
            <div className="drawer-body">
              <div id="printable-single-payroll" style={{ padding: '1rem', backgroundColor: '#fff', color: '#1e293b', borderRadius: '8px' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: '0 0 0.25rem', color: '#0f172a' }}>Allahr dan gents point</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Monthly Salary Payslip ({viewPayrollDetails.payroll.month})</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                  <div>
                    <span className="text-muted text-xs block">Staff Name</span>
                    <strong style={{ fontSize: '1.1rem' }}>{viewPayrollDetails.staff.name}</strong>
                    <div className="text-xs text-muted">{viewPayrollDetails.staff.role || 'Staff'} (ID: {viewPayrollDetails.staff.id})</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="text-muted text-xs block">Month</span>
                    <strong style={{ fontSize: '1.1rem' }}>{viewPayrollDetails.payroll.month}</strong>
                    {(() => {
                      const sId = viewPayrollDetails.staff.id;
                      const m = viewPayrollDetails.payroll.month;
                      const pr = viewPayrollDetails.payroll;
                      const fullD = attendance.filter(a => a.staffId === sId && (a.status === 'Present' || a.status === 'Late') && a.date.startsWith(m)).length;
                      const halfD = pr.halfDays ?? attendance.filter(a => a.staffId === sId && a.status === 'Half Day' && a.date.startsWith(m)).length;
                      const totD = pr.presentDays ?? (fullD + (halfD * 0.5));
                      return (
                        <div className="text-xs text-muted">
                          Attendance: {totD} / {pr.daysInMonth || 30} Days
                          {halfD > 0 ? ` · ${halfD} Half-Day` : ''}
                          {pr.absentDays > 0 ? ` · ${pr.absentDays} Absent` : ''}
                          {pr.leaveDays > 0 ? ` · ${pr.leaveDays} Leave` : ''}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {(() => {
                  const pr = viewPayrollDetails.payroll;
                  const base = Number(pr.baseSalary ?? pr.base_salary ?? 0);
                  const cutV = Number(pr.deduction || 0);
                  const autoV = Number(pr.autoDeduction || 0);
                  const bonusV = Number(pr.bonus || 0);
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1rem' }}>
                      <tbody>
                        <tr><td style={{ padding: '4px 0' }}>Base Salary</td><td style={{ textAlign: 'right' }}>৳{base.toLocaleString()}</td></tr>
                        <tr>
                          <td style={{ padding: '4px 0' }}>
                            Deduction (absent / half day)
                            {autoV > 0 && cutV !== autoV && (
                              <span style={{ color: '#64748b', fontSize: '0.78rem' }}> — by attendance ৳{autoV.toLocaleString()}, {cutV === 0 ? 'waived' : 'adjusted'}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', color: cutV > 0 ? '#dc2626' : undefined }}>{cutV > 0 ? `−৳${cutV.toLocaleString()}` : '৳0'}</td>
                        </tr>
                        <tr><td style={{ padding: '4px 0' }}>Bonus</td><td style={{ textAlign: 'right' }}>+৳{bonusV.toLocaleString()}</td></tr>
                        <tr style={{ borderTop: '1px solid #cbd5e1', fontWeight: 700 }}>
                          <td style={{ padding: '6px 0' }}>Net Salary</td>
                          <td style={{ textAlign: 'right' }}>৳{Number(pr.netPay || pr.net_pay || 0).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                  <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '6px' }}>
                    <span className="text-muted text-xs block">Total Payable</span>
                    <strong style={{ fontSize: '1.2rem', color: '#2563eb' }}>৳{Number(viewPayrollDetails.payroll.netPay || viewPayrollDetails.payroll.net_pay || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '6px' }}>
                    <span className="text-muted text-xs block">Paid So Far</span>
                    <strong style={{ fontSize: '1.2rem', color: '#16a34a' }}>৳{Number(viewPayrollDetails.payroll.paidAmount || viewPayrollDetails.payroll.paid_amount || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '6px' }}>
                    <span className="text-muted text-xs block">Remaining</span>
                    <strong style={{ fontSize: '1.2rem', color: '#dc2626' }}>৳{Math.max(0, Number(viewPayrollDetails.payroll.netPay || viewPayrollDetails.payroll.net_pay || 0) - Number(viewPayrollDetails.payroll.paidAmount || viewPayrollDetails.payroll.paid_amount || 0)).toLocaleString()}</strong>
                  </div>
                </div>

                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>{language === 'bn' ? 'পরিশোধিত কিস্তিসমূহের তালিকা' : 'Installment Payments History'}</h4>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem' }}>Date</th>
                        <th style={{ padding: '0.5rem' }}>Code</th>
                        <th style={{ padding: '0.5rem' }}>Method</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total Paid</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Salary Portion</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Excess (Due)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewPayrollDetails.payroll.payments && viewPayrollDetails.payroll.payments.length > 0) ? (
                        viewPayrollDetails.payroll.payments.map((pmt, idx) => (
                          <tr key={pmt.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '0.5rem' }}>{formatDate(pmt.date)}</td>
                            <td style={{ padding: '0.5rem' }}>{pmt.paymentCode || pmt.id}</td>
                            <td style={{ padding: '0.5rem' }}>{pmt.paymentMethod || 'Cash'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>৳{Number(pmt.amount || 0).toLocaleString()}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>৳{Number(pmt.salaryPortion || pmt.salary_portion || pmt.amount || 0).toLocaleString()}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: Number(pmt.advanceDuePortion || pmt.advance_due_portion || 0) > 0 ? '#dc2626' : '#64748b' }}>
                              ৳{Number(pmt.advanceDuePortion || pmt.advance_due_portion || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                            {language === 'bn' ? 'কোনো কিস্তির রেকর্ড পাওয়া যায়নি।' : 'No individual installment records.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ textAlign: 'center', marginTop: '2rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                  Printed on {formatDateTime(new Date())}
                </div>
              </div>
            </div>
            <div className="drawer-footer" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn-outline" onClick={() => setViewPayrollDetails(null)}>
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
              <button
                type="button"
                className="btn-primary flex-align-gap"
                onClick={() => printElement('printable-single-payroll', 'Payroll')}
              >
                <Printer size={16} /> {language === 'bn' ? 'রসিদ প্রিন্ট করুন' : 'Print Payslip'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default HR;
