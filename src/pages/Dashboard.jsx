import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, DollarSign, TrendingUp, TrendingDown, Truck, RefreshCcw, Users, ArrowRight, Clock, MessageSquare, FileText, Settings, Landmark, Calendar, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const navigate = useNavigate();

  const { user, sales, expenses, inventory, customers, suppliers, language, dashboardSummary, cashBalance, bankBalance } = useStore();
  const isAdmin = user?.role === 'Admin';

  const [currentTime, setCurrentTime] = useState(new Date());
  const [chartTimeframe, setChartTimeframe] = useState('Weekly');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate dynamic stats
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  // Sales
  const dailySales = sales.filter(s => s.date && s.date.startsWith(todayStr)).reduce((acc, sale) => acc + sale.total, 0);
  const monthlySales = sales.filter(s => s.date && s.date.startsWith(currentMonthStr)).reduce((acc, sale) => acc + sale.total, 0);

  // Expenses
  const dailyExpenses = expenses.filter(e => e.date && e.date.startsWith(todayStr)).reduce((acc, exp) => acc + exp.amount, 0);
  const monthlyExpenses = expenses.filter(e => e.date && e.date.startsWith(currentMonthStr)).reduce((acc, exp) => acc + exp.amount, 0);

  // Profit/Loss
  const dailyProfit = dailySales - dailyExpenses;
  const monthlyProfit = monthlySales - monthlyExpenses;

  // The money the shop actually holds. This card used to read sales minus
  // expenses, which left purchases out of it entirely and ignored the opening
  // balances, so a card labelled "balance" showed something that was not one.
  // Cash and bank are now tracked for real, so the card can just say what they
  // add up to.
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

  // --- ACTIVE BORDER DESIGN ---
  const stats = [
    { label: language === 'bn' ? "মোট ব্যালেন্স (ক্যাশ + ব্যাংক)" : "Total Balance (Cash + Bank)", value: `৳${totalBalance.toLocaleString()}`, icon: DollarSign, color: "var(--success)" },
    { label: language === 'bn' ? "আজকের বিক্রয়" : "Today's Sales", value: `৳${dailySales.toLocaleString()}`, icon: ShoppingCart, color: "var(--primary)" },
    { label: language === 'bn' ? "আজকের খরচ" : "Today's Expense", value: `৳${dailyExpenses.toLocaleString()}`, icon: TrendingDown, color: "var(--danger)" },
    { label: language === 'bn' ? "আজকের নিট লাভ" : "Today's Net Profit", value: `৳${dailyProfit.toLocaleString()}`, icon: TrendingUp, color: dailyProfit >= 0 ? "#10b981" : "var(--danger)" },
    { label: language === 'bn' ? "মাসিক লাভ" : "Monthly Profit", value: `৳${monthlyProfit.toLocaleString()}`, icon: TrendingUp, color: monthlyProfit >= 0 ? "#10b981" : "var(--danger)" },
    { label: language === 'bn' ? "মাসিক খরচ" : "Monthly Expense", value: `৳${monthlyExpenses.toLocaleString()}`, icon: DollarSign, color: "var(--warning)" },
    { label: language === 'bn' ? "স্টক ভ্যালু" : "Inventory Value", value: `৳${totalInventoryValue.toLocaleString()}`, icon: Package, color: "var(--info)" },
    { label: language === 'bn' ? "কাস্টমার বকেয়া" : "Customer Due", value: `৳${totalCustomerDue.toLocaleString()}`, icon: Users, color: "var(--warning)" },
    { label: language === 'bn' ? "সাপ্লায়ার বকেয়া" : "Supplier Due", value: `৳${totalSupplierDue.toLocaleString()}`, icon: Users, color: "var(--danger)" }
  ];

  const bkashServices = [
    { name: language === 'bn' ? 'বিক্রয়' : 'POS', path: '/pos', icon: ShoppingCart },
    { name: language === 'bn' ? 'স্টক' : 'Inventory', path: '/inventory', icon: Package },
    { name: language === 'bn' ? 'ক্রয়' : 'Purchases', path: '/purchases', icon: Truck },
    { name: language === 'bn' ? 'রিটার্ন' : 'Returns', path: '/returns', icon: RefreshCcw },
    { name: language === 'bn' ? 'সাপ্লায়ার' : 'Suppliers', path: '/suppliers', icon: Users },
    { name: language === 'bn' ? 'কাস্টমার' : 'Customers', path: '/customers', icon: Users },
    { name: language === 'bn' ? 'খরচ' : 'Expenses', path: '/expenses', icon: DollarSign },
    { name: language === 'bn' ? 'এসআর' : 'SR', path: '/sr', icon: Truck },
    { name: language === 'bn' ? 'স্টক লগ' : 'Stock Log', path: '/stock-log', icon: ClipboardList },
  ];

  const adminServices = user?.role === 'Admin' ? [
    { name: language === 'bn' ? 'হিসাব' : 'Accounts', icon: Landmark, path: '/accounts' },
    { name: language === 'bn' ? 'রিপোর্ট' : 'Reports', icon: FileText, path: '/reports' },
    { name: language === 'bn' ? 'কর্মী' : 'HR', icon: Calendar, path: '/hr' },
    { name: language === 'bn' ? 'এসএমএস' : 'SMS', icon: MessageSquare, path: '/sms' },
    { name: language === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings, path: '/settings' }
  ] : [];

  const allServices = [...bkashServices, ...adminServices];

  // Dynamic Chart Data Calculation (Zero Mock Data)
  const computedWeeklyChartData = [];
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
    computedWeeklyChartData.push({
      name: dayName,
      date: dStr,
      sales: daySales,
      profit: daySales - dayExpenses
    });
  }

  const computedMonthlyChartData = [];
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
    computedMonthlyChartData.push({
      name: `Week ${4 - i}`,
      sales: periodSales,
      profit: periodSales - periodExpenses
    });
  }

  const activeChartData = chartTimeframe === 'Weekly' 
    ? (dashboardSummary?.chartData && dashboardSummary.chartData.length > 0 ? dashboardSummary.chartData : computedWeeklyChartData)
    : computedMonthlyChartData;

  return (
    <div className="dashboard-page animate-fade-in" style={{ padding: '0.5rem' }}>
      
      {/* Header Section */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: '800', letterSpacing: '-1px', color: 'var(--text-main)', marginBottom: '0.5rem' }}>{language === 'bn' ? 'ওভারভিউ' : 'Overview'}</h1>
          <p className="text-muted" style={{ fontSize: '1.1rem' }}>{language === 'bn' ? 'আল্লাহর দান জেন্টস পয়েন্টে স্বাগতম। আজকের কাজের সারাংশ এখানে।' : "Welcome back to Allah Dan Gents Point. Here is what's happening today."}</p>
        </div>

        <div className="card" style={{
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          minWidth: 'fit-content',
          borderRadius: '20px'
        }}>
          <div style={{
            background: 'var(--primary)',
            padding: '12px',
            borderRadius: '16px',
            color: 'white',
            boxShadow: '0 8px 16px rgba(139, 92, 246, 0.25)'
          }}>
            <Clock size={28} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '1.6rem',
              fontWeight: '700',
              color: 'var(--text-main)',
              lineHeight: '1.1',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {currentTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' })}
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                {currentTime.toLocaleTimeString('en-US', { hour12: true, second: '2-digit' }).split(' ')[0].slice(-2)} {currentTime.toLocaleTimeString('en-US', { hour12: true }).split(' ')[1]}
              </span>
            </span>
            <span className="text-muted" style={{ fontSize: '0.9rem', fontWeight: '500', marginTop: '2px' }}>
              {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* --- PREMIUM bKash Style Services Grid --- */}
      <div className="card" style={{ 
        marginBottom: '2.5rem', 
        padding: '2rem', 
        borderRadius: '24px', 
        border: 'none', 
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-md)'
      }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>{language === 'bn' ? 'কুইক সার্ভিস' : 'Quick Services'}</h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', 
          gap: '1.5rem',
          justifyItems: 'center'
        }}>
          {allServices.map((service, index) => (
            <div
              key={index}
              onClick={() => navigate(service.path)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                width: '100%',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.children[0].style.boxShadow = '0 12px 20px rgba(233, 30, 99, 0.25)';
                e.currentTarget.children[0].style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.children[0].style.boxShadow = '0 4px 12px rgba(233, 30, 99, 0.15)';
                e.currentTarget.children[0].style.transform = 'scale(1)';
              }}
            >
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '22px', // Squircle shape
                backgroundColor: '#fdf2f8', // Soft pink background
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
                color: '#e91e63',
                boxShadow: '0 4px 12px rgba(233, 30, 99, 0.15)',
                transition: 'all 0.3s ease',
                border: '1px solid rgba(233, 30, 99, 0.1)'
              }}>
                <service.icon size={30} strokeWidth={1.5} />
              </div>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: '600', 
                textAlign: 'center',
                color: 'var(--text-main)',
                letterSpacing: '0.2px'
              }}>
                {service.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* --- PREMIUM ACTIVE BORDER LAYOUT --- */}
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>{language === 'bn' ? 'সারসংক্ষেপ' : 'Business Summary'}</h2>
      <div className="grid responsive-grid" style={{ marginBottom: '2.5rem', gap: '1.25rem' }}>
        {stats.map((stat, idx) => (
          <div key={idx} className="card" style={{ 
            flexDirection: 'column', 
            alignItems: 'flex-start',
            borderRadius: '20px',
            transition: 'all 0.3s ease',
            padding: '1.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px -10px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.02)';
          }}
          >
            {/* Subtle color glow in the corner */}
            <div style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '100px',
              height: '100px',
              background: `radial-gradient(circle, ${stat.color}25 0%, transparent 70%)`,
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            
            <div className="flex-align-gap w-full" style={{ justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
               <h3 style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</h3>
               <div style={{ padding: '8px', borderRadius: '12px', background: `${stat.color}15`, color: stat.color }}>
                 <stat.icon size={20} strokeWidth={2} />
               </div>
            </div>
            <p style={{ 
              fontSize: '2rem', 
              fontWeight: '800', 
              marginTop: '1rem', 
              color: 'var(--text-main)',
              letterSpacing: '-1px',
              position: 'relative',
              zIndex: 1
            }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid responsive-grid-2" style={{ marginBottom: '2rem', gap: '1.5rem' }}>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="flex-align-gap" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '600' }}>{language === 'bn' ? 'বিক্রয় অ্যানালিটিক্স' : 'Sales Analytics'}</h3>
              <p className="text-muted text-sm mt-1">{chartTimeframe === 'Weekly' ? (language === 'bn' ? 'গত ৭ দিনের আয় এবং লাভ' : 'Revenue and Profit over the last 7 days') : (language === 'bn' ? 'গত ৪ সপ্তাহের আয় এবং লাভ' : 'Revenue and Profit over the last 4 weeks')}</p>
            </div>
            <div className="segmented-control">
              <button className={chartTimeframe === 'Weekly' ? 'active' : ''} onClick={() => setChartTimeframe('Weekly')}>Weekly</button>
              <button className={chartTimeframe === 'Monthly' ? 'active' : ''} onClick={() => setChartTimeframe('Monthly')}>Monthly</button>
            </div>
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <AreaChart data={activeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-lg)' }}
                  itemStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid responsive-grid-2" style={{ gap: '1.5rem' }}>

        {/* Customer Dues (Accounts Receivable) */}
        <div className="card">
          <div className="flex-align-gap" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--warning)' }}>Accounts Receivable</h3>
            <span className="badge warning">Customer Due</span>
          </div>
          <p className="text-muted text-sm mb-3">Total money owed to you by customers.</p>
          <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Phone</th>
                  <th style={{ textAlign: 'right' }}>Due Amount</th>
                </tr>
              </thead>
              <tbody>
                {customers.filter(c => c.due > 0).length > 0 ? (
                  customers.filter(c => c.due > 0).map(customer => (
                    <tr key={customer.id}>
                      <td style={{ fontWeight: '500' }}>{customer.name}</td>
                      <td>{customer.phone}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--warning)' }}>
                        ৳{customer.due.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem' }} className="text-muted">
                      No customer dues at the moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supplier Dues (Accounts Payable) */}
        <div className="card">
          <div className="flex-align-gap" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--danger)' }}>Accounts Payable</h3>
            <span className="badge danger">Supplier Due</span>
          </div>
          <p className="text-muted text-sm mb-3">Total money you owe to suppliers.</p>
          <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Phone</th>
                  <th style={{ textAlign: 'right' }}>Due Amount</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.filter(s => s.due > 0).length > 0 ? (
                  suppliers.filter(s => s.due > 0).map(supplier => (
                    <tr key={supplier.id}>
                      <td style={{ fontWeight: '500' }}>{supplier.name}</td>
                      <td>{supplier.phone}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                        ৳{supplier.due.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem' }} className="text-muted">
                      No supplier dues at the moment.
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
