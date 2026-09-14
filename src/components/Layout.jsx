import { toast } from 'react-toastify';
import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import useStore from '../store/useStore';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  LogOut,
  Settings,
  DollarSign,
  Truck,
  RefreshCcw,
  Sun,
  Moon,
  PanelLeft,
  MessageSquare,
  Wifi,
  WifiOff,
  ArrowLeft,
  Landmark,
  Scale,
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardList,
  ReceiptText,
  Menu,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import './Layout.css';
import logo from '../assets/allah_dan.jpeg';
import { hasMenuAccess } from '../utils/navigationConfig';

// Route-to-Data requirements mapping for lazy-loading
const ROUTE_SLICES = {
  '/': ['dashboard', 'sales', 'expenses', 'treasury', 'inventory', 'customers', 'suppliers'],
  '/pos': ['inventory', 'customers', 'drafts', 'staff', 'sales'],
  '/pos-history': ['sales', 'customers', 'settlements', 'treasury'],
  // The day book fetches its own figures; the slices are for acting on rows.
  '/day-book': ['sales', 'customers', 'expenses'],
  '/inventory': ['categories', 'units'],
  '/purchases': ['purchases', 'suppliers', 'inventory'],
  '/returns': ['returns', 'inventory'],
  '/suppliers': ['suppliers', 'purchases', 'settlements'],
  '/customers': ['customers', 'suppliers', 'sales', 'purchases', 'settlements'],
  '/expenses': ['expenses'],
  '/sr': ['sr', 'staff', 'inventory'],
  '/stock-log': ['inventory'],
  '/accounts': ['treasury'],
  // The balance sheet fetches its own figures for the chosen range.
  '/balance-sheet': [],
  '/ledger': ['customers', 'suppliers', 'staff'],
  '/reports': ['dashboard', 'sales', 'inventory', 'purchases', 'expenses', 'customers', 'suppliers', 'staff', 'payrolls', 'returns', 'attendance', 'leaves', 'treasury', 'settlements'],
  '/hr': ['staff', 'attendance', 'leaves', 'payrolls'],
  '/sms': ['sms', 'customers'],
  '/settings': [],
};

