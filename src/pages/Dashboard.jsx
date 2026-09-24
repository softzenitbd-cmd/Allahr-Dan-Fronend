import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, DollarSign, TrendingUp, TrendingDown, Truck, RefreshCcw, Users, ArrowRight, Clock, MessageSquare, FileText, Settings, Landmark, Calendar, ClipboardList, CalendarDays, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DASHBOARD_CARDS, cardColor } from '../utils/dashboardCards';
import { hasMenuAccess } from '../utils/navigationConfig';
import './Dashboard.css';
import { formatDate, formatTime } from '../utils/date';

const Dashboard = () => {
  const navigate = useNavigate();

  const {
    user, sales, expenses, inventory, customers, suppliers, language,
    dashboardSummary, cashBalance, bankBalance, dashboardCardColors, rolePermissions,
    staff, ensureLoaded,
    refresh
  } = useStore();
  const isSalesman = String(user?.role || '').toLowerCase() === 'salesman';
  const isAdmin = user?.role === 'Admin';

  const [currentTime, setCurrentTime] = useState(new Date());
  const [chartTimeframe, setChartTimeframe] = useState('Weekly');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep dashboard metrics fresh from the backend balance sheet / day book
  useEffect(() => {
    if (typeof refresh === 'function') {
      refresh('dashboard');
    }
    if (isSalesman && typeof ensureLoaded === 'function') {
      ensureLoaded('staff', 'payrolls');
    }
  }, [refresh, isSalesman, ensureLoaded]);

  // Match logged-in salesman to their staff profile
  const currentStaff = React.useMemo(() => {
    if (!user || !isSalesman) return null;
    const uName = String(user.username || '').toLowerCase();
    const uFullName = String(user.name || '').trim().toLowerCase();
    const uId = String(user.id || '');
    return (staff || []).find((s) => {
      const sUser = String(s.username || '').toLowerCase();
      const sCode = String(s.staff_code || '').toLowerCase();
      const sName = String(s.name || '').trim().toLowerCase();
      const sId = String(s.id || '');
      return (sUser && sUser === uName) ||
             (sCode && sCode === uName) ||
             (sName && uFullName && sName === uFullName) ||
             (sId && uId && sId === uId);
    }) || null;
  }, [user, staff, isSalesman]);

  // Calculate dynamic stats
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  // Sales
  const dailySales = sales.filter(s => s.date && s.date.startsWith(todayStr)).reduce((acc, sale) => acc + sale.total, 0);
  const monthlySales = sales.filter(s => s.date && s.date.startsWith(currentMonthStr)).reduce((acc, sale) => acc + sale.total, 0);

  // Expenses
  const dailyExpenses = expenses.filter(e => e.date && e.date.startsWith(todayStr)).reduce((acc, exp) => acc + exp.amount, 0);
  const monthlyExpenses = expenses.filter(e => e.date && e.date.startsWith(currentMonthStr)).reduce((acc, exp) => acc + exp.amount, 0);

  // Helper to calculate total COGS (Cost of Goods Sold) for a sale
  const calcSaleCogs = (sale) => {
    if (!sale?.items || !Array.isArray(sale.items)) return 0;
    return sale.items.reduce((sum, it) => {
      const q = Number(it.quantity) || 1;
      let cost = Number(it.cost_price ?? it.costPrice);
      if (isNaN(cost) || cost <= 0) {
        const prod = (inventory || []).find(p => p.id === it.id || p.product_code === it.id || p.product_code === it.product_code || p.name === it.name);
        cost = Number(prod?.cost_price ?? prod?.costPrice ?? 0);
      }
      return sum + (cost * q);
    }, 0);
  };

  const dailyCogs = sales.filter(s => s.date && s.date.startsWith(todayStr)).reduce((acc, sale) => acc + calcSaleCogs(sale), 0);
  const monthlyCogs = sales.filter(s => s.date && s.date.startsWith(currentMonthStr)).reduce((acc, sale) => acc + calcSaleCogs(sale), 0);

  // Profit/Loss: (Sales - COGS) - Operating Expenses
  // Matches DayBook & BalanceSheet calculations exactly
  const dailyProfit = dashboardSummary?.dailyProfit !== undefined
    ? Number(dashboardSummary.dailyProfit)
    : (dailySales - dailyCogs - dailyExpenses);

  const monthlyProfit = dashboardSummary?.monthlyProfit !== undefined
    ? Number(dashboardSummary.monthlyProfit)
    : (monthlySales - monthlyCogs - monthlyExpenses);

  // The money the shop actually holds.
  const totalBalance = (cashBalance || 0) + (bankBalance || 0);

  const totalInventoryValue = inventory.reduce((acc, item) => acc + (item.stock * item.price), 0);
  const totalCustomerDue = customers.reduce((acc, cust) => acc + cust.due, 0);
  const totalSupplierDue = suppliers.reduce((acc, sup) => acc + sup.due, 0);

  // --- GRADIENT DESIGN (Commented out for now as requested) ---
  /*
  const stats = [
    { label: "Total Balance (Cash + Bank)", value: `৳${totalBalance.toLocaleString()}`, icon: DollarSign, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)' },
    { label: "Today's Sales", value: `৳${dailySales.toLocaleString()}`, icon: ShoppingCart, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', shadow: '0 10px 20px -5px rgba(139, 92, 246, 0.4)' },
    { label: "Today's Expense", value: `৳${dailyExpenses.toLocaleString()}`, icon: TrendingDown, gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: '0 10px 20px -5px rgba(239, 68, 68, 0.4)' },
    { label: "Today's Net Profit", value: `৳${dailyProfit.toLocaleString()}`, icon: TrendingUp, gradient: dailyProfit >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: dailyProfit >= 0 ? '0 10px 20px -5px rgba(16, 185, 129, 0.4)' : '0 10px 20px -5px rgba(239, 68, 68, 0.4)' },
    { label: "Monthly Profit", value: `৳${monthlyProfit.toLocaleString()}`, icon: TrendingUp, gradient: monthlyProfit >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: monthlyProfit >= 0 ? '0 10px 20px -5px rgba(16, 185, 129, 0.4)' : '0 10px 20px -5px rgba(239, 68, 68, 0.4)' },
    { label: "Monthly Expense", value: `৳${monthlyExpenses.toLocaleString()}`, icon: DollarSign, gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)', shadow: '0 10px 20px -5px rgba(245, 158, 11, 0.4)' },
    { label: "Inventory Value", value: `৳${totalInventoryValue.toLocaleString()}`, icon: Package, gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', shadow: '0 10px 20px -5px rgba(59, 130, 246, 0.4)' },
    { label: "Customer Due (Receivable)", value: `৳${totalCustomerDue.toLocaleString()}`, icon: Users, gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)', shadow: '0 10px 20px -5px rgba(245, 158, 11, 0.4)' },
    { label: "Supplier Due (Payable)", value: `৳${totalSupplierDue.toLocaleString()}`, icon: Users, gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: '0 10px 20px -5px rgba(239, 68, 68, 0.4)' }
  ];
  */

  const totalCustomers = (customers || []).length;

  // Each card carries its own colour, chosen in Settings or falling back to
  // the default the card ships with (defaulting to red on loss if not customized).
  const valueByKey = {
    totalBalance: totalBalance,
    todaySales: dailySales,
    todayExpense: dailyExpenses,
    todayProfit: dailyProfit,
    monthlyProfit: monthlyProfit,
    monthlyExpense: monthlyExpenses,
    totalCustomers: totalCustomers,
    customerDue: totalCustomerDue,
  };
  const iconByKey = {
    totalBalance: DollarSign, todaySales: ShoppingCart, todayExpense: TrendingDown,
    todayProfit: TrendingUp, monthlyProfit: TrendingUp, monthlyExpense: DollarSign,
    totalCustomers: Users, customerDue: Users,
  };
  const stats = DASHBOARD_CARDS.map((card) => {
    const value = valueByKey[card.key] || 0;
    const isLoss = (card.key === 'todayProfit' || card.key === 'monthlyProfit') && value < 0;
    const formattedValue = card.key === 'totalCustomers'
      ? `${value.toLocaleString()} ${language === 'bn' ? 'জন' : 'Customers'}`
      : `৳${value.toLocaleString()}`;
    const userCustomColor = dashboardCardColors?.[card.key];
    return {
      key: card.key,
      label: language === 'bn' ? card.bn : card.en,
      value: formattedValue,
      icon: isLoss ? TrendingDown : iconByKey[card.key],
      color: userCustomColor || (isLoss ? '#dc2626' : card.color),
    };
  });

  const rawServices = [
    { name: language === 'bn' ? 'আজকের হিসাব' : 'Day Book', path: '/day-book', icon: CalendarDays },
    { name: language === 'bn' ? 'বিক্রয়' : 'POS', path: '/pos', icon: ShoppingCart },
    { name: language === 'bn' ? 'স্টক' : 'Inventory', path: '/inventory', icon: Package },
    { name: language === 'bn' ? 'ক্রয়' : 'Purchases', path: '/purchases', icon: Truck },
    { name: language === 'bn' ? 'রিটার্ন' : 'Returns', path: '/returns', icon: RefreshCcw },
    { name: language === 'bn' ? 'সাপ্লায়ার' : 'Suppliers', path: '/suppliers', icon: Users },
    { name: language === 'bn' ? 'কাস্টমার' : 'Customers', path: '/customers', icon: Users },
    { name: language === 'bn' ? 'খরচ' : 'Expenses', path: '/expenses', icon: DollarSign },
    { name: language === 'bn' ? 'স্টক লগ' : 'Stock Log', path: '/stock-log', icon: ClipboardList },
    { name: language === 'bn' ? 'হিসাব' : 'Accounts', icon: Landmark, path: '/accounts' },
    { name: language === 'bn' ? 'খাতা (লেজার)' : 'Ledger', icon: BookOpen, path: '/ledger' },
    { name: language === 'bn' ? 'রিপোর্ট' : 'Reports', icon: FileText, path: '/reports' },
    { name: language === 'bn' ? 'কর্মী' : 'HR', icon: Calendar, path: '/hr' },
    { name: language === 'bn' ? 'এসএমএস' : 'SMS', icon: MessageSquare, path: '/sms' },
    { name: language === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings, path: '/settings' },
  ];

  const allServices = rawServices.filter((item) => hasMenuAccess(user, item.path, rolePermissions));

  // Dynamic Chart Data Calculation (Zero Mock Data)
  const computedWeeklyChartData = React.useMemo(() => {
    const list = [];
    const todayDate = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const daySales = (sales || [])
        .filter(s => s.date && s.date.startsWith(dStr))
        .reduce((acc, s) => acc + (Number(s.total) || 0), 0);
      const dayExpenses = (expenses || [])
        .filter(e => e.date && e.date.startsWith(dStr))
        .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      const dayCogs = (sales || [])
        .filter(s => s.date && s.date.startsWith(dStr))
        .reduce((acc, s) => acc + calcSaleCogs(s), 0);
      list.push({
        name: dayName,
        date: dStr,
        sales: daySales,
        profit: (daySales - dayCogs) - dayExpenses
      });
    }
    return list;
  }, [sales, expenses]);

  const computedMonthlyChartData = React.useMemo(() => {
    const list = [];
    const todayDate = new Date();
    for (let i = 3; i >= 0; i--) {
      const startD = new Date(todayDate);
      startD.setDate(todayDate.getDate() - (i * 7 + 6));
      const endD = new Date(todayDate);
      endD.setDate(todayDate.getDate() - (i * 7));
      const periodSales = (sales || [])
        .filter(s => {
          if (!s.date) return false;
          const sDate = s.date.split('T')[0];
          return sDate >= startD.toISOString().split('T')[0] && sDate <= endD.toISOString().split('T')[0];
        })
        .reduce((acc, s) => acc + (Number(s.total) || 0), 0);
      const periodExpenses = (expenses || [])
        .filter(e => {
          if (!e.date) return false;
          const eDate = e.date.split('T')[0];
          return eDate >= startD.toISOString().split('T')[0] && eDate <= endD.toISOString().split('T')[0];
        })
        .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      const periodCogs = (sales || [])
        .filter(s => {
          if (!s.date) return false;
          const sDate = s.date.split('T')[0];
          return sDate >= startD.toISOString().split('T')[0] && sDate <= endD.toISOString().split('T')[0];
        })
        .reduce((acc, s) => acc + calcSaleCogs(s), 0);
      list.push({
        name: `Week ${4 - i}`,
        sales: periodSales,
        profit: (periodSales - periodCogs) - periodExpenses
      });
    }
    return list;
  }, [sales, expenses]);

  const activeChartData = chartTimeframe === 'Weekly' ? computedWeeklyChartData : computedMonthlyChartData;

  const myPersonalSales = React.useMemo(() => {
    if (!currentStaff) return { today: 0, total: 0, count: 0 };
    const sId = String(currentStaff.staff_code || currentStaff.id || user?.username || '').toLowerCase();
    const sName = String(currentStaff.name || user?.name || '').trim().toLowerCase();
    const mySales = (sales || []).filter((s) => {
      const invSid = String(s.salesman_id || s.salesmanId || '').toLowerCase();
      const invSname = String(s.salesman_name || s.salesmanName || '').trim().toLowerCase();
      return (invSid && invSid === sId) || (invSname && invSname === sName);
    });
    const today = mySales
      .filter((s) => s.date && String(s.date).startsWith(todayStr))
      .reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const total = mySales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    return { today, total, count: mySales.length };
  }, [currentStaff, sales, todayStr, user]);

  return (
    <div className="dashboard-page animate-fade-in">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{language === 'bn' ? 'ওভারভিউ' : 'Overview'}</h1>
          <p className="text-muted">
            {language === 'bn'
              ? 'আল্লাহর দান জেন্টস পয়েন্টে স্বাগতম। আজকের কাজের সারাংশ এখানে।'
              : "Welcome back to Allahr dan gents point. Here is what's happening today."}
          </p>
        </div>

        <div className="dash-clock">
          <div className="icon"><Clock size={19} /></div>
          <div>
            <div className="time">
              {formatTime(currentTime)}
            </div>
            <div className="date">
              {formatDate(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Salesman Personal Salary & Due Banner */}
      {isSalesman && currentStaff && (
        <div className="card mb-6" style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '1.25rem 1.5rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', fontWeight: 800
              }}>
                {(currentStaff.name || user?.name || 'S')[0]?.toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 700 }}>
                  {language === 'bn' ? `স্বাগতম, ${currentStaff.name}` : `Welcome, ${currentStaff.name}`}
                </h2>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 2 }}>
                  {language === 'bn' ? 'সেলসম্যান ব্যক্তিগত হিসাব ও বেতন বিবরণী' : 'Personal Salary & Due Overview'} · {currentStaff.staff_code || currentStaff.id}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/ledger')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontSize: '0.875rem' }}
            >
              <BookOpen size={17} />
              {language === 'bn' ? 'আমার সম্পূর্ণ খাতা ও বিবরণী' : 'View My Full Ledger'}
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '1rem',
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {language === 'bn' ? 'মূল বেতন' : 'Base Salary'}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#38bdf8', marginTop: 4 }}>
                ৳{(Number(currentStaff.base_salary) || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {language === 'bn' ? 'দোকানকে দেনা (বকেয়া)' : 'Current Due (Owed)'}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: (Number(currentStaff.due) || 0) > 0 ? '#f87171' : '#4ade80', marginTop: 4 }}>
                ৳{(Number(currentStaff.due) || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {language === 'bn' ? 'আজকের নিজস্ব বিক্রয়' : "Today's Personal Sales"}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#facc15', marginTop: 4 }}>
                ৳{myPersonalSales.today.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {language === 'bn' ? 'মোট নিজস্ব বিক্রয়' : 'Total Personal Sales'}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#4ade80', marginTop: 4 }}>
                ৳{myPersonalSales.total.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick services */}
      <div className="card mb-6">
        <div className="dash-section-title">{language === 'bn' ? 'কুইক সার্ভিস' : 'Quick Services'}</div>
        <div className="quick-services">
          {allServices.map((service, index) => (
            <button key={index} type="button" className="quick-service" onClick={() => navigate(service.path)}>
              <span className="tile"><service.icon size={20} strokeWidth={1.9} /></span>
              <span>{service.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="dash-section-title">{language === 'bn' ? 'সারসংক্ষেপ' : 'Business Summary'}</div>
      <div className="stat-grid mb-6">
        {stats.map((stat) => (
          <div key={stat.key} className="stat-card" style={{ '--card': stat.color }}>
            <div className="head">
              <span className="label">{stat.label}</span>
              <span className="icon">
                <stat.icon size={16} strokeWidth={2} />
              </span>
            </div>
            <div className="value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Sales analytics */}
      <div className="card mb-6">
        <div className="dash-panel-head">
          <div>
            <h3>{language === 'bn' ? 'বিক্রয় অ্যানালিটিক্স' : 'Sales Analytics'}</h3>
            <p className="dash-panel-sub" style={{ marginBottom: 0 }}>
              {chartTimeframe === 'Weekly'
                ? (language === 'bn' ? 'গত ৭ দিনের আয় এবং লাভ' : 'Revenue and profit over the last 7 days')
                : (language === 'bn' ? 'গত ৪ সপ্তাহের আয় এবং লাভ' : 'Revenue and profit over the last 4 weeks')}
            </p>
          </div>
          <div className="segmented-control">
            <button className={chartTimeframe === 'Weekly' ? 'active' : ''} onClick={() => setChartTimeframe('Weekly')}>
              {language === 'bn' ? 'সাপ্তাহিক' : 'Weekly'}
            </button>
            <button className={chartTimeframe === 'Monthly' ? 'active' : ''} onClick={() => setChartTimeframe('Monthly')}>
              {language === 'bn' ? 'মাসিক' : 'Monthly'}
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: 300, marginTop: '1rem' }}>
          <ResponsiveContainer>
            <AreaChart data={activeChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={62} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-lg)',
                  fontSize: '0.8125rem',
                }}
                labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              <Area type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="responsive-grid-2">

        {/* Customer dues (receivable) */}
        <div className="card">
          <div className="dash-panel-head">
            <h3>{language === 'bn' ? 'প্রাপ্য হিসাব' : 'Accounts Receivable'}</h3>
            <span className="badge bg-warning">{language === 'bn' ? 'কাস্টমার বকেয়া' : 'Customer Due'}</span>
          </div>
          <p className="dash-panel-sub">
            {language === 'bn' ? 'কাস্টমারদের কাছে আপনার মোট পাওনা।' : 'Total money owed to you by customers.'}
          </p>
          <div className="table-responsive dash-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{language === 'bn' ? 'কাস্টমার' : 'Customer'}</th>
                  <th>{language === 'bn' ? 'ফোন' : 'Phone'}</th>
                  <th className="num">{language === 'bn' ? 'বকেয়া' : 'Due'}</th>
                </tr>
              </thead>
              <tbody>
                {customers.filter(c => c.due > 0).length > 0 ? (
                  customers.filter(c => c.due > 0).map(customer => (
                    <tr key={customer.id}>
                      <td style={{ fontWeight: 500 }}>{customer.name}</td>
                      <td className="text-muted">{customer.phone}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--warning)' }}>
                        ৳{customer.due.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center text-muted" style={{ padding: '1.75rem' }}>
                      {language === 'bn' ? 'এই মুহূর্তে কোনো কাস্টমার বকেয়া নেই।' : 'No customer dues at the moment.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supplier dues (payable) */}
        <div className="card">
          <div className="dash-panel-head">
            <h3>{language === 'bn' ? 'প্রদেয় হিসাব' : 'Accounts Payable'}</h3>
            <span className="badge bg-danger">{language === 'bn' ? 'সাপ্লায়ার বকেয়া' : 'Supplier Due'}</span>
          </div>
          <p className="dash-panel-sub">
            {language === 'bn' ? 'সাপ্লায়ারদের কাছে আপনার মোট দেনা।' : 'Total money you owe to suppliers.'}
          </p>
          <div className="table-responsive dash-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{language === 'bn' ? 'সাপ্লায়ার' : 'Supplier'}</th>
                  <th>{language === 'bn' ? 'ফোন' : 'Phone'}</th>
                  <th className="num">{language === 'bn' ? 'বকেয়া' : 'Due'}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.filter(s => s.due > 0).length > 0 ? (
                  suppliers.filter(s => s.due > 0).map(supplier => (
                    <tr key={supplier.id}>
                      <td style={{ fontWeight: 500 }}>{supplier.name}</td>
                      <td className="text-muted">{supplier.phone}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--danger)' }}>
                        ৳{supplier.due.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center text-muted" style={{ padding: '1.75rem' }}>
                      {language === 'bn' ? 'এই মুহূর্তে কোনো সাপ্লায়ার বকেয়া নেই।' : 'No supplier dues at the moment.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;

