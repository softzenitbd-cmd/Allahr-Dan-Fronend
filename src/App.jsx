import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import logo from './assets/allah_dan.jpeg';
import useStore from './store/useStore';
import { applyAccent } from './utils/accent';
import TopLoader from './components/TopLoader';
import Login from './pages/Login';
import Layout from './components/Layout';
import { hasMenuAccess } from './utils/navigationConfig';

// Code-split pages so unvisited pages don't flood the network with JS modules
const Inventory = lazy(() => import('./pages/Inventory'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Returns = lazy(() => import('./pages/Returns'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Customers = lazy(() => import('./pages/Customers'));
const Expenses = lazy(() => import('./pages/Expenses'));
const HR = lazy(() => import('./pages/HR'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const POSHistory = lazy(() => import('./pages/POSHistory'));
const SMS = lazy(() => import('./pages/SMS'));
const Accounts = lazy(() => import('./pages/Accounts'));
const BalanceSheet = lazy(() => import('./pages/BalanceSheet'));
const Ledger = lazy(() => import('./pages/Ledger'));
const DayBook = lazy(() => import('./pages/DayBook'));
const SR = lazy(() => import('./pages/SR'));
const StockLog = lazy(() => import('./pages/StockLog'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));

// Placeholder Pages (will be extracted to separate files in later phases)

// Protected Route Wrapper with Dynamic Role-Based Access Control
const ProtectedRoute = ({ children, requiredRole, path }) => {
  const user = useStore((state) => state.user);
  const rolePermissions = useStore((state) => state.rolePermissions);
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole && user.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  if (path && !hasMenuAccess(user, path, rolePermissions)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const theme = useStore((state) => state.theme);
  const themeGradient = useStore((state) => state.themeGradient) || 'theme-sky';
  const accentColor = useStore((state) => state.accentColor);
  const user = useStore((state) => state.user);
  const hydrate = useStore((state) => state.hydrate);

  // A reload keeps the session but not the data, so pull everything back from
  // the server once the persisted user is known.
  useEffect(() => {
    if (user) hydrate();
    const onFocus = () => {
      if (user) hydrate();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, hydrate]);

  useEffect(() => {
    // Clear old theme classes
    document.body.classList.remove(
      'theme-sky', 'theme-emerald', 'theme-purple', 
      'theme-rose', 'theme-amber', 'theme-indigo'
    );
    
    // Add new theme class
    document.body.classList.add(themeGradient);

    // Keep legacy light-mode logic if it was used anywhere else
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    }

    // A freely picked accent is painted straight onto the body, which beats
    // the theme class. It has to be re-derived when the screen flips to dark,
    // because the same colour needs different treatment on each ground.
    applyAccent(accentColor, theme !== 'light');

    // Global click listener for closing modals/drawers
    const handleOverlayClick = (e) => {
      if (e.target.classList.contains('drawer-overlay') || e.target.classList.contains('modal-overlay')) {
        const closeBtn = e.target.querySelector('.drawer-close-btn, .modal-close-btn');
        if (closeBtn) {
          closeBtn.click();
        }
      }
    };
    
    document.addEventListener('mousedown', handleOverlayClick);
    
    return () => {
      document.removeEventListener('mousedown', handleOverlayClick);
    };
  }, [theme, themeGradient, accentColor]);

  return (
    <Router>
      <TopLoader />
      <ToastContainer 
        position="top-right" 
        autoClose={4000} 
        icon={<img src={logo} alt="Logo" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />}
      />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Protected Routes with Layout */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<ProtectedRoute path="/"><Dashboard /></ProtectedRoute>} />
            <Route path="pos" element={<ProtectedRoute path="/pos"><POS /></ProtectedRoute>} />
            <Route path="pos-history" element={<ProtectedRoute path="/pos-history"><POSHistory /></ProtectedRoute>} />
            <Route path="day-book" element={<ProtectedRoute path="/day-book"><DayBook /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute path="/inventory"><Inventory /></ProtectedRoute>} />
            <Route path="purchases" element={<ProtectedRoute path="/purchases"><Purchase /></ProtectedRoute>} />
            <Route path="returns" element={<ProtectedRoute path="/returns"><Returns /></ProtectedRoute>} />
            <Route path="suppliers" element={<ProtectedRoute path="/suppliers"><Suppliers /></ProtectedRoute>} />
            <Route path="customers" element={<ProtectedRoute path="/customers"><Customers /></ProtectedRoute>} />
            <Route path="sms" element={<ProtectedRoute path="/sms"><SMS /></ProtectedRoute>} />
            <Route path="expenses" element={<ProtectedRoute path="/expenses"><Expenses /></ProtectedRoute>} />
            <Route path="sr" element={<ProtectedRoute path="/sr"><SR /></ProtectedRoute>} />
            <Route path="stock-log" element={<ProtectedRoute path="/stock-log"><StockLog /></ProtectedRoute>} />
            
            {/* Dynamic Management Routes */}
            <Route path="accounts" element={<ProtectedRoute path="/accounts"><Accounts /></ProtectedRoute>} />
            <Route path="balance-sheet" element={<ProtectedRoute path="/balance-sheet"><BalanceSheet /></ProtectedRoute>} />
            <Route path="ledger" element={<ProtectedRoute path="/ledger"><Ledger /></ProtectedRoute>} />
            <Route path="hr" element={<ProtectedRoute path="/hr"><HR /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute path="/reports"><Reports /></ProtectedRoute>} />
            <Route path="activity-log" element={<ProtectedRoute path="/activity-log"><ActivityLog /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute path="/settings"><Settings /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
