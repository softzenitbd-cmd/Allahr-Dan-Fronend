import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import logo from './assets/allah_dan.jpeg';
import useStore from './store/useStore';
import TopLoader from './components/TopLoader';
import Login from './pages/Login';
import Layout from './components/Layout';

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
const SR = lazy(() => import('./pages/SR'));
const StockLog = lazy(() => import('./pages/StockLog'));

// Placeholder Pages (will be extracted to separate files in later phases)

// Protected Route Wrapper
const ProtectedRoute = ({ children, requiredRole }) => {
  const user = useStore((state) => state.user);
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole && user.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const theme = useStore((state) => state.theme);
  const themeGradient = useStore((state) => state.themeGradient) || 'theme-sky';
  const user = useStore((state) => state.user);
  const hydrate = useStore((state) => state.hydrate);

  // A reload keeps the session but not the data, so pull everything back from
  // the server once the persisted user is known.
  useEffect(() => {
    if (user) hydrate();
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
  }, [theme, themeGradient]);

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
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="pos-history" element={<POSHistory />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="purchases" element={<Purchase />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/sms" element={<SMS />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/sr" element={<SR />} />
            <Route path="/stock-log" element={<StockLog />} />
            
            {/* Admin Only Routes */}
            <Route path="accounts" element={<ProtectedRoute requiredRole="Admin"><Accounts /></ProtectedRoute>} />
            <Route path="balance-sheet" element={<ProtectedRoute requiredRole="Admin"><BalanceSheet /></ProtectedRoute>} />
            <Route path="hr" element={<ProtectedRoute requiredRole="Admin"><HR /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute requiredRole="Admin"><Reports /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute requiredRole="Admin"><Settings /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
