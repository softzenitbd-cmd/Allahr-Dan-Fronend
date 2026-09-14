import React, { useState, useEffect, useCallback } from 'react';
import useStore from '../store/useStore';
import { ActivityLogService } from '../api/services';
import { printElement } from '../utils/pdfGenerator';
import {
  Activity,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Printer,
  Eye,
  X,
  LogIn,
  LogOut,
  PlusCircle,
  Edit,
  Trash2,
  ShieldAlert,
  ShoppingBag,
  Package,
  DollarSign,
  Users,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Info,
} from 'lucide-react';
import { toast } from 'react-toastify';

const MODULE_OPTIONS = [
  { id: 'All', labelEn: 'All Modules', labelBn: 'সব মডিউল' },
  { id: 'AUTH', labelEn: 'Authentication', labelBn: 'লগইন ও সিকিউরিটি' },
  { id: 'POS', labelEn: 'POS & Sales', labelBn: 'বিক্রয় ও চালান' },
  { id: 'ACCOUNTS', labelEn: 'Accounts & Payments', labelBn: 'পেমেন্ট ও হিসাব' },
  { id: 'CUSTOMERS', labelEn: 'Customers', labelBn: 'কাস্টমার' },
  { id: 'SUPPLIERS', labelEn: 'Suppliers', labelBn: 'সাপ্লায়ার' },
  { id: 'INVENTORY', labelEn: 'Inventory', labelBn: 'ইনভেন্টরি ও পণ্য' },
  { id: 'EXPENSE', labelEn: 'Expense', labelBn: 'দোকানের খরচ' },
  { id: 'PURCHASE', labelEn: 'Purchase', labelBn: 'ক্রয় ও সাপ্লায়ার' },
  { id: 'HR', labelEn: 'HR & Staff', labelBn: 'কর্মী ও হাজিরা' },
];

const ACTION_OPTIONS = [
  { id: 'All', labelEn: 'All Actions', labelBn: 'সব অ্যাকশন' },
  { id: 'LOGIN', labelEn: 'Login', labelBn: 'লগইন' },
  { id: 'CREATE', labelEn: 'Create', labelBn: 'নতুন এন্ট্রি (Create)' },
  { id: 'UPDATE', labelEn: 'Update / Edit', labelBn: 'সম্পাদনা (Update)' },
  { id: 'DELETE', labelEn: 'Delete', labelBn: 'ডিলিট (Delete)' },
  { id: 'SECURITY', labelEn: 'Security', labelBn: 'পাসওয়ার্ড / নিরাপত্তা' },
];

