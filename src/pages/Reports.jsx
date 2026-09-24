import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, PieChart, TrendingUp, DollarSign, Users, Package, Calendar, Printer, Database, ShoppingCart, Eye, Plus, X, Gift, Download } from 'lucide-react';
import useStore from '../store/useStore';
import { printElement, downloadElementAsPDF } from '../utils/pdfGenerator';
import { t } from '../utils/i18n';
import { formatDate, formatDateTime } from '../utils/date';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('Sales');
  const [dateFilter, setDateFilter] = useState('Daily'); // Daily, Weekly, Monthly, Custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceType, setInvoiceType] = useState(''); // 'Sale' or 'Purchase'
  const { sales, inventory, purchases, expenses, customers, suppliers, staff, payrolls, returns, attendance, leaves, loadDummyData, accountTransactions, settlements, language } = useStore();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedAttStaffId, setSelectedAttStaffId] = useState('');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentMonthStr = today.toISOString().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  const formatStatementDate = (dStr) => {
    if (!dStr) return '';
    const [y, m, d] = dStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = String(d).padStart(2, '0');
    const monthName = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${monthName} ${year}`;
  };

  // Helper to generate days of a given YYYY-MM month
  const getDaysInMonth = (monthStr) => {
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

  // Helper to check if a date string falls within the selected filter
  const isWithinFilter = (dateStr) => {
    if (!dateStr) return false;
    const itemDateStr = dateStr.split('T')[0];

    if (dateFilter === 'Daily') {
      return itemDateStr === todayStr;
    } else if (dateFilter === 'Weekly') {
      const itemDate = new Date(itemDateStr);
      return itemDate >= lastWeek && itemDate <= today;
    } else if (dateFilter === 'Monthly') {
      return itemDateStr.startsWith(selectedMonth || currentMonthStr);
    } else if (dateFilter === 'Custom') {
      if (!startDate && !endDate) return true;
      if (startDate && itemDateStr < startDate) return false;
      if (endDate && itemDateStr > endDate) return false;
      return true;
    }
    return true;
  };

  // 1. Sales Report Data
  const filteredSales = sales.filter(s => isWithinFilter(s.date));
  const totalSalesAmount = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const totalInvoices = filteredSales.length;

  // 1.5 Purchase Report Data
  const filteredPurchases = purchases.filter(p => isWithinFilter(p.date));
  const totalPurchasesCost = filteredPurchases.reduce((acc, p) => acc + p.total, 0);
  const totalPurchaseInvoices = filteredPurchases.length;

  // 2. Stock Report Data
  const stockData = inventory.map(item => {
    const stockInPurchases = purchases.reduce((acc, p) => {
      const pItem = p.items.find(i => i.name.toLowerCase() === item.name.toLowerCase());
      return acc + (pItem ? pItem.quantity : 0);
    }, 0);
    const stockInReturns = returns.filter(r => r.returnType === 'Customer' && r.productId === item.id).reduce((acc, r) => acc + r.quantity, 0);
    const totalIn = stockInPurchases + stockInReturns;

    const stockOutSales = sales.reduce((acc, s) => {
      const sItem = s.items.find(i => i.id === item.id);
      return acc + (sItem ? sItem.quantity : 0);
    }, 0);
    const stockOutReturns = returns.filter(r => r.returnType === 'Supplier' && r.productId === item.id).reduce((acc, r) => acc + r.quantity, 0);
    const totalOut = stockOutSales + stockOutReturns;

    return { ...item, totalIn, totalOut };
  });

  // 3. Profit & Loss Data
  const filteredExpenses = expenses.filter(e => isWithinFilter(e.date));
  const totalExpenseCost = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  const totalCost = totalPurchasesCost + totalExpenseCost;
  const netProfit = totalSalesAmount - totalCost;

  // Prepare Profit & Loss Detailed Ledger
  let currentBalance = 0;
  const profitLossDetails = [
    ...filteredSales.map(s => ({
      id: s.id,
      date: s.date,
      type: 'Sale (Revenue)',
      amount: s.total,
      isRevenue: true
    })),
    ...filteredPurchases.map(p => ({
      id: p.id,
      date: p.date,
      type: 'Purchase (Cost)',
      amount: p.total,
      isRevenue: false
    })),
    ...filteredExpenses.map(e => ({
      id: e.id || 'EXP' + Date.now() + Math.random(),
      date: e.date,
      type: `Expense (${e.category})`,
      amount: e.amount,
      isRevenue: false
    }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date)).map(item => {
    if (item.isRevenue) currentBalance += item.amount;
    else currentBalance -= item.amount;
    return { ...item, balance: currentBalance };
  });

  // 4. Due Report Data
  const dueCustomers = customers.filter(c => c.due > 0);
  const dueSuppliers = suppliers.filter(s => s.due > 0);
  const totalCustomerDue = dueCustomers.reduce((acc, c) => acc + c.due, 0);
  const totalSupplierDue = dueSuppliers.reduce((acc, s) => acc + s.due, 0);

  // 5. Salesman-wise Report
  const salesmanData = {};
  filteredSales.forEach(s => {
    const sm = s.salesmanName || 'Unknown';
    if (!salesmanData[sm]) salesmanData[sm] = { count: 0, total: 0, sales: [] };
    salesmanData[sm].count += 1;
    salesmanData[sm].total += s.total;
    salesmanData[sm].sales.push(s);
  });

  // 6. Expense Report Data
  const expenseByCategory = {};
  filteredExpenses.forEach(e => {
    if (!expenseByCategory[e.category]) expenseByCategory[e.category] = 0;
    expenseByCategory[e.category] += e.amount;
  });

  // 7. HR & Payroll Report Data
  const filteredPayrolls = payrolls.filter(p => isWithinFilter(p.paymentDate || p.month));
  const totalSalaryPaid = filteredPayrolls.reduce((acc, p) => acc + p.netPay, 0);
  const totalBonusPaid = filteredPayrolls.reduce((acc, p) => acc + p.bonus, 0);

  // 7.2 Attendance Report Data
  const filteredAttendance = (attendance || []).filter(a => isWithinFilter(a.date));
  const totalAttPresent = filteredAttendance.filter(a => a.status === 'Present').length;
  const totalAttHalfDay = filteredAttendance.filter(a => a.status === 'Half Day').length;
  const totalAttLate = filteredAttendance.filter(a => a.status === 'Late').length;
  const totalAttAbsent = filteredAttendance.filter(a => a.status === 'Absent').length;
  const totalAttLeave = filteredAttendance.filter(a => a.status === 'Leave').length;

  const staffAttendanceSummary = (staff || []).map(s => {
    const records = filteredAttendance.filter(a => a.staffId === s.id);
    const present = records.filter(a => a.status === 'Present').length;
    const halfDay = records.filter(a => a.status === 'Half Day').length;
    const late = records.filter(a => a.status === 'Late').length;
    const absent = records.filter(a => a.status === 'Absent').length;
    const leave = records.filter(a => a.status === 'Leave').length;
    const effectiveDays = present + (halfDay * 0.5);
    return {
      ...s,
      present,
      halfDay,
      late,
      absent,
      leave,
      effectiveDays,
      records
    };
  });

  const TABS = [
    { id: 'Sales', label: t(language, 'Sales' || 'Sales'), icon: BarChart },
    { id: 'Purchases', label: t(language, 'Purchases' || 'Purchases'), icon: ShoppingCart },
    { id: 'Stock', label: t(language, 'Stock' || 'Stock'), icon: Package },
    { id: 'ProfitLoss', label: t(language, 'Profit & Loss'), icon: TrendingUp },
    { id: 'Due', label: t(language, 'Due Report'), icon: DollarSign },
    { id: 'Salesman', label: t(language, 'Salesman Report' || 'Salesman'), icon: Users },
    { id: 'Expense', label: t(language, 'Expense' || 'Expense'), icon: PieChart },
    { id: 'Attendance', label: language === 'bn' ? 'হাজিরা রিপোর্ট' : 'Attendance', icon: Calendar },
    { id: 'HR', label: t(language, 'HR & Payroll' || 'HR & Payroll'), icon: Calendar },
    { id: 'Gifts', label: t(language, 'Gifts Report' || 'Gifts'), icon: Gift },
    { id: 'CustLedger', label: t(language, 'Cust. Ledger' || 'Cust. Ledger'), icon: Users },
    { id: 'SupLedger', label: t(language, 'Sup. Ledger' || 'Sup. Ledger'), icon: Users },
    { id: 'CashStatement', label: t(language, 'Cash Stmt' || 'Cash Stmt'), icon: DollarSign },
    { id: 'BankStatement', label: language === 'bn' ? 'বাসার স্টেটমেন্ট' : 'Home Stmt', icon: DollarSign },
  ];

  // 8. Gifts Data
  const giftItems = [];
  filteredSales.forEach(sale => {
    sale.items.forEach(item => {
      if (item.isGift) {
        giftItems.push({
          date: sale.date,
          invoiceId: sale.id,
          customerName: sale.customerInfo?.name,
          customerPhone: sale.customerInfo?.phone,
          itemName: item.name,
          quantity: item.quantity,
          value: (item.price - (item.itemDiscount || 0)) * item.quantity
        });
      }
    });
  });
  const totalGiftValue = giftItems.reduce((acc, g) => acc + g.value, 0);

  const currentTabObj = TABS.find(t => t.id === activeTab);
  const currentTabLabel = currentTabObj?.label || activeTab;
  const targetStaff = selectedAttStaffId ? (staff || []).find(s => s.id === selectedAttStaffId) : null;
  const periodLabel = dateFilter === 'Monthly' ? selectedMonth : dateFilter;
  const reportFileName = activeTab === 'Attendance' && targetStaff
    ? `Attendance-${targetStaff.name}-${periodLabel}-${todayStr}`
    : `${activeTab}-Report-${periodLabel}-${todayStr}`;

  const handleDownloadReportPDF = () => {
    downloadElementAsPDF('printable-active-report', reportFileName);
  };

  const handlePrintReport = () => {
    const printTitle = activeTab === 'Attendance' && targetStaff
      ? `Attendance Report - ${targetStaff.name} (${periodLabel})`
      : `${currentTabLabel} Report (${periodLabel})`;
    printElement('printable-active-report', printTitle);
  };

  return (
    <div className="reports-page animate-fade-in" id="reports-page-container">
      <div className="page-header">
        <div>
          <h1>{t(language, 'Reports & Analytics')}</h1>
          <p className="text-muted">{language === 'bn' ? 'সব ধরনের রিপোর্ট এবং অ্যানালিটিক্স।' : 'Comprehensive business intelligence and reporting.'}</p>
        </div>
        <div className="flex-align-gap" style={{ flexWrap: 'wrap' }}>
          <label className="text-muted text-sm">Timeframe:</label>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="p-2 bg-input border border-gray-700 rounded text-main">
            <option value="Daily">Daily (Today)</option>
            <option value="Weekly">Weekly (Last 7 Days)</option>
            <option value="Monthly">{language === 'bn' ? 'মাসিক (Monthly)' : 'Monthly'}</option>
            <option value="Custom">Custom Range</option>
          </select>
          {dateFilter === 'Monthly' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="p-2 bg-input border border-gray-700 rounded text-main"
            />
          )}
          {dateFilter === 'Custom' && (
            <div className="flex-align-gap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 bg-input border border-gray-700 rounded text-main" />
              <span className="text-muted">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 bg-input border border-gray-700 rounded text-main" />
            </div>
          )}
          {sales.length === 0 && (
            <button className="btn-secondary flex-align-gap" onClick={loadDummyData}>
              <Database size={18} /> {language === 'bn' ? 'ডাটা সিঙ্ক করুন' : 'Sync Report Data'}
            </button>
          )}
          <button
            className="btn-outline flex-align-gap"
            onClick={handleDownloadReportPDF}
            title={language === 'bn' ? 'রিপোর্ট PDF ডাউনলোড করুন' : 'Download Report as PDF'}
          >
            <Download size={18} /> {language === 'bn' ? 'PDF ডাউনলোড' : 'Download PDF'}
          </button>
          <button className="btn-primary flex-align-gap" onClick={handlePrintReport}>
            <Printer size={18} /> {language === 'bn' ? 'প্রিন্ট রিপোর্ট' : 'Print Report'}
          </button>
        </div>
      </div>

      <div className="card glass mb-4" style={{ padding: '0.5rem' }}>
        <div className="return-type-selector" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {TABS.map(tab => (
            <button key={tab.id} className={`type-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)} style={{ padding: '0.5rem 1rem', flex: '1 1 auto', minWidth: '120px' }}>
              <tab.icon size={16} className="inline-block mr-2" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Printable Active Report Area */}
      <div id="printable-active-report" className="printable-report-wrapper">
        <div className="print-report-header" style={{ display: 'none' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #333', paddingBottom: '0.75rem' }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: 700, color: '#111' }}>Allahr dan gents point</h2>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 600, color: '#333' }}>
              {currentTabLabel} {activeTab === 'Attendance' && targetStaff ? `- ${targetStaff.name} ` : ''}{language === 'bn' ? 'রিপোর্ট' : 'Report'} ({periodLabel})
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
              {activeTab === 'Attendance' && targetStaff ? `${language === 'bn' ? 'কর্মী' : 'Staff'}: ${targetStaff.name} (${targetStaff.role || 'Staff'}) | ` : ''}
              {dateFilter === 'Custom' && startDate && endDate ? `${language === 'bn' ? 'সময়কাল' : 'Range'}: ${startDate} to ${endDate} | ` : ''}
              {language === 'bn' ? 'তারিখ' : 'Date'}: {formatDateTime(new Date())}
            </p>
          </div>
        </div>

        {/* 1. Sales Report */}
        {activeTab === 'Sales' && (
        <div className="card glass">
          <h3>{t(language, 'Sales Report' || 'Sales Report')} ({dateFilter})</h3>
          <div className="grid responsive-grid-2 mt-4 mb-4">
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Sales' || 'Total Revenue')}</h4>
              <p className="text-2xl text-primary font-bold">৳{totalSalesAmount.toLocaleString()}</p>
            </div>
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Invoices Generated' || 'Invoices Generated')}</h4>
              <p className="text-2xl font-bold">{totalInvoices}</p>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Invoice ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Total Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {filteredSales.map(s => (
                  <tr key={s.id}>
                    <td>{s.id}</td><td>{formatDate(s.date)}</td><td>{s.customerName}</td><td>{s.items.length}</td><td className="text-primary font-bold">৳{s.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(s); setInvoiceType('Sale'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSales.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No sales found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1.5 Purchase Report */}
      {activeTab === 'Purchases' && (
        <div className="card glass">
          <h3>{t(language, 'Purchases Report' || 'Purchases Report')} ({dateFilter})</h3>
          <div className="grid responsive-grid-2 mt-4 mb-4">
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Purchase Cost' || 'Total Purchase Cost')}</h4>
              <p className="text-2xl text-danger font-bold">৳{totalPurchasesCost.toLocaleString()}</p>
            </div>
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Invoices Generated' || 'Invoices Generated')}</h4>
              <p className="text-2xl font-bold">{totalPurchaseInvoices}</p>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Invoice ID</th><th>Date</th><th>Supplier</th><th>Items Qty</th><th>Total Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {filteredPurchases.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{formatDate(p.date)}</td><td>{p.supplierName}</td><td>{p.items.reduce((acc, i) => acc + i.quantity, 0)}</td><td className="text-danger font-bold">৳{p.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(p); setInvoiceType('Purchase'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No purchases found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Stock Report */}
      {activeTab === 'Stock' && (
        <div className="card glass">
          <h3>{t(language, 'Stock Report' || 'Stock Report')}</h3>
          <p className="text-muted text-sm mb-4">{language === 'bn' ? 'স্টক ইন/আউট সব ক্রয়, বিক্রয় এবং রিটার্ন থেকে হিসাব করা হয়েছে।' : 'Stock In/Out is calculated from all-time Purchases, Sales, and Returns.'}</p>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>{t(language, 'Item Name')}</th><th>{t(language, 'Category')}</th><th>{t(language, 'All Time IN' || 'All Time IN')}</th><th>{t(language, 'All Time OUT' || 'All Time OUT')}</th><th>{t(language, 'Current Stock')}</th><th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th></tr></thead>
              <tbody>
                {stockData.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.category}</td>
                    <td className="text-success">+{item.totalIn}</td>
                    <td className="text-danger">-{item.totalOut}</td>
                    <td className="font-bold">{item.stock} {item.unit}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(item); setInvoiceType('Stock'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Profit & Loss Report */}
      {activeTab === 'ProfitLoss' && (
        <div className="card glass">
          <h3>{t(language, 'Profit & Loss Report' || 'Profit & Loss Report')} ({dateFilter})</h3>
          <div className="grid responsive-grid-3 mt-4 mb-4">
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Revenue' || 'Total Revenue')}</h4>
              <p className="text-2xl text-primary font-bold">৳{totalSalesAmount.toLocaleString()}</p>
            </div>
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Cost' || 'Total Cost (Purchases + Expense)')}</h4>
              <p className="text-2xl text-danger font-bold">৳{totalCost.toLocaleString()}</p>
            </div>
            <div className="card bg-input text-center" style={{ border: `1px solid ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
              <h4 className="text-muted">{t(language, 'Net Profit' || 'Net Profit')}</h4>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-danger'}`}>৳{netProfit.toLocaleString()}</p>
            </div>
          </div>

          <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#000' }}>{t(language, 'Detailed Breakdown' || 'Detailed Breakdown')}</h4>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction Type</th>
                  <th style={{ textAlign: 'right' }}>Revenue (In)</th>
                  <th style={{ textAlign: 'right' }}>Cost (Out)</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {profitLossDetails.length > 0 ? (
                  profitLossDetails.map((item, idx) => (
                    <tr key={item.id + idx}>
                      <td>{formatDate(item.date)}</td>
                      <td>{item.type}</td>
                      <td style={{ textAlign: 'right', color: item.isRevenue ? '#10b981' : 'inherit', fontWeight: item.isRevenue ? 'bold' : 'normal' }}>
                        {item.isRevenue ? `+৳${item.amount.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ textAlign: 'right', color: !item.isRevenue ? 'red' : 'inherit', fontWeight: !item.isRevenue ? 'bold' : 'normal' }}>
                        {!item.isRevenue ? `-৳${item.amount.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        ৳{item.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center text-muted" style={{ padding: '1.5rem' }}>No transactions found for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Due Report */}
      {activeTab === 'Due' && (
        <div className="grid responsive-grid-2" style={{ gap: '1.5rem' }}>
          <div className="card glass">
            <h3 className="text-success mb-2">{t(language, 'To Receive (Customer Due)' || 'To Receive (Customer Due)')}</h3>
            <p className="text-2xl font-bold mb-4">৳{totalCustomerDue.toLocaleString()}</p>
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Customer Name</th><th>Phone</th><th>Due Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
                <tbody>
                  {dueCustomers.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td className="text-warning font-bold">৳{c.due.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(c); setInvoiceType('Customer Due'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>)}
                  {dueCustomers.length === 0 && <tr><td colSpan="4" className="text-center text-muted">No customer dues.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card glass">
            <h3 className="text-danger mb-2">{t(language, 'To Pay (Supplier Due)' || 'To Pay (Supplier Due)')}</h3>
            <p className="text-2xl font-bold mb-4">৳{totalSupplierDue.toLocaleString()}</p>
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Supplier Name</th><th>Phone</th><th>Due Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
                <tbody>
                  {dueSuppliers.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.phone}</td><td className="text-danger font-bold">৳{s.due.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(s); setInvoiceType('Supplier Due'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>)}
                  {dueSuppliers.length === 0 && <tr><td colSpan="4" className="text-center text-muted">No supplier dues.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Salesman-wise Report */}
      {activeTab === 'Salesman' && (
        <div className="card glass">
          <h3>{t(language, 'Salesman Report' || 'Salesman-wise Report')} ({dateFilter})</h3>
          <div className="table-responsive mt-4">
            <table className="data-table">
              <thead><tr><th>Salesman Name</th><th>Invoices Handled</th><th>Total Sales Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {Object.keys(salesmanData).map(sm => (
                  <tr key={sm}>
                    <td>{sm}</td>
                    <td>{salesmanData[sm].count}</td>
                    <td className="text-primary font-bold">৳{salesmanData[sm].total.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice({ name: sm, ...salesmanData[sm] }); setInvoiceType('Salesman'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {Object.keys(salesmanData).length === 0 && <tr><td colSpan="4" className="text-center text-muted">No sales data found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Expense Report */}
      {activeTab === 'Expense' && (
        <div className="card glass">
          <h3>{t(language, 'Expense Report' || 'Expense Report')} ({dateFilter})</h3>
          <p className="text-2xl text-danger font-bold mb-4 mt-2">{t(language, 'Total')}: ৳{totalExpenseCost.toLocaleString()}</p>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Total Amount</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {Object.keys(expenseByCategory).map(cat => (
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td className="text-danger font-bold">৳{expenseByCategory[cat].toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice({ category: cat, amount: expenseByCategory[cat] }); setInvoiceType('Expense'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {Object.keys(expenseByCategory).length === 0 && <tr><td colSpan="3" className="text-center text-muted">No expenses found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6.5 Staff Attendance Report */}
      {activeTab === 'Attendance' && (
        <div className="card glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {language === 'bn' ? 'স্টাফ হাজিরা রিপোর্ট' : 'Staff Attendance Report'} ({periodLabel})
              </h3>
              <p className="text-muted text-sm" style={{ margin: '0.25rem 0 0 0' }}>
                {targetStaff
                  ? (language === 'bn' ? `${targetStaff.name}-এর ১ মাসের / নির্ধারিত সময়কালের হাজিরা শিট।` : `Attendance records for ${targetStaff.name}.`)
                  : (dateFilter === 'Daily' 
                      ? (language === 'bn' ? 'আজকের স্টাফদের উপস্থিতির বিবরণ।' : "Today's staff attendance details.")
                      : (language === 'bn' ? 'সকল কর্মীর উপস্থিতির মাসিক/সময়কালের সারসংক্ষেপ।' : 'Attendance summary for the selected period.'))}
              </p>
            </div>

            {/* Staff Selector and Filter Controls */}
            <div className="flex-align-gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="text-muted text-sm">{language === 'bn' ? 'কর্মী নির্বাচন:' : 'Select Staff:'}</span>
                <select
                  className="p-2 bg-input border border-gray-700 rounded text-main"
                  value={selectedAttStaffId}
                  onChange={e => setSelectedAttStaffId(e.target.value)}
                  style={{ minWidth: '170px' }}
                >
                  <option value="">{language === 'bn' ? 'সকল কর্মী (All Staff)' : 'All Staff'}</option>
                  {(staff || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || 'Staff'})</option>
                  ))}
                </select>
              </div>
              {selectedAttStaffId && (
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setSelectedAttStaffId('')}
                >
                  ← {language === 'bn' ? 'সকল কর্মীর তালিকা' : 'Back to All Staff'}
                </button>
              )}
              <div className="badge badge-secondary hide-on-print" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
                {language === 'bn' ? `মোট রেকর্ড: ${filteredAttendance.length} টি` : `Total Records: ${filteredAttendance.length}`}
              </div>
            </div>
          </div>

          {targetStaff ? (
            /* Selected Individual Staff View */
            (() => {
              const staffRecords = filteredAttendance.filter(a => a.staffId === targetStaff.id);
              const isMonthly = dateFilter === 'Monthly';
              const monthDays = isMonthly ? getDaysInMonth(selectedMonth) : [];
              const firstDayStr = isMonthly ? (monthDays[0]?.dateStr || `${selectedMonth}-01`) : (startDate || staffRecords[0]?.date || todayStr);
              const lastDayStr = isMonthly ? (monthDays[monthDays.length - 1]?.dateStr || `${selectedMonth}-30`) : (endDate || staffRecords[staffRecords.length - 1]?.date || todayStr);
              const periodText = `${formatStatementDate(firstDayStr)} - ${formatStatementDate(lastDayStr)}`;

              return (
                <div>
                  {/* EXACT STATEMENT CONTAINER MATCHING USER PHOTO */}
                  <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', color: '#111827' }}>
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
                          {targetStaff.name.toLowerCase()}
                        </h2>
                        <p className="statement-subtitle" style={{
                          fontSize: '0.88rem',
                          color: '#3f6e65',
                          margin: '4px 0 0 0',
                          fontWeight: 600
                        }}>
                          ID: {targetStaff.id} &nbsp;&nbsp;|&nbsp;&nbsp; Role: {targetStaff.role || 'Admin'}
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

                    {/* 4-Column Clean White Table */}
                    <div className="statement-table-card" style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      overflowX: 'auto'
                    }}>
                      <table className="statement-table" style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '12px',
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
                          {isMonthly ? (
                            monthDays.map(d => {
                              const attRec = staffRecords.find(a => a.date === d.dateStr);
                              const stat = attRec ? attRec.status : '';
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
                            })
                          ) : (
                            staffRecords.map((attRec, idx) => {
                              const dateObj = new Date(attRec.date);
                              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                              return (
                                <tr key={attRec.id || idx} style={{ borderBottom: '1px solid #f3f4f6', background: '#ffffff' }}>
                                  <td style={{ padding: '11px 16px', fontWeight: 600, color: '#111827' }}>{formatDate(attRec.date)}</td>
                                  <td style={{ padding: '11px 16px', color: '#6b7280' }}>{dayName}</td>
                                  <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                                    {attRec.status === 'Present' ? (
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
                                    ) : attRec.status === 'Absent' ? (
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
                                    ) : attRec.status === 'Half Day' ? (
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
                                    ) : attRec.status === 'Late' ? (
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
                                    ) : attRec.status === 'Leave' ? (
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
                                    ) : (
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
                                        {attRec.status || '-'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                          {(!isMonthly && staffRecords.length === 0) && (
                            <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '16px' }}>{language === 'bn' ? 'কোনো হাজিরার তথ্য পাওয়া যায়নি।' : 'No attendance records found.'}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* All Staff Summary View */
            <div>
              {/* Shop Summary KPIs */}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div className="card bg-input text-center" style={{ padding: '0.75rem', borderLeft: '3px solid #16a34a' }}>
                  <h4 className="text-muted text-xs">{language === 'bn' ? 'মোট উপস্থিতি' : 'Total Present'}</h4>
                  <p className="text-2xl text-success font-bold mt-1">{totalAttPresent} {language === 'bn' ? 'দিন' : 'days'}</p>
                </div>
                <div className="card bg-input text-center" style={{ padding: '0.75rem', borderLeft: '3px solid #d97706' }}>
                  <h4 className="text-muted text-xs">{language === 'bn' ? 'হাফ ডে' : 'Half Day'}</h4>
                  <p className="text-2xl text-warning font-bold mt-1">{totalAttHalfDay} {language === 'bn' ? 'টি' : ''}</p>
                </div>
                <div className="card bg-input text-center" style={{ padding: '0.75rem', borderLeft: '3px solid #0284c7' }}>
                  <h4 className="text-muted text-xs">{language === 'bn' ? 'দেরিতে উপস্থিতি' : 'Late'}</h4>
                  <p className="text-2xl text-info font-bold mt-1">{totalAttLate} {language === 'bn' ? 'দিন' : ''}</p>
                </div>
                <div className="card bg-input text-center" style={{ padding: '0.75rem', borderLeft: '3px solid #dc2626' }}>
                  <h4 className="text-muted text-xs">{language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</h4>
                  <p className="text-2xl text-danger font-bold mt-1">{totalAttAbsent} {language === 'bn' ? 'দিন' : ''}</p>
                </div>
                <div className="card bg-input text-center" style={{ padding: '0.75rem', borderLeft: '3px solid #6b7280' }}>
                  <h4 className="text-muted text-xs">{language === 'bn' ? 'ছুটি' : 'On Leave'}</h4>
                  <p className="text-2xl text-muted font-bold mt-1">{totalAttLeave} {language === 'bn' ? 'দিন' : ''}</p>
                </div>
              </div>

              {/* All Staff Summary Table */}
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{language === 'bn' ? 'আইডি' : 'Staff ID'}</th>
                      <th>{language === 'bn' ? 'নাম' : 'Name'}</th>
                      <th>{language === 'bn' ? 'পদবী' : 'Role'}</th>
                      {dateFilter === 'Daily' && <th>{language === 'bn' ? 'আজকের অবস্থা' : 'Status'}</th>}
                      <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'উপস্থিত' : 'Present'}</th>
                      <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'হাফ ডে' : 'Half Day'}</th>
                      <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'দেরি' : 'Late'}</th>
                      <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</th>
                      <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'ছুটি' : 'Leave'}</th>
                      <th style={{ textAlign: 'right' }}>{language === 'bn' ? 'কার্যকর উপস্থিতি' : 'Effective Days'}</th>
                      <th className="hide-on-print" style={{ textAlign: 'center' }}>{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffAttendanceSummary.map(s => {
                      const todayRecord = s.records && s.records[0];
                      const todayStatus = todayRecord ? todayRecord.status : '';
                      return (
                        <tr key={s.id}>
                          <td><code>{s.id}</code></td>
                          <td className="font-bold">{s.name}</td>
                          <td>{s.role || 'Staff'}</td>
                          {dateFilter === 'Daily' && (
                            <td>
                              {todayStatus === 'Present' && <span className="badge bg-success text-white px-2 py-1 rounded">✓ {language === 'bn' ? 'উপস্থিত' : 'Present'}</span>}
                              {todayStatus === 'Half Day' && <span className="badge bg-warning text-white px-2 py-1 rounded">½ {language === 'bn' ? 'হাফ ডে' : 'Half Day'}</span>}
                              {todayStatus === 'Late' && <span className="badge bg-info text-white px-2 py-1 rounded">⏰ {language === 'bn' ? 'দেরিতে' : 'Late'}</span>}
                              {todayStatus === 'Absent' && <span className="badge bg-danger text-white px-2 py-1 rounded">✗ {language === 'bn' ? 'অনুপস্থিত' : 'Absent'}</span>}
                              {todayStatus === 'Leave' && <span className="badge bg-muted text-white px-2 py-1 rounded">🏖️ {language === 'bn' ? 'ছুটি' : 'Leave'}</span>}
                              {!todayStatus && <span className="text-muted text-xs">—</span>}
                            </td>
                          )}
                          <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 'bold' }}>{s.present}</td>
                          <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 'bold' }}>{s.halfDay}</td>
                          <td style={{ textAlign: 'center', color: '#0284c7' }}>{s.late}</td>
                          <td style={{ textAlign: 'center', color: '#dc2626' }}>{s.absent}</td>
                          <td style={{ textAlign: 'center', color: '#6b7280' }}>{s.leave}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', color: '#2563eb' }}>
                            {s.effectiveDays} {language === 'bn' ? 'দিন' : 'days'}
                          </td>
                          <td className="hide-on-print" style={{ textAlign: 'center' }}>
                            <button
                              className="btn-outline btn-sm flex-align-gap"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex' }}
                              onClick={() => setSelectedAttStaffId(s.id)}
                              title={language === 'bn' ? 'এই কর্মীর বিস্তারিত হাজিরা শিট দেখুন' : "View staff's attendance sheet"}
                            >
                              <Eye size={14} /> {language === 'bn' ? '১ মাসের শিট' : 'View Sheet'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {staffAttendanceSummary.length === 0 && (
                      <tr><td colSpan={dateFilter === 'Daily' ? 11 : 10} className="text-center text-muted">{language === 'bn' ? 'কোনো হাজিরার তথ্য পাওয়া যায়নি।' : 'No attendance data found.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. HR & Payroll Report */}
      {activeTab === 'HR' && (
        <div className="card glass">
          <h3>{t(language, 'HR & Payroll Report' || 'HR & Payroll Report')} ({dateFilter})</h3>
          <div className="grid responsive-grid-2 mt-4 mb-4">
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Salary Paid' || 'Total Salary Paid')}</h4>
              <p className="text-2xl text-warning font-bold">৳{totalSalaryPaid.toLocaleString()}</p>
            </div>
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Bonus Paid' || 'Total Bonus Paid')}</h4>
              <p className="text-2xl text-success font-bold">৳{totalBonusPaid.toLocaleString()}</p>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Staff ID</th><th>Month</th><th>Net Pay</th><th>Bonus</th><th>Payment Date</th><th style={{ textAlign: 'center' }}>Actions</th></tr></thead>
              <tbody>
                {filteredPayrolls.map(p => (
                  <tr key={p.id}>
                    <td>{p.staffName}</td>
                    <td>{p.month}</td>
                    <td className="font-bold">৳{p.netPay.toLocaleString()}</td>
                    <td>৳{p.bonus.toLocaleString()}</td>
                    <td>{formatDate(p.paymentDate)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                        <button className="btn-icon" title="View & Print" onClick={() => { setSelectedInvoice(p); setInvoiceType('Payroll'); }}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPayrolls.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No payroll data found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. Gifts Report */}
      {activeTab === 'Gifts' && (
        <div className="card glass">
          <h3>{t(language, 'Gifts Report' || 'Gifts Report')} ({dateFilter})</h3>
          <div className="grid responsive-grid-2 mt-4 mb-4">
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Gifts Given' || 'Total Gifts Given')}</h4>
              <p className="text-2xl font-bold">{giftItems.reduce((sum, item) => sum + item.quantity, 0)} {language === 'bn' ? 'টি' : 'Items'}</p>
            </div>
            <div className="card bg-input text-center">
              <h4 className="text-muted">{t(language, 'Total Gift Value' || 'Total Gift Value')}</h4>
              <p className="text-2xl text-primary font-bold">৳{totalGiftValue.toLocaleString()}</p>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {giftItems.length > 0 ? giftItems.map((g, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(g.date)}</td>
                    <td>{g.invoiceId}</td>
                    <td>
                      {g.customerName || 'N/A'}
                      {g.customerPhone && <><br /><small className="text-muted">{g.customerPhone}</small></>}
                    </td>
                    <td>{g.itemName}</td>
                    <td>{g.quantity}</td>
                    <td>৳{g.value.toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="text-center text-muted">No gifts found in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 10. Customer Ledger */}
      {activeTab === 'CustLedger' && (
        <div className="card glass">
          <h3>{t(language, 'Cust. Ledger' || 'Customer Account Ledger')}</h3>
          <div className="flex-align-gap mt-4 mb-4">
            <select className="p-2 bg-input border border-gray-700 rounded text-main w-full" value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}>
              <option value="">Select a Customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            </select>
          </div>
          {selectedCustomerId && (
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Ref ID</th><th style={{ textAlign: 'right' }}>Debit (Due+)</th><th style={{ textAlign: 'right' }}>Credit (Paid-)</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                <tbody>
                  {(() => {
                    // Open at what they already owed, then charge each sale
                    // whatever it left unpaid -- a partly-paid sale belongs here
                    // too, for the part that is still outstanding.
                    let runBal = Number(customers.find(c => c.id === selectedCustomerId)?.opening_due) || 0;
                    const custSales = sales.filter(s => s.customerId === selectedCustomerId && Number(s.due_amount) > 0).map(s => ({ date: s.date, type: Number(s.paid_amount) > 0 ? 'Sale (Partial)' : 'Sale (Due)', ref: s.id, debit: Number(s.due_amount), credit: 0 }));
                    const custPayments = (settlements || []).filter(s => s.type === 'Customer' && s.targetId === selectedCustomerId).map(s => ({ date: s.date, type: 'Payment', ref: s.id, debit: 0, credit: s.amount }));
                    const ledger = [...custSales, ...custPayments].sort((a, b) => new Date(a.date) - new Date(b.date));

                    return ledger.length > 0 ? ledger.map((l, i) => {
                      runBal = runBal + l.debit - l.credit;
                      return (
                        <tr key={i}>
                          <td>{formatDate(l.date)}</td>
                          <td>{l.type}</td>
                          <td>{l.ref}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{l.debit > 0 ? `৳${l.debit}` : '-'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{l.credit > 0 ? `৳${l.credit}` : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>৳{runBal}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan="6" className="text-center text-muted">No transactions found.</td></tr>;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 11. Supplier Ledger */}
      {activeTab === 'SupLedger' && (
        <div className="card glass">
          <h3>{t(language, 'Sup. Ledger' || 'Supplier Account Ledger')}</h3>
          <div className="flex-align-gap mt-4 mb-4">
            <select className="p-2 bg-input border border-gray-700 rounded text-main w-full" value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>
              <option value="">Select a Supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>)}
            </select>
          </div>
          {selectedSupplierId && (
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Ref ID</th><th style={{ textAlign: 'right' }}>Debit (Due+)</th><th style={{ textAlign: 'right' }}>Credit (Paid-)</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                <tbody>
                  {(() => {
                    let runBal = Number(suppliers.find(s => s.id === selectedSupplierId)?.opening_due) || 0;
                    const supPurchases = purchases.filter(p => p.supplierId === selectedSupplierId && Number(p.dueAmount) > 0).map(p => ({ date: p.date, type: Number(p.paidAmount) > 0 ? 'Purchase (Partial)' : 'Purchase (Due)', ref: p.id, debit: Number(p.dueAmount), credit: 0 }));
                    const supPayments = (settlements || []).filter(s => s.type === 'Supplier' && s.targetId === selectedSupplierId).map(s => ({ date: s.date, type: 'Payment', ref: s.id, debit: 0, credit: s.amount }));
                    const ledger = [...supPurchases, ...supPayments].sort((a, b) => new Date(a.date) - new Date(b.date));

                    return ledger.length > 0 ? ledger.map((l, i) => {
                      runBal = runBal + l.debit - l.credit;
                      return (
                        <tr key={i}>
                          <td>{formatDate(l.date)}</td>
                          <td>{l.type}</td>
                          <td>{l.ref}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{l.debit > 0 ? `৳${l.debit}` : '-'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{l.credit > 0 ? `৳${l.credit}` : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>৳{runBal}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan="6" className="text-center text-muted">No transactions found.</td></tr>;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 12. Cash Statement */}
      {activeTab === 'CashStatement' && (
        <div className="card glass">
          <h3>{t(language, 'Cash Stmt' || 'Cash Statement')} ({dateFilter})</h3>
          <div className="table-responsive mt-4">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Ref ID</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {(() => {
                  const cashTx = (accountTransactions || []).filter(t => t.accountId === 'Cash' && isWithinFilter(t.date));
                  return cashTx.length > 0 ? cashTx.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleString()}</td>
                      <td><span className={`badge ${t.type === 'In' ? 'bg-success text-white px-2 py-1 rounded' : 'bg-danger text-white px-2 py-1 rounded'}`}>{t.type}</span></td>
                      <td>{t.referenceId}</td>
                      <td>{t.description}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: t.type === 'In' ? 'var(--success)' : 'var(--danger)' }}>{t.type === 'In' ? '+' : '-'}৳{t.amount}</td>
                    </tr>
                  )) : <tr><td colSpan="5" className="text-center text-muted">No Cash transactions.</td></tr>;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 13. Bank Statement */}
      {activeTab === 'BankStatement' && (
        <div className="card glass">
          <h3>{t(language, 'Bank Stmt' || 'Bank Statement')} ({dateFilter})</h3>
          <div className="table-responsive mt-4">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Ref ID</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {(() => {
                  const bankTx = (accountTransactions || []).filter(t => t.accountId === 'Bank' && isWithinFilter(t.date));
                  return bankTx.length > 0 ? bankTx.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleString()}</td>
                      <td><span className={`badge ${t.type === 'In' ? 'bg-success text-white px-2 py-1 rounded' : 'bg-danger text-white px-2 py-1 rounded'}`}>{t.type}</span></td>
                      <td>{t.referenceId}</td>
                      <td>{t.description}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: t.type === 'In' ? 'var(--success)' : 'var(--danger)' }}>{t.type === 'In' ? '+' : '-'}৳{t.amount}</td>
                    </tr>
                  )) : <tr><td colSpan="5" className="text-center text-muted">{language === 'bn' ? 'কোনো লেনদেন পাওয়া যায়নি।' : 'No transactions found.'}</td></tr>;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Invoice Drawer for Print */}
      {selectedInvoice && createPortal(
        <div className="drawer-overlay">
          <div className="drawer-container">
            <div className="drawer-header" style={{ backgroundColor: '#f1f5f9' }}>
              <h3 style={{ margin: 0 }}>Document Print</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedInvoice(null)}>
                <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '0', backgroundColor: '#fff' }}>
              <div id="printable-single-invoice" style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#000', fontSize: '1.5rem', fontWeight: 'bold' }}>Allahr dan gents point</h2>
                <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1rem', color: '#555' }}>
                  {invoiceType} Document<br />
                  {selectedInvoice.date && `Date: ${new Date(selectedInvoice.date).toLocaleString()}`}
                  {selectedInvoice.paymentDate && `Date: ${formatDate(selectedInvoice.paymentDate)}`}
                </p>
                <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

                {(invoiceType === 'Sale' || invoiceType === 'Purchase') && (
                  <>
                    <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: '#333' }}>
                      {selectedInvoice.customerName && <><strong>Customer:</strong> {selectedInvoice.customerName}<br /></>}
                      {selectedInvoice.supplierName && <><strong>Supplier:</strong> {selectedInvoice.supplierName}<br /></>}
                      <strong>Payment:</strong> {selectedInvoice.paymentType}
                    </div>
                    <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#000', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}><th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Item</th><th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Total</th></tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.75rem 0' }}>{item.name} <br /> <small style={{ color: '#666' }}>{item.quantity} x ৳{item.price}</small></td>
                            <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>৳{item.price * item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: '#000' }}>
                      <span>Total {invoiceType}:</span><span>৳{selectedInvoice.total}</span>
                    </div>
                  </>
                )}

                {invoiceType === 'Payroll' && (
                  <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                    <p><strong>Staff Name:</strong> {selectedInvoice.staffName}</p>
                    <p><strong>Month:</strong> {selectedInvoice.month}</p>
                    <p><strong>Net Salary:</strong> ৳{selectedInvoice.netPay.toLocaleString()}</p>
                    <p><strong>Bonus:</strong> ৳{selectedInvoice.bonus.toLocaleString()}</p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: '#000' }}><strong>Total Paid:</strong> ৳{(selectedInvoice.netPay + selectedInvoice.bonus).toLocaleString()}</p>
                  </div>
                )}

                {(invoiceType === 'Customer Due' || invoiceType === 'Supplier Due') && (
                  <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                    <p><strong>Name:</strong> {selectedInvoice.name}</p>
                    <p><strong>Phone:</strong> {selectedInvoice.phone}</p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: 'red' }}><strong>Total Due:</strong> ৳{selectedInvoice.due.toLocaleString()}</p>
                  </div>
                )}

                {invoiceType === 'Stock' && (
                  <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                    <p><strong>Item Name:</strong> {selectedInvoice.name}</p>
                    <p><strong>Category:</strong> {selectedInvoice.category}</p>
                    <p><strong>Total In:</strong> <span style={{ color: 'green' }}>+{selectedInvoice.totalIn}</span></p>
                    <p><strong>Total Out:</strong> <span style={{ color: 'red' }}>-{selectedInvoice.totalOut}</span></p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: '#000' }}><strong>Current Stock:</strong> {selectedInvoice.stock} {selectedInvoice.unit}</p>
                  </div>
                )}

                {invoiceType === 'Salesman' && (
                  <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                    <p><strong>Salesman:</strong> {selectedInvoice.name}</p>
                    <p><strong>Invoices Handled:</strong> {selectedInvoice.count}</p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

                    <h4 style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Detailed Sales List:</h4>
                    <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1.5rem', color: '#000', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Date</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Invoice ID</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'left' }}>Customer</th>
                          <th style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.sales && selectedInvoice.sales.map((sale, idx) => (
                          <tr key={idx}>
                            <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{formatDate(sale.date)}</td>
                            <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{sale.id}</td>
                            <td style={{ border: '1px solid #ccc', padding: '0.4rem' }}>{sale.customerInfo?.name || sale.customerName || 'N/A'}</td>
                            <td style={{ border: '1px solid #ccc', padding: '0.4rem', textAlign: 'right' }}>৳{sale.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '1rem', color: '#000' }}>
                      Grand Total Sales: ৳{selectedInvoice.total.toLocaleString()}
                    </div>
                  </div>
                )}

                {invoiceType === 'Expense' && (
                  <div style={{ fontSize: '0.9rem', color: '#333', lineHeight: '2' }}>
                    <p><strong>Category:</strong> {selectedInvoice.category}</p>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', color: 'red' }}><strong>Total Expense:</strong> ৳{selectedInvoice.amount.toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn-outline flex-align-gap"
                style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '99px' }}
                onClick={() => {
                  downloadElementAsPDF('printable-single-invoice', `${invoiceType}-Document-${selectedInvoice?.id || todayStr}`);
                }}
              >
                <Download size={18} /> {language === 'bn' ? 'PDF ডাউনলোড' : 'Download PDF'}
              </button>
              <button className="btn-primary flex-align-gap" style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', borderRadius: '99px' }} onClick={() => {
                printElement('printable-single-invoice', 'Reports');
              }}>
                <Printer size={20} /> {language === 'bn' ? 'প্রিন্ট করুন' : 'Print Document'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Reports;