const Layout = () => {
  const { user, logout, theme, toggleTheme, language, setLanguage, ensureLoaded, refresh, rolePermissions } = useStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Smart lazy-loader: fetch only what the current active route requires with 90s cache
  useEffect(() => {
    if (!user) return;
    const cleanPath = location.pathname.replace(/\/$/, '') || '/';
    const slices = ROUTE_SLICES[cleanPath];
    if (slices && slices.length > 0) {
      ensureLoaded(...slices);
    }
  }, [location.pathname, user, ensureLoaded]);

  const handleRefreshRoute = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const cleanPath = location.pathname.replace(/\/$/, '') || '/';
    const slices = ROUTE_SLICES[cleanPath] || [];
    try {
      if (slices.length > 0) {
        await refresh(...slices);
      } else {
        await refresh();
      }
      toast.info(language === 'bn' ? 'তথ্য রিফ্রেশ হয়েছে' : 'Data refreshed');
    } catch {
      toast.error(language === 'bn' ? 'রিফ্রেশ ব্যর্থ হয়েছে' : 'Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allServices = [
    { name: language === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: language === 'bn' ? 'আজকের হিসাব' : 'Day Book', path: '/day-book', icon: CalendarDays },
    { name: language === 'bn' ? 'বিক্রয়' : 'POS', path: '/pos', icon: ShoppingCart },
    { name: language === 'bn' ? 'পিওএস ইতিহাস' : 'POS History', path: '/pos-history', icon: ReceiptText },
    { name: language === 'bn' ? 'স্টক' : 'Inventory', path: '/inventory', icon: Package },
    { name: language === 'bn' ? 'ক্রয়' : 'Purchases', path: '/purchases', icon: Truck },
    { name: language === 'bn' ? 'রিটার্ন' : 'Returns', path: '/returns', icon: RefreshCcw },
    { name: language === 'bn' ? 'সাপ্লায়ার' : 'Suppliers', path: '/suppliers', icon: Users },
    { name: language === 'bn' ? 'কাস্টমার' : 'Customers', path: '/customers', icon: Users },
    { name: language === 'bn' ? 'খরচ' : 'Expenses', path: '/expenses', icon: DollarSign },
    { name: language === 'bn' ? 'এসআর' : 'SR', path: '/sr', icon: Truck },
    { name: language === 'bn' ? 'স্টক লগ' : 'Stock Log', path: '/stock-log', icon: ClipboardList },
  ].filter((item) => hasMenuAccess(user, item.path, rolePermissions));

  const adminServices = [
    { name: language === 'bn' ? 'হিসাব' : 'Accounts', icon: Landmark, path: '/accounts' },
    { name: language === 'bn' ? 'খাতা (লেজার)' : 'Ledger', icon: BookOpen, path: '/ledger' },
    { name: language === 'bn' ? 'ব্যালেন্স শিট' : 'Balance Sheet', icon: Scale, path: '/balance-sheet' },
    { name: language === 'bn' ? 'রিপোর্ট' : 'Reports', icon: FileText, path: '/reports' },
    { name: language === 'bn' ? 'কর্মী' : 'HR', icon: Calendar, path: '/hr' },
    { name: language === 'bn' ? 'এসএমএস' : 'SMS', icon: MessageSquare, path: '/sms' },
    { name: language === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings, path: '/settings' },
  ].filter((item) => hasMenuAccess(user, item.path, rolePermissions));

  // Rendered as two labelled groups. Fifteen links in one undifferentiated
  // column is a wall; split into "day to day" and "management" it reads as two
  // short lists, and the admin half is visibly a different kind of work.
  const navGroups = [
    { key: 'ops', label: language === 'bn' ? 'দৈনন্দিন' : 'Operations', items: allServices },
    { key: 'admin', label: language === 'bn' ? 'ব্যবস্থাপনা' : 'Management', items: adminServices },
  ].filter((group) => group.items.length > 0);

  return (
    <div className={`app-container ${theme === 'dark' ? 'dark-mode' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2>{language === 'bn' ? 'মেনু' : 'Menu'}</h2>

          <button
            className="btn-icon hide-on-mobile"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={language === 'bn' ? 'সাইডবার ছোট/বড় করুন' : 'Collapse sidebar'}
          >
            <PanelLeft size={17} />
          </button>

          {isMobileMenuOpen && (
            <button className="btn-icon mobile-menu-toggle" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={18} />
            </button>
          )}
        </div>

        <nav className={`sidebar-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {navGroups.map((group) => (
            <React.Fragment key={group.key}>
              <div className="nav-section-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  title={isSidebarCollapsed ? item.name : undefined}
                >
                  <item.icon size={17} />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          {/* Left: navigation and brand */}
          <div className="topbar-brand">
            <button
              className="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title={language === 'bn' ? 'মেনু' : 'Menu'}
            >
              <Menu size={18} />
            </button>

            {!isDashboard && (
              <button className="back-btn" onClick={() => navigate(-1)} title={language === 'bn' ? 'পেছনে' : 'Go back'}>
                <ArrowLeft size={17} />
              </button>
            )}

            <div className="brand-link" onClick={() => navigate('/')} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate('/'); }}>
              <div className="brand-logo">
                <img src={logo} alt="" />
              </div>
              <div className="brand-text">
                <h2>{language === 'bn' ? 'আল্লাহর দান জেন্টস পয়েন্ট' : 'Allahr dan gents point'}</h2>
              </div>
            </div>
          </div>

          {/* Right: status and account */}
          <div className="topbar-actions">
            <div className={`conn-pill ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Connected' : 'No connection'}>
              {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span className="hide-on-mobile">{isOnline ? 'Synced' : 'Offline'}</span>
            </div>

            <button
              className="btn-icon"
              onClick={handleRefreshRoute}
              title={language === 'bn' ? 'তথ্য রিফ্রেশ করুন' : 'Refresh page data'}
              disabled={isRefreshing}
            >
              <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>

            <button
              className="btn-icon"
              onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
              title="Toggle language"
              style={{ fontWeight: 700, fontSize: '0.75rem' }}
            >
              {language === 'en' ? 'BN' : 'EN'}
            </button>

            <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="user-profile-topbar">
              <div className="avatar">{user?.name?.charAt(0).toUpperCase()}</div>
              <div className="user-meta hide-on-mobile">
                <span className="name">{user?.name}</span>
                <span className="role-badge">{user?.role}</span>
              </div>
              <button onClick={handleLogout} className="logout-btn" title={language === 'bn' ? 'লগআউট' : 'Logout'}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="content-area">
          <div className="print-only-header">
            <h2>{language === 'bn' ? 'আল্লাহর দান জেন্টস পয়েন্ট' : 'Allahr dan gents point'}</h2>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