const ActivityLog = () => {
  const { user, language, staff } = useStore();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // Filters
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | '7days' | '30days' | 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedModule, setSelectedModule] = useState('All');
  const [selectedAction, setSelectedAction] = useState('All');
  const [selectedStaff, setSelectedStaff] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Log for detail modal
  const [selectedLog, setSelectedLog] = useState(null);

  // Helper for quick date calculation
  const getFilterDates = useCallback(() => {
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (dateFilter === 'today') {
      const tStr = formatDate(today);
      return { start: tStr, end: tStr };
    }
    if (dateFilter === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = formatDate(y);
      return { start: yStr, end: yStr };
    }
    if (dateFilter === '7days') {
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 6);
      return { start: formatDate(d7), end: formatDate(today) };
    }
    if (dateFilter === '30days') {
      const d30 = new Date(today);
      d30.setDate(d30.getDate() - 29);
      return { start: formatDate(d30), end: formatDate(today) };
    }
    if (dateFilter === 'custom') {
      return { start: startDate, end: endDate };
    }
    return { start: '', end: '' };
  }, [dateFilter, startDate, endDate]);

  const fetchLogs = useCallback(async (page = currentPage) => {
    setLoading(true);
    try {
      const { start, end } = getFilterDates();
      const params = {
        page,
        page_size: pageSize,
      };
      if (start) params.start_date = start;
      if (end) params.end_date = end;
      if (selectedModule !== 'All') params.module = selectedModule;
      if (selectedAction !== 'All') params.action = selectedAction;
      if (selectedStaff !== 'All') params.staff = selectedStaff;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const res = await ActivityLogService.list(params);
      if (res && res.results) {
        setLogs(res.results);
        setTotalCount(res.count || 0);
      } else if (Array.isArray(res)) {
        setLogs(res);
        setTotalCount(res.length);
      } else {
        setLogs([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
      toast.error(language === 'bn' ? 'অ্যাক্টিভিটি লগ লোড করতে সমস্যা হয়েছে।' : 'Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, getFilterDates, selectedModule, selectedAction, selectedStaff, searchTerm, language]);

  useEffect(() => {
    setCurrentPage(1);
    fetchLogs(1);
  }, [dateFilter, startDate, endDate, selectedModule, selectedAction, selectedStaff]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Quick stat computations from current results
  const statCounts = {
    total: totalCount,
    logins: logs.filter(l => l.action === 'LOGIN').length,
    sales: logs.filter(l => l.module === 'POS').length,
    deletions: logs.filter(l => l.action === 'DELETE').length,
  };

  const getActionBadge = (action) => {
    switch (action?.toUpperCase()) {
      case 'LOGIN':
        return {
          bg: '#eff6ff',
          color: '#2563eb',
          border: '#bfdbfe',
          icon: <LogIn size={13} />,
          labelBn: 'লগইন',
          labelEn: 'LOGIN',
        };
      case 'CREATE':
        return {
          bg: '#ecfdf5',
          color: '#059669',
          border: '#a7f3d0',
          icon: <PlusCircle size={13} />,
          labelBn: 'যুক্ত',
          labelEn: 'CREATE',
        };
      case 'UPDATE':
        return {
          bg: '#fffbeb',
          color: '#d97706',
          border: '#fde68a',
          icon: <Edit size={13} />,
          labelBn: 'আপডেট',
          labelEn: 'UPDATE',
        };
      case 'DELETE':
        return {
          bg: '#fef2f2',
          color: '#dc2626',
          border: '#fecaca',
          icon: <Trash2 size={13} />,
          labelBn: 'ডিলিট',
          labelEn: 'DELETE',
        };
      case 'SECURITY':
        return {
          bg: '#faf5ff',
          color: '#9333ea',
          border: '#e9d5ff',
          icon: <ShieldAlert size={13} />,
          labelBn: 'সিকিউরিটি',
          labelEn: 'SECURITY',
        };
      default:
        return {
          bg: '#f1f5f9',
          color: '#475569',
          border: '#cbd5e1',
          icon: <Activity size={13} />,
          labelBn: action,
          labelEn: action,
        };
    }
  };

  const getModuleBadge = (module) => {
    switch (module?.toUpperCase()) {
      case 'POS':
        return { icon: <ShoppingBag size={13} />, label: 'POS' };
      case 'INVENTORY':
        return { icon: <Package size={13} />, label: language === 'bn' ? 'স্টক' : 'Inventory' };
      case 'EXPENSE':
        return { icon: <DollarSign size={13} />, label: language === 'bn' ? 'খরচ' : 'Expense' };
      case 'AUTH':
        return { icon: <ShieldAlert size={13} />, label: language === 'bn' ? 'লগইন' : 'Auth' };
      case 'ACCOUNTS':
        return { icon: <DollarSign size={13} />, label: language === 'bn' ? 'হিসাব/পেমেন্ট' : 'Accounts' };
      case 'CUSTOMERS':
        return { icon: <Users size={13} />, label: language === 'bn' ? 'কাস্টমার' : 'Customer' };
      case 'SUPPLIERS':
        return { icon: <Users size={13} />, label: language === 'bn' ? 'সাপ্লায়ার' : 'Supplier' };
      case 'PURCHASE':
        return { icon: <ShoppingBag size={13} />, label: language === 'bn' ? 'ক্রয়' : 'Purchase' };
      case 'HR':
        return { icon: <Users size={13} />, label: 'HR' };
      default:
        return { icon: <Activity size={13} />, label: module };
    }
  };

  const formatLogTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="card text-center mt-8" style={{ padding: '3rem 1rem' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>
          {language === 'bn' ? 'প্রবেশাধিকার সংরক্ষিত' : 'Access Denied'}
        </h2>
        <p className="text-muted">
          {language === 'bn'
            ? 'শুধুমাত্র এডমিন এই অ্যাক্টিভিটি লগ দেখতে পারবেন।'
            : 'Only Admins are permitted to view the Activity Log.'}
        </p>
      </div>
    );
  }

  return (
    <div className="activity-log-page animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', borderRadius: '8px' }}>
              <Activity size={24} />
            </div>
            <h1 style={{ margin: 0 }}>{language === 'bn' ? 'অ্যাক্টিভিটি লগ ও অডিট হিস্ট্রি' : 'Activity Log & Audit Trail'}</h1>
          </div>
          <p className="text-muted" style={{ marginTop: '4px' }}>
            {language === 'bn'
              ? 'দোকানের সকল লগইন, বিক্রয়, পণ্য পরিবর্তন, খরচ ও সংবেদনশীল কাজের সম্পূর্ণ নজরদারি।'
              : 'Complete live audit trail of user logins, sales, inventory modifications, expenses, and deletions.'}
          </p>
        </div>

        <div className="flex-align-gap">
          <button
            className="btn-outline flex-align-gap"
            onClick={() => fetchLogs(currentPage)}
            disabled={loading}
            title={language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>{language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
          <button
            className="btn-outline flex-align-gap"
            onClick={() => printElement('printable-activity-log', `Activity-Log-${new Date().toISOString().slice(0, 10)}`)}
          >
            <Printer size={16} />
            <span>{language === 'bn' ? 'প্রিন্ট রিপোর্ট' : 'Print Log'}</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'ফিল্টারকৃত মোট কাজ' : 'Total Filtered Logs'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {statCounts.total}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'বিক্রয় ও চালান কাজ' : 'Sales Activity'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669' }}>
              {statCounts.sales}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(147, 51, 234, 0.1)', color: '#9333ea' }}>
            <LogIn size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'লগইন কার্যক্রম' : 'Logins Recorded'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#9333ea' }}>
              {statCounts.logins}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
          <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}>
            <Trash2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {language === 'bn' ? 'ডিলিট কার্যক্রম' : 'Deletions / Removals'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: statCounts.deletions > 0 ? '#dc2626' : 'var(--text-main)' }}>
              {statCounts.deletions}
            </div>
          </div>
        </div>
      </div>

      {/* Main Filter & Table Card */}
      <div className="card">
        {/* Quick Date Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
            {language === 'bn' ? 'সময়কাল:' : 'Period:'}
          </span>
          {[
            { id: 'today', labelEn: 'Today', labelBn: 'আজকে' },
            { id: 'yesterday', labelEn: 'Yesterday', labelBn: 'গতকাল' },
            { id: '7days', labelEn: 'Last 7 Days', labelBn: 'বিগত ৭ দিন' },
            { id: '30days', labelEn: 'Last 30 Days', labelBn: 'বিগত ৩০ দিন' },
            { id: 'custom', labelEn: 'Custom', labelBn: 'কাস্টম তারিখ' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDateFilter(item.id)}
              style={{
                padding: '5px 12px',
                borderRadius: '16px',
                border: dateFilter === item.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                background: dateFilter === item.id ? 'var(--primary)' : 'transparent',
                color: dateFilter === item.id ? '#fff' : 'var(--text-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {language === 'bn' ? item.labelBn : item.labelEn}
            </button>
          ))}

          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '0.5rem' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}
              />
            </div>
          )}
        </div>

        {/* Toolbar: Search + Module + Action + Staff */}
        <div className="card-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div className="search-bar" style={{ minWidth: '240px', flex: '1 1 240px' }}>
            <Search size={17} className="text-muted" />
            <input
              type="text"
              placeholder={language === 'bn' ? 'বিবরণ, ইউজার বা চালান কোড খুঁজুন…' : 'Search by description, user, code…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--text-muted)' }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Module Filter */}
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {language === 'bn' ? m.labelBn : m.labelEn}
                </option>
              ))}
            </select>

            {/* Action Filter */}
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            >
              {ACTION_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {language === 'bn' ? a.labelBn : a.labelEn}
                </option>
              ))}
            </select>

            {/* Staff Filter */}
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            >
              <option value="All">{language === 'bn' ? 'সব কর্মী / ইউজার' : 'All Staff / Users'}</option>
              {(staff || []).map((s) => (
                <option key={s.id || s.staff_code} value={s.name || s.username}>
                  {s.name} ({s.role || 'Staff'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '170px' }}>{language === 'bn' ? 'তারিখ ও সময়' : 'Timestamp'}</th>
                <th style={{ width: '130px' }}>{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                <th style={{ width: '130px' }}>{language === 'bn' ? 'মডিউল' : 'Module'}</th>
                <th style={{ width: '160px' }}>{language === 'bn' ? 'ব্যবহারকারী' : 'User / Staff'}</th>
                <th>{language === 'bn' ? 'কার্যকলাপের বিবরণ' : 'Activity Description'}</th>
                <th style={{ width: '70px', textAlign: 'center' }}>{language === 'bn' ? 'ডিটেইল' : 'Details'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary)' }}>
                    <div className="flex-align-gap" style={{ justifyContent: 'center' }}>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>{language === 'bn' ? 'অ্যাক্টিভিটি হিস্ট্রি লোড হচ্ছে…' : 'Loading activity history…'}</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <Info size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>
                      {language === 'bn' ? 'এই ফিল্টারে কোনো কার্যক্রমের রেকর্ড পাওয়া যায়নি।' : 'No activity records found matching this filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const modBadge = getModuleBadge(log.module);

                  return (
                    <tr key={log.id} style={{ transition: 'background 0.15s ease' }}>
                      {/* Timestamp */}
                      <td style={{ fontSize: '0.83rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} style={{ opacity: 0.7 }} />
                          <span>{formatLogTime(log.created_at)}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.icon}
                          <span>{language === 'bn' ? badge.labelBn : badge.labelEn}</span>
                        </span>
                      </td>

                      {/* Module */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-main)',
                          }}
                        >
                          {modBadge.icon}
                          <span>{modBadge.label}</span>
                        </span>
                      </td>

                      {/* User */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#2563eb',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {(log.user_name || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                              {log.user_name || 'System'}
                            </div>
                            {log.user_role && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {log.user_role}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>
                        <span>{log.description}</span>
                      </td>

                      {/* Details button */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => setSelectedLog(log)}
                          title={language === 'bn' ? 'বিস্তারিত দেখুন' : 'View details'}
                          style={{ color: 'var(--primary)' }}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 0 0 0',
              marginTop: '0.5rem',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {language === 'bn'
                ? `পৃষ্ঠা ${currentPage} / ${totalPages} (মোট ${totalCount}টি রেকর্ড)`
                : `Page ${currentPage} of ${totalPages} (Total ${totalCount} logs)`}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-outline flex-align-gap"
                onClick={() => {
                  if (currentPage > 1) {
                    const prev = currentPage - 1;
                    setCurrentPage(prev);
                    fetchLogs(prev);
                  }
                }}
                disabled={currentPage <= 1 || loading}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              >
                <ChevronLeft size={16} />
                <span>{language === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
              </button>

              <button
                className="btn-outline flex-align-gap"
                onClick={() => {
                  if (currentPage < totalPages) {
                    const next = currentPage + 1;
                    setCurrentPage(next);
                    fetchLogs(next);
                  }
                }}
                disabled={currentPage >= totalPages || loading}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              >
                <span>{language === 'bn' ? 'পরবর্তী' : 'Next'}</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="drawer-overlay" style={{ zIndex: 1100 }}>
          <div
            className="drawer animate-slide-up"
            style={{ maxWidth: '520px', margin: 'auto', borderRadius: '12px', overflow: 'hidden' }}
          >
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={20} className="text-primary" />
                <h3 style={{ margin: 0 }}>
                  {language === 'bn' ? 'অ্যাক্টিভিটি বিস্তারিত বিবরণ' : 'Activity Log Details'}
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setSelectedLog(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '1.25rem' }}>
              <div style={{ marginBottom: '1rem', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {language === 'bn' ? 'কার্যকলাপ' : 'Activity'}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>
                  {selectedLog.description}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'ব্যবহারকারী' : 'User'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {selectedLog.user_name || 'System'}
                    {selectedLog.user_role ? ` (${selectedLog.user_role})` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'মডিউল' : 'Module'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedLog.module}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'অ্যাকশন' : 'Action'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedLog.action}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {language === 'bn' ? 'তারিখ ও সময়' : 'Time'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatLogTime(selectedLog.created_at)}</div>
                </div>
                {selectedLog.ip_address && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {language === 'bn' ? 'আইপি অ্যাড্রেস' : 'IP Address'}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedLog.ip_address}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => setSelectedLog(null)}>
                {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Printable Component */}
      <div style={{ display: 'none' }}>
        <div id="printable-activity-log" style={{ padding: '2rem', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 4px 0' }}>Allahr dan gents point</h2>
          <h3 style={{ textAlign: 'center', margin: '0 0 16px 0', fontSize: '1.1rem', color: '#475569' }}>
            Activity Log & Audit Report
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', marginBottom: '1.25rem' }}>
            Generated on: {new Date().toLocaleString()}
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Time</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Action</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Module</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>User</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{formatLogTime(l.created_at)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 'bold' }}>{l.action}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{l.module}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{l.user_name || 'System'}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
